// ════════════════════════════════════════════════════════════════
// useDiagnostics — Backend Health Polling Hook
//
// Polls both Python FastAPI (:8000/api/v1/health) and Rust Brain
// (:8080/api/v1/health) every 6 seconds and aggregates state for
// the DiagnosticMetrics panel and TopBar.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react'
import type { DiagnosticsState } from '../types/intel'

const PYTHON_URL = import.meta.env.VITE_PYTHON_URL ?? 'http://localhost:8000'
const BRAIN_URL  = import.meta.env.VITE_BRAIN_URL  ?? 'http://localhost:8080'
const POLL_MS    = 6000

const DEFAULT_STATE: DiagnosticsState = {
  pythonOnline:    false,
  brainOnline:     false,
  uptimePython:    0,
  uptimeBrain:     0,
  activeRules:     5,
  alertsInHistory: 0,
  qdrantTarget:    'http://localhost:6333',
  brainVersion:    '0.5.0',
  pythonStreams:   0,
  wsConnected:     false,
}

export function useDiagnostics(wsConnected = false): DiagnosticsState {
  const [diag, setDiag] = useState<DiagnosticsState>({ ...DEFAULT_STATE, wsConnected })
  const isMounted = useRef(true)

  async function pollHealth() {
    const results = await Promise.allSettled([
      fetch(`${PYTHON_URL}/api/v1/health`, { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
      fetch(`${BRAIN_URL}/api/v1/health`,  { signal: AbortSignal.timeout(4000) }).then(r => r.json()),
    ])

    if (!isMounted.current) return

    const [pythonResult, brainResult] = results

    setDiag(prev => ({
      ...prev,
      wsConnected,
      pythonOnline: pythonResult.status === 'fulfilled',
      brainOnline:  brainResult.status  === 'fulfilled',
      uptimePython:
        pythonResult.status === 'fulfilled'
          ? (pythonResult.value?.uptime_seconds ?? prev.uptimePython)
          : prev.uptimePython,
      uptimeBrain:
        brainResult.status === 'fulfilled'
          ? (brainResult.value?.uptime_seconds ?? prev.uptimeBrain)
          : prev.uptimeBrain,
      activeRules:
        brainResult.status === 'fulfilled'
          ? (brainResult.value?.active_alert_rules ?? prev.activeRules)
          : prev.activeRules,
      alertsInHistory:
        brainResult.status === 'fulfilled'
          ? (brainResult.value?.alerts_in_history ?? prev.alertsInHistory)
          : prev.alertsInHistory,
      qdrantTarget:
        brainResult.status === 'fulfilled'
          ? (brainResult.value?.qdrant_target ?? prev.qdrantTarget)
          : prev.qdrantTarget,
      brainVersion:
        brainResult.status === 'fulfilled'
          ? (brainResult.value?.version ?? prev.brainVersion)
          : prev.brainVersion,
      pythonStreams:
        pythonResult.status === 'fulfilled'
          ? (pythonResult.value?.active_streams ?? prev.pythonStreams)
          : prev.pythonStreams,
    }))
  }

  useEffect(() => {
    isMounted.current = true
    pollHealth()
    const t = setInterval(pollHealth, POLL_MS)
    return () => {
      isMounted.current = false
      clearInterval(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wsConnected])

  return diag
}
