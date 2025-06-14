const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: 'http://localhost:5173', // or your frontend domain
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());


// Test route
app.get('/', (req, res) => {
  res.send('Server is running');
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
