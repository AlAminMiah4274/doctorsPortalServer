const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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

    authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send("Unauthorized access");
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {

        if (err) {
            return res.status(403).send([{ message: "Forbidden access" }]);
        }

        req.decoded = decoded;

        next();
    });
};

async function run() {
    try {
        const appointmentOptionsCollection = client.db("doctorsPortal").collection("appointmentOptions");
        const bookingsCollection = client.db("doctorsPortal").collection("bookings");
        const usersCollection = client.db("doctorsPortal").collection("users");
        const doctorsCollection = client.db("doctorsPortal").collection("doctors");

        // to verify the user admin or not after verifying verifyJWT
        const verifyAdmin = async (req, res, next) => {
            const decodedEmail = req.decoded.userEmail;
            const query = {email: decodedEmail};
            const user = await usersCollection.findOne(query);

            if(user?.role !== "Admin"){
                return res.status(403).send([{message: "You are not an admin. Be admin first"}]);
            }

            next();
        };

        // ***************** APPOINTMENT OPTIONS ********************

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

        // to get specific data for showing specialty 
        app.get("/appointmentSpecialty", async (req, res) => {
            const query = {};
            const specialtyInfo = await appointmentOptionsCollection.find(query).project({ name: 1 }).toArray();
            res.send(specialtyInfo);
        });

        // to add extra field in appointment options api 
        app.get("/addPrice", async (req, res) => {
            const filter = {};
            const options = {upsert: true};
            const updatedDoc = {
                $set: {
                    price: 99
                }
            }
            const price = await appointmentOptionsCollection.updateMany(filter, updatedDoc, options);
            res.send(price);
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
                        price: 1,
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
                        price: 1,
                        slots: {
                            $setDifference: ["$slots", "$booked"]
                        }
                    }
                }
            ]).toArray();
            res.send(options);
        });

        // **************** BOOKINGS ******************

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
            const email = req.query.email;

            const decodedEmail = req.decoded.userEmail;
            if (email !== decodedEmail) {
                return res.status(403).send([{ message: "Forbidden access" }]);
            }

            const query = { patientEmail: email };
            const booknings = await bookingsCollection.find(query).toArray();
            res.send(booknings);
        });

        // to get an individual booking from database in client side (Payment) 
        app.get("/bookings/:id", async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const result = await bookingsCollection.findOne(query);
            res.send(result);
        });

        // ***************** USERS ********************

        // to save new user info in the database 
        app.post("/users", async (req, res) => {
            const userInfo = req.body;
            const user = await usersCollection.insertOne(userInfo);
            res.send(user);
        });

        // to get the all users in client side (AllUsers) from database
        app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
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

        // ********************* ADMIN ************************

        // to make a user admin
        app.put("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    role: "Admin"
                }
            };
            const result = await usersCollection.updateOne(filter, updatedDoc, options);
            res.send(result);
        });

        // to check the user admin or not 
        app.get("/users/admin/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role === "Admin" });
        });

        // ******************** DOCTORS ********************

        // to send the doctors data to the database from AddDoctors 
        app.post("/doctors", async (req, res) => {
            const doctorInfo = req.body;
            const doctor = await doctorsCollection.insertOne(doctorInfo);
            res.send(doctor);
        });

        // to load all doctors data from database in client side (ManageDoctor)
        app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
            const query = {};
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        });

        // to delete the invidula doctor from database 
        app.delete("/doctors/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = {_id: new ObjectId(id)};
            const deletedDoctor = await doctorsCollection.deleteOne(query);
            res.send(deletedDoctor);
        });

    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(err => console.error(err));


app.listen(port, () => {
    console.log(`Doctors Portal server is running on ${port}`);
});


/*
# data changing or updating systems: 
1. delete the data form server or database - dangerous system
2. write a querie or script 
3.
*/