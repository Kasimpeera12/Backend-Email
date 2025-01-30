const express = require('express');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { simpleParser } = require('mailparser');
const Imap = require('imap');
const User = require('../models/User');
const Email = require('../models/Email');

const router = express.Router();

// Helper function to fetch emails with full content
const fetchEmailsFromImap = (imapConfig) => {
  return new Promise((resolve, reject) => {
    const imap = new Imap(imapConfig);
    const emails = [];

    imap.once('ready', () => {
      imap.openBox('INBOX', true, (err) => {
        if (err) {
          console.error('Error opening inbox:', err.message);
          return reject(new Error('Failed to open inbox: ' + err.message));
        }

        // Search for the latest emails
        imap.search(['ALL'], (err, results) => {
          if (err) {
            console.error('Error searching inbox:', err.message);
            return reject(new Error('Failed to search inbox: ' + err.message));
          }

          if (!results || results.length === 0) {
            console.log('No emails found');
            return resolve([]); // No emails found
          }

          const fetch = imap.fetch(results, { bodies: '', struct: true });

          fetch.on('message', (msg, seqno) => {
            let emailData = '';

            msg.on('body', (stream) => {
              stream.on('data', (chunk) => {
                emailData += chunk.toString();
              });
            });

            msg.once('end', () => {
              simpleParser(emailData, (err, parsed) => {
                if (err) {
                  console.error('Error parsing email:', err.message);
                } else {
                  emails.push({
                    id: seqno,
                    subject: parsed.subject || '(No Subject)',
                    from: parsed.from?.text || '(Unknown Sender)',
                    to: parsed.to?.text || '(Unknown Recipient)',
                    body: parsed.text || parsed.html || '(No Content)',
                    date: parsed.date || new Date(),
                  });
                }
              });
            });
          });

          fetch.once('error', (err) => {
            console.error('Error fetching message:', err.message);
            reject(new Error('Failed to fetch emails: ' + err.message));
          });

          fetch.once('end', () => {
            console.log('Finished fetching all emails');
            resolve(emails);
          });
        });
      });
    });

    imap.once('error', (err) => {
      console.error('IMAP error:', err.message);
      reject(new Error('IMAP connection failed: ' + err.message));
    });

    imap.connect();
  });
};

// User Registration
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, emailPassword } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const emailPasswordEncrypted = emailPassword ? await bcrypt.hash(emailPassword, 10) : null;

    const user = new User({ username, email, password: hashedPassword, emailPassword: emailPasswordEncrypted });
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

// Send Email
router.post('/send-email', async (req, res) => {
  const { from, to, subject, body, emailPassword } = req.body;

  try {
    if (!Array.isArray(to) || to.length === 0) {
      return res.status(400).json({ error: 'Recipient list must be a non-empty array' });
    }

    const sender = await User.findOne({ email: from });
    if (!sender) {
      return res.status(404).json({ error: 'Sender email not found' });
    }

    const isPasswordValid = await bcrypt.compare(emailPassword, sender.emailPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email password' });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: from,
        pass: emailPassword,
      },
    });

    const mailOptions = {
      from,
      to: to.join(','),
      subject,
      text: body,
    };

    await transporter.sendMail(mailOptions);

    const sentEmail = new Email({ from, to, subject, body, folder: 'Sent' });
    await sentEmail.save();

    const inboxEmails = to.map((recipient) => ({
      from,
      to: [recipient],
      subject,
      body,
      folder: 'Inbox',
    }));
    await Email.insertMany(inboxEmails);

    res.json({ message: 'Email sent successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Email sending failed', details: err.message });
  }
});

// Fetch Emails from Inbox (IMAP)
router.get('/inbox', async (req, res) => {
  const { email, emailPassword } = req.query;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isPasswordValid = await bcrypt.compare(emailPassword, user.emailPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email password' });
    }

    const imapConfig = {
      user: email,
      password: emailPassword,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    };

    const emails = await fetchEmailsFromImap(imapConfig);
    res.json(emails);
  } catch (err) {
    console.error('Error fetching emails:', err.message);
    res.status(500).json({ error: 'Failed to fetch emails', details: err.message });
  }
});

module.exports = router;
