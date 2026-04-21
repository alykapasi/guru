// src/pages/LandingPage.jsx
import { useNavigate } from 'react-router-dom'

export default function LandingPage() {
  const navigate = useNavigate()
  const isLoggedIn = !!localStorage.getItem('token')

  return (
    <div className="min-h-screen bg-[#0f0f13] flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-[#1e1e2a]">
        <span className="text-white font-semibold text-lg tracking-tight">Guru</span>
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <button
              onClick={() => navigate('/library')}
              className="bg-violet-600 hover:bg-violet-500 text-white text-sm
                         px-4 py-2 rounded-lg transition-colors font-medium">
              Go to library →
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                className="text-slate-400 hover:text-white text-sm transition-colors px-4 py-2">
                Sign in
              </button>
              <button
                onClick={() => navigate('/login')}
                className="bg-violet-600 hover:bg-violet-500 text-white text-sm
                           px-4 py-2 rounded-lg transition-colors font-medium">
                Get started
              </button>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-violet-600/10 border border-violet-500/20
                          rounded-full px-4 py-1.5 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
            <span className="text-violet-300 text-xs font-medium">AI-powered learning</span>
          </div>

          <h1 className="text-5xl font-bold text-white mb-6 leading-tight tracking-tight">
            Learn anything.<br />
            <span className="text-violet-400">Actually understand it.</span>
          </h1>

          <p className="text-slate-400 text-lg mb-10 leading-relaxed max-w-xl mx-auto">
            Upload your study materials and learn with an AI tutor that adapts to you —
            tracking what you know, building your personal knowledge base, and
            teaching you the way you learn best.
          </p>

          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => navigate(isLoggedIn ? '/library' : '/login')}
              className="bg-violet-600 hover:bg-violet-500 text-white font-medium
                         px-8 py-3 rounded-xl transition-colors text-sm">
              {isLoggedIn ? 'Go to library' : 'Start learning for free'}
            </button>
            {!isLoggedIn && (
              <button
                onClick={() => navigate('/login')}
                className="text-slate-400 hover:text-white text-sm transition-colors px-4 py-3">
                Sign in →
              </button>
            )}
          </div>
        </div>
      </main>

      {/* How it works */}
      <section className="border-t border-[#1e1e2a] py-16 px-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-slate-500 text-xs uppercase tracking-widest text-center mb-10">
            How it works
          </p>
          <div className="grid grid-cols-3 gap-8">
            {[
              { n: '01', title: 'Upload your materials',
                body: 'PDF, DOCX, PPTX. Guru reads and indexes everything, extracting the concepts that matter.' },
              { n: '02', title: 'Study with your tutor',
                body: 'Chat, generate lessons, take quizzes. Guru grounds every answer in your actual materials.' },
              { n: '03', title: 'Build your knowledge base',
                body: "Every session adds to your personal wiki — a living record of everything you've learned." },
            ].map(item => (
              <div key={item.n} className="text-left">
                <span className="text-violet-500 text-xs font-mono font-bold mb-3 block">{item.n}</span>
                <h3 className="text-white font-medium mb-2 text-sm">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[#1e1e2a] px-8 py-5">
        <p className="text-slate-600 text-xs text-center">© 2026 Guru</p>
      </footer>
    </div>
  )
}