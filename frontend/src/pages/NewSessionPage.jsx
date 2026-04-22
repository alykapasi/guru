// src/pages/NewSessionPage.jsx

import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'

export default function NewSessionPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const preselected = searchParams.get('material')  // optional preselect from library

    const { data: materials = [] } = useQuery({
        queryKey: ['materials'],
        queryFn: api.materials.list,
    })

    const ready = materials.filter(m => m.status === 'ready')

    const [selected, setSelected] = useState(() =>
        preselected ? new Set([preselected]) : new Set()
    )
    const [goal, setGoal] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    function toggleMaterial(id) {
        setSelected(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    async function handleStart() {
        if (selected.size === 0 || !goal.trim()) return
        setLoading(true)
        setError('')
        try {
            const res = await api.sessions.create([...selected], goal)
            navigate(`/study/${res.session_id}`, { state: { goal } })
        } catch (err) {
            setError('Failed to create session. Try again.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#0f0f13] flex flex-col items-center justify-center px-6">
            <div className="w-full max-w-lg">
                <button onClick={() => navigate('/library')}
                    className="text-slate-500 hover:text-white text-sm mb-8 transition-colors">
                    ← Back to library
                </button>

                <h1 className="text-white font-semibold text-xl mb-1">New session</h1>
                <p className="text-slate-500 text-sm mb-8">
                    Choose your materials and set a goal
                </p>

                {/* Material picker */}
                <div className="mb-6">
                    <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">
                        Materials ({selected.size} selected)
                    </p>
                    {ready.length === 0 ? (
                        <div className="bg-[#1a1a24] border border-[#2e2e3a] rounded-xl p-4 text-center">
                            <p className="text-slate-500 text-sm">No ready materials</p>
                            <button onClick={() => navigate('/library')}
                                className="text-violet-400 hover:text-violet-300 text-xs mt-1 transition-colors">
                                Upload something →
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-56 overflow-y-auto">
                            {ready.map(m => (
                                <button key={m.id} onClick={() => toggleMaterial(m.id)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl
                                                border text-left transition-all
                                                ${selected.has(m.id)
                                                    ? 'bg-violet-600/15 border-violet-500/40'
                                                    : 'bg-[#1a1a24] border-[#2e2e3a] hover:border-[#3e3e4a]'}`}>
                                    {/* Checkbox */}
                                    <div className={`w-4 h-4 rounded border shrink-0 flex items-center
                                                     justify-center transition-colors
                                                     ${selected.has(m.id)
                                                         ? 'bg-violet-600 border-violet-600'
                                                         : 'border-[#3e3e4a]'}`}>
                                        {selected.has(m.id) && (
                                            <svg className="w-2.5 h-2.5 text-white" fill="none"
                                                 viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round"
                                                      strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-white text-sm font-medium truncate">
                                            {m.title}
                                        </p>
                                        <p className="text-slate-500 text-xs">
                                            {m.concepts?.length ?? 0} concepts
                                        </p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Goal */}
                <div className="mb-6">
                    <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-3">
                        Session goal
                    </p>
                    <textarea
                        value={goal}
                        onChange={e => setGoal(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && e.metaKey && handleStart()}
                        placeholder="What do you want to accomplish today?"
                        rows={3}
                        className="w-full bg-[#1a1a24] border border-[#2e2e3a] rounded-xl px-4 py-3
                                   text-white placeholder-slate-500 focus:outline-none
                                   focus:border-violet-500 text-sm resize-none" />
                    <p className="text-slate-600 text-xs mt-1.5">⌘ + Enter to start</p>
                </div>

                {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

                <button
                    onClick={handleStart}
                    disabled={selected.size === 0 || !goal.trim() || loading}
                    className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                               text-white font-medium py-3 rounded-xl transition-colors text-sm">
                    {loading ? (
                        <span className="flex items-center justify-center gap-2">
                            <span className="w-3 h-3 border border-white/30 border-t-white
                                             rounded-full animate-spin" />
                            Setting up session...
                        </span>
                    ) : `Start session with ${selected.size || 0} material${selected.size !== 1 ? 's' : ''} →`}
                </button>
            </div>
        </div>
    )
}