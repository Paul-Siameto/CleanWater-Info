import React, { useState } from 'react'
import api from '../lib/api'

export default function AdminRoles({ auth }) {
  const [uid, setUid] = useState('')
  const [role, setRole] = useState('ngo')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!uid) return
    setBusy(true)
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined
      await api.post('/admin/users/role', { uid, role, displayName, email }, headers ? { headers } : undefined)
      alert('Role saved')
      setUid('')
      setDisplayName('')
      setEmail('')
    } catch (e) {
      alert('Failed to save role')
    } finally { setBusy(false) }
  }

  return (
    <div className="border rounded p-3 space-y-2">
      <div className="font-semibold text-sm">Admin: Assign Role</div>
      <form onSubmit={submit} className="space-y-2">
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Firebase UID" value={uid} onChange={(e)=>setUid(e.target.value)} />
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Display Name (optional)" value={displayName} onChange={(e)=>setDisplayName(e.target.value)} />
        <input className="w-full border rounded px-2 py-1 text-sm" placeholder="Email (optional)" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <select className="w-full border rounded px-2 py-1 text-sm" value={role} onChange={(e)=>setRole(e.target.value)}>
          <option value="citizen">citizen</option>
          <option value="ngo">ngo</option>
          <option value="gov">gov</option>
          <option value="lab">lab</option>
          <option value="admin">admin</option>
        </select>
        <button className="px-3 py-1 border rounded text-sm" type="submit" disabled={busy}>Save</button>
      </form>
    </div>
  )
}
