// ════════════════════════════════════════════════════════════════
// EntityTracker — Client-side NER from Live Transcripts
//
// Runs lightweight regex-based Named Entity Recognition over the
// last N transcripts to extract LOC/ORG/VESSEL/PER/MIL entities.
// ════════════════════════════════════════════════════════════════

import { useMemo } from 'react'
import type { TranscriptEvent } from '../types/intel'
import { ENTITY_PATTERNS, DEMO_WATCHLIST_KEYWORDS } from '../lib/demo'

interface EntityTrackerProps {
  transcripts: TranscriptEvent[]
}

type EntityTag = 'LOC' | 'ORG' | 'VESSEL' | 'PER' | 'MIL'

interface ExtractedEntity {
  text:  string
  tag:   EntityTag
  count: number
}

const TAG_STYLES: Record<EntityTag, string> = {
  LOC:    'entity-loc',
  ORG:    'entity-org',
  VESSEL: 'entity-vessel',
  PER:    'entity-per',
  MIL:    'entity-mil',
}

const TAG_BORDER_BARS: Record<EntityTag, string> = {
  LOC:    'bg-si-cyan',
  ORG:    'bg-si-amber',
  VESSEL: 'bg-si-green',
  PER:    'bg-purple-400',
  MIL:    'bg-si-red',
}

/** Run all patterns over a corpus and aggregate entity counts. */
function extractEntities(texts: string[]): ExtractedEntity[] {
  const corpus   = texts.join(' ')
  const entities = new Map<string, ExtractedEntity>()

  for (const { regex, tag } of ENTITY_PATTERNS) {
    // Reset lastIndex (global regex reuse)
    regex.lastIndex = 0
    const matches = corpus.match(regex) ?? []
    for (const match of matches) {
      const key = match.trim().toLowerCase()
      if (entities.has(key)) {
        entities.get(key)!.count++
      } else {
        entities.set(key, {
          text:  match.trim(),
          tag:   tag as EntityTag,
          count: 1,
        })
      }
    }
  }

  return Array.from(entities.values())
    .filter(e => e.text.length > 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 14)
}

export default function EntityTracker({ transcripts }: EntityTrackerProps) {
  const texts = useMemo(
    () => transcripts.slice(-60).map(t =>
      [t.segment.original_text, t.segment.translated_text].filter(Boolean).join(' ')
    ),
    [transcripts]
  )

  const entities = useMemo(() => extractEntities(texts), [texts])

  const maxCount = Math.max(1, ...entities.map(e => e.count))

  return (
    <section
      id="entity-tracker"
      className="flex flex-col border border-si-border bg-si-panel overflow-hidden"
      style={{ gridColumn: '1 / 4', gridRow: '3 / 4' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-si-border shrink-0">
        <span className="text-si-cyan text-2xs font-bold tracking-widest font-display">
          ENTITY TRACKER
        </span>
        <span className="text-si-muted text-2xs">{entities.length} ENTITIES</span>
      </div>

      {/* Entity list */}
      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-1">
        {entities.length === 0 ? (
          <div className="flex items-center justify-center h-full text-si-muted text-2xs">
            AWAITING DATA…
          </div>
        ) : (
          <div className="space-y-1">
            {entities.map((e, i) => {
              const pct   = Math.round((e.count / maxCount) * 100)
              const style = TAG_STYLES[e.tag]
              const bar   = TAG_BORDER_BARS[e.tag]
              return (
                <div key={`${e.text}-${i}`} className="flex items-center gap-2">
                  {/* Tag chip */}
                  <span className={`shrink-0 px-1 py-px text-2xs font-mono font-bold border rounded-sm ${style}`}
                        style={{ minWidth: '48px', textAlign: 'center' }}>
                    {e.tag}
                  </span>

                  {/* Entity name */}
                  <span className="flex-1 text-si-text text-2xs font-mono truncate" title={e.text}>
                    {e.text.length > 22 ? e.text.slice(0, 20) + '…' : e.text}
                  </span>

                  {/* Count bar */}
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="relative h-1.5 w-16 bg-si-border rounded-full overflow-hidden">
                      <div
                        className={`absolute left-0 top-0 h-full rounded-full ${bar}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-si-muted text-2xs w-4 text-right">{e.count}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Watchlist keywords */}
      <div className="shrink-0 border-t border-si-border px-3 py-1.5 bg-si-panel-2/50">
        <p className="text-2xs text-si-muted tracking-widest mb-1 font-mono">WATCHLIST KEYWORDS</p>
        <div className="flex flex-wrap gap-1">
          {DEMO_WATCHLIST_KEYWORDS.map(kw => (
            <span
              key={kw}
              className="px-1.5 py-px text-2xs font-mono border border-si-border text-si-muted hover:border-si-border-c hover:text-si-text rounded-sm transition-colors cursor-default"
            >
              {kw}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
