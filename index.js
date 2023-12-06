const express = require("express");
const app = express();
const port = process.env.PORT || 5000;

app.get("/", (req, res) => {
    res.send("Doctors Portal server is running");
});

app.listen(port, () => { 
    console.log(`Doctors Portal server is running on ${port}`);
});