// src/pages/WikiPage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import AppLayout from '../components/AppLayout'
import { api } from '../api/client'

export default function WikiPage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['wiki'],
    queryFn: api.profile.wiki,
    refetchOnMount: true,
  })

  // Group by material
  const grouped = entries.reduce((acc, e) => {
    const key = e.material_title
    if (!acc[key]) acc[key] = { material_id: e.material_id, concepts: [] }
    acc[key].concepts.push(e)
    return acc
  }, {})

  const filtered = search
    ? entries.filter(e => e.concept.toLowerCase().includes(search.toLowerCase()))
    : null

  return (
    <AppLayout>
      <div className="flex h-screen overflow-hidden">
        {/* Left — concept tree */}
        <div className="w-72 shrink-0 border-r border-[#1e1e2a] flex flex-col overflow-hidden">
          <div className="px-5 py-5 border-b border-[#1e1e2a]">
            <h1 className="text-white font-semibold mb-3">Wiki</h1>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search concepts..."
              className="w-full bg-[#0f0f13] border border-[#2e2e3a] rounded-lg
                         px-3 py-2 text-white placeholder-slate-500 text-xs
                         focus:outline-none focus:border-violet-500" />
          </div>

          <div className="flex-1 overflow-y-auto py-3">
            {isLoading && (
              <p className="text-slate-500 text-xs px-5 py-4">Loading...</p>
            )}

            {!isLoading && entries.length === 0 && (
              <div className="px-5 py-8 text-center">
                <p className="text-slate-500 text-xs">No concepts yet</p>
                <p className="text-slate-600 text-xs mt-1">
                  Complete a quiz to build your wiki
                </p>
                <button onClick={() => navigate('/library')}
                  className="mt-3 text-violet-400 hover:text-violet-300
                             text-xs transition-colors">
                  Go to Library →
                </button>
              </div>
            )}

            {/* Filtered flat list */}
            {filtered && (
              <div className="px-3 space-y-1">
                {filtered.map(e => (
                  <ConceptRow
                    key={`${e.material_id}-${e.concept}`}
                    entry={e}
                    isSelected={selected?.concept === e.concept &&
                                selected?.material_id === e.material_id}
                    onClick={() => setSelected(e)}
                  />
                ))}
              </div>
            )}

            {/* Grouped by material */}
            {!filtered && Object.entries(grouped).map(([title, group]) => (
              <div key={title} className="mb-4">
                <div className="px-5 py-1.5 flex items-center justify-between">
                  <p className="text-slate-500 text-xs uppercase tracking-wider truncate">
                    {title}
                  </p>
                  <span className="text-slate-600 text-xs ml-2 shrink-0">
                    {group.concepts.length}
                  </span>
                </div>
                <div className="px-3 space-y-0.5">
                  {group.concepts.map(e => (
                    <ConceptRow
                      key={e.concept}
                      entry={e}
                      isSelected={selected?.concept === e.concept &&
                                  selected?.material_id === e.material_id}
                      onClick={() => setSelected(e)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — concept detail */}
        <div className="flex-1 overflow-y-auto">
          {selected ? (
            <ConceptDetail
              entry={selected}
              onStudy={() => navigate(`/study/${selected.material_id}`)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-slate-500 text-sm">Select a concept</p>
                <p className="text-slate-600 text-xs mt-1">
                  {entries.length > 0
                    ? 'Click any concept from the sidebar'
                    : 'Complete quizzes to populate your wiki'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}

function ConceptRow({ entry: e, isSelected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg
                  text-left transition-colors
                  ${isSelected
                    ? 'bg-violet-600/15 text-violet-300'
                    : 'text-slate-400 hover:bg-[#1a1a24] hover:text-white'}`}>
      <span className="text-xs truncate mr-2">{e.concept}</span>
      <MasteryDot score={e.irt_score} />
    </button>
  )
}

function MasteryDot({ score }) {
  const color = score >= 0.8 ? 'bg-emerald-400'
    : score >= 0.5 ? 'bg-yellow-400'
    : 'bg-red-400'
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />
}

function ConceptDetail({ entry: e, onStudy }) {
  const scorePercent = Math.round(e.irt_score * 100)
  const lastTested = new Date(e.last_updated).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric'
  })

  const strength = e.irt_score >= 0.8 ? 'Strong' : e.irt_score >= 0.5 ? 'Developing' : 'Needs work'
  const strengthColor = e.irt_score >= 0.8 ? 'text-emerald-400'
    : e.irt_score >= 0.5 ? 'text-yellow-400'
    : 'text-red-400'

  return (
    <div className="max-w-2xl mx-auto px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-white font-semibold text-xl">{e.concept}</h1>
          <span className={`text-sm font-medium shrink-0 ml-4 ${strengthColor}`}>
            {strength}
          </span>
        </div>
        <p className="text-slate-500 text-sm">{e.material_title}</p>
      </div>

      {/* Mastery bar */}
      <div className="bg-[#1a1a24] border border-[#2e2e3a] rounded-xl p-5 mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-slate-400 text-sm font-medium">Mastery</span>
          <span className="text-white font-bold">{scorePercent}%</span>
        </div>
        <div className="h-2 bg-[#0f0f13] rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all
              ${e.irt_score >= 0.8 ? 'bg-emerald-500'
                : e.irt_score >= 0.5 ? 'bg-yellow-500'
                : 'bg-red-500'}`}
            style={{ width: `${scorePercent}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{e.attempts} {e.attempts === 1 ? 'attempt' : 'attempts'}</span>
          <span>Last tested {lastTested}</span>
        </div>
      </div>

      {/* Status card */}
      <div className={`rounded-xl p-4 mb-5 border text-sm
        ${e.irt_score >= 0.8
          ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
          : e.irt_score >= 0.5
          ? 'bg-yellow-500/5 border-yellow-500/20 text-yellow-300'
          : 'bg-red-500/5 border-red-500/20 text-red-300'}`}>
        {e.irt_score >= 0.8 && (
          <>
            <p className="font-medium mb-1">You know this well</p>
            <p className="text-xs opacity-75">
              Consider moving on to harder related concepts,
              or revisit occasionally to keep it fresh.
            </p>
          </>
        )}
        {e.irt_score >= 0.5 && e.irt_score < 0.8 && (
          <>
            <p className="font-medium mb-1">You're getting there</p>
            <p className="text-xs opacity-75">
              You have a foundation but there are gaps.
              Take another quiz to strengthen your understanding.
            </p>
          </>
        )}
        {e.irt_score < 0.5 && (
          <>
            <p className="font-medium mb-1">This needs more attention</p>
            <p className="text-xs opacity-75">
              Focus on this concept in your next session.
              Try generating a lesson specifically on this topic.
            </p>
          </>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button onClick={onStudy}
          className="flex-1 bg-violet-600 hover:bg-violet-500 text-white
                     font-medium py-2.5 rounded-lg transition-colors text-sm">
          Study this material →
        </button>
      </div>

      {/* V1 note */}
      <div className="mt-8 pt-6 border-t border-[#1e1e2a]">
        <p className="text-slate-600 text-xs">
          Full wiki entries with definitions, examples, and notes are coming in V1.
          For now, your mastery data is tracked here after each quiz.
        </p>
      </div>
    </div>
  )
}