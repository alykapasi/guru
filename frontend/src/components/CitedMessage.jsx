// src/components/CitedMessage.jsx
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { api } from '../api/client'

export default function CitedMessage({ content, citations = [] }) {
    const safeCitations = Array.isArray(citations) ? citations : []
    const [expandedN, setExpandedN] = useState(null)
    const [chunkCache, setChunkCache] = useState({})
    const [loadingChunk, setLoadingChunk] = useState(null)

    async function handleCitationClick(citation) {
        const n = citation.n
        if (expandedN === n) { setExpandedN(null); return }
        setExpandedN(n)
        if (!chunkCache[citation.chunk_id]) {
            setLoadingChunk(n)
            try {
                const data = await api.chunks.get(citation.chunk_id)
                setChunkCache(prev => ({ ...prev, [citation.chunk_id]: data }))
            } catch { /* silently fail — excerpt still shows */ }
            finally { setLoadingChunk(null) }
        }
    }

    const parts = content.split(/(\[\d+\])/g)

    return (
        <div>
            <div className="text-sm leading-relaxed">
                {parts.map((part, i) => {
                    const match = part.match(/^\[(\d+)\]$/)
                    if (match) {
                        const n = parseInt(match[1])
                        const citation = safeCitations.find(c => c.n === n)
                        if (!citation) return (
                            <span key={i} className="text-slate-600 text-xs">[{n}]</span>
                        )
                        return (
                            <button key={i}
                                onClick={() => handleCitationClick(citation)}
                                className={`inline-flex items-center justify-center
                                           w-[16px] h-[16px] rounded text-[9px] font-bold
                                           align-super mx-[2px] leading-none shrink-0
                                           transition-colors
                                           ${expandedN === n
                                               ? 'bg-violet-600 text-white'
                                               : 'text-violet-300 bg-violet-600/30 hover:bg-violet-600/60'}`}>
                                {n}
                            </button>
                        )
                    }
                    return part ? (
                        <span key={i} className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown
                                components={{
                                    p:      ({ children }) => <span>{children}</span>,
                                    ul:     ({ children }) => <ul className="list-disc ml-4 my-1">{children}</ul>,
                                    ol:     ({ children }) => <ol className="list-decimal ml-4 my-1">{children}</ol>,
                                    li:     ({ children }) => <li className="my-0.5">{children}</li>,
                                    strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                                    h1:     ({ children }) => <p className="font-bold text-white mt-2">{children}</p>,
                                    h2:     ({ children }) => <p className="font-semibold text-white mt-2">{children}</p>,
                                    h3:     ({ children }) => <p className="font-medium text-slate-200 mt-1">{children}</p>,
                                }}>
                                {part}
                            </ReactMarkdown>
                        </span>
                    ) : null
                })}
            </div>

            {/* Expanded citation drawer */}
            {expandedN !== null && (() => {
                const citation = safeCitations.find(c => c.n === expandedN)
                if (!citation) return null
                const detail = chunkCache[citation.chunk_id]
                return (
                    <div className="mt-3 rounded-xl border border-violet-500/30
                                    bg-[#0f0f13] overflow-hidden">
                        {/* Header */}
                        <div className="flex items-start justify-between px-4 py-3
                                        border-b border-[#2e2e3a]">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-violet-400 text-xs font-bold shrink-0">
                                        [{expandedN}]
                                    </span>
                                    <p className="text-white text-xs font-medium truncate">
                                        {detail?.material_title ?? citation.material_title}
                                    </p>
                                </div>
                                {/* Breadcrumb */}
                                {(detail?.heading_path ?? citation.heading_path)?.length > 0 && (
                                    <p className="text-slate-500 text-xs">
                                        {(detail?.heading_path ?? citation.heading_path).join(' › ')}
                                    </p>
                                )}
                                {/* Page range */}
                                {detail?.page_range?.length === 2 && (
                                    <p className="text-slate-600 text-xs mt-0.5">
                                        Pages {detail.page_range[0]}–{detail.page_range[1]}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 ml-3 shrink-0">
                                {detail?.raw_text && (
                                    <button
                                        onClick={() => navigator.clipboard.writeText(detail.raw_text)}
                                        className="text-slate-600 hover:text-slate-400 text-xs
                                                   transition-colors">
                                        Copy
                                    </button>
                                )}
                                <button onClick={() => setExpandedN(null)}
                                    className="text-slate-600 hover:text-white text-sm
                                               leading-none transition-colors">
                                    ×
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-4 py-3 max-h-64 overflow-y-auto">
                            {loadingChunk === expandedN ? (
                                <p className="text-slate-600 text-xs">Loading source...</p>
                            ) : detail?.raw_text ? (
                                <p className="text-slate-400 text-xs leading-relaxed whitespace-pre-wrap">
                                    {detail.raw_text}
                                </p>
                            ) : (
                                <p className="text-slate-500 text-xs italic leading-relaxed">
                                    {citation.excerpt}...
                                </p>
                            )}
                        </div>
                    </div>
                )
            })()}

            {/* Sources list at bottom */}
            {safeCitations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#2e2e3a]">
                    <p className="text-slate-600 text-xs uppercase tracking-wider mb-2">
                        Sources
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {safeCitations.map(c => (
                            <button key={c.n}
                                onClick={() => handleCitationClick(c)}
                                className={`text-xs px-2 py-1 rounded-lg border transition-colors
                                    ${expandedN === c.n
                                        ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                                        : 'bg-[#0f0f13] border-[#2e2e3a] text-slate-500 hover:text-white hover:border-[#3e3e4a]'}`}>
                                [{c.n}] {c.material_title}
                                {c.heading_path?.length > 0 &&
                                    <span className="text-slate-600"> › {c.heading_path[c.heading_path.length - 1]}</span>
                                }
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}