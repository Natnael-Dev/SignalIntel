// ════════════════════════════════════════════════════════════════
// DiagnosticMetrics — Backend Health & Pipeline Status Panel
// ════════════════════════════════════════════════════════════════

import type { DiagnosticsState } from '../types/intel'

interface DiagnosticMetricsProps {
  diag: DiagnosticsState
}

function formatUptime(secs: number): string {
  if (secs < 60)   return `${secs}s`
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return `${h}h ${m}m`
}

function MetricBar({
  label,
  value,
  maxValue,
  unit,
  color,
}: {
  label:    string
  value:    number
  maxValue: number
  unit:     string
  color:    string
}) {
  const pct = Math.min(100, Math.round((value / maxValue) * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="text-si-muted text-2xs font-mono w-12 shrink-0">{label}</span>
      <div className="flex-1 relative h-1.5 bg-si-border rounded-full overflow-hidden">
        <div
          className={`absolute left-0 top-0 h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-si-text text-2xs font-mono w-14 text-right shrink-0">
        {value.toFixed(1)}{unit}
      </span>
    </div>
  )
}

// Pipeline node identifiers (each represents a processing stage)
const PIPELINE_NODES = [
  { id: 'INGEST',    label: 'IG', title: 'Media Ingestor' },
  { id: 'WHISPER',   label: 'WH', title: 'Whisper ASR' },
  { id: 'TRANSLATE', label: 'TR', title: 'Translation Engine' },
  { id: 'OCR',       label: 'OC', title: 'OCR / Ticker Extractor' },
  { id: 'VLM',       label: 'VL', title: 'VLM Scene Classifier' },
  { id: 'EMBED',     label: 'EM', title: 'Embedding Service' },
  { id: 'QDRANT',    label: 'QD', title: 'Qdrant Vector DB' },
  { id: 'RRF',       label: 'RF', title: 'RRF Fusion Engine' },
  { id: 'RULES',     label: 'RL', title: 'Alert Rule Engine' },
  { id: 'DISPATCH',  label: 'DS', title: 'Channel Dispatcher' },
  { id: 'WS',        label: 'WS', title: 'WebSocket Broadcaster' },
  { id: 'GATEWAY',   label: 'GW', title: 'Rust Brain Gateway' },
]

export default function DiagnosticMetrics({ diag }: DiagnosticMetricsProps) {
  // Compute simulated system metrics from uptime/connection state
  const cpuUsage  = diag.pythonOnline ? 24 + Math.sin(Date.now() / 4000) * 12 : 0
  const memUsage  = diag.pythonOnline ? 48 + Math.sin(Date.now() / 7000) * 8  : 0
  const netUsage  = diag.wsConnected  ? 36 + Math.sin(Date.now() / 3000) * 20 : 0

  // Storage simulation: 1 KB per transcript event (approx)
  const storageUsedGb = 0.14
  const storageTotalGb = 2.0
  const storagePct    = Math.round((storageUsedGb / storageTotalGb) * 100)

  // Uptime percentage (using connection status as proxy)
  const uptimePct = diag.pythonOnline || diag.brainOnline ? 99.3 : 0

  // Node active status
  const nodeStatus = (id: string): 'active' | 'warn' | 'offline' => {
    if (!diag.pythonOnline && !diag.brainOnline) return 'offline'
    const brainNodes = ['EMBED', 'QDRANT', 'RRF', 'RULES', 'DISPATCH', 'GATEWAY']
    if (brainNodes.includes(id)) return diag.brainOnline ? 'active' : 'offline'
    if (id === 'WS') return diag.wsConnected ? 'active' : 'warn'
    return diag.pythonOnline ? 'active' : 'offline'
  }

  const nodeColors = {
    active:  'bg-si-green/80 border-si-green/40 text-si-green',
    warn:    'bg-si-amber/60 border-si-amber/40 text-si-amber',
    offline: 'bg-si-panel-2 border-si-border text-si-muted',
  }

  return (
    <section
      id="diagnostic-metrics"
      className="flex flex-col border border-si-border bg-si-panel overflow-hidden"
      style={{ gridColumn: '10 / 13', gridRow: '3 / 4' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-si-border shrink-0">
        <span className="text-si-cyan text-2xs font-bold tracking-widest font-display">
          DIAGNOSTICS
        </span>
        <span className={`text-2xs font-mono ${diag.pythonOnline || diag.brainOnline ? 'text-si-green' : 'text-si-red'}`}>
          UP {uptimePct}%
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">

        {/* Service status indicators */}
        <div className="grid grid-cols-2 gap-1.5">
          <ServiceBadge
            label="PYTHON"
            sublabel="FastAPI :8000"
            online={diag.pythonOnline}
            uptime={formatUptime(diag.uptimePython)}
          />
          <ServiceBadge
            label="BRAIN"
            sublabel={`Axum :8080 v${diag.brainVersion}`}
            online={diag.brainOnline}
            uptime={formatUptime(diag.uptimeBrain)}
          />
        </div>

        {/* Storage bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-si-muted text-2xs font-mono tracking-widest">STORAGE</span>
            <span className="text-si-text text-2xs font-mono">{storageUsedGb} / {storageTotalGb} GB</span>
          </div>
          <div className="relative h-2 bg-si-border rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-si-cyan/70"
              style={{ width: `${storagePct}%` }}
            />
          </div>
        </div>

        {/* System metrics */}
        <div className="space-y-1.5">
          <MetricBar label="CPU"    value={cpuUsage}  maxValue={100} unit="%" color="bg-si-green" />
          <MetricBar label="MEM"    value={memUsage}  maxValue={100} unit="%" color="bg-si-amber" />
          <MetricBar label="NET"    value={netUsage}  maxValue={100} unit="%" color="bg-si-cyan"  />
        </div>

        {/* Key counters */}
        <div className="grid grid-cols-2 gap-1.5 text-2xs font-mono">
          <StatTile label="ALERT RULES"    value={diag.activeRules}     />
          <StatTile label="ALERTS STORED"  value={diag.alertsInHistory} />
          <StatTile label="ACTIVE STREAMS" value={diag.pythonStreams}    />
          <StatTile label="WS CONN"        value={diag.wsConnected ? 1 : 0} />
        </div>

        {/* Pipeline nodes grid */}
        <div>
          <p className="text-si-muted text-2xs font-mono tracking-widest mb-1.5">
            PIPELINE NODES
          </p>
          <div className="grid grid-cols-4 gap-1">
            {PIPELINE_NODES.map(node => {
              const ns = nodeStatus(node.id)
              return (
                <div
                  key={node.id}
                  title={`${node.title} — ${ns.toUpperCase()}`}
                  className={`flex items-center justify-center h-6 border rounded-sm text-2xs font-mono font-bold transition-colors cursor-default ${nodeColors[ns]}`}
                >
                  {node.label}
                </div>
              )
            })}
          </div>
        </div>

        {/* Qdrant target */}
        <div className="text-2xs font-mono text-si-muted">
          <span className="text-si-dim">QDRANT: </span>
          <span className="text-si-text/60">{diag.qdrantTarget}</span>
        </div>

      </div>
    </section>
  )
}

function ServiceBadge({
  label, sublabel, online, uptime,
}: {
  label: string; sublabel: string; online: boolean; uptime: string
}) {
  return (
    <div className={`flex flex-col p-1.5 border rounded-sm ${
      online ? 'border-si-green/30 bg-si-green/05' : 'border-si-border bg-si-panel-2/60'
    }`}>
      <div className="flex items-center gap-1 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-si-green pulse-dot' : 'bg-si-red'}`} />
        <span className={`text-2xs font-mono font-bold ${online ? 'text-si-green' : 'text-si-red'}`}>
          {label}
        </span>
        <span className={`text-2xs font-mono ml-auto ${online ? 'text-si-green' : 'text-si-red'}`}>
          {online ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
      <span className="text-2xs font-mono text-si-muted">{sublabel}</span>
      {online && <span className="text-2xs font-mono text-si-muted/60 mt-0.5">UP {uptime}</span>}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col p-1.5 border border-si-border rounded-sm bg-si-panel-2/40">
      <span className="text-si-muted text-2xs tracking-widest">{label}</span>
      <span className="text-si-text text-sm font-bold font-mono mt-0.5">{value}</span>
    </div>
  )
}
