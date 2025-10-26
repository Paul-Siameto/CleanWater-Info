import React, { useEffect, useState } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import axios from 'axios'
import { getFirebaseConfig } from './lib/firebase'

const firebaseApp = initializeApp(getFirebaseConfig())
const auth = getAuth(firebaseApp)
const provider = new GoogleAuthProvider()

export default function App() {
  const [user, setUser] = useState(null)
  const [reports, setReports] = useState([])
  const [position, setPosition] = useState({ lat: 0, lng: 0 })

  useEffect(() => {
    onAuthStateChanged(auth, (u) => setUser(u))
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((p) => setPosition({ lat: p.coords.latitude, lng: p.coords.longitude }))
    }
    fetchReports()
  }, [])

  async function fetchReports() {
    const { data } = await axios.get('/api/reports')
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
    await axios.post('/api/reports', {
      lat: position.lat,
      lng: position.lng,
      notes: 'Suspicious water sample',
      photos: [],
    }, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
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

      <main className="flex-1 grid md:grid-cols-2">
        <div className="h-[50vh] md:h-full">
          <MapContainer center={[position.lat || 0, position.lng || 0]} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {reports.map((r) => (
              <Marker key={r.id} position={[r.location.coordinates[1], r.location.coordinates[0]]}>
                <Popup>
                  <div className="text-sm">
                    <div>Status: {r.status}</div>
                    <div>Notes: {r.notes}</div>
                    <div>By: {r.reporterId || 'anon'}</div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <div className="p-4 space-y-3">
          <h2 className="font-semibold">Quick Actions</h2>
          <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={createReport}>Create Report at My Location</button>
          <div className="text-xs text-gray-500">This MVP uses in-memory storage until MongoDB is configured.</div>
        </div>
      </main>
    </div>
  )
}
