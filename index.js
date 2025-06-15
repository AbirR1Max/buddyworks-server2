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
// JWT verification middleware
const verifyJWT = (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) return res.status(401).send({ message: 'Unauthorized' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).send({ message: 'Forbidden' });
        req.decoded = decoded; // Save decoded info for next middleware
        next();
    });
};

// Email verification middleware
const verifyUser = (req, res, next) => {
    const jwtEmail = req.decoded?.email;
    const userEmail = req.body?.email || req.query?.email;

    if (jwtEmail === userEmail) {
        return next();
    }

    return res.status(401).send({ message: 'Unauthorized Access' });
};

app.use(express.json());
app.use(cookieParser());

let db; // Declare a global reference to use in routes

async function run() {
    try {
        await client.connect();
        db = client.db("BuddyWorks"); // change to your actual DB name
        console.log("Connected to MongoDB");

        //collection access
        const usersCollection = db.collection("users");
        const serviceCollection = db.collection("services");
        const bookedCollection = db.collection("bookedServicesList");
        // Add routes here that need DB access
        app.get('/users', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        //get methods

        app.get('/my-services', verifyJWT, verifyUser, async (req, res) => {
            const userEmail = req.query.email;

            try {
                const services = await serviceCollection.find({ serviceProviderMail: userEmail }).toArray();
                res.send(services);
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch services', error: err });
            }
        });

        //post methods

        app.post('/jwt', (req, res) => {
            const user = req.body; // user = { email: "user@example.com" } or more user info

            const token = jwt.sign(user, process.env.JWT_SECRET, {
                expiresIn: '7d'
            });

            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
                    maxAge: 7 * 24 * 60 * 60 * 1000
                })
                .send({ success: true });
        });

        app.post('/logout', (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            }).send({ success: true });
        });

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
        app.get('/', verifyJWT, (req, res) => {
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
