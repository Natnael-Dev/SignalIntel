// ════════════════════════════════════════════════════════════════
// TopBar — Mission Control Header
// ════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react'
import type { ConnectionStatus } from '../types/intel'

interface TopBarProps {
  status:      ConnectionStatus
  latencyMs:   number | null
  alertCount:  number   // P1 alert count for notification badge
  feedCount:   number   // active streams count
  totalFeeds:  number   // total configured streams
  ingestRate:  string   // e.g. "46.8 Mb/s" (computed by parent)
}

function useUtcClock(): string {
  const [time, setTime] = useState(() => new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC')
  useEffect(() => {
    const t = setInterval(() => {
      setTime(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC')
    }, 1000)
    return () => clearInterval(t)
  }, [])
  return time
}

const OPERATOR = import.meta.env.VITE_OPERATOR ?? 'J.WARREN'

export default function TopBar({
  status,
  latencyMs,
  alertCount,
  feedCount,
  totalFeeds,
  ingestRate,
}: TopBarProps) {
  const clock = useUtcClock()

  const isOnline = status === 'online'
  const isDemo   = status === 'demo'

  const statusColor  = isOnline ? 'text-si-green' : isDemo ? 'text-si-amber' : 'text-si-muted'
  const statusLabel  = isOnline ? 'SYSTEM ONLINE' : isDemo ? 'DEMO MODE' : 'RECONNECTING...'
  const dotColor     = isOnline ? 'bg-si-green pulse-dot' : isDemo ? 'bg-si-amber' : 'bg-si-muted'

  return (
    <header
      id="topbar"
      className="flex items-center h-10 px-4 border-b border-si-border bg-si-panel shrink-0"
      style={{ boxShadow: '0 1px 0 #16222E' }}
    >
      {/* ── Wordmark ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 mr-6 shrink-0">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
          <polygon points="10,1 19,6 19,14 10,19 1,14 1,6" stroke="#29D3E8" strokeWidth="1.2" fill="none"/>
          <circle cx="10" cy="10" r="3" fill="#29D3E8" opacity="0.8"/>
          <line x1="10" y1="1" x2="10" y2="19" stroke="#29D3E8" strokeWidth="0.6" opacity="0.4"/>
          <line x1="1"  y1="6" x2="19" y2="14" stroke="#29D3E8" strokeWidth="0.6" opacity="0.4"/>
          <line x1="1"  y1="14" x2="19" y2="6"  stroke="#29D3E8" strokeWidth="0.6" opacity="0.4"/>
        </svg>
        <span
          className="font-display text-si-cyan tracking-[0.25em] font-bold text-base select-none"
          style={{ letterSpacing: '0.25em' }}
        >
          SIGNAL<span className="text-si-text">INTEL</span>
        </span>
      </div>

      {/* ── Status indicator ─────────────────────────────── */}
      <div className={`flex items-center gap-1.5 mr-6 shrink-0 ${statusColor}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="text-2xs font-semibold tracking-wider">{statusLabel}</span>
      </div>

      {/* ── Metrics strip ────────────────────────────────── */}
      <div className="flex items-center gap-5 text-2xs text-si-muted font-mono flex-1 min-w-0">
        <MetricPill label="FEEDS" value={`${feedCount}/${totalFeeds}`} valueClass="text-si-text" />
        <MetricPill
          label="LATENCY"
          value={latencyMs != null ? `${latencyMs}ms` : '--'}
          valueClass={
            latencyMs == null ? 'text-si-muted'
            : latencyMs < 80  ? 'text-si-green'
            : latencyMs < 200 ? 'text-si-amber'
            : 'text-si-red'
          }
        />
        <MetricPill label="INGEST RATE" value={ingestRate} valueClass="text-si-text" />
        {isDemo && (
          <span className="px-1.5 py-0.5 border border-si-amber/40 bg-si-amber/10 text-si-amber text-2xs tracking-wider rounded-sm">
            ⚠ DEMO DATA
          </span>
        )}
      </div>

      {/* ── Spacer ───────────────────────────────────────── */}
      <div className="flex-1" />

      {/* ── Timestamp + operator + bell ──────────────────── */}
      <div className="flex items-center gap-4 shrink-0 text-2xs font-mono">
        <span className="text-si-muted tracking-wider">{clock}</span>

        <div className="flex items-center gap-1 text-si-muted">
          <span className="text-si-dim">OPR:</span>
          <span className="text-si-text font-semibold">{OPERATOR}</span>
        </div>

        {/* Notification bell */}
        <button
          id="topbar-bell"
          className="relative flex items-center justify-center w-7 h-7 rounded border border-si-border hover:border-si-border-c transition-colors"
          aria-label={`${alertCount} P1 alerts`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64788C" strokeWidth="1.8" strokeLinecap="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {alertCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-si-red text-white text-2xs flex items-center justify-center font-bold">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>
      </div>
    </header>
  )
}

function MetricPill({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-si-dim tracking-widest">{label}:</span>
      <span className={`font-semibold tracking-wide ${valueClass}`}>{value}</span>
    </div>
  )
}
