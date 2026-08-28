// ════════════════════════════════════════════════════════════════
// BroadcastMonitors — 2×2 Video Feed Grid
// ════════════════════════════════════════════════════════════════

import { useMemo } from 'react'
import type { TranscriptEvent, VisionEvent } from '../types/intel'
import { DEMO_STREAMS } from '../lib/demo'
import { formatUtcHMS } from '../lib/demo'

interface BroadcastMonitorsProps {
  transcripts:  TranscriptEvent[]
  visionEvents: VisionEvent[]
}

interface TileData {
  streamId:    string
  channelName: string
  isLive:      boolean
  lastTranscript?: TranscriptEvent
  lastVision?:     VisionEvent
}

// Gradient backgrounds simulating video feeds per channel
const CHANNEL_GRADIENTS: Record<string, string> = {
  'CNN INTERNATIONAL': 'linear-gradient(135deg, #0D1A2A 0%, #0A1520 40%, #071018 100%)',
  'BBC WORLD NEWS':    'linear-gradient(135deg, #0A1218 0%, #0D1C24 40%, #081018 100%)',
  'AL JAZEERA EN':     'linear-gradient(135deg, #0D180D 0%, #081208 40%, #0A150A 100%)',
  'RT ARABIC':         'linear-gradient(135deg, #1A0808 0%, #120505 40%, #0E0404 100%)',
}

// Scene type → description for overlay
const SCENE_LABELS: Record<string, string> = {
  studio_news:   'STUDIO BROADCAST',
  live_field:    'LIVE FIELD REPORT',
  breaking_news: 'BREAKING — LIVE',
  graphic:       'ANALYSIS GRAPHIC',
  program:       'PROGRAMMING',
  interview:     'LIVE INTERVIEW',
}

function AudioBars() {
  return (
    <div className="audio-bars" aria-hidden>
      <div className="audio-bar" style={{ height: '40%' }} />
      <div className="audio-bar" style={{ height: '60%' }} />
      <div className="audio-bar" style={{ height: '80%' }} />
      <div className="audio-bar" style={{ height: '50%' }} />
      <div className="audio-bar" style={{ height: '70%' }} />
    </div>
  )
}

