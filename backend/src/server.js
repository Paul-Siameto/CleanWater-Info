import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';
import admin from 'firebase-admin';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Firebase Admin initialization (optional; requires env vars)
if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
      console.log('Firebase Admin initialized');
    }
  } catch (e) {
    console.error('Failed to init Firebase Admin', e.message);
  }
}

// MongoDB connection (optional during first run)
const mongoUri = process.env.MONGO_URI;
if (mongoUri) {
  mongoose
    .connect(mongoUri)
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.error('MongoDB connection error', err.message));
}

// Simple auth middleware using Firebase ID tokens (if configured)
async function authOptional(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
  if (token && admin.apps.length) {
    try {
      const decoded = await admin.auth().verifyIdToken(token);
      req.user = decoded;
    } catch (e) {
      // token invalid; continue as unauthenticated
    }
  }
  next();
}

app.use(authOptional);

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Minimal in-memory reports for MVP scaffold
const reports = [];

app.get('/api/reports', (req, res) => {
  res.json({ items: reports });
});

app.post('/api/reports', (req, res) => {
  const { lat, lng, notes, photos = [] } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng are required numbers' });
  }
  const item = {
    id: String(Date.now()),
    location: { type: 'Point', coordinates: [lng, lat] },
    notes: notes || '',
    photos,
    status: 'pending',
    createdAt: new Date().toISOString(),
    reporterId: req.user?.uid || null,
  };
  reports.push(item);
  res.status(201).json(item);
});

// Weather proxy (OpenWeather) - optional during first run
app.get('/api/weather/current', async (req, res) => {
  const { lat, lng } = req.query;
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return res.json({ skip: true });
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;
    const { data } = await axios.get(url);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'weather_failed' });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
