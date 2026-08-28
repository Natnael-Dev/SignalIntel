// ════════════════════════════════════════════════════════════════
// CriticalAlertQueue — Prioritized Alert History Table
// ════════════════════════════════════════════════════════════════

import { useState } from 'react'
import type { AlertEntry, AlertPriority } from '../types/intel'
import { formatUtcHMS } from '../lib/demo'

interface CriticalAlertQueueProps {
  alerts: AlertEntry[]
  isDemo: boolean
}

type FilterMode = 'ALL' | AlertPriority

const PRIORITY_COLORS: Record<AlertPriority, string> = {
  P1: 'priority-p1',
  P2: 'priority-p2',
  P3: 'priority-p3',
}

const PRIORITY_BAR: Record<AlertPriority, string> = {
  P1: 'border-l-si-red',
  P2: 'border-l-si-amber',
  P3: 'border-l-si-green',
}

const STATUS_STYLES: Record<string, string> = {
  TRIGGERED: 'text-si-red   border border-si-red/30   bg-si-red/08',
  REVIEW:    'text-si-amber border border-si-amber/30 bg-si-amber/08',
  PENDING:   'text-si-amber border border-si-amber/20 bg-si-amber/05',
  MONITOR:   'text-si-cyan  border border-si-cyan/30  bg-si-cyan/08',
  RESOLVED:  'text-si-muted border border-si-border',
}

export default function CriticalAlertQueue({ alerts, isDemo }: CriticalAlertQueueProps) {
  const [filter, setFilter] = useState<FilterMode>('ALL')
  const [selected, setSelected] = useState<string | null>(null)

  const filtered = filter === 'ALL' ? alerts : alerts.filter(a => a.priority === filter)

  const counts = {
    P1: alerts.filter(a => a.priority === 'P1').length,
    P2: alerts.filter(a => a.priority === 'P2').length,
    P3: alerts.filter(a => a.priority === 'P3').length,
  }

  return (
    <section
      id="critical-alert-queue"
      className="flex flex-col border border-si-border-c panel-glow bg-si-panel overflow-hidden"
      style={{ gridColumn: '6 / 13', gridRow: '2 / 3' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-si-border shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-si-cyan text-2xs font-bold tracking-widest font-display">
            CRITICAL ALERT QUEUE
          </span>
          {isDemo && (
            <span className="text-si-amber text-2xs opacity-70">[DEMO]</span>
          )}
          <span className="text-si-muted text-2xs">{alerts.length} EVENTS</span>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1">
          {(['ALL', 'P1', 'P2', 'P3'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1 px-1.5 py-0.5 text-2xs font-mono border rounded-sm transition-colors ${
                filter === f
                  ? f === 'ALL'
                    ? 'border-si-cyan/50 bg-si-cyan/10 text-si-cyan'
                    : f === 'P1'
                    ? 'border-si-red/50 bg-si-red/10 text-si-red'
                    : f === 'P2'
                    ? 'border-si-amber/50 bg-si-amber/10 text-si-amber'
                    : 'border-si-green/50 bg-si-green/10 text-si-green'
                  : 'border-si-border text-si-muted hover:border-si-border-c'
              }`}
            >
              {f}
              {f !== 'ALL' && counts[f] > 0 && (
                <span className="opacity-70">{counts[f]}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table header */}
      <div className="grid px-3 py-1 border-b border-si-border shrink-0 text-si-muted text-2xs font-mono tracking-widest bg-si-panel-2/50"
           style={{ gridTemplateColumns: '42px 64px 120px 1fr 80px' }}>
        <span>PRI</span>
        <span>TIME</span>
        <span>SOURCE</span>
        <span>EVENT DESCRIPTION</span>
        <span className="text-right">STATUS</span>
      </div>

      {/* Alert rows */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-si-muted text-2xs">
            NO ALERTS MATCH FILTER
          </div>
        ) : (
          filtered.map(alert => (
            <AlertRow
              key={alert.id}
              alert={alert}
              isSelected={selected === alert.id}
              onSelect={() => setSelected(s => s === alert.id ? null : alert.id)}
            />
          ))
        )}
      </div>
    </section>
  )
}

function AlertRow({
  alert,
  isSelected,
  onSelect,
}: {
  alert: AlertEntry
  isSelected: boolean
  onSelect: () => void
}) {
  const prioClass   = PRIORITY_COLORS[alert.priority]
  const borderClass = PRIORITY_BAR[alert.priority]
  const statusStyle = STATUS_STYLES[alert.status] ?? STATUS_STYLES.RESOLVED

  return (
    <button
      onClick={onSelect}
      className={`w-full grid px-3 py-1.5 border-b border-si-border/40 border-l-2 text-left transition-all hover:bg-si-panel-2/60 ${borderClass} ${isSelected ? 'bg-si-panel-2' : ''}`}
      style={{ gridTemplateColumns: '42px 64px 120px 1fr 80px' }}
    >
      {/* Priority chip */}
      <div className="flex items-center">
        <span className={`px-1 py-0.5 text-2xs font-bold border rounded-sm ${prioClass}`}>
          {alert.priority}
        </span>
      </div>

      {/* Time */}
      <span className="text-si-muted text-2xs font-mono self-center">{alert.time_utc}</span>

      {/* Source */}
      <span className="text-si-text text-2xs font-mono truncate self-center pr-1">{alert.source}</span>

      {/* Description */}
      <span className="text-si-text/80 text-2xs font-mono truncate self-center pr-2">
        {alert.event_description}
      </span>

      {/* Status */}
      <div className="flex items-center justify-end">
        <span className={`px-1.5 py-0.5 text-2xs font-mono rounded-sm whitespace-nowrap ${statusStyle}`}>
          {alert.status}
        </span>
      </div>
    </button>
  )
}
