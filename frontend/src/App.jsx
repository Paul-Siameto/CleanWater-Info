import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, onAuthStateChanged, signOut } from 'firebase/auth'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Sun, Moon, Droplet, Filter, MapPin, Download, RefreshCw, Eye, EyeOff, TrendingUp, Layers, AlertTriangle, Shield, Users, BarChart3, FileText, Info, Home } from 'lucide-react'
import api from './lib/api'
import { getFirebaseConfig } from './lib/firebase'
import ReportList from './components/ReportList'
import ReportDetail from './components/ReportDetail'
import { getUploadSignature, uploadImageToCloudinary } from './lib/cloudinary'
import { queueReport, flushQueuedReports } from './lib/offline'
import AdminRoles from './components/AdminRoles'
import AnalyticsSummary from './components/AnalyticsSummary'
import KpiRibbon from './components/KpiRibbon'
import AssistantBox from './components/AssistantBox'

const firebaseApp = initializeApp(getFirebaseConfig())
const auth = getAuth(firebaseApp)
const provider = new GoogleAuthProvider()

function AppContent() {
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
  const [showHotspots, setShowHotspots] = useState(false)
  const [hotspots, setHotspots] = useState([])
  const [dark, setDark] = useState(false)
  const [baseLayer, setBaseLayer] = useState('osm') // 'osm' | 'sat' | 'terrain'
  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
  const hasMapbox = Boolean(MAPBOX_TOKEN)
  const [alerts, setAlerts] = useState([])
  const [viewMode, setViewMode] = useState('citizen') // 'citizen' or 'admin'
  const [userRole, setUserRole] = useState(null)

  useEffect(() => {
    onAuthStateChanged(auth, (u) => {
      setUser(u)
      if (u) checkUserRole()
    })
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }))
    }
    fetchReports(1, statusFilter)
    // Load dark mode
    try {
      const saved = localStorage.getItem('cw-dark')
      if (saved === '1') {
        setDark(true)
        document.documentElement.classList.add('dark')
      }
    } catch {}
    // Initial alerts
    fetchAlerts()
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

  async function checkUserRole() {
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      const { data } = await api.get('/admin/me', { headers: { Authorization: `Bearer ${token}` } })
      setUserRole(data?.role)
      // Auto-switch to admin view for authorized users
      if (data?.role && data.role !== 'citizen') {
        const savedView = localStorage.getItem('cw-view-mode')
        if (savedView === 'admin') setViewMode('admin')
      }
    } catch {
      setUserRole('citizen')
    }
  }

  async function fetchReports(nextPage = page, status = statusFilter, nextBbox = bbox) {
    const params = { page: nextPage, limit: 20 }
    if (status) params.status = status
    if (useBbox && nextBbox && nextBbox.length === 4) params.bbox = nextBbox.join(',')
    const { data } = await api.get('/reports', { params })
    setReports(data.items || [])
    setPage(data.page || nextPage)
    setPages(data.pages || 1)
  }

  async function fetchAlerts() {
    try {
      const center = bbox && bbox.length === 4
        ? { lat: (bbox[1] + bbox[3]) / 2, lng: (bbox[0] + bbox[2]) / 2 }
        : position
      if (!center.lat || !center.lng) return
      const { data } = await api.get('/weather/alerts', { params: { lat: center.lat, lng: center.lng } })
      setAlerts(Array.isArray(data.alerts) ? data.alerts : [])
    } catch { setAlerts([]) }
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

  function handleFileChange(e) {
    const files = e.target.files
    if (!files || !files.length) return
    setFile(files)
    const urls = []
    for (const f of Array.from(files)) {
      urls.push(URL.createObjectURL(f))
    }
    setPreviews(urls)
  }

  function handleImageRemove(idx) {
    const newFiles = Array.from(file || []).filter((_, i) => i !== idx)
    const newPreviews = previews.filter((_, i) => i !== idx)
    setFile(newFiles.length ? newFiles : null)
    setPreviews(newPreviews)
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
        if (showHotspots) void fetchHotspots(next)
        void fetchAlerts()
      },
      zoomend: (e) => {
        setZoomLevel(e.target.getZoom())
      }
    })
    return null
  }

  async function fetchHotspots(nextBbox = bbox) {
    try {
      const params = {}
      if (nextBbox && nextBbox.length === 4) params.bbox = nextBbox.join(',')
      const { data } = await api.get('/analytics/hotspots', { params })
      setHotspots(data?.cells || [])
    } catch { setHotspots([]) }
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

async function fetchHotspots(nextBbox = bbox) {
  try {
    const params = {}
    if (nextBbox && nextBbox.length === 4) params.bbox = nextBbox.join(',')
    const { data } = await api.get('/analytics/hotspots', { params })
    setHotspots(data?.cells || [])
  } catch { setHotspots([]) }
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

const location = useLocation()
const isActive = (path) => location.pathname === path

return (
  <div className="h-full flex flex-col">
    <header className="px-6 py-4 border-b flex items-center justify-between bg-gradient-to-r from-blue-50 via-cyan-50 to-teal-50 dark:from-blue-900/20 dark:via-cyan-900/20 dark:to-teal-900/20 backdrop-blur sticky top-0 z-50 shadow-sm">
      {/* Logo/Brand */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-xl shadow-lg">
          <Droplet className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-xl gradient-text">CleanWater</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Real-time Water Quality Monitoring</p>
        </div>
      </div>
      
      {/* Navigation Links */}
      <nav className="hidden lg:flex items-center gap-3">
        <Link to="/" className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${isActive('/') ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg' : 'glass-card hover:bg-white/50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}>
          <Home className="w-4 h-4" /> Map
        </Link>
        <Link to="/reports" className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${isActive('/reports') ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg' : 'glass-card hover:bg-white/50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}>
          <FileText className="w-4 h-4" /> Reports
        </Link>
        <Link to="/analytics" className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${isActive('/analytics') ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg' : 'glass-card hover:bg-white/50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}>
          <BarChart3 className="w-4 h-4" /> Analytics
        </Link>
        {userRole && userRole !== 'citizen' && (
          <Link to="/admin" className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${isActive('/admin') ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg' : 'glass-card hover:bg-white/50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}>
            <Shield className="w-4 h-4" /> Admin
          </Link>
        )}
        <Link to="/about" className={`px-4 py-2 rounded-xl font-semibold text-sm flex items-center gap-2 transition-all ${isActive('/about') ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg' : 'glass-card hover:bg-white/50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}>
          <Info className="w-4 h-4" /> About
        </Link>
      </nav>
      
      {/* User Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            const v = !dark
            setDark(v)
            try { localStorage.setItem('cw-dark', v ? '1' : '0') } catch {}
            document.documentElement.classList.toggle('dark', v)
          }}
          className="p-2.5 rounded-xl hover:bg-white/50 dark:hover:bg-gray-700/50 transition-all duration-300 hover:scale-110"
          aria-label="Toggle dark mode"
        >
          {dark ? <Sun className="w-5 h-5 text-yellow-500" /> : <Moon className="w-5 h-5 text-gray-700 dark:text-gray-300" />}
        </button>
        
        {user ? (
          <div className="flex items-center gap-3 glass-card px-4 py-2 rounded-xl">
            <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full ring-2 ring-blue-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 hidden md:inline">{user.displayName}</span>
            <button className="px-3 py-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-lg text-sm font-semibold transition-all" onClick={handleSignOut}>Sign out</button>
          </div>
        ) : (
          <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl font-semibold transition-all shadow-lg" onClick={handleSignIn}>Sign in</button>
        )}
      </div>
    </header>

    <main className="flex-1 overflow-y-auto">
      <Routes>
        <Route path="/" element={<MapPage {...{ alerts, baseLayer, setBaseLayer, hasMapbox, MAPBOX_TOKEN, position, showHotspots, hotspots, getClusteredMarkers, reports, setSelected, bbox, setBbox, setZoomLevel, useBbox, setUseBbox, useCluster, setUseCluster, setShowHotspots, fetchHotspots, fetchReports, page, pages, notes, setNotes, file, previews, createReport, user, handleFileChange, handleImageRemove, statusFilter }} />} />
        <Route path="/reports" element={<ReportsPage {...{ reports, statusFilter, setStatusFilter, fetchReports, page, setPage, pages, selected, setSelected, auth }} />} />
        <Route path="/analytics" element={<AnalyticsPage {...{ bbox, statusFilter }} />} />
        {userRole && userRole !== 'citizen' && (
          <Route path="/admin" element={<AdminReviewMode {...{ auth, userRole, reports, fetchReports: () => fetchReports(page, statusFilter, bbox) }} />} />
        )}
        <Route path="/about" element={<AboutPage />} />
        {/* Catch-all route - redirect to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>
  )
}

// Map Page Component
function MapPage({ alerts, baseLayer, setBaseLayer, hasMapbox, MAPBOX_TOKEN, position, showHotspots, hotspots, getClusteredMarkers, reports, setSelected, bbox, setBbox, setZoomLevel, useBbox, setUseBbox, useCluster, setUseCluster, setShowHotspots, fetchHotspots, fetchReports, page, pages, notes, setNotes, file, previews, createReport, user, handleFileChange, handleImageRemove, statusFilter }) {
  
  function MapEventsBinder() {
    useMapEvents({
      moveend: (e) => {
        if (!useBbox) return
        const b = e.target.getBounds()
        const next = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
        setBbox(next)
        if (showHotspots) void fetchHotspots(next)
      },
      zoomend: (e) => {
        setZoomLevel(e.target.getZoom())
      }
    })
    return null
  }
  
  return (
    <div className="h-full grid lg:grid-cols-3">
      <>
        <div className="h-[50vh] lg:h-full lg:col-span-2 relative">
          {alerts && alerts.length > 0 ? (
            <div className="absolute left-2 right-2 top-2 z-10 rounded border bg-yellow-50 dark:bg-yellow-900/40 text-xs text-gray-800 dark:text-yellow-100 p-2 shadow">
              <div className="font-semibold">Weather Alerts</div>
              <ul className="list-disc pl-5">
                {alerts.slice(0,3).map((al, idx) => (
                  <li key={idx}>{al.event || 'Alert'}{al.sender_name ? ` • ${al.sender_name}` : ''}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <MapContainer center={[position.lat || 0, position.lng || 0]} zoom={13} style={{ height: '100%', width: '100%' }}>
            {baseLayer === 'osm' && (
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
                url="/tiles/{z}/{x}/{y}.png"
                crossOrigin={true}
                referrerPolicy="no-referrer"
              />
            )}
            {hasMapbox && baseLayer === 'sat' && (
              <TileLayer
                attribution='Imagery © Mapbox'
                url={`https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`}
                tileSize={512}
                zoomOffset={-1}
              />
            )}
            {hasMapbox && baseLayer === 'terrain' && (
              <TileLayer
                attribution='© Mapbox Terrain'
                url={`https://api.mapbox.com/styles/v1/mapbox/outdoors-v12/tiles/{z}/{x}/{y}?access_token=${MAPBOX_TOKEN}`}
                tileSize={512}
                zoomOffset={-1}
              />
            )}
            <MapEventsBinder />
            {showHotspots && hotspots.map((c, idx) => (
              <Marker key={`hot-${idx}`} position={[c.center.lat, c.center.lng]}>
                <Popup>
                  <div className="text-xs">Hotspot count: {c.count}</div>
                </Popup>
              </Marker>
            ))}
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
        <div className="p-4 space-y-4 lg:col-span-1 h-full bg-gray-50 dark:bg-gray-900">
          <div className="rounded-xl border bg-white/70 backdrop-blur p-3 shadow-sm">
            <h2 className="font-semibold">Reports</h2>
            <div className="text-xs text-gray-500">Filter and export</div>
          </div>
          <div className="space-y-2 rounded-xl border bg-white/70 backdrop-blur p-3 shadow-sm">
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
            <label className="mt-1 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={useCluster} onChange={(e) => setUseCluster(e.target.checked)} /> Cluster markers</label>
            <label className="mt-1 inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={showHotspots} onChange={async (e) => { const v = e.target.checked; setShowHotspots(v); if (v) await fetchHotspots(bbox) }} /> Show hotspots</label>
            <div className="text-xs text-gray-500">BBox: {useBbox && bbox ? bbox.map(n=>n.toFixed(4)).join(', ') : '—'}</div>
            <button className="px-2 py-1 border rounded text-xs" onClick={() => fetchReports(1, statusFilter, bbox)}>Refresh</button>
            <div className="pt-2">
              <label className="block text-sm">Base Map</label>
              <select className="border rounded px-2 py-1 text-sm" value={baseLayer} onChange={(e)=>setBaseLayer(e.target.value)}>
                <option value="osm">OSM</option>
                {hasMapbox ? <option value="sat">Mapbox Satellite</option> : null}
                {hasMapbox ? <option value="terrain">Mapbox Terrain</option> : null}
              </select>
              {!hasMapbox ? (
                <div className="text-[10px] text-gray-500 mt-1">Add VITE_MAPBOX_TOKEN in frontend/.env for Satellite/Terrain</div>
              ) : null}
            </div>
          </div>
          <div className="rounded-xl border bg-white/70 backdrop-blur p-3 shadow-sm">
            <KpiRibbon status={statusFilter} bbox={useBbox ? bbox : null} />
          </div>
          <AnalyticsSummary status={statusFilter} bbox={useBbox ? bbox : null} />
          <AssistantBox context={{ status: statusFilter, bbox: useBbox ? bbox : null }} />
          <div className="space-y-2 rounded-xl border bg-white/70 backdrop-blur p-3 shadow-sm">
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
      </>
    </div>
  )
}

// Reports Page Component
function ReportsPage({ reports, statusFilter, setStatusFilter, fetchReports, page, setPage, pages, notes, setNotes, file, setFile, previews, setPreviews, handleCreate, handleFileChange, handleImageRemove, user, selected, setSelected, auth }) {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="glass-card rounded-2xl p-6 shadow-xl">
        <h2 className="font-bold text-2xl gradient-text mb-4">Water Quality Reports</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">View and manage all reported water quality issues</p>
        
        {/* Filters */}
        <div className="flex gap-3 mb-6">
          <button onClick={() => { setStatusFilter(''); fetchReports(1, '') }} className={`px-4 py-2 rounded-xl font-semibold ${!statusFilter ? 'bg-blue-600 text-white' : 'glass-card'}`}>All</button>
          <button onClick={() => { setStatusFilter('pending'); fetchReports(1, 'pending') }} className={`px-4 py-2 rounded-xl font-semibold ${statusFilter === 'pending' ? 'bg-yellow-600 text-white' : 'glass-card'}`}>Pending</button>
          <button onClick={() => { setStatusFilter('verified'); fetchReports(1, 'verified') }} className={`px-4 py-2 rounded-xl font-semibold ${statusFilter === 'verified' ? 'bg-green-600 text-white' : 'glass-card'}`}>Verified</button>
          <button onClick={() => { setStatusFilter('flagged'); fetchReports(1, 'flagged') }} className={`px-4 py-2 rounded-xl font-semibold ${statusFilter === 'flagged' ? 'bg-orange-600 text-white' : 'glass-card'}`}>Flagged</button>
        </div>
        
        <div className="grid lg:grid-cols-2 gap-6">
          <ReportList reports={reports} selectedId={selected?._id || selected?.id} onSelect={setSelected} />
          <ReportDetail report={selected} auth={auth} />
        </div>
      </div>
    </div>
  )
}

