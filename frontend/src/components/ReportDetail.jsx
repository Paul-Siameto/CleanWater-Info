import React, { useEffect, useState } from 'react'
import api from '../lib/api'

export default function ReportDetail({ report, auth }) {
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const reportId = report?._id || report?.id

  useEffect(() => {
    if (!reportId) return
    loadComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  async function loadComments() {
    const { data } = await api.get(`/reports/${reportId}/comments`)
    setComments(data.items || [])
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

  if (!report) return (
    <div className="p-4 text-sm text-gray-500">Select a report to view details.</div>
  )

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <div className="font-semibold">Report Details</div>
        <div className="text-sm text-gray-600">Status: {report.status}</div>
        <div className="text-sm text-gray-600">Notes: {report.notes || '—'}</div>
        <div className="text-xs text-gray-500">ID: {reportId}</div>
      </div>

      <div className="p-4 flex-1 overflow-auto">
        <div className="font-medium mb-2">Comments</div>
        <div className="space-y-2 mb-4">
          {comments.length === 0 && (
            <div className="text-sm text-gray-500">No comments yet.</div>
          )}
          {comments.map((c) => (
            <div key={c._id} className="p-2 border rounded">
              <div className="text-sm">{c.content}</div>
              <div className="text-xs text-gray-500">{(c.createdAt || '').toString().slice(0,19).replace('T',' ')}</div>
            </div>
          ))}
        </div>

        <form onSubmit={postComment} className="flex gap-2">
          <input
            className="flex-1 border rounded px-3 py-2 text-sm"
            placeholder="Add a comment"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="px-3 py-2 bg-blue-600 text-white rounded text-sm" type="submit">Post</button>
        </form>
      </div>
    </div>
  )
}
