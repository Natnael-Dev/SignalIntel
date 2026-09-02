//! SignalIntel Gateway & Brain Orchestrator (Axum Server)
//!
//! Exposes HTTP endpoints on port 8080 for:
//! 1. POST /api/v1/ingest   — Ingests Transcript & Vision events, indexes in Qdrant, dispatches alerts.
//! 2. GET  /api/v1/search   — Multimodal Hybrid RAG search (RRF, k=60).
//! 3. GET  /api/v1/alerts   — Returns alert history ring buffer (last 200 entries).
//! 4. GET|POST /api/v1/alerts/rules — Manages real-time keyword alert rules.
//! 5. GET  /api/v1/health   — Health telemetry and orchestrator metrics.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tracing::{error, info, Level};
use tracing_subscriber::FmtSubscriber;

use signalintel_channels::{ChannelProvider, TelegramChannel};
use signalintel_core::{evaluate_rules, AlertRule, IntelEvent, QdrantClient, TriggeredAlert};

/// Maximum alert history entries to keep in memory.
const MAX_ALERT_HISTORY: usize = 200;

/// A persisted alert record for the UI queue panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertHistoryEntry {
    /// Unique entry ID.
    pub id: String,
    /// Alert priority from the matched rule: "P1" | "P2" | "P3".
    pub priority: String,
    /// Wall-clock UTC timestamp string, e.g. "14:31:59".
    pub time_utc: String,
    /// POSIX timestamp (seconds since epoch) for sorting.
    pub timestamp: f64,
    /// Source channel or stream name.
    pub source: String,
    /// Human-readable event description (matched keywords + snippet).
    pub event_description: String,
    /// Current status: "TRIGGERED" | "REVIEW" | "MONITOR" | "RESOLVED".
    pub status: String,
    /// Keywords that matched the alert rule.
    pub matched_keywords: Vec<String>,
    /// Rule identifier that fired this alert.
    pub rule_id: String,
}

/// Shared Application State for the Gateway.
#[derive(Clone)]
pub struct AppState {
    pub rag_client: Arc<QdrantClient>,
    pub alert_rules: Arc<RwLock<Vec<AlertRule>>>,
    pub alert_history: Arc<RwLock<VecDeque<AlertHistoryEntry>>>,
    pub telegram_channel: Arc<TelegramChannel>,
    pub start_time: std::time::Instant,
}

#[derive(Debug, Deserialize)]
pub struct SearchQueryParams {
    pub q: String,
    pub limit: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct IngestResponse {
    pub status: String,
    pub event_id: String,
    pub event_type: String,
    pub stream_id: String,
    pub alerts_triggered: Vec<TriggeredAlert>,
}

/// Format a POSIX timestamp as "HH:MM:SS" UTC string.
fn format_utc_time(ts_secs: f64) -> String {
    let secs = ts_secs as u64;
    let hh = (secs / 3600) % 24;
    let mm = (secs % 3600) / 60;
    let ss = secs % 60;
    format!("{:02}:{:02}:{:02}", hh, mm, ss)
}

/// Handler for POST /api/v1/ingest
async fn handle_ingest(
    State(state): State<AppState>,
    Json(payload): Json<serde_json::Value>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let event_type = payload
        .get("event_type")
        .and_then(|v| v.as_str())
        .unwrap_or("generic");

    let stream_id = payload
        .get("stream_id")
        .and_then(|v| v.as_str())
        .unwrap_or("default_stream");

    let channel_name = payload
        .get("channel_name")
        .and_then(|v| v.as_str())
        .unwrap_or("live_channel");

    let timestamp = payload
        .get("timestamp")
        .or_else(|| payload.get("timestamp_seconds"))
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);

