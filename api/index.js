// api/index.js – Vercel serverless entry point
// ----------------------------------------------------------
// This file mirrors the functionality of the original server.js but uses ESM imports
// (required because "type": "module" is set in package.json). It is exported as the
// default Express app, which Vercel automatically invokes as a serverless function.

import express from 'express';
import fetch from 'node-fetch';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config(); // Load .env variables (ignored via .gitignore)

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ---------------------------------------------------------------------
// Helper: call Gemini API – same validation & error handling as original.
// ---------------------------------------------------------------------
async function queryGemini(message) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set in environment');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const body = { contents: [{ role: 'user', parts: [{ text: message }] }] };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} – ${errText}`);
  }

  const data = await response.json();
  const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return reply || 'I could not generate a response.';
}

// ---------------------------------------------------------------------
// /gemini endpoint – forwards a message to Gemini and returns the reply.
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// /contact endpoint – validates input and sends an email via SMTP.
// ---------------------------------------------------------------------
app.post('/contact', async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Input validation (length & format checks)
    if (!name || typeof name !== 'string' || name.trim().length === 0 || name.length > 100) {
      return res.status(400).json({ error: 'Invalid or missing name' });
    }
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) {
      return res.status(400).json({ error: 'Invalid or missing email address' });
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0 || message.length > 5000) {
      return res.status(400).json({ error: 'Invalid or missing message' });
    }

    // SMTP configuration – pulled from environment variables.
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT, 10) || 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const recipient = process.env.CONTACT_RECIPIENT || 'ligalitaariq@gmail.com';

    const isPlaceholder = (str) => !str || str.startsWith('YOUR_') || str.includes('YOUR_GMAIL_');
    if (isPlaceholder(user) || isPlaceholder(pass)) {
      console.warn('SMTP credentials not configured – running in dev mode. Logging submission details only.');
      console.log(`[DEV SUBMISSION] From: ${name} <${email}>, Message: ${message}`);
      return res.json({
        success: true,
        message: 'Message received! (SMTP not configured – see server logs).',
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const mailOptions = {
      from: `"${name}" <${email}>`,
      to: recipient,
      subject: `New T‑Square Contact Form Submission from ${name}`,
      text: `You have received a new message from the contact form:\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      replyTo: email,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Your message has been sent successfully!' });
  } catch (err) {
    console.error('Contact submission failed:', err);
    res.status(500).json({ error: 'An internal error occurred while processing your message.' });
  }
});

// ---------------------------------------------------------------------
// Serve static website assets (organization-website folder).
// ---------------------------------------------------------------------
app.use(express.static('organization-website', {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) res.set('Content-Type', 'text/css');
    if (filePath.endsWith('.js')) res.set('Content-Type', 'application/javascript');
  },
}));

// Fallback for SPA routes – return index.html for non‑file paths.
app.use((req, res, next) => {
  // If request includes a file extension, let static middleware handle 404
  if (req.path.includes('.')) {
    return next();
  }
  // Otherwise serve the SPA entry point
  res.sendFile(path.join(process.cwd(), 'organization-website', 'index.html'));
});

// Export the Express app for Vercel.
export default app;

// Start the server locally when not running in Vercel (e.g., npm start)
if (!process.env.VERCEL) {
  const listenPort = PORT;
  app.listen(listenPort, () => {
    console.log(`🚀 Local server listening on http://localhost:${listenPort}`);
  });
}
