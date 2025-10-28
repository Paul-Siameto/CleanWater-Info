import React, { useEffect, useState } from 'react'
import api from '../lib/api'

export default function AnalyticsSummary({ status, bbox }) {
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true); setError(null)
      try {
        const params = {}
        if (status) params.status = status
        if (bbox && bbox.length === 4) params.bbox = bbox.join(',')
        const { data } = await api.get('/analytics/summary', { params })
        if (mounted) setData(data)
      } catch (e) {
        if (mounted) setError('Failed to load summary')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [status, bbox])

  return (
    <div className="rounded-xl border bg-white/70 backdrop-blur p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">Analytics Summary</div>
        <div className="text-[10px] uppercase tracking-wider text-gray-500">{data?.provider || '—'}</div>
      </div>
      {loading && (
        <div className="text-xs text-gray-500 mt-2">Loading…</div>
      )}
      {error && (
        <div className="text-xs text-red-600 mt-2">{error}</div>
      )}
      {!loading && data && (
        <div className="text-sm text-gray-700 mt-2 whitespace-pre-line">
          {data.summary || `Total ${data?.stats?.total ?? 0}`}
        </div>
      )}
    </div>
  )
}
