// ════════════════════════════════════════════════════════════════
// SignalIntel Intelligence Console — Domain Types
// Mirrors the Rust/Python models across the IPC boundary.
// ════════════════════════════════════════════════════════════════

// ── Real-time event types ─────────────────────────────────────

export type EventType = 'transcript_update' | 'vision_update' | 'generic'

/** A transcript segment from the Python audio pipeline. */
export interface TranscriptSegment {
  original_text: string
  translated_text?: string
  original_language: string
  translated_to: string
  confidence: number
}

/** Full transcript event as broadcast over WebSocket. */
export interface TranscriptEvent {
  event_type: 'transcript_update'
  event_id: string
  stream_id: string
  channel_name: string
  timestamp: number          // POSIX seconds
  segment: TranscriptSegment
  // For UI rendering
  _key?: string              // stable React key (assigned on receive)
}

/** Vision event from the Python VLM/OCR pipeline. */
export interface VisionEvent {
  event_type: 'vision_update'
  event_id: string
  stream_id: string
  channel_name: string
  timestamp: number
  scene_type: string         // 'studio_news' | 'live_field' | 'breaking_news' | 'graphic' | 'program'
  description?: string
  ticker_text?: string       // lower-third OCR output
  confidence: number
  _key?: string
}

// ── Alert types ───────────────────────────────────────────────

export type AlertPriority = 'P1' | 'P2' | 'P3'
export type AlertStatus   = 'TRIGGERED' | 'REVIEW' | 'MONITOR' | 'RESOLVED' | 'PENDING'

/** Alert entry from GET /api/v1/alerts (Rust gateway). */
export interface AlertEntry {
  id: string
  priority: AlertPriority
  time_utc: string           // "HH:MM:SS"
  timestamp: number
  source: string
  event_description: string
  status: AlertStatus
  matched_keywords: string[]
  rule_id: string
}

export interface AlertsResponse {
  alerts: AlertEntry[]
  total: number
}

// ── Alert rule types ─────────────────────────────────────────

export interface AlertRule {
  id: string
  name?: string
  keywords: string[]
  webhook_url?: string
  telegram_chat_id?: string
  min_confidence?: number
  priority?: AlertPriority
}

// ── RAG search types ─────────────────────────────────────────

export interface RagSearchResult {
  event_id: string
  stream_id: string
  channel_name: string
  event_type: string
  text: string
  timestamp: number
  confidence: number
  score: number              // RRF relevance score
}

// ── Stream health types ───────────────────────────────────────

export interface StreamInfo {
  stream_id: string
  channel_name: string
  status: 'active' | 'inactive' | 'error'
  last_update?: number
  error_message?: string
}

export interface PythonHealthResponse {
  status: string
  active_streams: number
  uptime_seconds?: number
}

// ── Rust Brain health types ───────────────────────────────────

export interface BrainHealthResponse {
  status: string
  service: string
  version: string
  uptime_seconds: number
  active_alert_rules: number
  alerts_in_history: number
  qdrant_target: string
}

// ── Diagnostics aggregate ─────────────────────────────────────

export interface DiagnosticsState {
  pythonOnline: boolean
  brainOnline: boolean
  uptimePython: number    // seconds
  uptimeBrain: number     // seconds
  activeRules: number
  alertsInHistory: number
  qdrantTarget: string
  brainVersion: string
  pythonStreams: number
  wsConnected: boolean
}

// ── Entity extraction result ──────────────────────────────────

export type EntityTag = 'LOC' | 'ORG' | 'VESSEL' | 'PER' | 'MIL'

export interface ExtractedEntity {
  text: string
  tag: EntityTag
  count: number
  streams: Set<string>
}

// ── Application connection state ──────────────────────────────

export type ConnectionStatus = 'online' | 'demo' | 'reconnecting' | 'offline'
