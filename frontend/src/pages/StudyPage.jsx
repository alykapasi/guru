// src/pages/StudyPage.jsx

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'

import { api } from '../api/client'
import CitedMessage from '../components/CitedMessage'

export default function StudyPage() {
    const { sessionId } = useParams()
    const navigate = useNavigate()
    const location = useLocation()

    const goal = location.state?.goal ?? 'Study session'
    const [checklist, setChecklist] = useState([])
    const [checked, setChecked] = useState({})
    const [rightTab, setRightTab] = useState('lesson')
    const [leftCollapsed, setLeftCollapsed] = useState(false)
    const [rightCollapsed, setRightCollapsed] = useState(false)

    // Load session materials for display
    const { data: sessionData } = useQuery({
        queryKey: ['session-materials', sessionId],
        queryFn: async () => {
            const sessions = await api.sessions.list()
            return sessions.find(s => s.id === sessionId) ?? null
        },
    })

    // Generate checklist on mount
    useEffect(() => {
        if (!sessionId || !goal || goal === 'Study session') return
        api.lessons.checklist(sessionId, goal)
            .then(res => setChecklist(res.checklist ?? []))
            .catch(() => setChecklist([]))
    }, [sessionId])

    return (
        <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
            <LeftPanel
                collapsed={leftCollapsed}
                onToggle={() => setLeftCollapsed(c => !c)}
                sessionData={sessionData}
                goal={goal}
                checklist={checklist}
                checked={checked}
                onToggleCheck={i => setChecked(c => ({ ...c, [i]: !c[i] }))}
                onBack={() => navigate('/library')}
                sessionId={sessionId}
            />

            <div className="flex-1 flex flex-col min-w-0 border-x border-[#1e1e2a]">
                <ChatPanel sessionId={sessionId} goal={goal} />
            </div>

            <RightPanel
                collapsed={rightCollapsed}
                onToggle={() => setRightCollapsed(c => !c)}
                tab={rightTab}
                onTabChange={setRightTab}
                sessionId={sessionId}
            />
        </div>
    )
}

function useResizable(defaultWidth = 320, min = 240, max = 600) {
  const [width, setWidth] = useState(defaultWidth)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseDown = useCallback(e => {
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragging.current) return
      const delta = startX.current - e.clientX  // dragging left edge = increase width
      const next = Math.min(max, Math.max(min, startWidth.current + delta))
      setWidth(next)
    }
    function onMouseUp() {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [min, max])

  return { width, onMouseDown }
}

