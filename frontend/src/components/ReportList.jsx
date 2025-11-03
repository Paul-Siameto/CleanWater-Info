import React from 'react'
import { FileText, CheckCircle, Clock, AlertCircle, XCircle, Calendar } from 'lucide-react'

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
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${config.bg} ${config.text}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

export default function ReportList({ reports, selectedId, onSelect }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden h-full flex flex-col shadow-xl">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="font-bold text-sm text-gray-900 dark:text-white">Recent Reports</h3>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded-full font-semibold">{reports.length}</span>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto divide-y divide-gray-200 dark:divide-gray-700">
        {reports.length === 0 && (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 mb-3">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No reports yet</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Create your first water quality report</p>
          </div>
        )}
        {reports.map((r) => (
          <button
            key={r._id || r.id}
            onClick={() => onSelect(r)}
            className={`w-full text-left p-4 transition-all duration-200 hover:bg-blue-50 dark:hover:bg-blue-900/20 ${
              selectedId === (r._id || r.id) 
                ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-600' 
                : 'border-l-4 border-transparent'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2">
                {r.notes || 'Untitled report'}
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Calendar className="w-3 h-3" />
              <span>{(r.createdAt || '').toString().slice(0, 19).replace('T', ' ')}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
