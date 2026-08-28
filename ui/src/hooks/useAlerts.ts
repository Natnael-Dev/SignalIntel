// ════════════════════════════════════════════════════════════════
// useAlerts — Alert History Polling Hook
//
// Polls GET :8080/api/v1/alerts every 4 seconds.
// On new triggered alerts from the WebSocket, also merges them in.
// Falls back to demo snapshot when backend is offline.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef } from 'react'
import type { AlertEntry } from '../types/intel'
import { generateDemoAlerts } from '../lib/demo'

const BRAIN_URL  = import.meta.env.VITE_BRAIN_URL ?? 'http://localhost:8080'
const POLL_MS    = 4000
const FAIL_LIMIT = 2

export interface AlertsState {
  alerts:     AlertEntry[]
  isDemo:     boolean
  totalP1:    number
}

export function useAlerts(): AlertsState {
  const [alerts,  setAlerts]  = useState<AlertEntry[]>([])
  const [isDemo,  setIsDemo]  = useState(false)
  const failRef               = useRef(0)
  const timerRef              = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMounted             = useRef(true)

  async function fetchAlerts() {
    try {
      const res = await fetch(`${BRAIN_URL}/api/v1/alerts`, { signal: AbortSignal.timeout(4000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const data: AlertEntry[] = json.alerts ?? []
      if (!isMounted.current) return
      failRef.current = 0
      setAlerts(data)
      setIsDemo(false)
    } catch {
      if (!isMounted.current) return
      failRef.current++
      if (failRef.current >= FAIL_LIMIT && alerts.length === 0) {
        setAlerts(generateDemoAlerts(12))
        setIsDemo(true)
      }
    }
  }

  useEffect(() => {
    isMounted.current = true
    fetchAlerts()
    timerRef.current = setInterval(fetchAlerts, POLL_MS)
    return () => {
      isMounted.current = false
      if (timerRef.current) clearInterval(timerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalP1 = alerts.filter(a => a.priority === 'P1').length

  return { alerts, isDemo, totalP1 }
}
