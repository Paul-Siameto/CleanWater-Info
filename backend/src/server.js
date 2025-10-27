import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import axios from 'axios';
import admin from 'firebase-admin';
import Report from './models/Report.js';
import Comment from './models/Comment.js';
import crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import User from './models/User.js';

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

// Admin: upsert user role
app.post('/api/admin/users/role', authRequired, async (req, res) => {
  try {
    let isAdmin = false;
    if (req.user?.uid) {
      const me = await User.findOne({ uid: req.user.uid });
      if (me && me.role === 'admin') isAdmin = true;
    }
    const devBypass = !admin.apps.length || process.env.DEV_ALLOW_UNAUTH === 'true';
    if (!isAdmin && !devBypass) return res.status(403).json({ error: 'forbidden' });
    const { uid, role, displayName, email } = req.body || {};
    const allowed = ['citizen','ngo','gov','lab','admin'];
    if (!uid || !allowed.includes(role)) return res.status(400).json({ error: 'invalid_payload' });
    const doc = await User.findOneAndUpdate(
      { uid },
      { uid, role, ...(displayName ? { displayName } : {}), ...(email ? { email } : {}) },
      { upsert: true, new: true }
    );
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: 'role_upsert_failed' });
  }
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

// Auth-required middleware
function authRequired(req, res, next) {
  // Allow unauthenticated access in dev if Firebase Admin is not initialized
  // or when explicitly enabled via DEV_ALLOW_UNAUTH=true
  const devBypass = !admin.apps.length || process.env.DEV_ALLOW_UNAUTH === 'true';
  if (!req.user && !devBypass) return res.status(401).json({ error: 'auth_required' });
  next();
}

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Reports - MongoDB backed
app.get('/api/reports', async (req, res) => {
  try {
    const { limit = 100, page = 1, status, fromDate, toDate, bbox } = req.query;
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
    const lim = Math.max(1, Math.min(200, Number(limit)));
    const pg = Math.max(1, Number(page));
    const skip = (pg - 1) * lim;
    const [items, total] = await Promise.all([
      Report.find(q).sort({ createdAt: -1 }).skip(skip).limit(lim),
      Report.countDocuments(q),
    ]);
    res.json({ items, total, page: pg, pages: Math.ceil(total / lim) });
  } catch (e) {
    res.status(500).json({ error: 'reports_list_failed' });
  }
});