    let confidence = payload
        .get("confidence")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.0);

    // Extract core text depending on event type
    let text_content = if event_type == "transcript_update" || payload.get("segment").is_some() {
        let seg = payload.get("segment");
        let original = seg
            .and_then(|s| s.get("original_text"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let translated = seg
            .and_then(|s| s.get("translated_text"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !translated.is_empty() && translated != original {
            format!("{} [{}]", original, translated)
        } else {
            original.to_string()
        }
    } else if event_type == "vision_update" || payload.get("scene_type").is_some() {
        let ticker = payload
            .get("ticker_text")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let scene = payload
            .get("scene_type")
            .and_then(|v| v.as_str())
            .unwrap_or("program");
        let desc = payload
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        match (ticker.is_empty(), desc.is_empty()) {
            (false, false) => format!("[TICKER: {}] Scene: {} - {}", ticker, scene, desc),
            (false, true) => format!("[TICKER: {}] Scene: {}", ticker, scene),
            (true, false) => format!("[SCENE: {}] {}", scene, desc),
            (true, true) => format!("[SCENE: {}]", scene),
        }
    } else {
        payload
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    };

    let intel_event = IntelEvent::new(
        stream_id,
        channel_name,
        timestamp,
        event_type,
        text_content.clone(),
        confidence,
        payload.clone(),
    );

    // 1. Index in Qdrant
    if let Err(err) = state.rag_client.index_event(&intel_event).await {
        error!("Error indexing event in RAG: {}", err);
    }

    // 2. Evaluate alert rules
    let current_rules = state.alert_rules.read().await.clone();
    let triggered_alerts = evaluate_rules(&intel_event, &current_rules);

    // 3. Dispatch & persist alerts
    {
        let mut history = state.alert_history.write().await;
        for alert in &triggered_alerts {
            // Dispatch to Telegram if configured
            if let Some(chat_id) = &alert.telegram_chat_id {
                let msg = format!(
                    "🚨 <b>SignalIntel Broadcast Alert</b>\n\
                    <b>Priority:</b> {}\n\
                    <b>Channel:</b> {}\n\
                    <b>Trigger:</b> {}\n\
                    <b>Time:</b> +{:.1}s\n\
                    <b>Snippet:</b> <i>{}</i>",
                    alert.priority,
                    alert.channel_name,
                    alert.matched_keywords.join(", "),
                    alert.timestamp,
                    alert.text_snippet
                );
                let _ = state.telegram_channel.send_message(chat_id, &msg).await;
            }

            // Persist to alert history ring buffer
            let entry = AlertHistoryEntry {
                id: format!("{}-{}", alert.rule_id, intel_event.event_id),
                priority: alert.priority.clone(),
                time_utc: format_utc_time(alert.timestamp),
                timestamp: alert.timestamp,
                source: alert.channel_name.clone(),
                event_description: format!(
                    "{}: {}",
                    alert.matched_keywords.join(", "),
                    &alert.text_snippet.chars().take(80).collect::<String>()
                ),
                status: "TRIGGERED".into(),
                matched_keywords: alert.matched_keywords.clone(),
                rule_id: alert.rule_id.clone(),
            };
            history.push_front(entry);
            if history.len() > MAX_ALERT_HISTORY {
                history.pop_back();
            }
        }
    }

    info!(
        "Ingested {} event [{}] from stream [{}] - {} alert(s) triggered",
        event_type,
        intel_event.event_id,
        stream_id,
        triggered_alerts.len()
    );

    Ok(Json(IngestResponse {
        status: "ingested".into(),
        event_id: intel_event.event_id,
        event_type: event_type.into(),
        stream_id: stream_id.into(),
        alerts_triggered: triggered_alerts,
    }))
}

/// Handler for GET /api/v1/search?q=query
async fn handle_search(
    State(state): State<AppState>,
    Query(params): Query<SearchQueryParams>,
) -> Result<impl IntoResponse, StatusCode> {
    let limit = params.limit.unwrap_or(10);
    match state.rag_client.hybrid_search(&params.q, limit).await {
        Ok(results) => Ok(Json(results)),
        Err(err) => {
            error!("Hybrid search failure for query '{}': {}", params.q, err);
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Handler for GET /api/v1/health
async fn handle_health(State(state): State<AppState>) -> impl IntoResponse {
    let uptime = state.start_time.elapsed().as_secs();
    let rules_count = state.alert_rules.read().await.len();
    let alerts_count = state.alert_history.read().await.len();
    Json(serde_json::json!({
        "status": "healthy",
        "service": "signalintel-rust-brain-gateway",
        "version": "0.5.0",
        "uptime_seconds": uptime,
        "active_alert_rules": rules_count,
        "alerts_in_history": alerts_count,
        "qdrant_target": state.rag_client.base_url,
    }))
}

/// Handler for GET /api/v1/alerts — returns alert history ring buffer.
async fn handle_get_alerts(State(state): State<AppState>) -> impl IntoResponse {
    let history = state.alert_history.read().await;
    let entries: Vec<&AlertHistoryEntry> = history.iter().collect();
    Json(serde_json::json!({
        "alerts": entries,
        "total": entries.len(),
    }))
}

/// Handler for GET /api/v1/alerts/rules
async fn handle_list_rules(State(state): State<AppState>) -> impl IntoResponse {
    let rules = state.alert_rules.read().await.clone();
    Json(rules)
}

/// Handler for POST /api/v1/alerts/rules
async fn handle_create_rule(
    State(state): State<AppState>,
    Json(new_rule): Json<AlertRule>,
) -> impl IntoResponse {
    let mut rules = state.alert_rules.write().await;
    rules.push(new_rule.clone());
    info!(
        "Registered new alert rule [id={}] with keywords: {:?}",
        new_rule.id, new_rule.keywords
    );
    (StatusCode::CREATED, Json(new_rule))
}

pub fn create_app(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/api/v1/health", get(handle_health))
        .route("/api/v1/ingest", post(handle_ingest))
        .route("/api/v1/search", get(handle_search))
        .route("/api/v1/alerts", get(handle_get_alerts))
        .route(
            "/api/v1/alerts/rules",
            get(handle_list_rules).post(handle_create_rule),
        )
        .layer(cors)
        .with_state(state)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber).ok();

    info!("Starting SignalIntel Rust Brain & Omnichannel Gateway v0.5.0...");

    // Initialize prioritized default alert rules
    let default_rules = vec![
        AlertRule::new(
            "rule_mil_activity",
            vec![
                "military exercises".into(),
                "carrier strike group".into(),
                "naval operations".into(),
                "airspace incursion".into(),
                "tactical maneuvers".into(),
            ],
            Some("signalintel_mil_channel".into()),
            None,
        )
        .with_priority("P1")
        .with_name("Military Activity Monitor"),
        AlertRule::new(
            "rule_breaking",
            vec![
                "breaking news".into(),
                "urgent".into(),
                "developing story".into(),
                "emergency".into(),
            ],
            Some("signalintel_alerts_channel".into()),
            None,
        )
        .with_priority("P1")
        .with_name("Breaking News Detector"),
        AlertRule::new(
            "rule_geopolitics",
            vec![
                "sanctions".into(),
                "diplomatic crisis".into(),
                "summit cancelled".into(),
                "evacuation".into(),
                "coup".into(),
            ],
            Some("signalintel_geo_channel".into()),
            None,
        )
        .with_priority("P2")
        .with_name("Geopolitical Events"),
        AlertRule::new(
            "rule_markets",
            vec![
                "interest rate".into(),
                "federal reserve".into(),
                "opec".into(),
                "s&p 500".into(),
                "market crash".into(),
            ],
            Some("signalintel_finance_channel".into()),
            None,
        )
        .with_priority("P2")
        .with_name("Market Intelligence"),
        AlertRule::new(
            "rule_social_spike",
            vec![
                "viral".into(),
                "trending".into(),
                "protests".into(),
                "riots".into(),
                "mass demonstration".into(),
            ],
            None,
            None,
        )
        .with_priority("P3")
        .with_name("Social Sentiment Spike"),
    ];

    let state = AppState {
        rag_client: Arc::new(QdrantClient::new(None, None)),
        alert_rules: Arc::new(RwLock::new(default_rules)),
        alert_history: Arc::new(RwLock::new(VecDeque::new())),
        telegram_channel: Arc::new(TelegramChannel::default()),
        start_time: std::time::Instant::now(),
    };

    let app = create_app(state);
    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse()?;

    info!("SignalIntel Brain Gateway listening on http://{}", addr);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
