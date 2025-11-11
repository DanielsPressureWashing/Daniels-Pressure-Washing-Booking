import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import nodemailer from 'nodemailer';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const BRAND_NAME = process.env.BRAND_NAME || "Pressure Washing";
const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE || "America/Los_Angeles";

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('tiny'));
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
let db;
async function initDb() {
  db = await open({
    filename: path.join(__dirname, 'data.sqlite'),
    driver: sqlite3.Database
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      serviceType TEXT NOT NULL,
      sqft INTEGER,
      preferredDate TEXT NOT NULL,
      preferredTime TEXT NOT NULL,
      notes TEXT,
      createdAt TEXT NOT NULL
    )
  `);
}

// Nodemailer transporter
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    console.warn('SMTP environment variables missing. Email will fail without them.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: { user, pass }
  });
}

// Simple validators
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function isPhone(v) { return /^[0-9\-\+\(\)\s]{7,}$/.test(v); }
function sanitizeText(v) { return String(v || '').trim().slice(0, 2000); }
function sanitizeSmallText(v) { return String(v || '').trim().slice(0, 200); }
function toInt(v, def = null) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

// Creates a simple ICS calendar string for the booking
function buildICS({ summary, description, startISO, endISO }) {
  // Convert ISO to basic UTC format YYYYMMDDTHHMMSSZ
  const toICSDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const uid = `booking-${Date.now()}@pressurewash`;
  const dtstamp = toICSDate(new Date().toISOString());
  const dtstart = toICSDate(startISO);
  const dtend = toICSDate(endISO);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PressureWash//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, brand: BRAND_NAME });
});

app.post('/api/bookings', async (req, res) => {
  try {
    const {
      name, email, phone, address,
      serviceType, sqft, preferredDate, preferredTime,
      notes, website // honeypot
    } = req.body || {};

    // Honeypot: if "website" filled, probably a bot
    if (website && website.trim() !== '') {
      return res.status(200).json({ ok: true, message: 'Thanks!' });
    }

    // Basic validation
    if (!name || !email || !phone || !address || !serviceType || !preferredDate || !preferredTime) {
      return res.status(400).json({ ok: false, error: 'Missing required fields.' });
    }
    if (!isEmail(email)) return res.status(400).json({ ok: false, error: 'Invalid email address.' });
    if (!isPhone(phone)) return res.status(400).json({ ok: false, error: 'Invalid phone number.' });

    const clean = {
      name: sanitizeSmallText(name),
      email: sanitizeSmallText(email),
      phone: sanitizeSmallText(phone),
      address: sanitizeText(address),
      serviceType: sanitizeSmallText(serviceType),
      sqft: toInt(sqft, null),
      preferredDate: sanitizeSmallText(preferredDate),
      preferredTime: sanitizeSmallText(preferredTime),
      notes: sanitizeText(notes)
    };

    const createdAt = new Date().toISOString();
    await db.run(
      `INSERT INTO bookings
       (name, email, phone, address, serviceType, sqft, preferredDate, preferredTime, notes, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [clean.name, clean.email, clean.phone, clean.address, clean.serviceType, clean.sqft, clean.preferredDate, clean.preferredTime, clean.notes, createdAt]
    );

    // Build email details
    const appointmentStart = new Date(`${clean.preferredDate}T${clean.preferredTime}:00`);
    const appointmentEnd = new Date(appointmentStart.getTime() + 60*60*1000); // 1 hour block
    const summary = `${BRAND_NAME} — ${clean.serviceType}`;
    const description = [
      `Name: ${clean.name}`,
      `Email: ${clean.email}`,
      `Phone: ${clean.phone}`,
      `Address: ${clean.address}`,
      `Service: ${clean.serviceType}`,
      `Sq Ft: ${clean.sqft ?? 'N/A'}`,
      `Preferred: ${clean.preferredDate} ${clean.preferredTime}`,
      clean.notes ? `Notes: ${clean.notes}` : ''
    ].filter(Boolean).join('\n');

    const ics = buildICS({
      summary,
      description,
      startISO: appointmentStart.toISOString(),
      endISO: appointmentEnd.toISOString()
    });

    const transporter = getTransporter();
    const toEmail = process.env.TO_EMAIL;
    const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER;

    // Email to business owner
    const ownerMail = {
      from: fromEmail,
      to: toEmail,
      subject: `New Booking — ${clean.name} — ${clean.serviceType}`,
      text: description,
      attachments: [{
        filename: 'booking.ics',
        content: ics,
        contentType: 'text/calendar'
      }]
    };

    // Confirmation to customer
    const customerMail = {
      from: fromEmail,
      to: clean.email,
      subject: `Thanks! We received your request — ${BRAND_NAME}`,
      text: `Hi ${clean.name},\n\nThanks for reaching out to ${BRAND_NAME}!\n\nWe have your request for ${clean.serviceType} at ${clean.address} on ${clean.preferredDate} at ${clean.preferredTime}. We'll confirm shortly.\n\n— ${BRAND_NAME}`,
      attachments: [{
        filename: 'booking.ics',
        content: ics,
        contentType: 'text/calendar'
      }]
    };

    if (!toEmail) {
      console.warn('TO_EMAIL not set — skipping owner notification');
    } else {
      await transporter.sendMail(ownerMail);
    }
    if (isEmail(clean.email)) {
      await transporter.sendMail(customerMail);
    }

    res.json({ ok: true, message: 'Booking received.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error.' });
  }
});

// Serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start
initDb().then(() => {
  app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Failed to init DB', err);
  process.exit(1);
});
