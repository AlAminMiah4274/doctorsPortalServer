const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion } = require('mongodb');
require("dotenv").config(); // to connect to the .env file 

// middleware 
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Doctors Portal server is running");
});

// jsonwebtoken: to create secret key in jwt: require("crypto").randomBytes(64).toString("hex")
/*
1. install jwt
2. require
3. create secret key and write this in the .env file
4. create app.get() api to send toekn to the client side 
5. write a function to get the token in the client side and save it in local storage 
6. to verify the token for accessing sensitive data in the client side send the token throurh headers method and write another function
 in the server side to complete next procedure. 
*/


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ubvegtf.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// to verify the token got from the client side 
const verifyJWT = (req, res, next) => {

    // to get authorization data in headers method 
    const authHeader = req.headers.authorization;

    // to be confirmed about authorization in headers method 
    if(!authHeader){
        return res.status(401).send("Unothorized access");
    };

    // to get the exact token
    const token = authHeader.split(' ')[1];
};

async function run() {
    try {
        const appointmentOptionsCollection = client.db("doctorsPortal").collection("appointmentOptions");
        const bookingsCollection = client.db("doctorsPortal").collection("bookings");
        const usersCollection = client.db("doctorsPortal").collection("users");

        // to get appointment option data from the database 
        app.get("/appointmentOptions", async (req, res) => {
            const optionsQuery = {};
            const options = await appointmentOptionsCollection.find(optionsQuery).toArray();

            // to find bookings data from the database 
            const date = req.query.date;
            const bookingsQuery = { appointmentDate: date };
            const alreadyBookedOptions = await bookingsCollection.find(bookingsQuery).toArray();

            // to show only available slots info in the client side 
            options.forEach(option => {
                const bookedOption = alreadyBookedOptions.filter(alreadyBookedOption => alreadyBookedOption.treatmentName === option.name);
                const bookedSlots = bookedOption.map(booked => booked.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
                option.slots = remainingSlots;
            });

            res.send(options);
        });

        // // mongodb aggregation pipeline
        // app.get("/v2/appointmentOptions", async (req, res) => {
        //     const date = req.query.date;
        //     const options = await appointmentOptionsCollection.aggregate([

        //         // to get booked option
        //         {
        //             $lookup: {
        //                 from: "bookings",
        //                 localField: "name",
        //                 foreignField: "treatmentName",
        //                 pipeline: [
        //                     {
        //                         $match: {
        //                             $expr: {
        //                                 $eq: ["$appointmentDate", date]
        //                             }
        //                         }
        //                     }
        //                 ],
        //                 as: "booked"
        //             }
        //         },

        //         // to get booked slots 
        //         {
        //             $project: {
        //                 name: 1,
        //                 slots: 1,
        //                 booked: {
        //                     $map: {
        //                         input: '$booked',
        //                         as: 'book',
        //                         in: '$$book.slot'
        //                     }
        //                 }
        //             }
        //         },

        //         // to make difference between booked slots and booked option 
        //         {
        //             $project: {
        //                 name: 1,
        //                 slots: {
        //                     $setDifference: ['$slots', '$booked']
        //                 }
        //             }
        //         }
        //     ]).toArray();
        //     res.send(options);
        // });

        app.get("/v2/appointmentOptions", async (req, res) => {
            const date = req.query.date;
            const options = await appointmentOptionsCollection.aggregate([
                {
                    $lookup: {
                        from: "bookings",
                        localField: "name",
                        foreignField: "treatmentName",
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ["$appointmentDate", date]
                                    }
                                }
                            }
                        ],
                        as: "booked"
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: 1,
                        booked: {
                            $map: {
                                input: "$booked",
                                as: "book",
                                in: "$$book.slot"
                            }
                        }
                    }
                },
                {
                    $project: {
                        name: 1,
                        slots: {
                            $setDifference: ["$slots", "$booked"]
                        }
                    }
                }
            ]).toArray();
            res.send(options);
        });

        // to send booking data to the databse 
        app.post("/bookings", async (req, res) => {
            const bookingInfo = req.body;

            // to prevent the user to take many appointments of a same category treatment in a day
            const query = {
                appointmentDate: bookingInfo.appointmentDate,
                treatmentName: bookingInfo.treatmentName,
                patientEmail: bookingInfo.patientEmail
            };

            const alreadyBooked = await bookingsCollection.find(query).toArray();

            if (alreadyBooked.length) {
                const message = `You have a booking on ${bookingInfo.appointmentDate}`;
                return res.send({ acknowledged: false, message });
            };

            const bookings = await bookingsCollection.insertOne(bookingInfo);
            res.send(bookings);
        });

        // to get bookings of the already signed in user from the database using email id in MyAppointment Component 
        app.get("/bookings", verifyJWT, async (req, res) => {
            const userEmail = req.query.email;
            const query = { patientEmail: userEmail };
            const booknings = await bookingsCollection.find(query).toArray();
            res.send(booknings);
        });

        // to save new user info in the database 
        app.post("/users", async (req, res) => {
            const userInfo = req.body;
            const user = await usersCollection.insertOne(userInfo);
            res.send(user);
        });

        // to send token to the client side during sign up 
        app.get("/jwt", async (req, res) => {
            const userEmail = req.query.email;
            const query = { email: userEmail };
            const user = await usersCollection.findOne(query);

            if (user) {
                const token = jwt.sign({ userEmail }, process.env.ACCESS_TOKEN, { expiresIn: "1h" });
                return res.send({ accessToken: token });
            };
            res.status(403).send({ accessToken: "" });
        });

    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(err => console.error(err));


app.listen(port, () => {
    console.log(`Doctors Portal server is running on ${port}`);
});