// Analytics Page Component
function AnalyticsPage({ bbox, statusFilter }) {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="glass-card rounded-2xl p-6 shadow-xl space-y-6">
        <div>
          <h2 className="font-bold text-2xl gradient-text mb-2">Analytics Dashboard</h2>
          <p className="text-gray-600 dark:text-gray-400">Insights and trends from water quality data</p>
        </div>
        
        <KpiRibbon bbox={bbox} status={statusFilter} />
        <AnalyticsSummary bbox={bbox} status={statusFilter} />
        <AssistantBox context={{ bbox, status: statusFilter }} />
      </div>
    </div>
  )
}

// About Page Component
function AboutPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="glass-card rounded-2xl p-8 shadow-xl space-y-6">
        <div className="text-center">
          <div className="inline-flex p-4 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl shadow-lg mb-4">
            <Droplet className="w-12 h-12 text-white" />
          </div>
          <h1 className="font-bold text-4xl gradient-text mb-2">CleanWater Info</h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">Real-time Water Quality Monitoring Platform</p>
        </div>
        
        <div className="space-y-4 text-gray-700 dark:text-gray-300">
          <p className="text-center text-lg">Empowering communities to monitor and improve water quality through citizen science and collaborative data collection.</p>
          
          <div className="grid md:grid-cols-3 gap-4 mt-8">
            <div className="glass-card p-6 rounded-xl text-center">
              <MapPin className="w-8 h-8 mx-auto mb-3 text-blue-600" />
              <h3 className="font-bold mb-2">Real-time Mapping</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Track water quality issues on an interactive map</p>
            </div>
            <div className="glass-card p-6 rounded-xl text-center">
              <BarChart3 className="w-8 h-8 mx-auto mb-3 text-green-600" />
              <h3 className="font-bold mb-2">Data Analytics</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">AI-powered insights and trend analysis</p>
            </div>
            <div className="glass-card p-6 rounded-xl text-center">
              <Users className="w-8 h-8 mx-auto mb-3 text-purple-600" />
              <h3 className="font-bold mb-2">Community Driven</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">Collaborative reporting and verification</p>
            </div>
          </div>
          
          <div className="mt-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <h3 className="font-bold text-lg mb-2">About This Project</h3>
            <p className="text-sm">Built with modern web technologies including React, Firebase, Leaflet maps, and AI integration. This platform enables NGOs, government agencies, and citizens to collaborate on water quality monitoring and intervention.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Main App Wrapper with Router
