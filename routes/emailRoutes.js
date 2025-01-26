const express = require('express');
const bcrypt = require('bcrypt');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const mongoose = require('mongoose');

// Email schema for storing email data
const emailSchema = new mongoose.Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
  sentAt: { type: Date, default: Date.now },
});

const Email = mongoose.model('Email', emailSchema);

const router = express.Router();

// User Registration
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, emailPassword } = req.body;

    // Encrypt the passwords
    const hashedPassword = await bcrypt.hash(password, 10);
    const emailPasswordEncrypted = emailPassword
      ? await bcrypt.hash(emailPassword, 10)
      : null;

    const user = new User({
      username,
      email,
      password: hashedPassword,
      emailPassword: emailPasswordEncrypted,
    });

    await user.save();
    res.status(201).json({ message: 'User registered successfully' });
  } catch (err) {
    res.status(400).json({ error: 'Registration failed', details: err.message });
  }
});

// User Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({ message: 'Login successful' });
    } else {
      res.status(401).json({ error: 'Invalid email or password' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed', details: err.message });
  }
});

// Send Email to Many Recipients
router.post('/send-email', async (req, res) => {
  const { from, to, subject, body, emailPassword } = req.body;

  try {
    // Ensure `to` is an array of email addresses
    if (!Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ error: '`to` must be a non-empty array of email addresses' });
    }

    // Find the user by the `from` email address
    const user = await User.findOne({ email: from });

    if (!user) {
      return res.status(404).json({ error: 'Sender email not found' });
    }

    // Validate the provided email password
    const isPasswordValid = await bcrypt.compare(emailPassword, user.emailPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email password' });
    }

    // Configure Nodemailer with the user's credentials
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      auth: {
        user: from,
        pass: emailPassword, // Use the provided app password
      },
    });

    // Send emails to each recipient
    const emailPromises = to.map(recipient =>
      transporter.sendMail({
        from,
        to: recipient,
        subject,
        text: body,
      })
    );

    await Promise.all(emailPromises); // Wait for all emails to be sent

    // Save the email data to MongoDB for each recipient
    const emailDocs = to.map(recipient => ({
      from,
      to: recipient,
      subject,
      body,
    }));

    await Email.insertMany(emailDocs);

    res.json({ message: 'Emails sent and saved successfully' });
  } catch (err) {
    console.error('Error:', err); // Debugging
    res.status(500).json({ error: 'Email sending failed', details: err.message });
  }
});

module.exports = router;
