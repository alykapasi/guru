// src/pages/OnboardingPage.jsx

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

const questions = [
    { key: 'background', label: "What's your background with this subject?",
        options: [['beginner', 'Beginner'], ['some', 'Some exposure'], ['familiar', 'Fairly familiar'], ['expert', 'Expert']]},
    { key: 'learn_style', label: 'How do you prefer to learn?',
        options: [['examples','Explanations + examples'], ['problems','Problems first'], ['analogies','Analogies & metaphors'], ['facts','Just the facts']] },
    { key: 'goal', label: "What's your goal?",
        options: [['exam','Pass an exam'], ['deep','Deep understanding'], ['overview','Quick overview'], ['work','Apply it at work']] },
    { key: 'session_length', label: 'How long are your typical study sessions?',
        options: [['lt15','Under 15 min'], ['15-30','15–30 min'], ['30-60','30–60 min'], ['60plus','gt60 min']] },
    { key: 'tone', label: 'Preferred communication style?',
        options: [['concise','Concise & direct'], ['detailed','Thorough & detailed'], ['conversational','Warm & conversational'], ['formal','Formal']] },
]

export default function OnboardingPage() {
    const [answers, setAnswers] = useState({})
    const [loading, setLoading] = useState(false)
    const navigate = useNavigate()

    async function handleSubmit() {
        if (Object.keys(answers).length < questions.length) return
        setLoading(true)
        try {
            await api.profile.save(answers)
            navigate('/dashboard')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#0f0f13] flex items-center justify-center p-4">
            <div className="w-full max-w-lg">
                <h1 className="text-2xl font-bold text-white mb-1">Quick setup</h1>
                <p className="text-slate-400 text-sm mb-8">Help Guru teach you better</p>

                <div className="space-y-6">
                    {questions.map(q => (
                        <div key={q.key}>
                            <p className="text-sm font-medium text-slate-300 mb-3">{q.label}</p>
                            <div className="grid grid-cols-2 gap-2">
                                {q.options.map(([val, label]) => (
                                    <button key={val} onClick={() => setAnswers(a => ({...a, [q.key]: val}))}
                                        className={`py-2.5 px-3 rounded-lg text-sm text-left transition-colors border
                                            ${answers[q.key] === val
                                                ? 'bg-violet-600 border-violet-500 text-white'
                                                : 'bg-[#1a1a24] border-[#2e2e3a] text-slate-300 hover:border-violet-500'}`}>
                                        {label}
                                    </button>
                                ))}
                             </div>
                        </div>
                    ))}
                </div>

                <button onClick={handleSubmit} disabled={loading || Object.keys(answers).length < questions.length}
                    className="mt-8 w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white
                    font-medium py-3 rounded-xl transition-colors">
                    {loading ? 'Saving...' : 'Start learning'}
                </button>
            </div>
        </div>
    )
}