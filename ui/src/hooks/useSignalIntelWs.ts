// ════════════════════════════════════════════════════════════════
// useSignalIntelWs — Real-time WebSocket Feed Hook
//
// Connects to the Python FastAPI WebSocket endpoints for live
// transcript and vision events. On failure, degrades gracefully
// to demo mode with a clear amber "DEMO" indicator in the UI.
// ════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react'
import type { TranscriptEvent, VisionEvent, ConnectionStatus } from '../types/intel'
import { generateMockTranscriptEvent, generateMockVisionEvent, nowSecs } from '../lib/demo'

const WS_BASE = import.meta.env.VITE_PYTHON_WS_URL ?? 'ws://localhost:8000'
const MAX_ITEMS       = 120
const MAX_VISION      = 20
const DEMO_THRESHOLD  = 3    // Failed attempts before demo mode
const INITIAL_BACKOFF = 1000
const MAX_BACKOFF     = 20000
const PING_INTERVAL   = 5000

export interface WsState {
  transcripts:  TranscriptEvent[]
  visionEvents: VisionEvent[]
  latestTicker: string | null
  status:       ConnectionStatus
  latencyMs:    number | null
  feedCounts:   Record<string, number>
}

/** Exponential backoff with jitter. */
function nextBackoff(current: number): number {
  return Math.min(current * 1.5 + Math.random() * 300, MAX_BACKOFF)
}

export function useSignalIntelWs(): WsState {
  const [transcripts,  setTranscripts]  = useState<TranscriptEvent[]>([])
  const [visionEvents, setVisionEvents] = useState<VisionEvent[]>([])
  const [latestTicker, setLatestTicker] = useState<string | null>(null)
  const [status,       setStatus]       = useState<ConnectionStatus>('reconnecting')
  const [latencyMs,    setLatencyMs]    = useState<number | null>(null)
  const [feedCounts,   setFeedCounts]   = useState<Record<string, number>>({})

  const wsRef        = useRef<WebSocket | null>(null)
  const backoffRef   = useRef(INITIAL_BACKOFF)
  const attemptsRef  = useRef(0)
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const demoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMounted    = useRef(true)

  const pushTranscript = useCallback((ev: TranscriptEvent) => {
    setTranscripts(prev => {
      const next = [...prev, { ...ev, _key: `${ev.event_id}-${Date.now()}` }]
      return next.slice(-MAX_ITEMS)
    })
    setFeedCounts(prev => ({
      ...prev,
      [ev.channel_name]: (prev[ev.channel_name] ?? 0) + 1,
    }))
  }, [])

  const pushVision = useCallback((ev: VisionEvent) => {
    setVisionEvents(prev => {
      const next = [...prev, { ...ev, _key: `${ev.event_id}-${Date.now()}` }]
      return next.slice(-MAX_VISION)
    })
    if (ev.ticker_text) {
      setLatestTicker(ev.ticker_text)
    }
  }, [])

  /** Start demo mode interval. */
  const startDemo = useCallback(() => {
    if (!isMounted.current) return
    if (demoTimerRef.current) return   // already running
    setStatus('demo')
    setLatencyMs(null)

    // Seed with a few events immediately
    for (let i = 0; i < 8; i++) {
      pushTranscript({ ...generateMockTranscriptEvent(), timestamp: nowSecs() - (7 - i) * 3.5 })
    }
    pushVision(generateMockVisionEvent())

    demoTimerRef.current = setInterval(() => {
      if (!isMounted.current) return
      pushTranscript(generateMockTranscriptEvent())
      if (Math.random() > 0.65) {
        pushVision(generateMockVisionEvent())
      }
    }, 2800 + Math.random() * 1200)
  }, [pushTranscript, pushVision])

  const stopDemo = useCallback(() => {
    if (demoTimerRef.current) {
      clearInterval(demoTimerRef.current)
      demoTimerRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!isMounted.current) return
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
    }

    setStatus('reconnecting')
    const ws = new WebSocket(`${WS_BASE}/api/v1/ws/transcripts`)
    wsRef.current = ws

    ws.onopen = () => {
      if (!isMounted.current) return
      attemptsRef.current = 0
      backoffRef.current  = INITIAL_BACKOFF
      setStatus('online')
      stopDemo()

      // Start heartbeat ping/pong
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const t0 = performance.now()
          ws.send(JSON.stringify({ type: 'ping', t: t0 }))
        }
      }, PING_INTERVAL)
    }

    ws.onmessage = (msgEvent) => {
      if (!isMounted.current) return
      try {
        const data = JSON.parse(msgEvent.data as string)
        if (data?.type === 'pong' && data.t) {
          setLatencyMs(Math.round(performance.now() - data.t))
          return
        }
        if (data?.event_type === 'transcript_update') {
          pushTranscript(data as TranscriptEvent)
        } else if (data?.event_type === 'vision_update') {
          pushVision(data as VisionEvent)
        }
      } catch {
        // ignore malformed
      }
    }

    ws.onclose = () => {
      if (!isMounted.current) return
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null }
      setStatus('reconnecting')
      setLatencyMs(null)
      attemptsRef.current++

      if (attemptsRef.current >= DEMO_THRESHOLD) {
        startDemo()
      } else {
        const delay = backoffRef.current
        backoffRef.current = nextBackoff(delay)
        setTimeout(connect, delay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [pushTranscript, pushVision, startDemo, stopDemo])

  useEffect(() => {
    isMounted.current = true
    connect()

    return () => {
      isMounted.current = false
      if (wsRef.current)        wsRef.current.close()
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      if (demoTimerRef.current) clearInterval(demoTimerRef.current)
    }
  }, [connect])

  return { transcripts, visionEvents, latestTicker, status, latencyMs, feedCounts }
}
