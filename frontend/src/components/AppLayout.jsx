// src/components/AppLayout.jsx

import { NavLink, useNavigate } from 'react-router-dom'

const NAV = [
    { to: '/library',    label: 'Library',    icon: '📚' },
    { to: '/sessions',   label: 'Sessions',   icon: '🧠' },
    { to: '/flashcards', label: 'Flashcards', icon: '🃏' },
    { to: '/wiki',       label: 'Wiki',       icon: '📖' },
]

export default function AppLayout({ children }) {
    const navigate = useNavigate()

    function logout() {
        localStorage.removeItem('token')
        navigate('/login')
    }

    return (
        <div className="flex min-h-screen bg-[#0f0f13]">
            {/* Sidebar */}
            <aside className="w-56 shrink-0 border-r border-[#1e1e2a] flex flex-col">
                {/* Logo */}
                <div className="px-5 py-5 border-b border-[#1e1e2a]">
                    <span className="text-white font-semibold tracking-tight">Guru</span>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-4 space-y-1">
                    {NAV.map(({ to, label, icon }) => (
                        <NavLink key={to} to={to}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                                ${isActive
                                    ? 'bg-violet-600/15 text-violet-300 font-medium'
                                    : 'text-slate-400 hover:text-white hover:bg-[#1e1e2a]'}`
                            }>
                            <span className="text-base leading-none">{icon}</span>
                            {label}
                        </NavLink>
                    ))}
                </nav>

                {/* Bottom */}
                <div className="px-3 py-4 border-t border-[#1e1e2a]">
                    <button onClick={logout}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                                text-slate-500 hover:text-white hover:bg-[#1e1e2a] w-full transition-colors">
                        <span className="text-base leading-none">↩</span>
                        Sign out
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    )
}