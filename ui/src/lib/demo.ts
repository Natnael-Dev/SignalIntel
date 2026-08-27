// ════════════════════════════════════════════════════════════════
// SignalIntel — Demo / Simulation Data Generator
//
// Generates deterministically-flavored but randomised broadcast
// intelligence data when real backends are unreachable.
// All content is fictional geopolitical simulation for demo.
// ════════════════════════════════════════════════════════════════

import type {
  TranscriptEvent, VisionEvent, AlertEntry,
  StreamInfo, AlertStatus, AlertPriority,
} from '../types/intel'

// ── Counter for stable unique IDs ────────────────────────────
let _idCounter = 0
const uid = () => `demo-${Date.now()}-${++_idCounter}`

// ── Timestamp helpers ─────────────────────────────────────────
export function nowSecs(): number { return Date.now() / 1000 }

export function formatUtcHMS(ts: number): string {
  const d = new Date(ts * 1000)
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

// ── Source channels ───────────────────────────────────────────
export const DEMO_CHANNELS = [
  'CNN INTERNATIONAL',
  'BBC WORLD NEWS',
  'AL JAZEERA EN',
  'RT ARABIC',
  'FRANCE 24',
  'DW NEWS',
] as const

export const DEMO_STREAM_IDS: Record<string, string> = {
  'CNN INTERNATIONAL': 'stream-001',
  'BBC WORLD NEWS':    'stream-002',
  'AL JAZEERA EN':     'stream-003',
  'RT ARABIC':         'stream-004',
}

// ── Demo transcript content pools ────────────────────────────
const TRANSCRIPT_POOL_EN: [string, string?][] = [
  ['Maritime forces have commenced active maneuvers in the eastern Mediterranean sector.'],
  ['Rear Admiral Thompson confirmed multiple carrier strike groups are operating joint exercises.'],
  ['NATO Task Force 34 has repositioned vessels to Cyprus Naval Base grid coordinates.'],
  ['Energy ministers cancel delegation summit briefing due to undisclosed security concerns.'],
  ['HMS Defender reported active monitoring operations off coordinate sector Alpha-Seven.'],
  ['Strategic deterrence measures active in response to reported airspace incursions.'],
  ['The Federal Reserve chair signaled that inflation is approaching its long-term target.'],
  ['Satellite imagery confirms repositioning of armored units near the northeastern corridor.'],
  ['Breaking — UN Security Council has called an emergency session regarding the Straits situation.'],
  ['Diplomatic sources confirm three envoys were recalled from the eastern European capitals.'],
  ['Social media volume surges 450 percent in Baltica region following unconfirmed reports.'],
  ['OPEC announced a surprise production cut of 500,000 barrels per day effective next quarter.'],
  ['Market reaction: S&P 500 futures declined 2.3 percent on geopolitical risk premium.'],
  ['Port authority confirms unusual vessel clustering at coordinates 35.9N 014.4E.'],
  ['Eyewitness accounts describe mass demonstration outside the parliament building.'],
]

const TRANSCRIPT_POOL_AR: [string, string][] = [
  [
    'أفادت التقارير بنشاط عسكري غير معتاد قرب المنطقة الاقتصادية الخالصة.',
    'Reports of unusual military activity near the exclusive economic zone.',
  ],
  [
    'وزير الدفاع أكد تعزيز القوات الجوية على الحدود الشمالية.',
    'Defense minister confirmed air force reinforcement along the northern border.',
  ],
  [
    'الحكومة تتخذ إجراءات احترازية في مواجهة التصعيد الإقليمي.',
    'Government takes precautionary measures in response to regional escalation.',
  ],
  [
    'البنك المركزي يرفع سعر الفائدة مئة نقطة أساس في قرار طارئ.',
    'Central bank raises interest rate by 100 basis points in an emergency decision.',
  ],
]

const TICKER_POOL: string[] = [
  'BREAKING: NAVAL EXERCISES EXPANDING TO STRAITS SECTOR — LIVE COVERAGE',
  'UN SECURITY COUNCIL CONVENES EMERGENCY SESSION ON REGIONAL TENSIONS',
  'MARKETS: CRUDE +4.2% | GOLD +1.8% | DOW -1.1% | EUR/USD 1.0724',
  'OPEC SURPRISE CUT: 500K BPD REDUCTION EFFECTIVE Q1 — FULL ANALYSIS',
  'HMS DEFENDER OPERATIONAL STATUS CONFIRMED — MED DEPLOYMENT WEEK 3',
  'DIPLOMATIC SOURCES: THREE ENVOYS RECALLED FROM EASTERN CAPITALS',
  'SOCIAL SPIKE: BALTICA REGION TRENDING +450% — AI SENTIMENT: ELEVATED',
  'GEOPOLITICAL RISK INDEX REACHES 7-YEAR HIGH — ANALYST COMMENTARY AHEAD',
  'SANCTIONS PACKAGE UNDER REVIEW — VOTE EXPECTED FRIDAY — LIVE UPDATES',
]

const SCENE_TYPES = [
  'studio_news', 'live_field', 'breaking_news', 'graphic', 'program', 'interview'
]

// ── Demo stream statuses ──────────────────────────────────────
export const DEMO_STREAMS: StreamInfo[] = [
  { stream_id: 'stream-001', channel_name: 'CNN INTERNATIONAL', status: 'active' },
  { stream_id: 'stream-002', channel_name: 'BBC WORLD NEWS',    status: 'active' },
  { stream_id: 'stream-003', channel_name: 'AL JAZEERA EN',     status: 'active' },
  { stream_id: 'stream-004', channel_name: 'RT ARABIC',         status: 'error',  error_message: 'SIGNAL LOST' },
]

// ── Generator functions ───────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Generate a mock transcript event. */
export function generateMockTranscriptEvent(): TranscriptEvent {
  const useArabic = Math.random() < 0.25
  const channels = ['CNN INTERNATIONAL', 'BBC WORLD NEWS', 'AL JAZEERA EN']
  const channelName = useArabic ? 'AL JAZEERA EN' : pick(channels)
  const ts = nowSecs()

  if (useArabic) {
    const [orig, translated] = pick(TRANSCRIPT_POOL_AR)
    return {
      event_type: 'transcript_update',
      event_id: uid(),
      stream_id: DEMO_STREAM_IDS[channelName] ?? 'stream-demo',
      channel_name: channelName,
      timestamp: ts,
      segment: {
        original_text: orig,
        translated_text: translated,
        original_language: 'ar',
        translated_to: 'en',
        confidence: 0.88 + Math.random() * 0.11,
      },
      _key: uid(),
    }
  } else {
    const [text] = pick(TRANSCRIPT_POOL_EN)
    return {
      event_type: 'transcript_update',
      event_id: uid(),
      stream_id: DEMO_STREAM_IDS[channelName] ?? 'stream-demo',
      channel_name: channelName,
      timestamp: ts,
      segment: {
        original_text: text,
        original_language: 'en',
        translated_to: 'en',
        confidence: 0.91 + Math.random() * 0.08,
      },
      _key: uid(),
    }
  }
}

/** Generate a mock vision event. */
export function generateMockVisionEvent(): VisionEvent {
  const channelName = pick(['CNN INTERNATIONAL', 'BBC WORLD NEWS', 'AL JAZEERA EN'])
  const hasOcr = Math.random() > 0.45
  return {
    event_type: 'vision_update',
    event_id: uid(),
    stream_id: DEMO_STREAM_IDS[channelName] ?? 'stream-demo',
    channel_name: channelName,
    timestamp: nowSecs(),
    scene_type: pick(SCENE_TYPES),
    description: Math.random() > 0.5 ? pick(TRANSCRIPT_POOL_EN)[0] : undefined,
    ticker_text: hasOcr ? pick(TICKER_POOL) : undefined,
    confidence: 0.7 + Math.random() * 0.29,
    _key: uid(),
  }
}

/** Generate a snapshot of demo alert history entries. */
export function generateDemoAlerts(count = 12): AlertEntry[] {
  const templates: Array<{
    priority: AlertPriority
    source: string
    description: string
    status: AlertStatus
    keywords: string[]
    rule_id: string
  }> = [
    {
      priority: 'P1', source: 'MIL-TRANS-18',
      description: 'Tactical military frequency activation detected — Cyprus Command',
      status: 'TRIGGERED', keywords: ['military exercises', 'carrier strike group'],
      rule_id: 'rule_mil_activity',
    },
    {
      priority: 'P1', source: 'SAT-ISR-9',
      description: 'Satellite radar mismatch — Latiskala port shipyard activity change',
      status: 'REVIEW', keywords: ['breaking news', 'urgent'],
      rule_id: 'rule_breaking',
    },
    {
      priority: 'P2', source: 'BBC WORLD NEWS',
      description: 'Breaking: Energy minister cancels delegation summit briefing',
      status: 'REVIEW', keywords: ['summit cancelled', 'diplomatic crisis'],
      rule_id: 'rule_geopolitics',
    },
    {
      priority: 'P2', source: 'SOCIAL-ALRT',
      description: 'Social volume spike in Baltica region (+450% over baseline 10m)',
      status: 'MONITOR', keywords: ['protests', 'mass demonstration'],
      rule_id: 'rule_social_spike',
    },
    {
      priority: 'P1', source: 'CNN INTL',
      description: 'UN Security Council emergency session — naval asset deployment confirmed',
      status: 'TRIGGERED', keywords: ['naval operations', 'carrier strike group'],
      rule_id: 'rule_mil_activity',
    },
    {
      priority: 'P2', source: 'REUTERS',
      description: 'OPEC surprise production cut — 500K bpd — market reaction: crude +4.2%',
      status: 'RESOLVED', keywords: ['opec', 'interest rate'],
      rule_id: 'rule_markets',
    },
    {
      priority: 'P3', source: 'AL JAZEERA EN',
      description: 'Scheduled rotation swap — Bureau Chief Transition complete — MENA desk',
      status: 'RESOLVED', keywords: ['trending'],
      rule_id: 'rule_social_spike',
    },
    {
      priority: 'P1', source: 'SIGINT-FEED',
      description: 'Intercept: Encrypted military channel burst — med sector — auth required',
      status: 'TRIGGERED', keywords: ['airspace incursion', 'tactical maneuvers'],
      rule_id: 'rule_mil_activity',
    },
    {
      priority: 'P2', source: 'DW NEWS',
      description: 'Breaking: Sanctions package vote moved up — Friday session confirmed',
      status: 'PENDING', keywords: ['sanctions', 'diplomatic crisis'],
      rule_id: 'rule_geopolitics',
    },
    {
      priority: 'P3', source: 'FRANCE 24',
      description: 'Annual maritime patrol completion — Mediterranean Zone B report filed',
      status: 'RESOLVED', keywords: ['trending'],
      rule_id: 'rule_social_spike',
    },
    {
      priority: 'P2', source: 'MARKET-FEED',
      description: 'Federal Reserve emergency language — rate decision imminent',
      status: 'MONITOR', keywords: ['federal reserve', 'interest rate'],
      rule_id: 'rule_markets',
    },
    {
      priority: 'P1', source: 'OSINT-WATCH',
      description: 'Open-source: Armored unit repositioning confirmed — northeastern corridor',
      status: 'REVIEW', keywords: ['military exercises', 'airspace incursion'],
      rule_id: 'rule_mil_activity',
    },
  ]

  const now = nowSecs()
  return templates.slice(0, count).map((t, i) => ({
    id: `demo-alert-${i}`,
    priority: t.priority,
    time_utc: formatUtcHMS(now - i * 47),
    timestamp: now - i * 47,
    source: t.source,
    event_description: t.description,
    status: t.status,
    matched_keywords: t.keywords,
    rule_id: t.rule_id,
  }))
}

/** Generate mock RAG search results for a query string. */
export function generateDemoRagResults(query: string) {
  const pool = [
    {
      event_id: 'rag-001', stream_id: 'stream-001', channel_name: 'CNN INTERNATIONAL',
      event_type: 'transcript_update', timestamp: nowSecs() - 120, confidence: 0.94, score: 0.912,
      text: 'Rear Admiral Thompson confirmed multiple carrier strike groups are operating joint exercises in the eastern Mediterranean.',
    },
    {
      event_id: 'rag-002', stream_id: 'stream-003', channel_name: 'AL JAZEERA EN',
      event_type: 'transcript_update', timestamp: nowSecs() - 280, confidence: 0.88, score: 0.863,
      text: 'وزير الدفاع أكد تعزيز القوات الجوية على الحدود الشمالية. [Defense minister confirmed air force reinforcement along the northern border.]',
    },
    {
      event_id: 'rag-003', stream_id: 'stream-002', channel_name: 'BBC WORLD NEWS',
      event_type: 'vision_update', timestamp: nowSecs() - 540, confidence: 0.77, score: 0.791,
      text: '[TICKER: UN SECURITY COUNCIL CONVENES EMERGENCY SESSION] Scene: breaking_news',
    },
    {
      event_id: 'rag-004', stream_id: 'stream-001', channel_name: 'CNN INTERNATIONAL',
      event_type: 'transcript_update', timestamp: nowSecs() - 720, confidence: 0.95, score: 0.744,
      text: 'NATO Task Force 34 has repositioned vessels to Cyprus Naval Base grid coordinates following allied request.',
    },
    {
      event_id: 'rag-005', stream_id: 'stream-002', channel_name: 'BBC WORLD NEWS',
      event_type: 'transcript_update', timestamp: nowSecs() - 900, confidence: 0.91, score: 0.701,
      text: 'Energy ministers cancelled the delegation summit briefing due to undisclosed security concerns — third cancellation this week.',
    },
  ]
  // Filter slightly by query keywords for demo plausibility
  const qLower = query.toLowerCase()
  const filtered = pool.filter(r =>
    qLower.length < 3 ||
    r.text.toLowerCase().includes(qLower) ||
    r.channel_name.toLowerCase().includes(qLower)
  )
  return filtered.length > 0 ? filtered : pool.slice(0, 3)
}

/** Watchlist trigger keywords displayed in entity tracker. */
export const DEMO_WATCHLIST_KEYWORDS = [
  'AIRSPACE INCURSION', 'CARRIER STRIKE', 'NUCLEAR POSTURE',
  'EMERGENCY SESSION', 'SANCTIONS', 'EVACUATION ORDER',
  'COUP', 'FORCE MAJEURE',
]

/** NLP entity patterns for client-side extraction. */
export const ENTITY_PATTERNS: Array<{ regex: RegExp; tag: string }> = [
  { regex: /\b(Cyprus|Mediterranean|Baltica|Straits|NATO|UN|OPEC|MENA)\b/gi,   tag: 'LOC' },
  { regex: /\b(Task Force \d+|NATO|OPEC|S&P 500|Federal Reserve|UN Security Council)\b/gi, tag: 'ORG' },
  { regex: /\b(HMS \w+|USS \w+|INS \w+|carrier strike group)\b/gi,             tag: 'VESSEL' },
  { regex: /\b(Rear Admiral|Admiral|General|Minister|Chairman|Secretary)\s+\w+/gi, tag: 'PER' },
  { regex: /\b(airspace incursion|military exercises|tactical maneuvers|armored unit)\b/gi, tag: 'MIL' },
]
