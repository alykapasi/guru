// src/pages/StudyPage.jsx

import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { api } from '../api/client'

const SESSION_ID = crypto.randomUUID()

export default function StudyPage() {
  const { materialId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // if resuming, skip entirely
  const resumeSessionId = searchParams.get('session')
  const [sessionId] = useState(() => resumeSessionId ?? crypto.randomUUID())
  const [phase, setPhase] = useState(resumeSessionId ? 'studying' : 'setup') // setup | studying
  const [goal, setGoal] = useState(resumeSessionId ? 'Continuing previous session' : '')
  const [checklist, setChecklist] = useState([])
  const [checked, setChecked] = useState({})
  const [generatingChecklist, setGeneratingChecklist] = useState(false)
  const [rightTab, setRightTab] = useState('lesson')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)

  const { data: material } = useQuery({
    queryKey: ['material', materialId],
    queryFn: () => api.materials.get(materialId),
  })

  const { data: mastery = [] } = useQuery({
    queryKey: ['mastery', materialId],
    queryFn: async () => {
      // fetch mastery scores for this material
      try {
        const res = await fetch(
          `http://localhost:8000/profile/mastery/${materialId}`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        )
        if (!res.ok) return []
        return res.json()
      } catch { return [] }
    },
    enabled: phase === 'studying',
  })

  async function startSession() {
    if (!goal.trim()) return
    setGeneratingChecklist(true)
    try {
      const res = await api.lessons.checklist(materialId, goal)
      setChecklist(res.checklist || [])
    } catch {
      setChecklist([])
    } finally {
      setGeneratingChecklist(false)
    }
    setPhase('studying')
  }

  function toggleCheck(i) {
    setChecked(c => ({ ...c, [i]: !c[i] }))
  }

  if (phase === 'setup') {
    return (
      <SessionSetup
        material={material}
        goal={goal}
        setGoal={setGoal}
        onStart={startSession}
        loading={generatingChecklist}
        onBack={() => navigate('/library')}
      />
    )
  }

  return (
    <div className="flex h-screen bg-[#0f0f13] overflow-hidden">
      {/* Left panel — session context */}
      <LeftPanel
        collapsed={leftCollapsed}
        onToggle={() => setLeftCollapsed(c => !c)}
        material={material}
        goal={goal}
        checklist={checklist}
        checked={checked}
        onToggleCheck={toggleCheck}
        mastery={mastery}
        onBack={() => navigate('/library')}
      />

      {/* Centre — chat */}
      <div className="flex-1 flex flex-col min-w-0 border-x border-[#1e1e2a]">
        <ChatPanel
          materialId={materialId} 
          sessionId={SESSION_ID} 
          goal={goal} 
          isResuming={!!resumeSessionId}
        />
      </div>

      {/* Right panel — lesson / quiz */}
      <RightPanel
        collapsed={rightCollapsed}
        onToggle={() => setRightCollapsed(c => !c)}
        tab={rightTab}
        onTabChange={setRightTab}
        materialId={materialId}
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

// ── Session Setup ──────────────────────────────────────────────────────────
function SessionSetup({ material, goal, setGoal, onStart, loading, onBack }) {
  return (
    <div className="min-h-screen bg-[#0f0f13] flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <button onClick={onBack}
          className="text-slate-500 hover:text-white text-sm mb-8 transition-colors">
          ← Back to library
        </button>

        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-[#1a1a24] border border-[#2e2e3a] rounded-lg
                            flex items-center justify-center">
              <span className="text-xs font-bold text-slate-400">
                {material?.file_type?.toUpperCase() ?? '?'}
              </span>
            </div>
            <h1 className="text-white font-semibold">{material?.title ?? '...'}</h1>
          </div>
          <p className="text-slate-500 text-sm">
            {material?.concepts?.length ?? 0} concepts indexed
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-slate-300 text-sm font-medium block mb-2">
              What do you want to accomplish today?
            </label>
            <textarea
              value={goal}
              onChange={e => setGoal(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && e.metaKey && onStart()}
              placeholder="e.g. Understand the core concepts well enough to explain them to someone else"
              rows={3}
              className="w-full bg-[#1a1a24] border border-[#2e2e3a] rounded-xl px-4 py-3
                         text-white placeholder-slate-500 focus:outline-none
                         focus:border-violet-500 text-sm resize-none" />
            <p className="text-slate-600 text-xs mt-1.5">⌘ + Enter to start</p>
          </div>

          <button
            onClick={onStart}
            disabled={!goal.trim() || loading}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                       text-white font-medium py-3 rounded-xl transition-colors text-sm">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border border-white/30 border-t-white
                                 rounded-full animate-spin"></span>
                Setting up session...
              </span>
            ) : 'Start session →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Left Panel ─────────────────────────────────────────────────────────────
function LeftPanel({ collapsed, onToggle, material, goal, checklist, checked, onToggleCheck, mastery, onBack }) {
  const completedCount = Object.values(checked).filter(Boolean).length

  if (collapsed) {
    return (
      <div className="w-10 border-r border-[#1e1e2a] flex flex-col items-center py-4 gap-4">
        <button onClick={onToggle}
          className="text-slate-500 hover:text-white transition-colors text-sm">
          →
        </button>
      </div>
    )
  }

  return (
    <div className="w-64 shrink-0 border-r border-[#1e1e2a] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1e1e2a] flex items-center justify-between">
        <button onClick={onBack}
          className="text-slate-500 hover:text-white text-xs transition-colors">
          ← Library
        </button>
        <button onClick={onToggle}
          className="text-slate-500 hover:text-white transition-colors text-sm">
          ←
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Material */}
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-wider mb-1.5">Material</p>
          <p className="text-white text-sm font-medium">{material?.title}</p>
        </div>

        {/* Goal */}
        <div>
          <p className="text-slate-500 text-xs uppercase tracking-wider mb-1.5">Session goal</p>
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
            {/* Progress bar */}
            <div className="h-1 bg-[#1e1e2a] rounded-full mb-3 overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all"
                style={{ width: `${checklist.length ? (completedCount / checklist.length) * 100 : 0}%` }}
              />
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
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
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

        {/* Mastery */}
        {mastery.length > 0 && (
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1.5">Mastery</p>
            <div className="space-y-2">
              {mastery.slice(0, 8).map(m => (
                <div key={m.concept}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-slate-400 text-xs truncate mr-2">{m.concept}</span>
                    <span className="text-slate-500 text-xs shrink-0">
                      {Math.round(m.score * 100)}%
                    </span>
                  </div>
                  <div className="h-1 bg-[#1e1e2a] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all
                        ${m.score >= 0.8 ? 'bg-emerald-500'
                          : m.score >= 0.5 ? 'bg-yellow-500'
                          : 'bg-red-500'}`}
                      style={{ width: `${m.score * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Concepts (if no mastery yet) */}
        {mastery.length === 0 && material?.concepts?.length > 0 && (
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-1.5">Concepts</p>
            <div className="flex flex-wrap gap-1">
              {material.concepts.slice(0, 12).map(c => (
                <span key={c}
                  className="bg-[#0f0f13] border border-[#2e2e3a] text-slate-500
                             text-xs px-2 py-0.5 rounded-md">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Chat Panel ─────────────────────────────────────────────────────────────
function ChatPanel({ materialId, sessionId, goal, isResuming }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const bottomRef = useRef()
  const inputRef = useRef()

  useEffect(() => {
    if (isResuming) {
      // Load existing messages
      fetch(`http://localhost:8000/chat/sessions/${sessionId}/messages`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
        .then(r => r.json())
        .then(history => {
          if (history.length > 0) {
            setMessages(history.map(m => ({ role: m.role, content: m.content })))
          } else {
            setMessages([{ role: 'assistant', content: 'Welcome back! Where would you like to continue?' }])
          }
          setHistoryLoaded(true)
        })
        .catch(() => {
          setMessages([{ role: 'assistant', content: 'Welcome back! Where would you like to continue?' }])
          setHistoryLoaded(true)
        })
    } else {
      setMessages([{
        role: 'assistant',
        content: `Ready to help you study. Your goal for this session: **${goal}**\n\nWhat would you like to start with?`
      }])
      setHistoryLoaded(true)
    }
  }, [])

  // Opening message from Guru
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: `Ready to help you study. Your goal for this session: **${goal}**\n\nWhat would you like to start with?`
    }])
  }, [])

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
      const res = await api.chat.message(sessionId, materialId, userMsg)
      setMessages(m => [...m, { role: 'assistant', content: res.reply ?? res.response }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: 'Something went wrong. Try again.' }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
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
              {m.role === 'assistant' ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : m.content}
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
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 pb-6 pt-3 border-t border-[#1e1e2a]">
        <div className="flex gap-3">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask a question..."
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
function RightPanel({ collapsed, onToggle, tab, onTabChange, materialId }) {
  const { width, onMouseDown } = useResizable(320, 240, 600)

  if (collapsed) {
    return (
      <div className="w-10 border-l border-[#1e1e2a] flex flex-col items-center py-4">
        <button onClick={onToggle}
          className="text-slate-500 hover:text-white transition-colors text-sm">
          ←
        </button>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-l border-[#1e1e2a] flex flex-col overflow-hidden relative"
         style={{ width }}>
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize
                   hover:bg-violet-500/50 transition-colors z-10" />

      <div className="flex border-b border-[#1e1e2a]">
        {['lesson', 'quiz'].map(t => (
          <button key={t} onClick={() => onTabChange(t)}
            className={`flex-1 py-3 text-xs font-medium capitalize transition-colors border-b-2
              ${tab === t
                ? 'border-violet-500 text-violet-300'
                : 'border-transparent text-slate-500 hover:text-white'}`}>
            {t}
          </button>
        ))}
        <button onClick={onToggle}
          className="px-3 text-slate-500 hover:text-white transition-colors text-sm
                     border-b-2 border-transparent">
          →
        </button>
      </div>

      {/* Keep both mounted, show/hide with CSS */}
      <div className="flex-1 overflow-y-auto relative">
        <div style={{ display: tab === 'lesson' ? 'block' : 'none' }}>
          <LessonTab materialId={materialId} />
        </div>
        <div style={{ display: tab === 'quiz' ? 'block' : 'none' }}>
          <QuizTab materialId={materialId} />
        </div>
      </div>
    </div>
  )
}

// ── Lesson Tab ─────────────────────────────────────────────────────────────
function LessonTab({ materialId }) {
  const [topic, setTopic] = useState('')
  const [lesson, setLesson] = useState('')
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    setLesson('')
    try {
      const res = await api.lessons.generate(materialId, topic || undefined)
      setLesson(res.lesson_markdown)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <input
        value={topic} onChange={e => setTopic(e.target.value)}
        placeholder={loading ? "Guru is thinking..." : "Ask a question..."}
        className="w-full bg-[#0f0f13] border border-[#2e2e3a] rounded-lg px-3 py-2
                   text-white placeholder-slate-500 focus:outline-none
                   focus:border-violet-500 text-xs" />
      <button onClick={generate} disabled={loading}
        className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40
                   text-white py-2 rounded-lg text-xs font-medium transition-colors">
        {loading ? 'Generating...' : 'Generate lesson'}
      </button>

      {lesson && (
        <div className="mt-2 text-slate-300">
          <div className="prose prose-invert prose-xs max-w-none text-xs leading-relaxed">
            <ReactMarkdown>{lesson}</ReactMarkdown>
          </div>
        </div>
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
function QuizTab({ materialId }) {
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
      const res = await api.quiz.generate(materialId, topic || undefined, 5)
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
      // Invalidate wiki and mastery so they reflect new scores
      qc.invalidateQueries({ queryKey: ['wiki'] })
      qc.invalidateQueries({ queryKey: ['mastery', materialId] })
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