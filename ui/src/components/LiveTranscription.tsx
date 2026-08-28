// ════════════════════════════════════════════════════════════════
// LiveTranscription — Real-time Transcript Feed Panel
// ════════════════════════════════════════════════════════════════

import { useRef, useEffect, useState } from 'react'
import type { TranscriptEvent, VisionEvent } from '../types/intel'
import { formatUtcHMS } from '../lib/demo'

interface LiveTranscriptionProps {
  transcripts:  TranscriptEvent[]
  visionEvents: VisionEvent[]
  latestTicker: string | null
  activeChannel: string
}

const CHANNELS = ['CNN INTERNATIONAL', 'BBC WORLD NEWS', 'AL JAZEERA EN', 'ALL']

function TranscriptRow({ ev, isNew }: { ev: TranscriptEvent; isNew: boolean }) {
  const { segment } = ev
  const hasTranslation =
    segment.translated_text &&
    segment.translated_text !== segment.original_text &&
    segment.original_language !== 'en'

  const timeStr   = formatUtcHMS(ev.timestamp)
  const confPct   = Math.round((segment.confidence ?? 0.9) * 100)
  const confColor =
    confPct >= 90 ? 'text-si-green' :
    confPct >= 70 ? 'text-si-amber' : 'text-si-red'

  return (
    <div className={`group px-3 py-1.5 border-b border-si-border/50 hover:bg-si-panel-2/60 transition-colors ${isNew ? 'fade-in-up' : ''}`}>
      {/* Time + channel + confidence */}
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-si-cyan/70 text-2xs font-mono shrink-0">{timeStr}</span>
        <span className="text-si-muted/60 text-2xs font-mono truncate">{ev.channel_name}</span>
        <span className={`ml-auto text-2xs font-mono shrink-0 ${confColor}`}>{confPct}%</span>
      </div>

      {/* Original text */}
      <p className="text-si-text text-2xs font-mono leading-relaxed">
        {segment.original_text}
      </p>

      {/* Translation (if applicable) */}
      {hasTranslation && (
        <p className="text-si-green/80 text-2xs font-mono leading-relaxed mt-0.5">
          ↪ {segment.translated_text}
        </p>
      )}
    </div>
  )
}

export default function LiveTranscription({
  transcripts,
  visionEvents,
  latestTicker,
  activeChannel,
}: LiveTranscriptionProps) {
  const [selectedChannel, setSelectedChannel] = useState<string>('ALL')
  const [autoScroll, setAutoScroll] = useState(true)
  const listRef    = useRef<HTMLDivElement>(null)
  const prevLenRef = useRef(0)

  // Auto-scroll on new items
  useEffect(() => {
    if (!autoScroll || !listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [transcripts.length, autoScroll])

  // Detect manual scroll up → disable auto-scroll
  const handleScroll = () => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    setAutoScroll(atBottom)
  }

  const filtered = selectedChannel === 'ALL'
    ? transcripts
    : transcripts.filter(t => t.channel_name === selectedChannel)

  const newCount = filtered.length - prevLenRef.current
  useEffect(() => { prevLenRef.current = filtered.length }, [filtered.length])

  // Latest OCR ticker from vision events
  const tickerText = latestTicker ?? visionEvents
    .slice()
    .reverse()
    .find(v => v.ticker_text)?.ticker_text ?? null

  return (
    <section
      id="live-transcription"
      className="flex flex-col border border-si-border-c panel-glow bg-si-panel overflow-hidden"
      style={{ gridColumn: '6 / 13', gridRow: '1 / 2' }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-si-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-si-cyan text-2xs font-bold tracking-widest font-display">
            LIVE TRANSCRIPTION
          </span>
          <span className="text-si-muted/60 text-2xs">—</span>
          <span className="text-si-muted text-2xs">{activeChannel}</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Channel filter pills */}
          {CHANNELS.map(ch => (
            <button
              key={ch}
              onClick={() => setSelectedChannel(ch)}
              className={`px-1.5 py-0.5 text-2xs font-mono rounded-sm border transition-colors ${
                selectedChannel === ch
                  ? 'border-si-cyan/50 bg-si-cyan/10 text-si-cyan'
                  : 'border-si-border text-si-muted hover:border-si-border-c hover:text-si-text'
              }`}
            >
              {ch === 'ALL' ? 'ALL' : ch.split(' ')[0]}
            </button>
          ))}
          {/* Auto-scroll indicator */}
          {!autoScroll && (
            <button
              onClick={() => { setAutoScroll(true); listRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }) }}
              className="px-1.5 py-0.5 text-2xs text-si-amber border border-si-amber/40 rounded-sm hover:bg-si-amber/10"
            >
              ↓ LIVE
            </button>
          )}
        </div>
      </div>

      {/* Transcript list */}
      <div
        ref={listRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto min-h-0"
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-si-muted text-2xs">
            AWAITING FEED…
          </div>
        ) : (
          filtered.map((ev, i) => (
            <TranscriptRow
              key={ev._key ?? ev.event_id}
              ev={ev}
              isNew={i >= filtered.length - newCount}
            />
          ))
        )}
      </div>

      {/* OCR ticker strip */}
      <div className="shrink-0 border-t border-si-border bg-si-panel-2/80 px-3 py-1 flex items-center gap-2 overflow-hidden">
        <span className="text-2xs text-si-cyan/70 font-mono shrink-0 tracking-widest">OCR TICKER:</span>
        {tickerText ? (
          <div className="overflow-hidden flex-1">
            <div className="ticker-track text-si-amber text-2xs font-mono">
              {/* Duplicated for seamless loop */}
              <span className="mr-12">{tickerText}</span>
              <span className="mr-12">{tickerText}</span>
            </div>
          </div>
        ) : (
          <span className="text-si-muted text-2xs font-mono">NO TICKER DETECTED</span>
        )}
      </div>
    </section>
  )
}
