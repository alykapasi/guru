// src/pages/LibraryPage.jsx

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import AppLayout from '../components/AppLayout'
import { api } from '../api/client'

export default function LibraryPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const fileRef = useRef()
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const { data: materials = [], isLoading } = useQuery({
  queryKey: ['materials'],
  queryFn: api.materials.list,
  refetchInterval: 5000,
})

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploadError('')
    setUploading(true)
    try {
      await api.materials.upload(file)
      qc.invalidateQueries({ queryKey: ['materials'] })
    } catch (err) {
      setUploadError('Upload failed. Try again.')
    } finally {
      setUploading(false)
      fileRef.current.value = ''
    }
  }

  const filtered = materials.filter(m => {
    if (filter !== 'all' && m.file_type !== filter) return false
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const fileTypes = [...new Set(materials.map(m => m.file_type))].filter(Boolean)

  return (
    <AppLayout>
      <div className="flex h-screen overflow-hidden">
        {/* Main list */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-8 py-6 border-b border-[#1e1e2a] flex items-center justify-between">
            <div>
              <h1 className="text-white font-semibold text-lg">Library</h1>
              <p className="text-slate-500 text-sm mt-0.5">
                {materials.length} {materials.length === 1 ? 'material' : 'materials'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {uploadError && (
                <p className="text-red-400 text-xs">{uploadError}</p>
              )}
              <button
                onClick={() => fileRef.current.click()}
                disabled={uploading}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500
                           disabled:opacity-50 text-white text-sm px-4 py-2
                           rounded-lg transition-colors font-medium">
                {uploading ? (
                  <>
                    <span className="w-3 h-3 border border-white/30 border-t-white
                                     rounded-full animate-spin"></span>
                    Uploading...
                  </>
                ) : (
                  <>+ Upload</>
                )}
              </button>
              <input
                ref={fileRef} type="file"
                accept=".pdf,.docx,.pptx"
                onChange={handleUpload}
                className="hidden" />
            </div>
          </div>

          {/* Filters + search */}
          <div className="px-8 py-3 border-b border-[#1e1e2a] flex items-center gap-3">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search materials..."
              className="bg-[#1a1a24] border border-[#2e2e3a] rounded-lg px-3 py-1.5
                         text-white placeholder-slate-500 text-sm focus:outline-none
                         focus:border-violet-500 w-48" />
            <div className="flex gap-1">
              {['all', ...fileTypes].map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors uppercase
                    ${filter === f
                      ? 'bg-violet-600/20 text-violet-300'
                      : 'text-slate-500 hover:text-white'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-8 py-4">
            {isLoading && (
              <div className="flex items-center justify-center h-32">
                <span className="text-slate-500 text-sm">Loading...</span>
              </div>
            )}

            {!isLoading && materials.length === 0 && (
              <EmptyState onUpload={() => fileRef.current.click()} />
            )}

            {!isLoading && materials.length > 0 && filtered.length === 0 && (
              <p className="text-slate-500 text-sm text-center mt-8">
                No materials match your search
              </p>
            )}

            <div className="space-y-2">
              {filtered.map(m => (
                <MaterialRow
                  key={m.id}
                  material={m}
                  isSelected={selected?.id === m.id}
                  onClick={() => setSelected(s => s?.id === m.id ? null : m)}
                  onStudy={() => navigate(`/study/${m.id}`)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Detail drawer */}
        {selected && (
          <MaterialDetail
            material={selected}
            onClose={() => setSelected(null)}
            onStudy={() => navigate(`/study/${selected.id}`)}
          />
        )}
      </div>
    </AppLayout>
  )
}

function MaterialRow({ material: m, isSelected, onClick, onStudy }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between px-4 py-3.5 rounded-xl
                  border cursor-pointer transition-all
                  ${isSelected
                    ? 'bg-violet-600/10 border-violet-500/30'
                    : 'bg-[#1a1a24] border-[#2e2e3a] hover:border-[#3e3e4a]'}`}>
      <div className="flex items-center gap-3 min-w-0">
        <FileIcon type={m.file_type} />
        <div className="min-w-0">
          <p className="text-white text-sm font-medium truncate">{m.title}</p>
          <p className="text-slate-500 text-xs mt-0.5">{m.filename}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 ml-4 shrink-0">
        {m.concepts?.length > 0 && (
          <span className="text-slate-500 text-xs">
            {m.concepts.length} concepts
          </span>
        )}
        <StatusBadge status={m.status} />
        {m.status === 'ready' && (
          <button
            onClick={e => { e.stopPropagation(); onStudy() }}
            className="bg-violet-600 hover:bg-violet-500 text-white text-xs
                       px-3 py-1.5 rounded-lg transition-colors font-medium">
            Study
          </button>
        )}
      </div>
    </div>
  )
}

function MaterialDetail({ material: m, onClose, onStudy }) {
  return (
    <div className="w-80 border-l border-[#1e1e2a] flex flex-col overflow-hidden">
      <div className="px-5 py-4 border-b border-[#1e1e2a] flex items-center justify-between">
        <h2 className="text-white font-medium text-sm truncate">{m.title}</h2>
        <button onClick={onClose}
          className="text-slate-500 hover:text-white text-lg leading-none transition-colors">
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Meta */}
        <div className="space-y-2">
          <Row label="File" value={m.filename} />
          <Row label="Type" value={m.file_type?.toUpperCase()} />
          <Row label="Status" value={<StatusBadge status={m.status} />} />
          <Row label="Uploaded" value={new Date(m.created_at).toLocaleDateString()} />
        </div>

        {/* Concepts */}
        {m.concepts?.length > 0 && (
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wider mb-2">
              Concepts ({m.concepts.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {m.concepts.map(c => (
                <span key={c}
                  className="bg-[#0f0f13] border border-[#2e2e3a] text-slate-400
                             text-xs px-2 py-1 rounded-md">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Ingesting state */}
        {(m.status === 'pending' || m.status === 'ingesting') && (
          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
              <p className="text-yellow-300 text-xs font-medium">Processing</p>
            </div>
            <p className="text-slate-500 text-xs">
              Parsing, chunking and indexing your material. This takes 1–2 minutes.
            </p>
          </div>
        )}

        {m.status === 'error' && (
          <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
            <p className="text-red-300 text-xs font-medium mb-1">Processing failed</p>
            <p className="text-slate-500 text-xs">
              Try uploading the file again.
            </p>
          </div>
        )}
      </div>

      {m.status === 'ready' && (
        <div className="px-5 py-4 border-t border-[#1e1e2a]">
          <button onClick={onStudy}
            className="w-full bg-violet-600 hover:bg-violet-500 text-white
                       font-medium py-2.5 rounded-lg transition-colors text-sm">
            Start studying
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 text-xs">{label}</span>
      <span className="text-slate-300 text-xs">{value}</span>
    </div>
  )
}

function FileIcon({ type }) {
  const colors = { pdf: 'text-red-400', docx: 'text-blue-400', pptx: 'text-orange-400' }
  const labels = { pdf: 'PDF', docx: 'DOC', pptx: 'PPT' }
  return (
    <div className={`w-8 h-8 rounded-lg bg-[#0f0f13] border border-[#2e2e3a]
                     flex items-center justify-center shrink-0 ${colors[type] ?? 'text-slate-400'}`}>
      <span className="text-xs font-bold">{labels[type] ?? '?'}</span>
    </div>
  )
}

function StatusBadge({ status }) {
  const styles = {
    ready:     'bg-emerald-500/10 text-emerald-400',
    ingesting: 'bg-yellow-500/10 text-yellow-400',
    pending:   'bg-slate-500/10 text-slate-400',
    error:     'bg-red-500/10 text-red-400',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  )
}

function EmptyState({ onUpload }) {
  return (
    <div
      onClick={onUpload}
      className="border-2 border-dashed border-[#2e2e3a] hover:border-violet-500/50
                 rounded-2xl p-16 text-center cursor-pointer transition-colors group mt-4">
      <div className="w-12 h-12 rounded-xl bg-[#1a1a24] border border-[#2e2e3a]
                      flex items-center justify-center mx-auto mb-4
                      group-hover:border-violet-500/30 transition-colors">
        <span className="text-2xl">📚</span>
      </div>
      <p className="text-white font-medium text-sm mb-1">Upload your first material</p>
      <p className="text-slate-500 text-sm">PDF, DOCX, or PPTX</p>
    </div>
  )
}