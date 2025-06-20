const express = require('express')
const cors = require('cors')
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
const { kamiLogger } = require('kami-logger');


const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});



// ✅ THEN the rest of your middleware
// middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://buddyworks.surge.sh'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(kamiLogger({ connectionString: uri }));
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
            const { email } = req.body;

            const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '1h' });

            res.cookie('token', token, {
                httpOnly: true,
                secure: true,
                sameSite: 'None'
            });

            res.send({ success: true });
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

            if (!email || email !== req.decoded.email) {
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
        // Get booking services for the service provider
        app.get('/provider-booked-services', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email || email !== req.decoded.email) {
                return res.status(403).send({ message: "Unauthorized access" });
            }

            try {
                const bookingServices = await bookedCollection.find({ providerEmail: email }).toArray();
                res.send(bookingServices);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch booking services.", error });
            }
        });


        // PATCH: Update booking status by provider
        app.patch('/provider-booked-services/:id', verifyJWT, async (req, res) => {
            const { id } = req.params;
            const { serviceStatus } = req.body;
            const email = req.query.email;
            if (!serviceStatus) {
                return res.status(400).send({ message: "Status is required" });
            }

            try {
                const booking = await bookedCollection.findOne({ _id: new ObjectId(id) });


                if (!booking) {
                    return res.status(404).send({ message: 'Booking not found' });
                }

                if (booking.providerEmail !== email) {
                    return res.status(403).send({ message: 'Forbidden: Unauthorized provider' });
                }

                const result = await bookedCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { serviceStatus } }
                );

                if (result.modifiedCount === 0) {
                    return res.status(304).send({ message: 'No changes made to status' });
                }

                res.send({ message: 'Booking status updated successfully' });
            } catch (error) {
                console.error("Status update error:", error);
                res.status(500).send({ message: 'Failed to update booking!', error });
            }
        });

        // Update method
        app.put('/services/:id', verifyJWT, async (req, res) => {
            const { id } = req.params;
            console.log("Decoded email:", req.decoded.email);

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
