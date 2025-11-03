import React, { useEffect, useState } from 'react'
import { BarChart3, CheckCircle, Clock, AlertCircle, XCircle } from 'lucide-react'
import api from '../lib/api'

export default function KpiRibbon({ bbox, status }) {
  const [kpis, setKpis] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      try {
        const params = {}
        if (bbox && bbox.length === 4) params.bbox = bbox.join(',')
        if (status) params.status = status
        const { data } = await api.get('/analytics/kpis', { params })
        if (mounted) setKpis(data)
      } catch {
        if (mounted) setKpis(null)
      } finally { if (mounted) setLoading(false) }
    }
    load()
    return () => { mounted = false }
  }, [bbox, status])

  const Item = ({ label, value, color, gradient, Icon }) => (
    <div className={`flex-1 min-w-[90px] rounded-xl px-3 py-3 border border-gray-200 dark:border-gray-700 ${color} hover:scale-105 transition-transform duration-200 shadow-sm`}>
      <div className="flex items-center justify-center mb-1">
        <div className={`p-1.5 rounded-lg ${gradient}`}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
      </div>
      <div className="text-2xl font-bold text-center text-gray-900 dark:text-white">
        {loading ? (
          <div className="h-7 w-12 mx-auto skeleton rounded"></div>
        ) : (
          value ?? 0
        )}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 text-center font-semibold mt-1">{label}</div>
    </div>
  )

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        <h3 className="font-bold text-sm text-gray-900 dark:text-white">Key Metrics</h3>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Item label="Total" value={kpis?.total} color="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20" gradient="bg-gradient-to-br from-blue-500 to-cyan-500" Icon={BarChart3} />
        <Item label="Verified" value={kpis?.verified} color="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20" gradient="bg-gradient-to-br from-green-500 to-emerald-500" Icon={CheckCircle} />
        <Item label="Pending" value={kpis?.pending} color="bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20" gradient="bg-gradient-to-br from-yellow-500 to-amber-500" Icon={Clock} />
        <Item label="Flagged" value={kpis?.flagged} color="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20" gradient="bg-gradient-to-br from-orange-500 to-red-500" Icon={AlertCircle} />
        <Item label="Rejected" value={kpis?.rejected} color="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20" gradient="bg-gradient-to-br from-red-500 to-rose-500" Icon={XCircle} />
      </div>
    </div>
  )
}
