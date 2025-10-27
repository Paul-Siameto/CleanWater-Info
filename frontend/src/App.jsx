import React, { useEffect, useState } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import api from './lib/api'
import { getFirebaseConfig } from './lib/firebase'
import ReportList from './components/ReportList'
import ReportDetail from './components/ReportDetail'

const firebaseApp = initializeApp(getFirebaseConfig())
const auth = getAuth(firebaseApp)
const provider = new GoogleAuthProvider()

export default function App() {
  const [user, setUser] = useState(null)
  const [reports, setReports] = useState([])
  const [position, setPosition] = useState({ lat: 0, lng: 0 })
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    onAuthStateChanged(auth, (u) => setUser(u))
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }))
    }
    fetchReports()
  }, [])

  async function fetchReports() {
    const { data } = await api.get('/reports')
    setReports(data.items || [])
  }

  async function handleSignIn() {
    await signInWithPopup(auth, provider)
  }

  async function handleSignOut() {
    await signOut(auth)
  }

  async function createReport() {
    if (!position.lat || !position.lng) return
    const token = await auth.currentUser?.getIdToken?.()
    await api.post('/reports', {
      lat: position.lat,
      lng: position.lng,
      notes: 'Suspicious water sample',
      photos: [],
    }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
    await fetchReports()
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
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
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
          <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={createReport}>Create Report at My Location</button>
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
        </div>
      </main>
    </div>
  )
}
