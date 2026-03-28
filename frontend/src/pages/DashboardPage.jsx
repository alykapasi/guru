// src/pages/DashboardPage.jsx

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'

export default function DashboardPage() {
    const navigate = useNavigate()
    const qc = useQueryClient()
    const fileRef = useRef()
    const [uploading, setUploading] = useState(false)

    const { data: materials = [] } = useQuery({
        queryKey: ['materials'],
        queryFn: api.materials.list,
        refetchInterval: (data) =>
            data?.some?.(m => m.status === 'ingesting' || m.status === 'pending') ? 3000 : false,
    })

    async function handleUpload(e) {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        try {
            await api.materials.upload(file)
            qc.invalidateQueries(['materials'])
        } finally {
            setUploading(false)
            fileRef.current.value = ''
        }
    }

    function statusBadge(status) {
        const map = {
            pending: 'bg-yellow-500/20 text-yellow-400',
            ingesting: 'bg-blue-500/20 text-blue-400',
            ready: 'bg-green-500/20 text-green-400',
            error: 'bg-red-500/20 text-red-400',
        }
        return `text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? ''}`
    }

    return (
        <div className="min-h-screen bg-[#0f0f13] p-6">
            <div className="max-w-3x1 mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2x1 font-bold text-white">My materials</h1>
                        <p className="text-slate-400 text-sm mt-1">Upload study material to get started</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={() => { localStorage.removeItem('token'); navigate('/login') }}
                            className="text-slate-400 hover:text-white text-sm transition-colors">
                            Sign Out
                        </button>
                        <button onClick={() => fileRef.current?.click()} disabled={uploading}
                            className="bg-violet-600 hover:bg-violet-500 diabled:opacity-50 text-white
                                text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                            {uploading ? 'Uploading...' : '+ Upload'}
                        </button>
                        <input ref={fileRef} type="file" accept=".pdf, .docx, .pptx" className="hidden" onChange={handleUpload} />
                    </div>
                </div>

                {materials.length === 0 ? (
                    <div className="text-center py-20 text-slate-500">
                        <p className="text-lg mb-2">No materials yet</p>
                        <p className="text-sm">Upload a PDF, DOCX or PPTX to start learning</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {materials.map(m => (
                            <div key={m.id} onClick={() => m.status === 'ready' && navigate(`/study/${m.id}`)}
                                className={`bg-[#1a1a24] border border-[#2e2e3a] rounded-x1 p-4 flex items-center
                                    justify-between transition-colors
                                    ${m.status === 'ready' ? 'cursor-pointer hover:border-violet-500' : 'opacity-60'}`}>
                                <div>
                                    <p className="text-white font-medium">{m.title}</p>
                                    <p className="text-slate-500 text-xs mt-0.5">{m.filename}</p>
                                </div>
                                <span className={statusBadge(m.status)}>{m.status}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}