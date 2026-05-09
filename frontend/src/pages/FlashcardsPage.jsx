// src/pages/FlashcardsPage.jsx

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import AppLayout from '../components/AppLayout'
import { api } from '../api/client'

export default function FlashcardsPage() {
    const qc = useQueryClient()
    const [mode, setMode] = useState('due')    // 'due' | 'all' | 'review'
    const [reviewCards, setReviewCards] = useState([])
    const [current, setCurrent] = useState(0)
    const [flipped, setFlipped] = useState(false)
    const [done, setDone] = useState(false)
    const [filter, setFilter] = useState('all')

    const { data: dueCards = [], isLoading: dueLoading } = useQuery({
        queryKey: ['flashcards-due'],
        queryFn: () => api.flashcards.due(undefined, 50),
    })

    const { data: allCards = [], isLoading: allLoading } = useQuery({
        queryKey: ['flashcards-all'],
        queryFn: () => api.flashcards.all(),
        enabled: mode === 'all',
    })

    function startReview(cards) {
        setReviewCards(cards)
        setCurrent(0)
        setFlipped(false)
        setDone(false)
        setMode('review')
    }

    async function rate(grade) {
        const card = reviewCards[current]
        await api.flashcards.review(card.id, grade)
        qc.invalidateQueries({ queryKey: ['flashcards-due'] })
        qc.invalidateQueries({ queryKey: ['flashcards-all'] })
        setFlipped(false)
        if (current + 1 >= reviewCards.length) {
            setDone(true)
        } else {
            setCurrent(i => i + 1)
        }
    }

    // Group all cards by concept for the browse view
    const grouped = allCards.reduce((acc, c) => {
        acc[c.concept] = acc[c.concept] || []
        acc[c.concept].push(c)
        return acc
    }, {})

    // ── Review mode ──────────────────────────────────────────────────────
    if (mode === 'review') {
        if (done) return (
            <AppLayout>
                <div className="flex items-center justify-center h-screen">
                    <div className="text-center max-w-sm">
                        <div className="text-5xl mb-4">🎉</div>
                        <h2 className="text-white font-semibold text-lg mb-2">
                            Review complete
                        </h2>
                        <p className="text-slate-500 text-sm mb-6">
                            {reviewCards.length} cards reviewed.
                            Cards are scheduled based on your performance.
                        </p>
                        <button onClick={() => setMode('due')}
                            className="bg-violet-600 hover:bg-violet-500 text-white
                                       px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
                            Back to deck
                        </button>
                    </div>
                </div>
            </AppLayout>
        )

        const card = reviewCards[current]
        return (
            <AppLayout>
                <div className="flex items-center justify-center h-screen px-6">
                    <div className="w-full max-w-lg">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <button onClick={() => setMode('due')}
                                className="text-slate-500 hover:text-white text-sm transition-colors">
                                ← Back
                            </button>
                            <span className="text-slate-500 text-sm">
                                {current + 1} / {reviewCards.length}
                            </span>
                        </div>

                        {/* Progress */}
                        <div className="h-1 bg-[#1e1e2a] rounded-full mb-6 overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full transition-all"
                                 style={{ width: `${(current / reviewCards.length) * 100}%` }} />
                        </div>

                        {/* Concept label */}
                        <p className="text-violet-400 text-xs font-medium uppercase
                                      tracking-wider mb-3 text-center">
                            {card.concept}
                        </p>

                        {/* Card */}
                        <div
                            onClick={() => !flipped && setFlipped(true)}
                            className={`rounded-2xl border p-8 min-h-[220px] flex flex-col
                                        justify-between transition-all mb-6
                                        ${flipped
                                            ? 'bg-violet-600/10 border-violet-500/30 cursor-default'
                                            : 'bg-[#1a1a24] border-[#2e2e3a] hover:border-[#3e3e4a] cursor-pointer'}`}>
                            <div>
                                <p className="text-slate-500 text-xs uppercase tracking-wider mb-3">
                                    {flipped ? 'Answer' : 'Question'}
                                </p>
                                <p className="text-white text-sm leading-relaxed">
                                    {flipped ? card.back : card.front}
                                </p>
                            </div>
                            {!flipped && (
                                <p className="text-slate-600 text-xs text-center">
                                    Click to reveal
                                </p>
                            )}
                        </div>

                        {/* Grade buttons */}
                        {flipped && (
                            <div className="grid grid-cols-4 gap-3">
                                {[
                                    { grade: 0, label: 'Again', sub: '<1d',
                                      color: 'border-red-500/40 text-red-400 hover:bg-red-500/10' },
                                    { grade: 1, label: 'Hard',  sub: '~1d',
                                      color: 'border-orange-500/40 text-orange-400 hover:bg-orange-500/10' },
                                    { grade: 2, label: 'Good',  sub: 'scheduled',
                                      color: 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10' },
                                    { grade: 3, label: 'Easy',  sub: '+30%',
                                      color: 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10' },
                                ].map(({ grade, label, sub, color }) => (
                                    <button key={grade} onClick={() => rate(grade)}
                                        className={`py-3 rounded-xl border transition-colors ${color}`}>
                                        <p className="text-sm font-medium">{label}</p>
                                        <p className="text-xs opacity-60 mt-0.5">{sub}</p>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </AppLayout>
        )
    }

    // ── Main deck view ───────────────────────────────────────────────────
    return (
        <AppLayout>
            <div className="flex h-screen overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="px-8 py-6 border-b border-[#1e1e2a] flex items-center justify-between">
                        <div>
                            <h1 className="text-white font-semibold text-lg">Flashcards</h1>
                            <p className="text-slate-500 text-sm mt-0.5">
                                {dueCards.length} due today
                            </p>
                        </div>
                        {dueCards.length > 0 && (
                            <button onClick={() => startReview(dueCards)}
                                className="bg-violet-600 hover:bg-violet-500 text-white
                                           text-sm px-5 py-2.5 rounded-xl font-medium transition-colors">
                                Review {dueCards.length} due →
                            </button>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="px-8 border-b border-[#1e1e2a] flex gap-4">
                        {['due', 'all'].map(m => (
                            <button key={m} onClick={() => setMode(m)}
                                className={`py-3 text-xs font-medium capitalize border-b-2 transition-colors
                                    ${mode === m
                                        ? 'border-violet-500 text-violet-300'
                                        : 'border-transparent text-slate-500 hover:text-white'}`}>
                                {m === 'due' ? `Due (${dueCards.length})` : 'All cards'}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto px-8 py-4">
                        {mode === 'due' && (
                            <>
                                {dueLoading && (
                                    <p className="text-slate-500 text-sm text-center mt-8">
                                        Loading...
                                    </p>
                                )}
                                {!dueLoading && dueCards.length === 0 && (
                                    <div className="text-center mt-16">
                                        <div className="text-4xl mb-4">✓</div>
                                        <p className="text-white font-medium">
                                            All caught up!
                                        </p>
                                        <p className="text-slate-500 text-sm mt-1">
                                            No cards due for review right now.
                                            Generate cards from any study session.
                                        </p>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    {dueCards.map(c => (
                                        <CardRow key={c.id} card={c}
                                            onReview={() => startReview([c])} />
                                    ))}
                                </div>
                            </>
                        )}

                        {mode === 'all' && (
                            <>
                                {allLoading && (
                                    <p className="text-slate-500 text-sm text-center mt-8">
                                        Loading...
                                    </p>
                                )}
                                {!allLoading && allCards.length === 0 && (
                                    <p className="text-slate-500 text-sm text-center mt-8">
                                        No flashcards yet. Generate them from a study session.
                                    </p>
                                )}
                                {Object.entries(grouped).map(([concept, cards]) => (
                                    <div key={concept} className="mb-6">
                                        <div className="flex items-center justify-between mb-2">
                                            <p className="text-slate-400 text-xs font-medium
                                                          uppercase tracking-wider">
                                                {concept}
                                            </p>
                                            <button onClick={() => startReview(cards)}
                                                className="text-violet-400 hover:text-violet-300
                                                           text-xs transition-colors">
                                                Review all →
                                            </button>
                                        </div>
                                        <div className="space-y-1.5">
                                            {cards.map(c => (
                                                <CardRow key={c.id} card={c}
                                                    onReview={() => startReview([c])} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </AppLayout>
    )
}

function CardRow({ card: c, onReview }) {
    const due = new Date(c.due_at) <= new Date()
    const dueStr = due
        ? 'Due now'
        : `Due ${new Date(c.due_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

    return (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl
                        bg-[#1a1a24] border border-[#2e2e3a] hover:border-[#3e3e4a]
                        transition-colors">
            <div className="min-w-0">
                <p className="text-white text-sm truncate">{c.front}</p>
                <p className="text-slate-500 text-xs mt-0.5">
                    {dueStr} · interval {Math.round(c.interval)}d · EF {c.ease_factor.toFixed(1)}
                </p>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
                {due && (
                    <span className="text-xs text-violet-400 font-medium">due</span>
                )}
                <button onClick={onReview}
                    className="text-slate-500 hover:text-white text-xs transition-colors">
                    Review →
                </button>
            </div>
        </div>
    )
}