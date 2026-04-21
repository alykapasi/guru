// src/pages/LoginPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function LoginPage() {
  const [tab, setTab] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = tab === 'login'
        ? await api.auth.login(email, password)
        : await api.auth.register(email, password)
      localStorage.setItem('token', res.token)
      navigate(res.is_new ? '/onboarding': '/library')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f0f13]">
      <div className="w-full max-w-sm bg-[#1a1a24] rounded-2xl p-8 border border-[#2e2e3a]">
        <h1 className="text-2xl font-bold text-white mb-1">Guru</h1>
        <p className="text-slate-400 text-sm mb-6">Your personal AI tutor</p>

        <div className="flex bg-[#0f0f13] rounded-lg p-1 mb-6">
          {['login', 'register'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors
                ${tab === t ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}>
              {t === 'login' ? 'Sign in' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email" placeholder="Email" value={email}
            onChange={e => setEmail(e.target.value)} required
            className="w-full bg-[#0f0f13] border border-[#2e2e3a] rounded-lg px-4 py-2.5
                       text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm" />
          <input
            type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)} required
            className="w-full bg-[#0f0f13] border border-[#2e2e3a] rounded-lg px-4 py-2.5
                       text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 text-sm" />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50
                       text-white font-medium py-2.5 rounded-lg transition-colors text-sm">
            {loading ? 'Please wait...' : tab === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}