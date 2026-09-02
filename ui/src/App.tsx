// ════════════════════════════════════════════════════════════════
// App.tsx — SignalIntel Intelligence Console Root
//
// Composes all panels into the 12-column grid layout.
// Wires real-time hooks to panel props.
// ════════════════════════════════════════════════════════════════

import { useMemo, useRef } from 'react'
import { useSignalIntelWs } from './hooks/useSignalIntelWs'
import { useAlerts }        from './hooks/useAlerts'
import { useDiagnostics }   from './hooks/useDiagnostics'

import TopBar              from './components/TopBar'
import BroadcastMonitors   from './components/BroadcastMonitors'
import LiveTranscription   from './components/LiveTranscription'
import CriticalAlertQueue  from './components/CriticalAlertQueue'
import EntityTracker       from './components/EntityTracker'
import RagDatabase         from './components/RagDatabase'
import DiagnosticMetrics   from './components/DiagnosticMetrics'

// ── Simulated ingest rate based on transcript throughput ──────
function useIngestRate(transcriptCount: number): string {
  const prevCountRef = useRef(0)
  const prevRateRef  = useRef('0.0 Kb/s')
  const lastTsRef    = useRef(Date.now())

  const now   = Date.now()
  const delta = transcriptCount - prevCountRef.current
  const dtMs  = now - lastTsRef.current

  if (delta > 0 && dtMs > 500) {
    // Estimate 512 bytes per transcript segment on average
    const bytesPerSec = (delta * 512) / (dtMs / 1000)
    if (bytesPerSec > 1_048_576) {
      prevRateRef.current = `${(bytesPerSec / 1_048_576).toFixed(1)} Mb/s`
    } else {
      prevRateRef.current = `${(bytesPerSec / 1024).toFixed(1)} Kb/s`
    }
    prevCountRef.current = transcriptCount
    lastTsRef.current    = now
  }
  return prevRateRef.current
}

export default function App() {
  // ── Real-time WebSocket feed ──────────────────────────────
  const { transcripts, visionEvents, latestTicker, status, latencyMs, feedCounts } =
    useSignalIntelWs()

  // ── Alert history polling ─────────────────────────────────
  const { alerts, isDemo: isAlertsDemo, totalP1 } = useAlerts()

  // ── Backend health diagnostics ────────────────────────────
  const diag = useDiagnostics(status === 'online')

  // ── Derived values ─────────────────────────────────────────
  const ingestRate = useIngestRate(transcripts.length)

  const activeChannel = useMemo(() => {
    if (transcripts.length === 0) return 'NO ACTIVE FEED'
    return transcripts[transcripts.length - 1].channel_name
  }, [transcripts])

  const feedCount  = useMemo(() => Object.keys(feedCounts).length,  [feedCounts])
  const totalFeeds = 4  // configured streams

  return (
    <div
      id="app-root"
      className="flex flex-col bg-si-bg text-si-text font-mono"
      style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}
    >
      {/* ── Top Bar ─────────────────────────────────────────── */}
      <TopBar
        status={status}
        latencyMs={latencyMs}
        alertCount={totalP1}
        feedCount={feedCount}
        totalFeeds={totalFeeds}
        ingestRate={ingestRate}
      />

      {/* ── Main Grid ───────────────────────────────────────── */}
      <main
        id="main-grid"
        className="flex-1 min-h-0"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(12, 1fr)',
          gridTemplateRows: '1fr 1fr auto',
          gap: '4px',
          padding: '4px',
          overflow: 'hidden',
        }}
      >
        {/* ── Left: Broadcast Monitors (rows 1+2, cols 1-5) ── */}
        <BroadcastMonitors
          transcripts={transcripts}
          visionEvents={visionEvents}
        />

        {/* ── Right top: Live Transcription (row 1, cols 6-12) */}
        <LiveTranscription
          transcripts={transcripts}
          visionEvents={visionEvents}
          latestTicker={latestTicker}
          activeChannel={activeChannel}
        />

        {/* ── Right mid: Critical Alert Queue (row 2, cols 6-12) */}
        <CriticalAlertQueue
          alerts={alerts}
          isDemo={isAlertsDemo}
        />

        {/* ── Bottom left: Entity Tracker (row 3, cols 1-3) ── */}
        <EntityTracker transcripts={transcripts} />

        {/* ── Bottom center: RAG Database (row 3, cols 4-9) ── */}
        <RagDatabase />

        {/* ── Bottom right: Diagnostics (row 3, cols 10-12) ── */}
        <DiagnosticMetrics diag={diag} />
      </main>

      {/* ── Scan-line ambient overlay (full screen) ──────────── */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            'repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.015) 2px, rgba(0,0,0,0.015) 3px)',
          zIndex: 9999,
        }}
        aria-hidden
      />
    </div>
  )
}
