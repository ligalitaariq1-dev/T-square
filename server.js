// server.js – lightweight Express server for Gemini integration
// ------------------------------------------------------------
// This server provides a single POST endpoint `/gemini` that receives a user
// message, forwards it to Google's Gemini model, and returns the generated
// reply. The Gemini API key is read from the environment variable
// `GEMINI_API_KEY` – **do NOT commit the raw key to source control**.
// ------------------------------------------------------------

const express = require('express');
const fetch = globalThis.fetch ?? require('node-fetch');
const nodemailer = require('nodemailer');
require('dotenv').config(); // loads .env file

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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
  // Extract the generated text – the response structure follows Gemini's API docs
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return reply || 'I could not generate a response.';
}

app.post('/gemini', async (req, res) => {
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

app.post('/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;
    
    // Input validation
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return res.status(400).json({ error: 'Invalid or missing name' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) {
      return res.status(400).json({ error: 'Invalid or missing email address' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 5000) {
      return res.status(400).json({ error: 'Invalid or missing message' });
    }

    // SMTP Configuration from .env
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const recipient = process.env.CONTACT_RECIPIENT || 'ligalitaariq@gmail.com';

    const isPlaceholder = (str) => !str || str.startsWith('YOUR_') || str.includes('YOUR_GMAIL_') || str.includes('YOUR_GEMINI_');

    if (isPlaceholder(user) || isPlaceholder(pass)) {
      // TODO(security): Implement a full KMS for secure production credentials
      console.warn('SMTP credentials not configured in environment (or placeholders used). Logging submission details to server console.');
      console.log(`[DEV SUBMISSION] From: ${name} <${email}>, Message: ${message}`);
      return res.json({ 
        success: true, 
        message: 'Message received! (Running in sandbox: SMTP credentials not set, check server console logs for details).' 
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

// Serve the static website files
app.use(express.static('organization-website'));

// Fallback to index.html for any unknown routes (SPA support)
app.get(/.*/, (req, res) => {
  res.sendFile(require('path').join(__dirname, 'organization-website', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Gemini backend listening on http://localhost:${PORT}`);
});
