// Import dependencies
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();  // Load environment variables from .env file
const emailRoutes = require('./routes/emailRoutes');  // Ensure this path is correct

// Initialize app
const app = express();

// Middleware
app.use(cors());  // Enable Cross-Origin Resource Sharing (CORS)
app.use(bodyParser.json());  // Parse incoming requests with JSON payload

// Log MongoDB URI for debugging
console.log("MongoDB URI:", process.env.MONGO_URI);  // This will help debug

// API Routes
app.use('/api', emailRoutes);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected successfully'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);  // Exit process if unable to connect to MongoDB
  });

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