function LiveTile({ tile }: { tile: TileData }) {
  const caption =
    tile.lastTranscript?.segment.translated_text ||
    tile.lastTranscript?.segment.original_text ||
    '...'

  const sceneLabel = tile.lastVision
    ? (SCENE_LABELS[tile.lastVision.scene_type] ?? tile.lastVision.scene_type.toUpperCase())
    : 'LIVE BROADCAST'

  const tsLabel = tile.lastTranscript
    ? formatUtcHMS(tile.lastTranscript.timestamp)
    : formatUtcHMS(Date.now() / 1000)

  const gradient = CHANNEL_GRADIENTS[tile.channelName] ?? CHANNEL_GRADIENTS['CNN INTERNATIONAL']

  return (
    <div
      className="relative flex flex-col scanline-overlay video-noise overflow-hidden"
      style={{ background: gradient, minHeight: 0 }}
    >
      {/* Simulated video texture / pseudo-feed */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            radial-gradient(ellipse 60% 40% at 50% 30%, rgba(41,211,232,0.04) 0%, transparent 70%),
            radial-gradient(ellipse 40% 60% at 70% 60%, rgba(41,211,232,0.02) 0%, transparent 80%)
          `,
        }}
      />

      {/* Top bar: channel + timestamp + LIVE badge */}
      <div className="relative z-20 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/70 to-transparent">
        <span className="text-si-text font-mono text-2xs font-semibold tracking-wider">
          {tile.channelName}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-si-muted text-2xs font-mono">{tsLabel}</span>
          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-si-red/90 rounded-sm text-white text-2xs font-bold tracking-widest">
            <span className="live-dot w-1 h-1 rounded-full bg-white" />
            LIVE
          </span>
        </div>
      </div>

      {/* Central content area — simulated video */}
      <div className="flex-1 relative z-10 flex items-center justify-center min-h-0">
        {/* Scene indicator */}
        <div className="absolute top-1 left-2 text-si-muted/60 text-2xs font-mono tracking-widest">
          {sceneLabel}
        </div>
        {/* Simulated figure / broadcast shape */}
        <div
          className="w-12 h-16 rounded-sm opacity-15"
          style={{
            background: 'linear-gradient(180deg, rgba(41,211,232,0.3) 0%, rgba(41,211,232,0.05) 100%)',
            filter: 'blur(3px)',
          }}
        />
      </div>

      {/* Bottom bar: caption + audio bars */}
      <div className="relative z-20 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1 pt-3">
        {/* Caption text */}
        <p className="text-si-text text-2xs font-mono leading-tight line-clamp-2 mb-1">
          {caption.length > 90 ? caption.slice(0, 87) + '…' : caption}
        </p>
        {/* Metadata row */}
        <div className="flex items-center justify-between">
          <span className="text-si-muted/60 text-2xs tracking-widest">
            {tile.streamId.toUpperCase()} ·{' '}
            {tile.lastTranscript?.segment.original_language?.toUpperCase() ?? 'EN'}
          </span>
          <AudioBars />
        </div>
      </div>
    </div>
  )
}

function SignalLostTile({ tile }: { tile: TileData }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #1A0607 0%, #0E0304 100%)',
        minHeight: 0,
      }}
    >
      {/* Scanline overlay */}
      <div className="scanline-overlay absolute inset-0" />

      {/* Warning triangle */}
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="mb-2 opacity-80" aria-hidden>
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              fill="rgba(255,59,71,0.15)" stroke="#FF3B47" strokeWidth="1.5"/>
        <line x1="12" y1="9" x2="12" y2="13" stroke="#FF3B47" strokeWidth="1.5" strokeLinecap="round"/>
        <line x1="12" y1="17" x2="12.01" y2="17" stroke="#FF3B47" strokeWidth="2" strokeLinecap="round"/>
      </svg>

      <p className="text-si-red font-mono text-xs font-bold tracking-widest text-center">
        SIGNAL LOST
      </p>
      <p className="text-si-red/60 font-mono text-2xs tracking-widest mt-0.5">
        RE-ACQUIRING…
      </p>

      {/* Channel label */}
      <div className="absolute top-2 left-2 text-si-red/50 text-2xs font-mono tracking-wider">
        {tile.channelName}
      </div>

      {/* Status metadata */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <span className="text-si-red/40 text-2xs font-mono">{tile.streamId.toUpperCase()}</span>
        <span className="text-si-red/40 text-2xs font-mono">NO SIGNAL</span>
      </div>
    </div>
  )
}

export default function BroadcastMonitors({ transcripts, visionEvents }: BroadcastMonitorsProps) {
  // Build per-channel latest event index
  const tileData: TileData[] = useMemo(() => {
    const latestTx: Record<string, TranscriptEvent> = {}
    const latestVi: Record<string, VisionEvent>     = {}

    for (const ev of transcripts) {
      latestTx[ev.channel_name] = ev
    }
    for (const ev of visionEvents) {
      latestVi[ev.channel_name] = ev
    }

    return DEMO_STREAMS.map(s => ({
      streamId:    s.stream_id,
      channelName: s.channel_name,
      isLive:      s.status === 'active',
      lastTranscript: latestTx[s.channel_name],
      lastVision:     latestVi[s.channel_name],
    }))
  }, [transcripts, visionEvents])

  return (
    <section
      id="broadcast-monitors"
      className="flex flex-col border border-si-border-c panel-glow bg-si-panel overflow-hidden"
      style={{ gridColumn: '1 / 6', gridRow: '1 / 3' }}
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-si-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-si-cyan text-2xs font-bold tracking-widest font-display">
            BROADCAST MONITORS
          </span>
          <span className="text-si-muted text-2xs">
            {tileData.filter(t => t.isLive).length}/{tileData.length} LIVE
          </span>
        </div>
        <div className="flex gap-1">
          {tileData.map(t => (
            <span
              key={t.streamId}
              className={`w-1.5 h-1.5 rounded-full ${t.isLive ? 'bg-si-green pulse-dot' : 'bg-si-red'}`}
              title={t.channelName}
            />
          ))}
        </div>
      </div>

      {/* 2×2 grid */}
      <div className="grid grid-cols-2 grid-rows-2 flex-1 min-h-0 gap-px bg-si-border">
        {tileData.map(tile =>
          tile.isLive ? (
            <LiveTile key={tile.streamId} tile={tile} />
          ) : (
            <SignalLostTile key={tile.streamId} tile={tile} />
          )
        )}
      </div>
    </section>
  )
}