// ── Left Panel ─────────────────────────────────────────────────────────────
function LeftPanel({ collapsed, onToggle, sessionData, goal, checklist, checked, onToggleCheck, onBack, sessionId }) {
    const [addingMaterial, setAddingMaterial] = useState(false)
    const { data: allMaterials = [] } = useQuery({
        queryKey: ['materials'],
        queryFn: api.materials.list,
        enabled: addingMaterial,
    })
    const qc = useQueryClient()
    const completedCount = Object.values(checked).filter(Boolean).length
    const materialTitles = sessionData?.material_titles ?? []

    async function handleAddMaterial(materialId) {
        try {
            await api.sessions.addMaterial(sessionId, materialId)
            qc.invalidateQueries({ queryKey: ['session-materials', sessionId] })
            setAddingMaterial(false)
        } catch (err) {
            console.error('Failed to add material:', err)
        }
    }

    if (collapsed) return (
        <div className="w-10 border-r border-[#1e1e2a] flex flex-col items-center py-4 gap-4">
            <button onClick={onToggle}
                className="text-slate-500 hover:text-white transition-colors text-sm">→</button>
        </div>
    )

    const activeMaterialIds = new Set(sessionData?.material_ids ?? [])
    const addableMaterials = allMaterials.filter(
        m => m.status === 'ready' && !activeMaterialIds.has(m.id)
    )

    return (
        <div className="w-64 shrink-0 border-r border-[#1e1e2a] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-[#1e1e2a] flex items-center justify-between">
                <button onClick={onBack}
                    className="text-slate-500 hover:text-white text-xs transition-colors">
                    ← Library
                </button>
                <button onClick={onToggle}
                    className="text-slate-500 hover:text-white transition-colors text-sm">←</button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
                {/* Materials */}
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <p className="text-slate-500 text-xs uppercase tracking-wider">Materials</p>
                        <button onClick={() => setAddingMaterial(v => !v)}
                            className="text-violet-400 hover:text-violet-300 text-xs transition-colors">
                            + Add
                        </button>
                    </div>
                    <div className="space-y-1">
                        {materialTitles.map(title => (
                            <div key={title}
                                className="flex items-center gap-2 px-2 py-1 rounded-lg
                                           bg-[#0f0f13] border border-[#2e2e3a]">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                                <span className="text-slate-400 text-xs truncate">{title}</span>
                            </div>
                        ))}
                    </div>

                    {/* Add material dropdown */}
                    {addingMaterial && (
                        <div className="mt-2 bg-[#1a1a24] border border-[#2e2e3a] rounded-xl
                                        overflow-hidden">
                            {addableMaterials.length === 0 ? (
                                <p className="text-slate-500 text-xs px-3 py-2">
                                    No other materials available
                                </p>
                            ) : (
                                addableMaterials.map(m => (
                                    <button key={m.id}
                                        onClick={() => handleAddMaterial(m.id)}
                                        className="w-full text-left px-3 py-2 text-xs text-slate-300
                                                   hover:bg-[#2e2e3a] transition-colors">
                                        {m.title}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Goal */}
                <div>
                    <p className="text-slate-500 text-xs uppercase tracking-wider mb-1.5">Goal</p>
                    <p className="text-slate-300 text-xs leading-relaxed">{goal}</p>
                </div>

                {/* Checklist */}
                {checklist.length > 0 && (
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <p className="text-slate-500 text-xs uppercase tracking-wider">Checklist</p>
                            <span className="text-slate-500 text-xs">
                                {completedCount}/{checklist.length}
                            </span>
                        </div>
                        <div className="h-1 bg-[#1e1e2a] rounded-full mb-3 overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full transition-all"
                                 style={{ width: `${checklist.length ? (completedCount/checklist.length)*100 : 0}%` }} />
                        </div>
                        <div className="space-y-2">
                            {checklist.map((item, i) => (
                                <button key={i} onClick={() => onToggleCheck(i)}
                                    className="flex items-start gap-2.5 w-full text-left group">
                                    <div className={`w-4 h-4 rounded border shrink-0 mt-0.5 flex items-center
                                                     justify-center transition-colors
                                                     ${checked[i]
                                                         ? 'bg-violet-600 border-violet-600'
                                                         : 'border-[#3e3e4a] group-hover:border-violet-500'}`}>
                                        {checked[i] && (
                                            <svg className="w-2.5 h-2.5 text-white" fill="none"
                                                 viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round"
                                                      strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                    <span className={`text-xs leading-relaxed transition-colors
                                        ${checked[i] ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                                        {item}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Chat Panel ─────────────────────────────────────────────────────────────
function ChatPanel({ sessionId, goal }) {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const bottomRef = useRef()
    const inputRef = useRef()
    const isResuming = !goal || goal === 'Study session'

    useEffect(() => {
        if (isResuming) {
            api.sessions.messages(sessionId)
                .then(history => {
                    setMessages(history.length > 0
                        ? history.map(m => ({
                            role: m.role,
                            content: m.content,
                            citations: m.citations ?? [],   // was hardcoded []
                        }))
                        : [{ role: 'assistant', content: 'Welcome back! Where would you like to continue?', citations: [] }]
                    )
                })
                .catch(() => setMessages([{
                    role: 'assistant',
                    content: 'Welcome back! Where would you like to continue?'
                }]))
        } else {
            setMessages([{
                role: 'assistant',
                content: `Ready to help. Your goal: **${goal}**\n\nWhat would you like to start with?`
            }])
        }
    }, [sessionId])

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function send() {
        if (!input.trim() || loading) return
        const userMsg = input.trim()
        setInput('')
        setMessages(m => [...m, { role: 'user', content: userMsg }])
        setLoading(true)
        try {
            const res = await api.chat.message(sessionId, userMsg)
            console.log('raw reply:', res.reply)
            console.log('citations:', res.citations)
            setMessages(m => [...m, { role: 'assistant', content: res.reply, citations: res.citations ?? [], }])
        } catch (err) {
            setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong. Try again.' }])
        } finally {
            setLoading(false)
            inputRef.current?.focus()
        }
    }

    return (
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {m.role === 'assistant' && (
                            <div className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-500/30
                                            flex items-center justify-center shrink-0 mt-1 mr-2">
                                <span className="text-violet-400 text-xs font-bold">G</span>
                            </div>
                        )}
                        <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed
                            ${m.role === 'user'
                                ? 'bg-violet-600 text-white'
                                : 'bg-[#1a1a24] border border-[#2e2e3a] text-slate-200'}`}>
                            {m.role === 'assistant'
                                ? <CitedMessage content={m.content} citations={m.citations ?? []} />
                                : m.content}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="w-6 h-6 rounded-full bg-violet-600/20 border border-violet-500/30
                                        flex items-center justify-center shrink-0 mt-1 mr-2">
                            <span className="text-violet-400 text-xs font-bold">G</span>
                        </div>
                        <div className="bg-[#1a1a24] border border-[#2e2e3a] rounded-2xl px-4 py-3">
                            <div className="flex gap-1 items-center">
                                {[0, 150, 300].map(delay => (
                                    <span key={delay}
                                        className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
                                        style={{ animationDelay: `${delay}ms` }} />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>
            <div className="px-6 pb-6 pt-3 border-t border-[#1e1e2a]">
                <div className="flex gap-3">
                    <input ref={inputRef} value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                        placeholder={loading ? 'Guru is thinking...' : 'Ask a question...'}
                        disabled={loading}
                        className="flex-1 bg-[#1a1a24] border border-[#2e2e3a] rounded-xl px-4 py-3
                                   text-white placeholder-slate-500 focus:outline-none
                                   focus:border-violet-500 text-sm" />
                    <button onClick={send} disabled={loading || !input.trim()}
                        className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                                   text-white px-5 rounded-xl text-sm font-medium transition-colors">
                        Send
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Right Panel ────────────────────────────────────────────────────────────
function RightPanel({ collapsed, onToggle, tab, onTabChange, sessionId }) {
    const { width, onMouseDown } = useResizable(320, 240, 600)

    if (collapsed) return (
        <div className="w-10 border-l border-[#1e1e2a] flex flex-col items-center py-4">
            <button onClick={onToggle}
                className="text-slate-500 hover:text-white transition-colors text-sm">←</button>
        </div>
    )

    return (
        <div className="shrink-0 border-l border-[#1e1e2a] flex flex-col overflow-hidden relative"
             style={{ width }}>
            <div onMouseDown={onMouseDown}
                 className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize
                            hover:bg-violet-500/50 transition-colors z-10" />
            <div className="flex border-b border-[#1e1e2a]">
                {['lesson', 'quiz', 'cards'].map(t => (
                    <button key={t} onClick={() => onTabChange(t)}
                        className={`flex-1 py-3 text-xs font-medium capitalize transition-colors border-b-2
                            ${tab === t
                                ? 'border-violet-500 text-violet-300'
                                : 'border-transparent text-slate-500 hover:text-white'}`}>
                        {t === 'cards' ? '🃏' : t}
                    </button>
                ))}
                <button onClick={onToggle}
                    className="px-3 text-slate-500 hover:text-white transition-colors text-sm
                               border-b-2 border-transparent">→</button>
            </div>
            <div className="flex-1 overflow-y-auto relative">
                <div style={{ display: tab === 'lesson' ? 'block' : 'none' }}>
                    <LessonTab sessionId={sessionId} />
                </div>
                <div style={{ display: tab === 'quiz' ? 'block' : 'none' }}>
                    <QuizTab sessionId={sessionId} />
                </div>
                <div style={{ display: tab === 'cards' ? 'block' : 'none' }}>
                    <FlashcardTab sessionId={sessionId} />
                </div>
            </div>
        </div>
    )
}

// ── Lesson Tab ─────────────────────────────────────────────────────────────
function LessonTab({ sessionId }) {
    const [topic, setTopic] = useState('')
    const [lesson, setLesson] = useState('')
    const [loading, setLoading] = useState(false)
    const [confidence, setConfidence] = useState(null)
    const [reportSaved, setReportSaved] = useState(false)

    async function generate() {
        setLoading(true)
        setLesson('')
        setConfidence(null)
        setReportSaved(false)
        try {
            const res = await api.lessons.generate(sessionId, topic || undefined)
            setLesson(res.lesson_markdown)
        } finally {
            setLoading(false)
        }
    }

    async function saveConfidence(level) {
        setConfidence(level)
        try {
            await api.profile.selfReport(sessionId, topic || 'general', level)
            setReportSaved(true)
        } catch {
            // non-critical, don't surface error
        }
    }

    return (
        <div className="p-4 space-y-3">
            <input value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="Topic (optional)"
                className="w-full bg-[#0f0f13] border border-[#2e2e3a] rounded-lg px-3 py-2
                           text-white placeholder-slate-500 focus:outline-none
                           focus:border-violet-500 text-xs" />
            <button onClick={generate} disabled={loading}
                className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                           text-white py-2 rounded-lg text-xs font-medium transition-colors">
                {loading ? 'Generating...' : 'Generate lesson'}
            </button>

            {lesson && (
                <>
                    <div className="mt-2 text-slate-300">
                        <div className="prose prose-invert prose-xs max-w-none text-xs leading-relaxed">
                            <ReactMarkdown>{lesson}</ReactMarkdown>
                        </div>
                    </div>

                    {/* Self-report confidence */}
                    <div className="border-t border-[#1e1e2a] pt-3 mt-3">
                        {reportSaved ? (
                            <p className="text-slate-500 text-xs text-center">
                                ✓ Confidence saved
                            </p>
                        ) : (
                            <>
                                <p className="text-slate-400 text-xs mb-2 text-center">
                                    How confident do you feel about this?
                                </p>
                                <div className="flex gap-1.5">
                                    {[
                                        { level: 1, label: 'Lost' },
                                        { level: 2, label: 'Unsure' },
                                        { level: 3, label: 'Getting it' },
                                        { level: 4, label: 'Solid' },
                                    ].map(({ level, label }) => (
                                        <button key={level}
                                            onClick={() => saveConfidence(level)}
                                            className={`flex-1 py-1.5 rounded-lg text-xs transition-colors border
                                                ${confidence === level
                                                    ? 'bg-violet-600 border-violet-500 text-white'
                                                    : 'bg-[#0f0f13] border-[#2e2e3a] text-slate-400 hover:border-violet-500'}`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}

            {!lesson && !loading && (
                <p className="text-slate-600 text-xs text-center pt-4">
                    Generate a lesson on any topic from this material
                </p>
            )}
        </div>
    )
}

// ── Quiz Tab ───────────────────────────────────────────────────────────────
function QuizTab({ sessionId }) {
  const qc = useQueryClient()
  const [topic, setTopic] = useState('')
  const [quiz, setQuiz] = useState(null)
  const [attemptId, setAttemptId] = useState(null)
  const [answers, setAnswers] = useState({})
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    setQuiz(null); setResults(null); setAnswers({})
    try {
      const res = await api.quiz.generate(sessionId, topic || undefined, 5)
      const quiz = res.quiz.map((q, i) => ({ ...q, id: q.id || `q${i}` }))
      setQuiz(quiz)
      setAttemptId(res.attempt_id)
    } finally {
      setLoading(false)
    }
  }

  async function submit() {
    setLoading(true)
    try {
      const res = await api.quiz.submit(attemptId, answers)
      setResults(res)
      qc.invalidateQueries({ queryKey: ['wiki'] })
    //   qc.invalidateQueries({ queryKey: ['mastery', materialId] })
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-32">
      <span className="text-slate-500 text-xs">
        {quiz ? 'Grading...' : 'Generating quiz...'}
      </span>
    </div>
  )

  if (!quiz) return (
    <div className="p-4 space-y-3">
      <input
        value={topic} onChange={e => setTopic(e.target.value)}
        placeholder="Topic (optional)"
        className="w-full bg-[#0f0f13] border border-[#2e2e3a] rounded-lg px-3 py-2
                   text-white placeholder-slate-500 focus:outline-none
                   focus:border-violet-500 text-xs" />
      <button onClick={generate}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white py-2
                   rounded-lg text-xs font-medium transition-colors">
        Generate quiz
      </button>
      <p className="text-slate-600 text-xs text-center pt-2">
        Test your understanding with a short quiz
      </p>
    </div>
  )

  if (results) return (
    <div className="p-4 space-y-3">
      <div className="bg-violet-600/10 border border-violet-500/20 rounded-xl p-3 text-center">
        <p className="text-xl font-bold text-white">
          {Math.round(results.overall_score * 100)}%
        </p>
        <p className="text-violet-300 text-xs">Overall score</p>
      </div>
      {results.results.map(r => (
        <div key={r.question_id}
          className={`rounded-lg p-3 border text-xs
            ${r.score >= 0.8 ? 'bg-emerald-500/5 border-emerald-500/20'
              : r.score >= 0.5 ? 'bg-yellow-500/5 border-yellow-500/20'
              : 'bg-red-500/5 border-red-500/20'}`}>
          <div className="flex justify-between mb-1">
            <span className="text-slate-400 truncate mr-2">{r.concept}</span>
            <span className={`font-bold shrink-0
              ${r.score >= 0.8 ? 'text-emerald-400'
                : r.score >= 0.5 ? 'text-yellow-400'
                : 'text-red-400'}`}>
              {Math.round(r.score * 100)}%
            </span>
          </div>
          {r.feedback && <p className="text-slate-500 text-xs">{r.feedback}</p>}
        </div>
      ))}
      <button onClick={() => { setQuiz(null); setResults(null); setAnswers({}) }}
        className="w-full border border-[#2e2e3a] hover:border-violet-500
                   text-slate-400 py-2 rounded-lg text-xs transition-colors">
        New quiz
      </button>
    </div>
  )

  return (
    <div className="p-4 space-y-4">
      {quiz.map((q, i) => (
        <div key={q.id} className="space-y-2">
          <p className="text-slate-200 text-xs font-medium leading-relaxed">
            {i + 1}. {q.question}
          </p>
          {q.type === 'mcq' ? (
            <div className="space-y-1.5">
              {Object.entries(q.options).map(([k, v]) => (
                <button key={k}
                  onClick={() => setAnswers(a => ({ ...a, [q.id]: k }))}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors border
                    ${answers[q.id] === k
                      ? 'bg-violet-600 border-violet-500 text-white'
                      : 'bg-[#0f0f13] border-[#2e2e3a] text-slate-300 hover:border-violet-500'}`}>
                  <span className="font-medium mr-1.5">{k}.</span>{v}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={answers[q.id] ?? ''} rows={2}
              onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
              placeholder="Your answer..."
              className="w-full bg-[#0f0f13] border border-[#2e2e3a] rounded-lg px-3 py-2
                         text-white placeholder-slate-500 focus:outline-none
                         focus:border-violet-500 text-xs resize-none" />
          )}
        </div>
      ))}
      <button onClick={submit}
        className="w-full bg-violet-600 hover:bg-violet-500 text-white
                   py-2.5 rounded-lg text-xs font-medium transition-colors">
        Submit
      </button>
    </div>
  )
}

// ── Flashcard Tab ───────────────────────────────────────────────────────────────

function FlashcardTab({ sessionId }) {
    const [cards, setCards] = useState(null)
    const [current, setCurrent] = useState(0)
    const [flipped, setFlipped] = useState(false)
    const [generating, setGenerating] = useState(false)
    const [done, setDone] = useState(false)
    const [topic, setTopic] = useState('')

    async function generate() {
        setGenerating(true)
        setCards(null); setDone(false); setCurrent(0); setFlipped(false)
        try {
            const res = await api.flashcards.generate(sessionId, topic || undefined, 8)
            if (res.cards.length === 0) {
                setDone(true)
            } else {
                setCards(res.cards)
            }
        } finally {
            setGenerating(false)
        }
    }

    async function rate(grade) {
        const card = cards[current]
        await api.flashcards.review(card.id, grade)
        setFlipped(false)
        if (current + 1 >= cards.length) {
            setDone(true)
        } else {
            setCurrent(i => i + 1)
        }
    }

    if (generating) return (
        <div className="flex items-center justify-center h-32">
            <span className="text-slate-500 text-xs">Generating flashcards...</span>
        </div>
    )

    if (!cards) return (
        <div className="p-4 space-y-3">
            <input value={topic} onChange={e => setTopic(e.target.value)}
                placeholder="Topic (optional)"
                className="w-full bg-[#0f0f13] border border-[#2e2e3a] rounded-lg px-3 py-2
                           text-white placeholder-slate-500 focus:outline-none
                           focus:border-violet-500 text-xs" />
            <button onClick={generate}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white py-2
                           rounded-lg text-xs font-medium transition-colors">
                Generate flashcards
            </button>
            <p className="text-slate-600 text-xs text-center pt-2">
                Cards are scheduled using spaced repetition
            </p>
        </div>
    )

    if (done) return (
        <div className="p-4 text-center space-y-3">
            <div className="text-3xl mb-2">✓</div>
            <p className="text-white font-medium text-sm">Session complete</p>
            <p className="text-slate-500 text-xs">
                {cards.length} cards reviewed. Cards are scheduled for future review.
            </p>
            <button onClick={() => { setCards(null); setDone(false) }}
                className="w-full border border-[#2e2e3a] hover:border-violet-500
                           text-slate-400 py-2 rounded-lg text-xs transition-colors mt-2">
                Generate new cards
            </button>
        </div>
    )

    const card = cards[current]

    return (
        <div className="p-4 space-y-3">
            {/* Progress */}
            <div className="flex items-center justify-between">
                <span className="text-slate-500 text-xs">{card.concept}</span>
                <span className="text-slate-600 text-xs">
                    {current + 1}/{cards.length}
                </span>
            </div>
            <div className="h-1 bg-[#1e1e2a] rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all"
                     style={{ width: `${((current) / cards.length) * 100}%` }} />
            </div>

            {/* Card */}
            <div
                onClick={() => !flipped && setFlipped(true)}
                className={`rounded-xl border p-4 min-h-[140px] flex flex-col
                            justify-between transition-all cursor-pointer
                            ${flipped
                                ? 'bg-violet-600/10 border-violet-500/30'
                                : 'bg-[#0f0f13] border-[#2e2e3a] hover:border-[#3e3e4a]'}`}>
                <div>
                    <p className="text-slate-500 text-xs mb-2 uppercase tracking-wider">
                        {flipped ? 'Answer' : 'Question'}
                    </p>
                    <p className="text-white text-xs leading-relaxed">
                        {flipped ? card.back : card.front}
                    </p>
                </div>
                {!flipped && (
                    <p className="text-slate-600 text-xs text-center mt-3">
                        Tap to reveal answer
                    </p>
                )}
            </div>

            {/* Grade buttons */}
            {flipped && (
                <div className="grid grid-cols-4 gap-1.5">
                    {[
                        { grade: 0, label: 'Again', color: 'border-red-500/40 text-red-400 hover:bg-red-500/10' },
                        { grade: 1, label: 'Hard',  color: 'border-orange-500/40 text-orange-400 hover:bg-orange-500/10' },
                        { grade: 2, label: 'Good',  color: 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10' },
                        { grade: 3, label: 'Easy',  color: 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10' },
                    ].map(({ grade, label, color }) => (
                        <button key={grade} onClick={() => rate(grade)}
                            className={`py-2 rounded-lg text-xs font-medium border transition-colors ${color}`}>
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}