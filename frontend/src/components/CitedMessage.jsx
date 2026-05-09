// src/components/CitedMessage.jsx

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'

export default function CitedMessage({ content, citations = [] }) {
    const safeCitations = Array.isArray(citations) ? citations : []
    const [expanded, setExpanded] = useState(null)

    // Split the full content on citation markers first
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
                            <span key={i} className="text-slate-500 text-xs">[{n}]</span>
                        )
                        return (
                            <button key={i}
                                onClick={() => setExpanded(prev => prev === n ? null : n)}
                                className="inline-flex items-center justify-center
                                           w-[16px] h-[16px] rounded text-[9px] font-bold
                                           text-violet-300 bg-violet-600/30
                                           hover:bg-violet-600/60 transition-colors
                                           align-super mx-[2px] leading-none shrink-0">
                                {n}
                            </button>
                        )
                    }
                    // Render each text segment through ReactMarkdown
                    return part ? (
                        <span key={i} className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown
                                components={{
                                    p: ({ children }) => <span>{children}</span>,
                                    // Prevent ReactMarkdown from wrapping in block elements
                                    ul: ({ children }) => <ul className="list-disc ml-4 my-1">{children}</ul>,
                                    ol: ({ children }) => <ol className="list-decimal ml-4 my-1">{children}</ol>,
                                    li: ({ children }) => <li className="my-0.5">{children}</li>,
                                    strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                                    h1: ({ children }) => <p className="font-bold text-white mt-2">{children}</p>,
                                    h2: ({ children }) => <p className="font-semibold text-white mt-2">{children}</p>,
                                    h3: ({ children }) => <p className="font-medium text-slate-200 mt-1">{children}</p>,
                                }}>
                                {part}
                            </ReactMarkdown>
                        </span>
                    ) : null
                })}
            </div>

            {/* Sources panel */}
            {safeCitations.length > 0 && (
                <div className="mt-3 pt-3 border-t border-[#2e2e3a]">
                    <p className="text-slate-600 text-xs uppercase tracking-wider mb-2">Sources</p>
                    <div className="space-y-1.5">
                        {safeCitations.map(c => (
                            <div key={c.n}
                                onClick={() => setExpanded(prev => prev === c.n ? null : c.n)}
                                className={`text-xs rounded-lg border transition-all cursor-pointer
                                    ${expanded === c.n
                                        ? 'bg-violet-600/10 border-violet-500/30'
                                        : 'bg-[#0f0f13] border-[#2e2e3a] hover:border-[#3e3e4a]'}`}>
                                <div className="flex items-start gap-2 px-3 py-2">
                                    <span className="text-violet-400 font-bold shrink-0 mt-0.5">
                                        [{c.n}]
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-slate-400 font-medium">
                                            {c.material_title}
                                            {c.heading_path?.length > 0 && (
                                                <span className="text-slate-600 font-normal">
                                                    {' › '}{c.heading_path.join(' › ')}
                                                </span>
                                            )}
                                        </p>
                                        {expanded === c.n && (
                                            <p className="text-slate-500 mt-2 leading-relaxed
                                                          border-t border-[#2e2e3a] pt-2 italic">
                                                "{c.excerpt}{c.excerpt?.length >= 300 ? '...' : ''}"
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}