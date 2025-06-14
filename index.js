const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { kamiLogger } = require('kami-logger');
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(kamiLogger({ connectionString: uri }));
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

let db; // Declare a global reference to use in routes

async function run() {
  try {
    await client.connect();
    db = client.db("BuddyWorks"); // change to your actual DB name
    console.log("Connected to MongoDB");

    // Example collection access
    const usersCollection = db.collection("users");
    const serviceCollection =db.collection("services");
    const bookedCollection =db.collection("bookedServicesList");
    // Add routes here that need DB access
    app.get('/users', async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    //post methods
    app.post("/services", async (req, res) => {
    try {
      const newService = req.body;
      const result = await serviceCollection.insertOne(newService);
      res.status(201).send(result);
    } catch (error) {
      res.status(500).send({ message: "Failed to insert service", error });
    }
  });

    // Test route
    app.get('/', (req, res) => {
      res.send('Server is running');
    });

    // Start server inside run()
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error("Error connecting to MongoDB:", err);
  }
}

run();
