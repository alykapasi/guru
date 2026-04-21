// src/pages/SessionsPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import AppLayout from '../components/AppLayout'
import { api } from '../api/client'

export default function SessionsPage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: api.chat.sessions,
  })

  const selectedId = selected?.id

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['session-messages', selectedId],
    queryFn: () => api.chat.sessionMessages(selectedId),
    enabled: !!selectedId,
  })

  return (
    <AppLayout>
      <div className="flex h-screen overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-8 py-6 border-b border-[#1e1e2a]">
            <h1 className="text-white font-semibold text-lg">Sessions</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-8 py-4">
            {isLoading && (
              <div className="flex items-center justify-center h-32">
                <span className="text-slate-500 text-sm">Loading...</span>
              </div>
            )}
            {!isLoading && sessions.length === 0 && (
              <div className="text-center py-16">
                <p className="text-slate-500 text-sm">No sessions yet</p>
                <p className="text-slate-600 text-xs mt-1">Start studying from the Library</p>
                <button onClick={() => navigate('/library')}
                  className="mt-4 text-violet-400 hover:text-violet-300 text-sm transition-colors">
                  Go to Library →
                </button>
              </div>
            )}
            <div className="space-y-2">
              {sessions.map(s => (
                <SessionRow
                  key={s.id}
                  session={s}
                  isSelected={selected?.id === s.id}
                  onClick={() => setSelected(s.id === selected?.id ? null : s)}
                  onContinue={() => navigate(`/study/${s.material_id}?session=${s.id}`)}
                />
              ))}
            </div>
          </div>
        </div>

        {selected && (
          <SessionDetail
            key={selected.id}
            session={selected}
            messages={messages}
            loading={messagesLoading}
            onClose={() => setSelected(null)}
            onContinue={() => navigate(`/study/${selected.material_id}?session=${selected.id}`)}
          />
        )}
      </div>
    </AppLayout>
  )
}

function SessionRow({ session: s, isSelected, onClick, onContinue }) {
  const date = new Date(s.started_at)
  const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

  return (
    <div onClick={onClick}
      className={`flex items-center justify-between px-4 py-4 rounded-xl border
                  cursor-pointer transition-all
                  ${isSelected
                    ? 'bg-violet-600/10 border-violet-500/30'
                    : 'bg-[#1a1a24] border-[#2e2e3a] hover:border-[#3e3e4a]'}`}>
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-[#0f0f13] border border-[#2e2e3a]
                        flex items-center justify-center shrink-0">
          <span className="text-sm">
            {s.mode === 'chat' ? '💬' : s.mode === 'quiz' ? '✏️' : '📖'}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">
            {s.material_title ?? 'Unknown material'}
          </p>
          <p className="text-slate-500 text-xs mt-0.5">
            {s.message_count} messages · {dateStr} at {timeStr}
          </p>
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); onContinue() }}
        className="text-violet-400 hover:text-violet-300 text-xs font-medium
                   transition-colors shrink-0 ml-4">
        Continue →
      </button>
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-slate-500 text-xs">{label}</p>
      <p className="text-white text-sm font-medium capitalize">{value}</p>
    </div>
  )
}

function SessionDetail({ session: s, messages, loading, onClose, onContinue }) {
  return (
    <div className="w-96 shrink-0 border-l border-[#1e1e2a] flex flex-col"
         style={{ height: '100vh' }}>
      <div className="px-5 py-4 border-b border-[#1e1e2a] flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <h2 className="text-white font-medium text-sm truncate">
            {s.material_title ?? 'Session'}
          </h2>
          <p className="text-slate-500 text-xs mt-0.5">
            {new Date(s.started_at).toLocaleDateString(undefined, {
              weekday: 'long', month: 'long', day: 'numeric'
            })}
          </p>
        </div>
        <button onClick={onClose}
          className="text-slate-500 hover:text-white text-lg leading-none
                     transition-colors ml-3 shrink-0">
          ×
        </button>
      </div>

      <div className="px-5 py-3 border-b border-[#1e1e2a] flex gap-4 shrink-0">
        <Stat label="Messages" value={s.message_count} />
        <Stat label="Mode" value={s.mode} />
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
        <p className="text-slate-500 text-xs uppercase tracking-wider">Transcript</p>

        {loading && (
          <div className="flex items-center justify-center h-16">
            <span className="text-slate-600 text-xs">Loading...</span>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <p className="text-slate-600 text-xs">No messages in this session</p>
        )}

        {messages.map((m, i) => (
          <div key={i}
            className={`text-xs rounded-lg px-3 py-2 leading-relaxed
              ${m.role === 'user'
                ? 'bg-violet-600/10 text-violet-200 ml-4'
                : 'bg-[#0f0f13] border border-[#2e2e3a] text-slate-400 mr-4'}`}>
            <span className="font-medium text-slate-500 block mb-0.5">
              {m.role === 'user' ? 'You' : 'Guru'}
            </span>
            {m.content.length > 300 ? m.content.slice(0, 300) + '...' : m.content}
          </div>
        ))}
      </div>

      <div className="px-5 py-4 border-t border-[#1e1e2a] shrink-0">
        <button onClick={onContinue}
          className="w-full bg-violet-600 hover:bg-violet-500 text-white
                     font-medium py-2.5 rounded-lg transition-colors text-sm">
          Continue session →
        </button>
      </div>
    </div>
  )
}