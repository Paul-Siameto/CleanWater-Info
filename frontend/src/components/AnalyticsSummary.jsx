import React, { useEffect, useState } from 'react'
import { Brain, Sparkles, AlertCircle } from 'lucide-react'
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
    <div className="glass-card rounded-2xl p-5 shadow-xl animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div className="font-bold text-sm text-gray-900 dark:text-white">AI Analytics Summary</div>
        </div>
        {data?.provider && (
          <div className="flex items-center gap-1 px-2 py-1 bg-purple-50 dark:bg-purple-900/30 rounded-full">
            <Sparkles className="w-3 h-3 text-purple-600 dark:text-purple-400" />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-purple-600 dark:text-purple-400">{data.provider}</span>
          </div>
        )}
      </div>
      
      {loading && (
        <div className="space-y-2">
          <div className="h-4 skeleton rounded w-full"></div>
          <div className="h-4 skeleton rounded w-4/5"></div>
          <div className="h-4 skeleton rounded w-3/4"></div>
        </div>
      )}
      
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-red-700 dark:text-red-300">{error}</div>
        </div>
      )}
      
      {!loading && !error && data && (
        <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
          {data.summary || `Total reports: ${data?.stats?.total ?? 0}`}
        </div>
      )}
      
      {!loading && !error && !data && (
        <div className="text-center py-4">
          <Brain className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-xs text-gray-500 dark:text-gray-400">No analytics data available</p>
        </div>
      )}
    </div>
  )
}
