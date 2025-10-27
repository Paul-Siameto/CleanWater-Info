import React, { useEffect, useState } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from 'firebase/auth'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import api from './lib/api'
import { getFirebaseConfig } from './lib/firebase'
import ReportList from './components/ReportList'
import ReportDetail from './components/ReportDetail'
import { getUploadSignature, uploadImageToCloudinary } from './lib/cloudinary'
import { queueReport } from './lib/offline'

const firebaseApp = initializeApp(getFirebaseConfig())
const auth = getAuth(firebaseApp)
const provider = new GoogleAuthProvider()

export default function App() {
  const [user, setUser] = useState(null)
  const [reports, setReports] = useState([])
  const [position, setPosition] = useState({ lat: 0, lng: 0 })
  const [selected, setSelected] = useState(null)
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [useBbox, setUseBbox] = useState(false)
  const [bbox, setBbox] = useState(null) // [minLng,minLat,maxLng,maxLat]

  useEffect(() => {
    onAuthStateChanged(auth, (u) => setUser(u))
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }))
    }
    fetchReports(1, statusFilter)
  }, [])

  async function fetchReports(nextPage = page, status = statusFilter, nextBbox = bbox) {
    const params = { page: nextPage, limit: 20 }
    if (status) params.status = status
    if (useBbox && nextBbox && nextBbox.length === 4) params.bbox = nextBbox.join(',')
    const { data } = await api.get('/reports', { params })
    setReports(data.items || [])
    setPage(data.page || nextPage)
    setPages(data.pages || 1)
  }

  async function handleSignIn() {
    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      await signInWithRedirect(auth, provider)
    }
  }

  async function handleSignOut() {
    await signOut(auth)
  }

  async function createReport() {
    if (!position.lat || !position.lng) return
    try {
      const token = await auth.currentUser?.getIdToken?.()
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined
      const photos = []
      if (file && file.length) {
        try {
          const sig = await getUploadSignature(auth)
          for (const f of Array.from(file)) {
            try {
              const uploaded = await uploadImageToCloudinary(f, sig)
              if (uploaded?.public_id) photos.push(uploaded.public_id)
            } catch (e) { /* skip individual failures */ }
          }
        } catch (e) {
          console.warn('Photo uploads skipped:', e?.message || e)
        }
      }
      await api.post('/reports', {
        lat: position.lat,
        lng: position.lng,
        notes: notes || 'Suspicious water sample',
        photos,
      }, headers ? { headers } : undefined)
      setNotes('')
      setFile(null)
      await fetchReports(1, statusFilter, bbox)
    } catch (e) {
      // Only queue offline if the API request itself failed
      try {
        await queueReport({
          lat: position.lat,
          lng: position.lng,
          notes: notes || 'Suspicious water sample',
          photos: [],
          createdAt: Date.now(),
        })
        alert('No network or not signed in. Report queued offline.')
      } finally {
        setNotes('')
        setFile(null)
      }
    }
  }

  function MapEventsBinder() {
    useMapEvents({
      moveend: (e) => {
        if (!useBbox) return
        const b = e.target.getBounds()
        const next = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
        setBbox(next)
        fetchReports(1, statusFilter, next)
      },
    })
    return null
  }

  return (
    <div className="h-full flex flex-col">
      <header className="p-3 border-b flex items-center justify-between">
        <div className="font-semibold">CleanWater-Info</div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full" />
              <span className="text-sm">{user.displayName}</span>
              <button className="px-3 py-1 border rounded" onClick={handleSignOut}>Sign out</button>
            </>
          ) : (
            <button className="px-3 py-1 border rounded" onClick={handleSignIn}>Sign in</button>
          )}
        </div>
      </header>

      <main className="flex-1 grid lg:grid-cols-3">
        <div className="h-[50vh] lg:h-full lg:col-span-2">
          <MapContainer center={[position.lat || 0, position.lng || 0]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
              url="/tiles/{z}/{x}/{y}.png"
              crossOrigin={true}
              referrerPolicy="no-referrer"
            />
            <MapEventsBinder />
            {reports.map((r) => (
              <Marker key={r._id || r.id} position={[r.location.coordinates[1], r.location.coordinates[0]]}>
                <Popup>
                  <div className="text-sm">
                    <div>Status: {r.status}</div>
                    <div>Notes: {r.notes}</div>
                    <div>By: {r.reporterId || 'anon'}</div>
                    <button className="mt-2 px-2 py-1 border rounded text-xs" onClick={() => setSelected(r)}>Open</button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <div className="p-4 space-y-3 lg:col-span-1 h-full">
          <h2 className="font-semibold">Reports</h2>
          <div className="space-y-2">
            <label className="block text-sm">Status Filter</label>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={statusFilter}
              onChange={async (e) => { setStatusFilter(e.target.value); await fetchReports(1, e.target.value) }}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="verified">Verified</option>
              <option value="flagged">Flagged</option>
              <option value="rejected">Rejected</option>
            </select>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={useBbox} onChange={async (e) => { const v = e.target.checked; setUseBbox(v); const next = v && bbox ? bbox : null; await fetchReports(1, statusFilter, next); }} /> Limit to map view</label>
          </div>
          <div className="space-y-2">
            <label className="block text-sm">Notes</label>
            <input className="border rounded w-full px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe the issue" />
            <input className="border rounded w-full px-3 py-2 text-sm" type="file" accept="image/*" multiple onChange={(e) => setFile(e.target.files || null)} />
            <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={createReport}>Create Report at My Location</button>
            {file && file.length ? (
              <div className="text-xs text-gray-500">{file.length} image(s) selected</div>
            ) : null}
          </div>
          <div className="grid grid-rows-2 gap-3 h-[calc(100%-4rem)]">
            <ReportList
              reports={reports}
              selectedId={selected?._id || selected?.id}
              onSelect={(r) => setSelected(r)}
            />
            <div className="border rounded overflow-hidden">
              <ReportDetail report={selected} auth={auth} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <button className="px-3 py-1 border rounded text-sm" disabled={page <= 1} onClick={() => fetchReports(page - 1, statusFilter)}>Prev</button>
            <div className="text-xs text-gray-600">Page {page} / {pages}</div>
            <button className="px-3 py-1 border rounded text-sm" disabled={page >= pages} onClick={() => fetchReports(page + 1, statusFilter)}>Next</button>
          </div>
          <div className="pt-2">
            <button
              className="px-3 py-1 border rounded text-sm"
              onClick={() => {
                const params = new URLSearchParams()
                params.set('page', String(page))
                params.set('limit', '1000')
                if (statusFilter) params.set('status', statusFilter)
                if (useBbox && bbox) params.set('bbox', bbox.join(','))
                const url = `/api/reports.csv?${params.toString()}`
                window.open(url, '_blank')
              }}
            >Export CSV</button>
          </div>
        </div>
      </main>
    </div>
  )
}
