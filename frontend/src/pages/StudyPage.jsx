// src/pages/StudyPage.jsx

import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { api } from '../api/client'

const SESSION_ID = crypto.randomUUID()

export default function StudyPage() {
    const { materialId } = useParams()
    const navigate = useNavigate()
    const [tab, setTab] = useState('chat')

    const { data: material } = useQuery({
        queryKey: ['material', materialId],
        queryFn: () => api.materials.get(materialId),
    })

    return (
        <div className="min-h-screen bg-[#0f0f13] flex flex-col">
            <header className="border-b border-[#2e2e3a] px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/dashboard')} className="text-slate-400 hover:text-white text-sm">Back</button>
                    <span className="text-white font-medium text-sm">{material?.title ?? '...'}</span>
                </div>
                <div className="flex gap-1">
                    {['chat', 'lesson', 'quiz'].map(t => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`px-4 py-1.5 rounded-1g text-sm font-medium transition-colors captialize
                                ${tab === t ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                            {t}
                        </button>
                    ))}
                </div>
            </header>

            <div className="flex-1 overflow-hidden">
                {tab === 'chat' && <ChatPanel materialId={materialId} sessionId={SESSION_ID} />}
                {tab === 'lesson' && <LessonPanel materialId={materialId} />}
                {tab === 'quiz' && <QuizPanel materialId={materialId} />}
            </div>
        </div>
    )
}

// chat
function ChatPanel({ materialId, sessionId }) {
    const [messages, setMessages] = useState([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const bottomRef = useRef()

    useEffect(() => { bottomRef.current?.scrollIntoView({behavior: 'smooth' }) }, [messages])

    async function send() {
        if (!input.trim() || loading) return
        const userMsg = input.trim()
        setInput('')
        setMessages(m => [...m, {role: 'user', content: UserMsg }])
        setLoading(true)
        try {
            const res = await api.chat.message(sessionId, materialId, userMsg)
            setMessages(m => [...m, { role: 'assistant', content: res.reply ?? res.response }])
        } catch(err) {
            setMessages(m => [...m, { role: 'assistant', content: 'Error: ' + err.message }])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col h-full max-w-3x1 mx-auto w-full">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 && (
                    <p className="text-slate-500 text-sm text-center mt-12">Ask anything about this material</p>
                )}
                {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] rounded-2x1 px-4 py-3 text-sm
                            ${m.role === 'user'
                                ? 'bg-violet-600 text-white'
                                : 'bg-[#1a1a24] border border-[#2e2e3a] text-slate-200'}`}>
                            {m.role === 'assistant'
                                ? <ReactMarkdown className="prose prose-invert prose-sm max-w-none">{m.content}</ReactMarkdown>
                                : m.content}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-[#1a1a24] border border-[#2e2e3a] rounded-2x1 px-4 py-3">
                            <span className="text-slate-400 text-sm">Thinking...</span>
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>
            <div className="p-4 border-t border-[#2e2e3a]">
                <div className="flex gap-3">
                    <input value={input} onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
                        placeholder="Ask a question..." disabled={loading}
                        className="flex-1 bg-[#1a1a24] border border-[#2e2e3a] rounded-x1 px-4 py-3
                        text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm" />
                    <button onClick={send} disabled={loading || !input.trim()}
                        className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white
                            px-5 py-3 rounded-x1 text-sm font-medium transition-colors">
                        Send
                    </button>
                </div>
            </div>
        </div>
    )
}

// lesson 

function LessonPanel({ materialId }) {
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
    <div className="max-w-3xl mx-auto w-full p-6">
      <div className="flex gap-3 mb-6">
        <input value={topic} onChange={e => setTopic(e.target.value)}
          placeholder="Topic (optional — leave blank for full overview)"
          className="flex-1 bg-[#1a1a24] border border-[#2e2e3a] rounded-xl px-4 py-2.5
            text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm" />
        <button onClick={generate} disabled={loading}
          className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white
            px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>
      {lesson && (
        <div className="bg-[#1a1a24] border border-[#2e2e3a] rounded-2xl p-6">
          <ReactMarkdown className="prose prose-invert prose-sm max-w-none">{lesson}</ReactMarkdown>
        </div>
      )}
      {!lesson && !loading && (
        <p className="text-slate-500 text-sm text-center mt-12">Enter a topic and generate a lesson</p>
      )}
    </div>
  )
}

// quiz
function QuizPanel({ materialId }) {
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
      const res = await api.quiz.generate(materialId, topic || undefined, 6)
      setQuiz(res.quiz)
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
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto w-full p-6">
      {!quiz && !loading && (
        <div className="flex gap-3 mb-6">
          <input value={topic} onChange={e => setTopic(e.target.value)}
            placeholder="Topic (optional)"
            className="flex-1 bg-[#1a1a24] border border-[#2e2e3a] rounded-xl px-4 py-2.5
              text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm" />
          <button onClick={generate}
            className="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium">
            Start quiz
          </button>
        </div>
      )}

      {loading && <p className="text-slate-400 text-sm text-center mt-12">Generating quiz...</p>}

      {quiz && !results && (
        <div className="space-y-6">
          {quiz.map((q, i) => (
            <div key={q.id} className="bg-[#1a1a24] border border-[#2e2e3a] rounded-xl p-5">
              <p className="text-white text-sm font-medium mb-3">{i+1}. {q.question}</p>
              {q.type === 'mcq' ? (
                <div className="space-y-2">
                  {Object.entries(q.options).map(([k, v]) => (
                    <button key={k} onClick={() => setAnswers(a => ({...a, [q.id]: k}))}
                      className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors border
                        ${answers[q.id] === k
                          ? 'bg-violet-600 border-violet-500 text-white'
                          : 'bg-[#0f0f13] border-[#2e2e3a] text-slate-300 hover:border-violet-500'}`}>
                      <span className="font-medium mr-2">{k}.</span>{v}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea value={answers[q.id] ?? ''} rows={3}
                  onChange={e => setAnswers(a => ({...a, [q.id]: e.target.value}))}
                  placeholder="Your answer..."
                  className="w-full bg-[#0f0f13] border border-[#2e2e3a] rounded-lg px-4 py-2.5
                    text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm resize-none" />
              )}
            </div>
          ))}
          <button onClick={submit} disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white
              font-medium py-3 rounded-xl transition-colors">
            Submit quiz
          </button>
        </div>
      )}

      {results && (
        <div className="space-y-4">
          <div className="bg-violet-600/20 border border-violet-500/30 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-white">{Math.round(results.overall_score * 100)}%</p>
            <p className="text-violet-300 text-sm">Overall score</p>
          </div>
          {results.results.map(r => (
            <div key={r.question_id} className={`bg-[#1a1a24] border rounded-xl p-4
              ${r.score >= 0.8 ? 'border-green-500/30' : r.score >= 0.5 ? 'border-yellow-500/30' : 'border-red-500/30'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-300 text-sm font-medium">{r.concept}</span>
                <span className={`text-sm font-bold ${r.score >= 0.8 ? 'text-green-400' : r.score >= 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {Math.round(r.score * 100)}%
                </span>
              </div>
              {r.feedback && <p className="text-slate-400 text-xs mt-1">{r.feedback}</p>}
              {r.correct_answer && r.score < 1 && (
                <p className="text-slate-500 text-xs mt-1">Correct: {r.correct_answer}</p>
              )}
            </div>
          ))}
          <button onClick={() => { setQuiz(null); setResults(null); setAnswers({}) }}
            className="w-full border border-[#2e2e3a] hover:border-violet-500 text-slate-300
              font-medium py-3 rounded-xl transition-colors text-sm">
            New quiz
          </button>
        </div>
      )}
    </div>
  )
}