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
import { queueReport, flushQueuedReports } from './lib/offline'
import AdminRoles from './components/AdminRoles'

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
  const [previews, setPreviews] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [useBbox, setUseBbox] = useState(false)
  const [bbox, setBbox] = useState(null) // [minLng,minLat,maxLng,maxLat]
  const [zoomLevel, setZoomLevel] = useState(13)
  const [useCluster, setUseCluster] = useState(true)

  useEffect(() => {
    onAuthStateChanged(auth, (u) => setUser(u))
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }))
    }
    fetchReports(1, statusFilter)
    // SW background sync handler
    navigator.serviceWorker?.addEventListener?.('message', async (event) => {
      if (event?.data?.type === 'flush-reports') {
        try { await flushQueuedReports(api, auth) } catch {}
      }
    })
    // Online trigger
    window.addEventListener('online', async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration?.()
        if (reg?.sync) {
          try { await reg.sync.register('flush-reports') } catch { await flushQueuedReports(api, auth) }
        } else {
          await flushQueuedReports(api, auth)
        }
      } catch {}
    })
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
      zoomend: (e) => {
        setZoomLevel(e.target.getZoom())
      }
    })
    return null
  }

  function getClusteredMarkers() {
    if (!useCluster) return reports.map((r) => ({ type: 'single', report: r }))
    // Grid size tuned by zoom
    const z = zoomLevel || 13
    const grid = z >= 14 ? 0.005 : z >= 12 ? 0.01 : z >= 10 ? 0.02 : 0.05
    const buckets = new Map()
    for (const r of reports) {
      const lat = r.location.coordinates[1]
      const lng = r.location.coordinates[0]
      const key = `${Math.floor(lng / grid)}:${Math.floor(lat / grid)}`
      if (!buckets.has(key)) buckets.set(key, { items: [], latSum: 0, lngSum: 0 })
      const b = buckets.get(key)
      b.items.push(r)
      b.latSum += lat
      b.lngSum += lng
    }
    const clusters = []
    for (const [, b] of buckets) {
      if (b.items.length === 1) {
        clusters.push({ type: 'single', report: b.items[0] })
      } else {
        clusters.push({ type: 'cluster', count: b.items.length, lat: b.latSum / b.items.length, lng: b.lngSum / b.items.length, items: b.items })
      }
    }
    return clusters
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
            {getClusteredMarkers().map((item, idx) => {
              if (item.type === 'single') {
                const r = item.report
                return (
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
                )
              }
              return (
                <Marker key={`cluster-${idx}-${item.lat}-${item.lng}`} position={[item.lat, item.lng]}>
                  <Popup>
                    <div className="text-sm">
                      <div>Cluster: {item.count} reports</div>
                      <button className="mt-2 px-2 py-1 border rounded text-xs" onClick={() => setSelected(item.items[0])}>Open first</button>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
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
            <div className="text-xs text-gray-500">BBox: {useBbox && bbox ? bbox.map(n=>n.toFixed(4)).join(', ') : '—'}</div>
            <button className="px-2 py-1 border rounded text-xs" onClick={() => fetchReports(1, statusFilter, bbox)}>Refresh</button>
          </div>
          <div className="space-y-2">
            <label className="block text-sm">Notes</label>
            <input className="border rounded w-full px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe the issue" />
            <input className="border rounded w-full px-3 py-2 text-sm" type="file" accept="image/*" multiple onChange={(e) => { const fl = e.target.files || null; setFile(fl); if (fl && fl.length) { const arr = Array.from(fl).slice(0,6).map(f => ({ name: f.name, url: URL.createObjectURL(f) })); setPreviews(arr) } else { setPreviews([]) } }} />
            <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={createReport}>Create Report at My Location</button>
            {file && file.length ? (
              <div className="text-xs text-gray-500">{file.length} image(s) selected</div>
            ) : null}
            {previews.length ? (
              <div className="flex flex-wrap gap-2">
                {previews.map((p) => (
                  <img key={p.url} src={p.url} alt={p.name} className="w-16 h-16 object-cover rounded border" />
                ))}
              </div>
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
          <div className="pt-2">
            <AdminRoles auth={auth} />
          </div>
        </div>
      </main>
    </div>
  )
}
