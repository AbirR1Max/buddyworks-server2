const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { kamiLogger } = require('kami-logger');
const { MongoClient, ObjectId, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// Middleware
app.use(kamiLogger({ connectionString: uri }));
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// JWT verification middleware
const verifyJWT = (req, res, next) => {
    const token = req.cookies?.token;
    if (!token) return res.status(401).send({ message: 'Unauthorized' });

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).send({ message: 'Forbidden' });
        req.decoded = decoded;
        next();
    });
};

// Database reference
let db;

async function run() {
    try {
        await client.connect();
        db = client.db("BuddyWorks");
        console.log("Connected to MongoDB");

        const usersCollection = db.collection("users");
        const serviceCollection = db.collection("services");
        const bookedCollection = db.collection("bookedServicesList");


        // JWT issue route
        app.post('/jwt', (req, res) => {
            const user = req.body;

            const token = jwt.sign(user, process.env.JWT_SECRET, {
                expiresIn: '7d',
            });

            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    maxAge: 7 * 24 * 60 * 60 * 1000,
                })
                .send({ success: true });
        });

        // JWT logout route
        app.post('/logout', (req, res) => {
            res
                .clearCookie('token', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true });
        });

        // All users
        app.get('/users', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        // My services - secure via JWT, read email from token
        app.get('/my-services', verifyJWT, async (req, res) => {
            // const userEmail = req.decoded.email;
            const email = req.query.email;

            if (!email || email !== req.decoded.email){
                return res.status(403).send({ message: "Unauthorized access" });
            }

            try {
                const services = await serviceCollection.find({ serviceProviderMail: email }).toArray();
                res.send(services);
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch services', error: err });
            }
        });

        // Get all services
        app.get('/services', async (req, res) => {
            try {
                const services = await serviceCollection.find().toArray();
                res.send(services);
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch services', error: err });
            }
        });

        // Get service by ID
        app.get('/services/:id', async (req, res) => {
            const { id } = req.params;
            try {
                const service = await serviceCollection.findOne({ _id: new ObjectId(id) });
                if (!service) return res.status(404).send({ message: 'Service not found' });
                res.send(service);
            } catch (err) {
                res.status(500).send({ message: 'Error fetching service', error: err });
            }
        });

        // Add new service
        app.post('/services', verifyJWT, async (req, res) => {
            try {
                const newService = req.body;
                const result = await serviceCollection.insertOne(newService);
                res.status(201).send(result);
            } catch (error) {
                res.status(500).send({ message: 'Failed to insert service', error });
            }
        });
        // Delete method
        app.delete('/services/:id', verifyJWT, async (req, res) => {
            const { id } = req.params;

            try {
                const service = await serviceCollection.findOne({ _id: new ObjectId(id) });
                if (!service) return res.status(404).send({ message: 'Service not found' });

                if (service.serviceProviderMail !== req.decoded.email) {
                    return res.status(403).send({ message: 'Forbidden' });
                }

                await serviceCollection.deleteOne({ _id: new ObjectId(id) });

                res.send({ message: 'Service deleted successfully' });
            } catch (error) {
                res.status(500).send({ message: 'Failed to delete service!', error });
            }
        });
        // POST: Create a booking
        app.post('/bookings', verifyJWT, async (req, res) => {
            const bookingData = req.body;

            try {
                const result = await bookedCollection.insertOne(bookingData);
                res.status(201).send({ message: "Booking created", result });
            } catch (err) {
                console.error("Booking insert failed:", err);
                res.status(500).send({ message: "Failed to book service", error: err });
            }
        });

        // GET: Get bookings by user email
        app.get("/bookings/user", verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email || email !== req.decoded.email) {
                return res.status(403).send({ message: "Unauthorized access" });
            }

            try {
                const bookings = await bookedCollection.find({ userEmail: email }).toArray();
                res.send(bookings);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch user bookings", error });
            }
        });
        // My services - secure via JWT, read email from token
        app.get('/my-services', verifyJWT, async (req, res) => {
            const userEmail = req.decoded.email;

            try {
                const services = await serviceCollection.find({ serviceProviderMail: userEmail }).toArray();
                res.send(services);
            } catch (err) {
                res.status(500).send({ message: 'Failed to fetch services', error: err });
            }
        });
        // Get booking services for the service provider
        app.get('/:id/provider-booked-services', verifyJWT, async (req, res) => {
            const {email} = req.params;
            const providerEmail = email;

            try {
                // Find booking services where serviceProvider == provider's email
                const bookingServices = await bookedCollection.find({ serviceProviderEmail: providerEmail }).toArray();
        
                res.send(bookingServices);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch booking services.", error });
            }
        });

        // Update booking service status
        app.patch('/provider-booked-services/:id', verifyJWT, async (req, res) => {
            const { id } = req.params;
            const { status } = req.body;

            try {
                // Check if booking belongs to the provider first
                const booking = await bookedCollection.findOne({ _id: new ObjectId(id) });

                if (!booking) return res.status(404).send({ message: 'Booking not found' });

                if (booking.serviceProviderEmail !== req.decoded.email) {
                    return res.status(403).send({ message: 'Forbidden' });
                }

                // Perform the update
                await bookedCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { status } }
                );

                res.send({ message: 'Booking updated successfully' });
            } catch (error) {
                res.status(500).send({ message: 'Failed to update booking!', error });
            }
        });

        // Update method
        app.put('/services/:id', verifyJWT, async (req, res) => {
            const { id } = req.params;
            // We omit _id and serviceProviderMail to avoid changing them
            const { _id, serviceProviderMail, ...updatedData } = req.body;

            try {
                // Check if service exists first
                const service = await serviceCollection.findOne({ _id: new ObjectId(id) });
                if (!service) return res.status(404).send({ message: 'Service not found' });

                if (service.serviceProviderMail !== req.decoded.email) {
                    return res.status(403).send({ message: 'Forbidden' });
                }
                // Perform the update
                const result = await serviceCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedData }
                );

                if (result.modifiedCount === 0) {
                    return res.status(304).send({ message: 'Not modified' });
                }

                res.send({ message: 'Service updated successfully' });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Failed to update service!', error });
            }
        });

        // Test route
        app.get('/', (req, res) => {
            res.send('Server is running ✅');
        });

        // Start server
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });

    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
    }
}

run();