export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  )
}

// Admin Review Mode Component
function AdminReviewMode({ auth, userRole, reports, fetchReports }) {
  const [selectedReport, setSelectedReport] = useState(null)
  const [filterStatus, setFilterStatus] = useState('pending')
  const [assignTo, setAssignTo] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [busy, setBusy] = useState(false)

  async function updateStatus(reportId, newStatus) {
    setBusy(true)
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      await api.patch(`/reports/${reportId}/status`, { status: newStatus }, { headers: { Authorization: `Bearer ${token}` } })
      alert(`Status updated to ${newStatus}`)
      fetchReports()
    } catch {
      alert('Failed to update status')
    } finally { setBusy(false) }
  }

  async function assignReport(reportId) {
    if (!assignTo.trim()) return
    setBusy(true)
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      await api.patch(`/reports/${reportId}/assign`, { assignee: assignTo.trim() }, { headers: { Authorization: `Bearer ${token}` } })
      alert('Report assigned')
      setAssignTo('')
      fetchReports()
    } catch {
      alert('Failed to assign')
    } finally { setBusy(false) }
  }

  async function resolveReport(reportId, status) {
    setBusy(true)
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      await api.patch(`/reports/${reportId}/resolve`, { resolutionNotes, status }, { headers: { Authorization: `Bearer ${token}` } })
      alert('Report resolved')
      setResolutionNotes('')
      fetchReports()
    } catch {
      alert('Failed to resolve')
    } finally { setBusy(false) }
  }

  const filteredReports = filterStatus ? reports.filter(r => r.status === filterStatus) : reports

  return (
    <div className="glass-card rounded-2xl p-6 shadow-xl space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl shadow-lg">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="font-bold text-2xl gradient-text">Admin Review Panel</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage and review water quality reports • Role: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{userRole}</span></p>
        </div>
      </div>

      {/* Status Filters */}
      <div className="flex gap-3 flex-wrap">
        {['', 'pending', 'verified', 'flagged', 'rejected'].map(status => (
          <button
            key={status || 'all'}
            onClick={() => setFilterStatus(status)}
            className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all ${
              filterStatus === status
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg'
                : 'glass-card hover:bg-white/50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
            }`}
          >
            {status || 'All Reports'} ({status ? reports.filter(r => r.status === status).length : reports.length})
          </button>
        ))}
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {filteredReports.map(report => {
          const reportId = report._id || report.id
          const isSelected = selectedReport?._id === reportId || selectedReport?.id === reportId
          return (
            <div
              key={reportId}
              onClick={() => {
                setSelectedReport(report)
                setAssignTo(report.assignee || '')
                setResolutionNotes(report.resolutionNotes || '')
              }}
              className={`glass-card rounded-xl p-4 space-y-2 cursor-pointer transition-all hover:shadow-xl ${
                isSelected ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2">{report.notes || 'Untitled'}</div>
                <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                  report.status === 'verified' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                  report.status === 'pending' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
                  report.status === 'flagged' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300' :
                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                }`}>
                  {report.status}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {new Date(report.createdAt).toLocaleString()}
              </div>
              {report.assignee && (
                <div className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold">→ {report.assignee}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Selected Report Actions */}
      {selectedReport && (
        <div className="glass-card rounded-2xl p-6 space-y-4 border-2 border-indigo-500 animate-fade-in">
          <h3 className="font-bold text-lg text-gray-900 dark:text-white">Review: {selectedReport.notes || 'Untitled'}</h3>

          {/* Quick Status Actions */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <button onClick={() => updateStatus(selectedReport._id || selectedReport.id, 'verified')} disabled={busy}
              className="px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50">
              ✓ Verify
            </button>
            <button onClick={() => updateStatus(selectedReport._id || selectedReport.id, 'pending')} disabled={busy}
              className="px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50">
              ⏳ Pending
            </button>
            <button onClick={() => updateStatus(selectedReport._id || selectedReport.id, 'flagged')} disabled={busy}
              className="px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50">
              🚩 Flag
            </button>
            <button onClick={() => updateStatus(selectedReport._id || selectedReport.id, 'rejected')} disabled={busy}
              className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50">
              ✗ Reject
            </button>
          </div>

          {/* Assignment & Resolution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Assign To</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500"
                  placeholder="UID or email"
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                />
                <button onClick={() => assignReport(selectedReport._id || selectedReport.id)} disabled={busy || !assignTo.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50">
                  Assign
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">Resolution Notes</label>
              <textarea
                className="w-full border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 resize-none"
                rows={2}
                placeholder="Add resolution notes..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Resolve Actions */}
          <div className="flex gap-3">
            <button onClick={() => resolveReport(selectedReport._id || selectedReport.id, 'verified')} disabled={busy}
              className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50">
              ✓ Resolve & Verify
            </button>
            <button onClick={() => resolveReport(selectedReport._id || selectedReport.id, 'rejected')} disabled={busy}
              className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-all disabled:opacity-50">
              ✗ Resolve & Reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
