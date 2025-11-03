import React, { useEffect, useState } from 'react'
import { MapPin, Image as ImageIcon, Cloud, MessageSquare, Activity, CheckCircle, Clock, AlertCircle, XCircle, User, Send, Sparkles } from 'lucide-react'
import api from '../lib/api'
import Lightbox from './Lightbox'

export default function ReportDetail({ report, auth, adminMode = false }) {
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [full, setFull] = useState(null)
  const [assignTo, setAssignTo] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const reportId = report?._id || report?.id

  useEffect(() => {
    if (!reportId) return
    loadComments()
    loadFull()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  async function loadComments() {
    const { data } = await api.get(`/reports/${reportId}/comments`)
    setComments(data.items || [])
  }

  async function loadFull() {
    try {
      const { data } = await api.get(`/reports/${reportId}`)
      setFull(data)
      setAssignTo(data.assignee || '')
      setResolutionNotes(data.resolutionNotes || '')
    } catch {}
  }

  async function postComment(e) {
    e.preventDefault()
    if (!text.trim()) return
    const token = await auth?.currentUser?.getIdToken?.()
    await api.post(
      `/reports/${reportId}/comments`,
      { content: text },
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    )
    setText('')
    await loadComments()
  }

  async function analyzeAI() {
    if (!reportId || busy) return
    setBusy(true)
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      await api.post(`/reports/${reportId}/ai/analyze`, {}, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      alert('AI analysis updated for this report.')
    } catch (e) {
      alert('AI analyze failed')
    } finally { setBusy(false) }
  }

  async function updateStatus(next) {
    if (!reportId || busy) return
    setBusy(true)
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      await api.patch(`/reports/${reportId}/status`, { status: next }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      alert(`Status set to ${next}`)
      await loadFull()
    } catch (e) {
      alert('Status update failed')
    } finally { setBusy(false) }
  }

  async function assign() {
    if (!assignTo.trim() || busy) return
    setBusy(true)
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      await api.patch(`/reports/${reportId}/assign`, { assignee: assignTo.trim() }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      await loadFull()
    } catch { alert('Assign failed') } finally { setBusy(false) }
  }

  async function resolve(nextStatus) {
    setBusy(true)
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      await api.patch(`/reports/${reportId}/resolve`, { resolutionNotes, status: nextStatus }, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      await loadFull()
    } catch { alert('Resolve failed') } finally { setBusy(false) }
  }

  const StatusBadge = ({ status }) => {
    const configs = {
      verified: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', icon: CheckCircle, label: 'Verified' },
      pending: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', icon: Clock, label: 'Pending' },
      flagged: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', icon: AlertCircle, label: 'Flagged' },
      rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: XCircle, label: 'Rejected' },
    }
    const config = configs[status] || configs.pending
    const Icon = config.icon
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
        <Icon className="w-3.5 h-3.5" />
        {config.label}
      </span>
    )
  }

  if (!report) return (
    <div className="glass-card rounded-2xl p-8 text-center h-full flex flex-col items-center justify-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
        <MapPin className="w-8 h-8 text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No report selected</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Select a report from the list to view details</p>
    </div>
  )

  const view = full || report

  return (
    <div className="h-full flex flex-col glass-card rounded-2xl overflow-hidden shadow-xl">
      <div className="p-5 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="font-bold text-lg text-gray-900 dark:text-white mb-1">Report Details</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">ID: {reportId}</div>
          </div>
          <StatusBadge status={view.status} />
        </div>
        <div className="flex items-start gap-2 p-3 bg-white/50 dark:bg-gray-800/50 rounded-xl">
          <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-gray-700 dark:text-gray-300">{view.notes || 'No description provided'}</div>
        </div>
        {Array.isArray(view.photos) && view.photos.length > 0 ? (
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Photos ({view.photos.length})</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {view.photos.map((pid, idx) => {
                const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
                const url = cloud ? `https://res.cloudinary.com/${cloud}/image/upload/c_fill,w_120,h_120/${pid}.jpg` : null
                return (
                  <div key={pid} className="text-xs">
                    {url ? (
                      <img onClick={() => { setLightboxIndex(idx); setLightboxOpen(true) }} src={url} alt={pid} className="w-full aspect-square object-cover rounded-xl border-2 border-gray-200 dark:border-gray-700 cursor-pointer hover:scale-105 hover:border-blue-500 transition-all" />
                    ) : (
                      <div className="border rounded-xl px-2 py-1 text-center">{pid}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
        {view.weatherSnapshot ? (
          <div className="mt-3 flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
            <Cloud className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div className="text-xs text-blue-700 dark:text-blue-300">
              <span className="font-semibold">{view.weatherSnapshot.main}</span>
              {view.weatherSnapshot.temp != null ? <span> • {view.weatherSnapshot.temp}°C</span> : ''}
            </div>
          </div>
        ) : null}
        {/* Admin controls - hidden in citizen view */}
        {adminMode && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="px-3 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-all hover:shadow-lg disabled:opacity-50" onClick={analyzeAI} disabled={busy}>
                <Sparkles className="w-3 h-3" />
                AI Analyze
              </button>
              <button className="px-3 py-2 bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50" onClick={() => updateStatus('verified')} disabled={busy}>
                <CheckCircle className="w-3 h-3" />
                Verify
              </button>
              <button className="px-3 py-2 bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50" onClick={() => updateStatus('flagged')} disabled={busy}>
                <AlertCircle className="w-3 h-3" />
                Flag
              </button>
              <button className="px-3 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50" onClick={() => updateStatus('rejected')} disabled={busy}>
                <XCircle className="w-3 h-3" />
                Reject
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  <User className="w-3 h-3" />
                  Assignee
                </div>
                <div className="flex gap-2">
                  <input className="border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm flex-1 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500" placeholder="UID or email" value={assignTo} onChange={(e)=>setAssignTo(e.target.value)} />
                  <button className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50" onClick={assign} disabled={busy}>Set</button>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  <CheckCircle className="w-3 h-3" />
                  Resolution
                </div>
                <textarea className="border border-gray-300 dark:border-gray-600 rounded-xl px-3 py-2 text-sm w-full bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 resize-none" rows={2} placeholder="Resolution notes..." value={resolutionNotes} onChange={(e)=>setResolutionNotes(e.target.value)} />
                <div className="flex gap-2">
                  <button className="flex-1 px-2 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50" onClick={()=>resolve('verified')} disabled={busy}>Verify</button>
                  <button className="flex-1 px-2 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold transition-all disabled:opacity-50" onClick={()=>resolve('rejected')} disabled={busy}>Reject</button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="p-5 flex-1 overflow-auto space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <div className="font-bold text-sm text-gray-900 dark:text-white">Comments</div>
            <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full font-semibold">{comments.length}</span>
          </div>
          <div className="space-y-3 mb-4">
            {comments.length === 0 && (
              <div className="text-center py-4">
                <MessageSquare className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-xs text-gray-500 dark:text-gray-400">No comments yet</p>
              </div>
            )}
            {comments.map((c) => (
              <div key={c._id} className="p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl">
                <div className="text-sm text-gray-800 dark:text-gray-200">{c.content}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{(c.createdAt || '').toString().slice(0,19).replace('T',' ')}</div>
              </div>
            ))}
          </div>
        </div>

        {Array.isArray(view?.activities) && view.activities.length ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <div className="font-bold text-sm text-gray-900 dark:text-white">Activity Log</div>
            </div>
            <div className="space-y-2">
              {view.activities.slice().reverse().map((a, idx) => (
                <div key={idx} className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl text-xs">
                  <div className="font-semibold text-purple-700 dark:text-purple-300">{a.type}{a.to ? ` → ${a.to}` : ''}{a.assignee ? `: ${a.assignee}` : ''}</div>
                  <div className="text-[10px] text-purple-600 dark:text-purple-400 mt-1">{(a.at || '').toString().slice(0,19).replace('T',' ')} • {a.by || 'system'}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <form onSubmit={postComment} className="flex gap-2">
          <input
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 transition-all"
            placeholder="Add a comment..."
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:shadow-lg" type="submit">
            <Send className="w-4 h-4" />
            Post
          </button>
        </form>
      </div>

      {lightboxOpen ? (
        <Lightbox
          open={lightboxOpen}
          index={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
          images={(Array.isArray(view.photos) ? view.photos : []).map((pid) => {
            const cloud = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME
            return cloud ? `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto,w_1600/${pid}.jpg` : ''
          })}
        />
      ) : null}
    </div>
  )
}
