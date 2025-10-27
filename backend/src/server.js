import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';
import admin from 'firebase-admin';
import Report from './models/Report.js';
import Comment from './models/Comment.js';

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
  const dbName = process.env.MONGO_DB_NAME || 'cleanwater-db';
  mongoose
    .connect(mongoUri, { dbName })
    .then(() => console.log(`MongoDB connected (db=${dbName})`))
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

// Reports - MongoDB backed
app.get('/api/reports', async (req, res) => {
  try {
    const { limit = 100, status, fromDate, toDate, bbox } = req.query;
    const q = {};
    if (status) q.status = status;
    if (fromDate || toDate) {
      q.createdAt = {};
      if (fromDate) q.createdAt.$gte = new Date(fromDate);
      if (toDate) q.createdAt.$lte = new Date(toDate);
    }
    if (bbox) {
      const parts = String(bbox).split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        const [minLng, minLat, maxLng, maxLat] = parts;
        q['location'] = {
          $geoWithin: {
            $box: [ [minLng, minLat], [maxLng, maxLat] ],
          },
        };
      }
    }
    const items = await Report.find(q).sort({ createdAt: -1 }).limit(Number(limit));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'reports_list_failed' });
  }
});

app.post('/api/reports', async (req, res) => {
  try {
    const { lat, lng, notes, photos = [] } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat and lng are required numbers' });
    }
    const doc = await Report.create({
      reporterId: req.user?.uid || null,
      location: { type: 'Point', coordinates: [lng, lat] },
      notes: notes || '',
      photos,
      status: 'pending',
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ error: 'report_create_failed' });
  }
});

app.get('/api/reports/:id', async (req, res) => {
  try {
    const doc = await Report.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not_found' });
    res.json(doc);
  } catch (e) {
    res.status(400).json({ error: 'invalid_id' });
  }
});

app.post('/api/reports/:id/comments', async (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || !content.trim()) return res.status(400).json({ error: 'content_required' });
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'report_not_found' });
    const c = await Comment.create({ reportId: report._id, authorId: req.user?.uid || null, content });
    res.status(201).json(c);
  } catch (e) {
    res.status(500).json({ error: 'comment_create_failed' });
  }
});

app.get('/api/reports/:id/comments', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) return res.status(404).json({ error: 'report_not_found' });
    const items = await Comment.find({ reportId: report._id }).sort({ createdAt: 1 });
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'comments_list_failed' });
  }
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
