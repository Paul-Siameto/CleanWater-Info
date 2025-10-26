# CleanWater-Info

## Setup

### Backend
1. Copy `backend/.env.example` to `backend/.env` and fill values.
2. Install deps:
   - `cd backend && npm i`
3. Run API:
   - `npm run dev`

API will run at `http://localhost:4000`.

### Frontend
1. Copy `frontend/.env.example` to `frontend/.env` and fill Firebase values.
2. Install deps:
   - `cd frontend && npm i`
3. Run app:
   - `npm run dev`

App will run at `http://localhost:5173` and expects API at `/api` (use a dev proxy or run both with matching origins).

## Notes
- MVP stores reports in-memory until MongoDB is configured.
- Map tiles use OSM by default. You can switch to Mapbox later.
- Auth uses Firebase (Google Sign-In demo). Backend verifies Firebase ID tokens if service account env is set.
