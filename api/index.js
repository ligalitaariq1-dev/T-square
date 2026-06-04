// api/index.js – Express server for Vercel with static file serving
const express = require('express');
const path = require('path');
const fetch = globalThis.fetch ?? require('node-fetch');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

app.use(express.json());

// Serve static files from organization-website (CSS, images, etc)
app.use(express.static(path.join(__dirname, '../organization-website')));

// Helper: call Gemini API
async function queryGemini(message) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set in environment');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ role: 'user', parts: [{ text: message }] }]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} – ${errText}`);
  }

  const data = await response.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return reply || 'I could not generate a response.';
}

app.post('/api/gemini', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Missing `message` in request body' });
    }
    const reply = await queryGemini(message);
    res.json({ reply });
  } catch (err) {
    console.error('Gemini request failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return res.status(400).json({ error: 'Invalid or missing name' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) {
      return res.status(400).json({ error: 'Invalid or missing email address' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 5000) {
      return res.status(400).json({ error: 'Invalid or missing message' });
    }

    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const recipient = process.env.CONTACT_RECIPIENT || 'ligalitaariq@gmail.com';

    const isPlaceholder = (str) => !str || str.startsWith('YOUR_') || str.includes('YOUR_GMAIL_') || str.includes('YOUR_GEMINI_');

    if (isPlaceholder(user) || isPlaceholder(pass)) {
      console.warn('SMTP credentials not configured. Logging submission to console.');
      console.log(`[DEV SUBMISSION] From: ${name} <${email}>, Message: ${message}`);
      return res.json({ 
        success: true, 
        message: 'Message received! (Running in sandbox: SMTP credentials not set).' 
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    const mailOptions = {
      from: `"${name}" <${email}>`,
      to: recipient,
      subject: `New T-Square Contact Form Submission from ${name}`,
      text: `You have received a new message from the contact form on T-Square website:\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      replyTo: email
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Your message has been sent successfully!' });

  } catch (err) {
    console.error('Contact submission failed:', err);
    res.status(500).json({ error: 'An internal error occurred while processing your message.' });
  }
});

// Fallback to index.html for SPA (must be last)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../organization-website/index.html'));
});

module.exports = app;

