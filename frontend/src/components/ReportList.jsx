import React from 'react'

export default function ReportList({ reports, selectedId, onSelect }) {
  return (
    <div className="divide-y border rounded overflow-auto h-full">
      {reports.length === 0 && (
        <div className="p-4 text-sm text-gray-500">No reports yet.</div>
      )}
      {reports.map((r) => (
        <button
          key={r._id || r.id}
          onClick={() => onSelect(r)}
          className={`w-full text-left p-3 hover:bg-blue-50 ${selectedId === (r._id || r.id) ? 'bg-blue-50' : ''}`}
        >
          <div className="text-sm font-medium">{r.notes || 'Untitled report'}</div>
          <div className="text-xs text-gray-500">{r.status} • {(r.createdAt || '').toString().slice(0, 19).replace('T',' ')}</div>
        </button>
      ))}
    </div>
  )
}
