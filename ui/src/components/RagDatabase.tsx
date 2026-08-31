// ════════════════════════════════════════════════════════════════
// RagDatabase — Hybrid Semantic Search Panel
//
// Wires to GET :8080/api/v1/search for real Qdrant RRF results.
// Falls back to demo results transparently.
// ════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect } from 'react'
import { useRagSearch } from '../hooks/useRagSearch'
import { formatUtcHMS } from '../lib/demo'

const SUGGESTED_QUERIES = [
  'carrier strike group Mediterranean',
  'OPEC production cut market reaction',
  'energy minister summit cancelled',
  'satellite maritime surveillance',
  'airspace incursion eastern Europe',
]

export default function RagDatabase() {
  const [query, setQuery]         = useState('')
  const [autoRun, setAutoRun]     = useState(false)
  const { results, isSearching, isDemo, error, lastQuery, totalFound, search, clearResults } = useRagSearch()
  const autoRunTimerRef           = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)

  // Auto-run mode: run query every 8 seconds
  useEffect(() => {
    if (autoRun && query.trim()) {
      search(query)
      autoRunTimerRef.current = setInterval(() => search(query), 8000)
    } else {
      if (autoRunTimerRef.current) clearInterval(autoRunTimerRef.current)
    }
    return () => { if (autoRunTimerRef.current) clearInterval(autoRunTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, query])

  const handleSearch = () => {
    if (query.trim()) search(query)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleSuggestion = (q: string) => {
    setQuery(q)
    search(q)
  }

  return (
    <section
      id="rag-database"
      className="flex flex-col border border-si-border-c panel-glow bg-si-panel overflow-hidden"
      style={{ gridColumn: '4 / 10', gridRow: '3 / 4' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-si-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-si-cyan text-2xs font-bold tracking-widest font-display">
            RAG SEMANTIC INTELLIGENCE
          </span>
          {isDemo && (
            <span className="text-si-amber text-2xs opacity-70">[DEMO]</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-si-muted text-2xs">QDRANT / RRF k=60</span>
          <span className={`w-1.5 h-1.5 rounded-full ${isDemo ? 'bg-si-amber' : 'bg-si-green pulse-dot'}`} />
        </div>
      </div>

      {/* Search input */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-si-border shrink-0 bg-si-panel-2/40">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64788C" strokeWidth="2" className="shrink-0">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          id="rag-search-input"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Query semantic intelligence database…"
          className="flex-1 bg-transparent text-si-text text-2xs font-mono outline-none placeholder:text-si-muted/50"
        />
        <button
          onClick={() => { clearResults(); setQuery('') }}
          className="text-si-muted text-2xs hover:text-si-text transition-colors"
          title="Clear"
        >
          ✕
        </button>
        <button
          id="rag-auto-run"
          onClick={() => setAutoRun(r => !r)}
          className={`px-2 py-0.5 text-2xs font-mono border rounded-sm transition-colors ${
            autoRun
              ? 'border-si-cyan/60 bg-si-cyan/10 text-si-cyan'
              : 'border-si-border text-si-muted hover:border-si-border-c hover:text-si-text'
          }`}
        >
          {autoRun ? '⏸ AUTO-RUN' : '▶ AUTO-RUN'}
        </button>
        <button
          id="rag-search-btn"
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
          className="px-2 py-0.5 text-2xs font-mono border border-si-cyan/50 bg-si-cyan/10 text-si-cyan rounded-sm hover:bg-si-cyan/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {isSearching ? '…' : 'SEARCH'}
        </button>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {results.length === 0 && !isSearching ? (
          <div className="p-3">
            <p className="text-si-muted text-2xs mb-2 tracking-widest">SUGGESTED QUERIES</p>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_QUERIES.map(q => (
                <button
                  key={q}
                  onClick={() => handleSuggestion(q)}
                  className="px-2 py-0.5 text-2xs font-mono border border-si-border text-si-muted hover:border-si-border-c hover:text-si-text rounded-sm transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : isSearching ? (
          <div className="flex items-center justify-center h-full gap-2 text-si-muted text-2xs">
            <div className="w-1.5 h-1.5 rounded-full bg-si-cyan animate-pulse" />
            <div className="w-1.5 h-1.5 rounded-full bg-si-cyan animate-pulse [animation-delay:0.2s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-si-cyan animate-pulse [animation-delay:0.4s]" />
            <span className="ml-1">SEARCHING QDRANT…</span>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {/* Results header */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-si-muted text-2xs tracking-widest">
                {totalFound} RESULT{totalFound !== 1 ? 'S' : ''} FOR: <span className="text-si-cyan">"{lastQuery}"</span>
              </p>
              {error && <span className="text-si-red text-2xs">{error}</span>}
            </div>
            {results.map((r, i) => (
              <RagResultCard key={r.event_id} result={r} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

interface RagResult {
  event_id:     string
  stream_id:    string
  channel_name: string
  event_type:   string
  text:         string
  timestamp:    number
  confidence:   number
  score:        number
}

function RagResultCard({ result, rank }: { result: RagResult; rank: number }) {
  const relevancePct = Math.round(result.score * 100)
  const confPct      = Math.round(result.confidence * 100)

  return (
    <div className="border border-si-border bg-si-panel-2/60 rounded-sm p-2 hover:border-si-border-c transition-colors">
      {/* Card header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-si-muted text-2xs font-mono shrink-0">#{rank}</span>
          <span className="text-si-text text-2xs font-mono truncate font-semibold">{result.channel_name}</span>
          <span className="text-si-muted/60 text-2xs">·</span>
          <span className="text-si-muted text-2xs font-mono">{formatUtcHMS(result.timestamp)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Relevance score */}
          <div className="flex items-center gap-1">
            <div className="relative h-1 w-12 bg-si-border rounded-full overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-si-cyan"
                style={{ width: `${relevancePct}%` }}
              />
            </div>
            <span className="text-si-cyan text-2xs font-mono">{relevancePct}%</span>
          </div>
          {/* Event type badge */}
          <span className="text-2xs font-mono text-si-muted border border-si-border px-1 rounded-sm">
            {result.event_type === 'transcript_update' ? 'TX' : 'VX'}
          </span>
        </div>
      </div>

      {/* Text snippet */}
      <p className="text-si-text/80 text-2xs font-mono leading-relaxed line-clamp-2">
        {result.text.length > 200 ? result.text.slice(0, 197) + '…' : result.text}
      </p>

      {/* Footer metadata */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-si-muted/60 text-2xs font-mono">{result.stream_id}</span>
        <span className="text-si-muted text-2xs font-mono">CONF {confPct}%</span>
      </div>
    </div>
  )
}
