const express = require("express");
const cors = require("cors");
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


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ubvegtf.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const appointmentOptionsCollection = client.db("doctorsPortal").collection("appointmentOptions");
        const bookingsCollection = client.db("doctorsPortal").collection("bookings");

        // to get appointment option data from the database 
        app.get("/appointmentOptions", async (req, res) => {
            const optionsQuery = {};
            const options = await appointmentOptionsCollection.find(optionsQuery).toArray();

            // to find which options already has been booked 
            const date = req.query.date;
            const bookingsQuery = {appointmentDate: date};
            const alreadyBookedOptions = await bookingsCollection.find(bookingsQuery).toArray();
            
            // to show only remaining slots in the client side 
            options.forEach(option => {
                const bookedOption = alreadyBookedOptions.filter(alreadyBookedOption => alreadyBookedOption.treatmentName === option.name);
                const bookedSlots = bookedOption.map(booked => booked.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
                option.slots = remainingSlots;
            });

            res.send(options);
        });

        // to send booking data to the databse 
        app.post("/bookings", async(req, res) => {
            const bookingData = req.body;
            const result = await bookingsCollection.insertOne(bookingData)
            res.send(result);
        });

        // to get bookings from the database 
        app.get("/bookings", async(req, res) => {
            const query = {};
            const booknings = await bookingsCollection.find(query).toArray();
            res.send(booknings);
        });

    } finally {
        // Ensures that the client will close when you finish/error
    }
}
run().catch(err => console.error(err));


app.listen(port, () => {
    console.log(`Doctors Portal server is running on ${port}`);
});