app.post('/api/reports', authRequired, async (req, res) => {
  try {
    const { lat, lng, notes, photos = [] } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'lat and lng are required numbers' });
    }
    let weatherSnapshot = null;
    // Optional weather
    if (process.env.OPENWEATHER_API_KEY) {
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${process.env.OPENWEATHER_API_KEY}&units=metric`;
        const { data } = await axios.get(url);
        weatherSnapshot = {
          main: data?.weather?.[0]?.main,
          desc: data?.weather?.[0]?.description,
          temp: data?.main?.temp,
          humidity: data?.main?.humidity,
          wind: data?.wind?.speed,
        };
      } catch {}
    }

    const doc = await Report.create({
      reporterId: req.user?.uid || null,
      location: { type: 'Point', coordinates: [lng, lat] },
      notes: notes || '',
      photos,
      status: 'pending',
      weatherSnapshot,
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

// Update status (basic role check, dev bypass allows all)
app.patch('/api/reports/:id/status', authRequired, async (req, res) => {
  try {
    const allowed = ['pending','flagged','verified','rejected'];
    const { status } = req.body || {};
    if (!allowed.includes(status)) return res.status(400).json({ error: 'invalid_status' });
    // Basic role-based check: only ngo/gov/lab/admin may update status
    let allowedRole = false;
    if (req.user?.uid) {
      const u = await User.findOne({ uid: req.user.uid });
      if (u && ['ngo','gov','lab','admin'].includes(u.role)) allowedRole = true;
    }
    const devBypass = !admin.apps.length || process.env.DEV_ALLOW_UNAUTH === 'true';
    if (!allowedRole && !devBypass) return res.status(403).json({ error: 'forbidden' });
    const doc = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!doc) return res.status(404).json({ error: 'not_found' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: 'status_update_failed' });
  }
});

// Gemini-based regional summary (fallback to basic if key missing)
app.get('/api/analytics/summary', async (req, res) => {
  try {
    const { fromDate, toDate, bbox } = req.query;
    const q = {};
    if (fromDate || toDate) {
      q.createdAt = {};
      if (fromDate) q.createdAt.$gte = new Date(fromDate);
      if (toDate) q.createdAt.$lte = new Date(toDate);
    }
    if (bbox) {
      const parts = String(bbox).split(',').map(Number);
      if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
        const [minLng, minLat, maxLng, maxLat] = parts;
        q['location'] = { $geoWithin: { $box: [[minLng, minLat],[maxLng, maxLat]] } };
      }
    }
    const [total, pending, verified, flagged, rejected] = await Promise.all([
      Report.countDocuments(q),
      Report.countDocuments({ ...q, status: 'pending' }),
      Report.countDocuments({ ...q, status: 'verified' }),
      Report.countDocuments({ ...q, status: 'flagged' }),
      Report.countDocuments({ ...q, status: 'rejected' }),
    ]);

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.json({
        provider: 'basic',
        summary: `Total ${total}, Verified ${verified}, Pending ${pending}, Flagged ${flagged}, Rejected ${rejected}.`,
        stats: { total, verified, pending, flagged, rejected },
      });
    }
    try {
      const prompt = `Summarize these water report stats in 2-3 short bullet points for NGOs. Total=${total}, Verified=${verified}, Pending=${pending}, Flagged=${flagged}, Rejected=${rejected}. Provide actionable insight.`;
      const { data } = await axios.post(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
        { contents: [{ parts: [{ text: prompt }] }] },
        { params: { key: geminiKey } }
      );
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      res.json({ provider: 'gemini', summary: text, stats: { total, verified, pending, flagged, rejected } });
    } catch (e) {
      res.json({
        provider: 'basic',
        summary: `Total ${total}, Verified ${verified}, Pending ${pending}, Flagged ${flagged}, Rejected ${rejected}.`,
        stats: { total, verified, pending, flagged, rejected },
      });
    }
  } catch (e) {
    res.status(500).json({ error: 'summary_failed' });
  }
});

app.post('/api/reports/:id/comments', authRequired, async (req, res) => {
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

app.get('/api/media/signature', (req, res) => {
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = { timestamp };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, process.env.CLOUDINARY_API_SECRET);
    res.json({ timestamp, signature, cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY });
  } catch (e) {
    res.status(500).json({ error: 'signature_failed' });
  }
});

// AI analyze stub: sets aiLabel/aiScore
app.post('/api/reports/:id/ai/analyze', authRequired, async (req, res) => {
  try {
    const doc = await Report.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'not_found' });
    // Try Hugging Face Inference API; fallback to stub
    const hfKey = process.env.HUGGINGFACE_API_KEY;
    const hfModel = process.env.HUGGINGFACE_MODEL || 'microsoft/resnet-50';
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (hfKey && cloudName && doc.photos && doc.photos.length > 0) {
      try {
        const publicId = doc.photos[0];
        const imgUrl = `https://res.cloudinary.com/${cloudName}/image/upload/f_jpg/${publicId}.jpg`;
        const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer' });
        const hfRes = await axios.post(
          `https://api-inference.huggingface.co/models/${hfModel}`,
          imgRes.data,
          {
            headers: {
              'Authorization': `Bearer ${hfKey}`,
              'Content-Type': 'application/octet-stream',
              'Accept': 'application/json',
            },
            timeout: 30000,
          }
        );
        // Response is array of {label, score}
        const preds = Array.isArray(hfRes.data) ? hfRes.data : [];
        const top = preds[0] || {};
        doc.aiLabel = top.label || 'unknown';
        doc.aiScore = typeof top.score === 'number' ? Number(top.score.toFixed(2)) : null;
        await doc.save();
        return res.json({ aiLabel: doc.aiLabel, aiScore: doc.aiScore, provider: 'huggingface' });
      } catch (e) {
        // fall through to stub
      }
    }
    // Stub fallback
    doc.aiLabel = 'possible_contamination';
    doc.aiScore = 0.72;
    await doc.save();
    res.json({ aiLabel: doc.aiLabel, aiScore: doc.aiScore, provider: 'stub' });
  } catch (e) {
    res.status(500).json({ error: 'ai_analyze_failed' });
  }
});

// CSV export with same filters as list
app.get('/api/reports.csv', async (req, res) => {
  try {
    const { limit = 10000, page = 1, status, fromDate, toDate, bbox } = req.query;
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
        q['location'] = { $geoWithin: { $box: [[minLng, minLat],[maxLng, maxLat]] } };
      }
    }
    const lim = Math.max(1, Math.min(50000, Number(limit)));
    const pg = Math.max(1, Number(page));
    const skip = (pg - 1) * lim;
    const items = await Report.find(q).sort({ createdAt: -1 }).skip(skip).limit(lim);
    const header = ['_id','status','reporterId','lng','lat','notes','photos','aiLabel','aiScore','createdAt'];
    const lines = [header.join(',')];
    for (const r of items) {
      const lng = r.location?.coordinates?.[0] ?? '';
      const lat = r.location?.coordinates?.[1] ?? '';
      const row = [
        r._id,
        r.status ?? '',
        r.reporterId ?? '',
        lng,
        lat,
        JSON.stringify(r.notes ?? '').replaceAll('"','""'),
        (r.photos || []).join('|'),
        r.aiLabel ?? '',
        r.aiScore ?? '',
        r.createdAt?.toISOString?.() ?? '',
      ];
      lines.push(row.join(','));
    }
    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="reports.csv"');
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: 'csv_export_failed' });
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
