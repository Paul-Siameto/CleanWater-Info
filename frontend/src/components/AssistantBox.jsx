import React, { useState } from 'react'
import { MessageCircle, Send, Loader2, Sparkles } from 'lucide-react'
import api from '../lib/api'

export default function AssistantBox({ context }) {
  const [q, setQ] = useState('')
  const [a, setA] = useState('')
  const [busy, setBusy] = useState(false)

  async function ask() {
    if (!q.trim() || busy) return
    setBusy(true)
    setA('')
    try {
      const { data } = await api.post('/assistant/ask', { question: q.trim(), context })
      if (data?.provider === 'basic' && data?.answer?.includes('not configured')) {
        setA('💡 To enable AI Assistant:\n1. Get a free API key from https://aistudio.google.com/app/apikey\n2. Add GEMINI_API_KEY to backend/.env\n3. Restart the backend server')
      } else {
        setA(data?.answer || 'No answer')
      }
    } catch (err) {
      setA('⚠️ Assistant unavailable. Please check backend server is running and GEMINI_API_KEY is configured in backend/.env')
    } finally { setBusy(false) }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      ask()
    }
  }

  return (
    <div className="glass-card rounded-2xl p-5 shadow-xl space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg">
          <MessageCircle className="w-4 h-4 text-white" />
        </div>
        <div className="font-bold text-sm text-gray-900 dark:text-white">AI Assistant</div>
        <Sparkles className="w-3 h-3 text-yellow-500 ml-auto" />
      </div>
      
      <div className="flex gap-2">
        <input 
          className="flex-1 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 transition-all" 
          placeholder="Ask about patterns, trends, or insights..." 
          value={q} 
          onChange={(e)=>setQ(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={busy}
        />
        <button 
          className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-medium flex items-center gap-2 transition-all hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed" 
          onClick={ask} 
          disabled={busy || !q.trim()}
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
      
      {busy && !a ? (
        <div className="flex items-center gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
          <Loader2 className="w-4 h-4 animate-spin text-purple-600 dark:text-purple-400" />
          <span className="text-sm text-purple-600 dark:text-purple-400">Thinking...</span>
        </div>
      ) : null}
      
      {a ? (
        <div className="p-4 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
          <div className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">{a}</div>
        </div>
      ) : null}
    </div>
  )
}
