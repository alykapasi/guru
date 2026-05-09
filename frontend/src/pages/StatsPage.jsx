// src/pages/StatsPage.jsx
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
    LineChart, Line, BarChart, Bar, XAxis, YAxis,
    Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'
import AppLayout from '../components/AppLayout'
import { api } from '../api/client'

export default function StatsPage() {
    const { data: overview }       = useQuery({ queryKey: ['stats-overview'],   queryFn: api.stats.overview })
    const { data: masteryTime = [] } = useQuery({ queryKey: ['stats-mastery-time'], queryFn: api.stats.masteryOverTime })
    const { data: byMaterial = [] } = useQuery({ queryKey: ['stats-material'],  queryFn: api.stats.byMaterial })
    const { data: activity = [] }  = useQuery({ queryKey: ['stats-activity'],   queryFn: api.stats.activity })
    const { data: weakConcepts = [] } = useQuery({ queryKey: ['stats-weak'],    queryFn: api.stats.weakConcepts })
    const { data: quizHistory = [] } = useQuery({ queryKey: ['stats-quiz'],     queryFn: api.stats.quizHistory })

    return (
        <AppLayout>
            <div className="overflow-y-auto h-screen px-8 py-8 space-y-8 max-w-6xl mx-auto">

                {/* ── Motivational summary ───────────────────────────── */}
                <div>
                    <h1 className="text-white font-semibold text-xl mb-6">Your progress</h1>
                    <div className="grid grid-cols-4 gap-4">
                        {[
                            {
                                icon: '🔥',
                                value: overview?.streak ?? '—',
                                label: 'day streak',
                                sub: overview?.streak === 1 ? 'Keep it up' : overview?.streak > 3 ? 'On fire!' : 'Getting started',
                                color: 'text-orange-400',
                            },
                            {
                                icon: '📚',
                                value: overview ? `${overview.study_minutes}m` : '—',
                                label: 'estimated study time',
                                sub: 'based on messages sent',
                                color: 'text-violet-400',
                            },
                            {
                                icon: '✓',
                                value: overview ? `${overview.concepts_mastered}/${overview.total_concepts}` : '—',
                                label: 'concepts mastered',
                                sub: overview ? `${Math.round(overview.avg_mastery * 100)}% avg mastery` : '',
                                color: 'text-emerald-400',
                            },
                            {
                                icon: '🃏',
                                value: overview?.cards_reviewed ?? '—',
                                label: 'cards reviewed',
                                sub: `${overview?.total_sessions ?? 0} sessions total`,
                                color: 'text-blue-400',
                            },
                        ].map((stat, i) => (
                            <div key={i} className="bg-[#1a1a24] border border-[#2e2e3a]
                                                     rounded-2xl px-5 py-4">
                                <div className="flex items-start justify-between mb-3">
                                    <span className="text-2xl">{stat.icon}</span>
                                    <span className={`text-2xl font-bold ${stat.color}`}>
                                        {stat.value}
                                    </span>
                                </div>
                                <p className="text-white text-sm font-medium">{stat.label}</p>
                                <p className="text-slate-500 text-xs mt-0.5">{stat.sub}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Mastery over time ──────────────────────────────── */}
                {masteryTime.length > 0 && (
                    <Section title="Mastery over time"
                             sub="IRT ability score per concept across all sessions">
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
                                <XAxis dataKey="day" type="category"
                                    allowDuplicatedCategory={false}
                                    tick={{ fill: '#475569', fontSize: 11 }} />
                                <YAxis domain={[0, 1]} tickFormatter={v => `${Math.round(v * 100)}%`}
                                    tick={{ fill: '#475569', fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{ background: '#1a1a24', border: '1px solid #2e2e3a', borderRadius: 8 }}
                                    labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                                    formatter={(v, name) => [`${Math.round(v * 100)}%`, name]} />
                                <Legend wrapperStyle={{ fontSize: 11, color: '#475569' }} />
                                {masteryTime.map((series, i) => (
                                    <Line key={series.concept}
                                        data={series.data}
                                        dataKey="score"
                                        name={series.concept}
                                        stroke={COLORS[i % COLORS.length]}
                                        strokeWidth={2}
                                        dot={false}
                                        connectNulls />
                                ))}
                            </LineChart>
                        </ResponsiveContainer>
                    </Section>
                )}

                {/* ── Two column ─────────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-6">

                    {/* Mastery by material */}
                    {byMaterial.length > 0 && (
                        <Section title="By material" sub="Average mastery per document">
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={byMaterial.map(m => ({
                                    name: truncate(m.material_title, 20),
                                    mastery: Math.round(m.avg_score * 100),
                                    mastered: m.mastered,
                                    weak: m.weak,
                                }))} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
                                    <XAxis dataKey="name"
                                        tick={{ fill: '#475569', fontSize: 10 }} />
                                    <YAxis domain={[0, 100]}
                                        tickFormatter={v => `${v}%`}
                                        tick={{ fill: '#475569', fontSize: 10 }} />
                                    <Tooltip
                                        contentStyle={{ background: '#1a1a24', border: '1px solid #2e2e3a', borderRadius: 8 }}
                                        formatter={(v) => [`${v}%`, 'Avg mastery']} />
                                    <Bar dataKey="mastery" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Section>
                    )}

                    {/* Quiz history */}
                    {quizHistory.length > 0 && (
                        <Section title="Quiz performance" sub="Average score over time">
                            <ResponsiveContainer width="100%" height={200}>
                                <LineChart data={quizHistory.map(q => ({
                                    day: q.day.slice(5),   // MM-DD
                                    score: Math.round(q.score * 100),
                                }))} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2a" />
                                    <XAxis dataKey="day"
                                        tick={{ fill: '#475569', fontSize: 10 }} />
                                    <YAxis domain={[0, 100]}
                                        tickFormatter={v => `${v}%`}
                                        tick={{ fill: '#475569', fontSize: 10 }} />
                                    <Tooltip
                                        contentStyle={{ background: '#1a1a24', border: '1px solid #2e2e3a', borderRadius: 8 }}
                                        formatter={(v) => [`${v}%`, 'Score']} />
                                    <Line dataKey="score" stroke="#10b981"
                                        strokeWidth={2} dot={{ r: 3, fill: '#10b981' }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </Section>
                    )}
                </div>

                {/* ── Activity heatmap ───────────────────────────────── */}
                {activity.length > 0 && (
                    <Section title="Activity" sub="Sessions per day over the last 90 days">
                        <ActivityHeatmap data={activity} />
                    </Section>
                )}

                {/* ── Weak concepts table ────────────────────────────── */}
                {weakConcepts.length > 0 && (
                    <Section title="Needs attention"
                             sub="Concepts with the lowest mastery scores">
                        <div className="space-y-2">
                            {weakConcepts.map((c, i) => (
                                <WeakConceptRow key={i} concept={c} />
                            ))}
                        </div>
                    </Section>
                )}

            </div>
        </AppLayout>
    )
}

// ── Helpers ────────────────────────────────────────────────────────────────

const COLORS = ['#7c3aed','#10b981','#f59e0b','#3b82f6','#ef4444','#8b5cf6','#14b8a6','#f97316']

function truncate(str, n) {
    return str?.length > n ? str.slice(0, n) + '…' : str
}

function Section({ title, sub, children }) {
    return (
        <div className="bg-[#1a1a24] border border-[#2e2e3a] rounded-2xl px-6 py-5">
            <div className="mb-4">
                <h2 className="text-white font-medium text-sm">{title}</h2>
                {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
            </div>
            {children}
        </div>
    )
}

function WeakConceptRow({ concept: c }) {
    const navigate = useNavigate()
    const pct = Math.round((c.irt_score ?? 0) * 100)
    const color = pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'

    return (
        <div className="flex items-center gap-4 px-3 py-2.5 rounded-xl
                        bg-[#0f0f13] border border-[#2e2e3a]">
            <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{c.concept}</p>
                <p className="text-slate-500 text-xs truncate">{c.material_title}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
                <div className="w-24">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-slate-500 text-xs">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-[#1e1e2a] rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`}
                             style={{ width: `${pct}%` }} />
                    </div>
                </div>
                <button onClick={() => navigate('/sessions/new')}
                    className="text-violet-400 hover:text-violet-300 text-xs
                               transition-colors whitespace-nowrap">
                    Study →
                </button>
            </div>
        </div>
    )
}

function ActivityHeatmap({ data }) {
    // Build a map of day → count
    const countMap = {}
    data.forEach(d => { countMap[d.day] = d.count })
    const maxCount = Math.max(...data.map(d => d.count), 1)

    // Generate last 90 days
    const days = []
    const today = new Date()
    for (let i = 89; i >= 0; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i)
        const key = d.toISOString().slice(0, 10)
        days.push({ key, count: countMap[key] || 0 })
    }

    // Split into weeks (columns)
    const weeks = []
    for (let i = 0; i < days.length; i += 7) {
        weeks.push(days.slice(i, i + 7))
    }

    function intensity(count) {
        if (count === 0) return 'bg-[#1e1e2a]'
        const ratio = count / maxCount
        if (ratio < 0.25) return 'bg-violet-900/60'
        if (ratio < 0.5)  return 'bg-violet-700/70'
        if (ratio < 0.75) return 'bg-violet-600'
        return 'bg-violet-500'
    }

    return (
        <div className="flex gap-1 overflow-x-auto pb-2">
            {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-1">
                    {week.map((day, di) => (
                        <div key={di}
                            title={`${day.key}: ${day.count} session${day.count !== 1 ? 's' : ''}`}
                            className={`w-3 h-3 rounded-sm ${intensity(day.count)}`} />
                    ))}
                </div>
            ))}
        </div>
    )
}