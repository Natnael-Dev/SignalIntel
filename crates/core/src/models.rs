//! Core Intelligence Data Models
//!
//! Standardized representation of multimodal broadcast events (Audio transcripts and Vision OCR / Scene classifications).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Standardized cross-modal intelligence event payload.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct IntelEvent {
    pub event_id: String,
    pub stream_id: String,
    pub channel_name: String,
    pub timestamp: f64,
    pub event_type: String, // "transcript" | "vision"
    pub text: String,
    pub confidence: f64,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

impl IntelEvent {
    /// Creates a new IntelEvent from raw event components.
    pub fn new(
        stream_id: impl Into<String>,
        channel_name: impl Into<String>,
        timestamp: f64,
        event_type: impl Into<String>,
        text: impl Into<String>,
        confidence: f64,
        metadata: serde_json::Value,
    ) -> Self {
        let event_id = uuid::Uuid::new_v4().to_string();
        Self {
            event_id,
            stream_id: stream_id.into(),
            channel_name: channel_name.into(),
            timestamp,
            event_type: event_type.into(),
            text: text.into(),
            confidence,
            metadata,
            created_at: Utc::now(),
        }
    }

    /// Helper to construct an IntelEvent from an audio transcript segment.
    pub fn from_transcript(
        stream_id: impl Into<String>,
        channel_name: impl Into<String>,
        timestamp: f64,
        text: impl Into<String>,
        confidence: f64,
        source_lang: &str,
        target_lang: &str,
    ) -> Self {
        let meta = serde_json::json!({
            "source_lang": source_lang,
            "target_lang": target_lang,
        });
        Self::new(
            stream_id,
            channel_name,
            timestamp,
            "transcript",
            text,
            confidence,
            meta,
        )
    }

    /// Helper to construct an IntelEvent from a vision classification / ticker OCR event.
    pub fn from_vision(
        stream_id: impl Into<String>,
        channel_name: impl Into<String>,
        timestamp: f64,
        ticker_text: Option<String>,
        scene_type: &str,
        confidence: f64,
        description: Option<String>,
    ) -> Self {
        let text_content = match (&ticker_text, &description) {
            (Some(t), Some(d)) => format!("{}: {}", t, d),
            (Some(t), None) => t.clone(),
            (None, Some(d)) => d.clone(),
            (None, None) => format!("Scene: {}", scene_type),
        };

        let meta = serde_json::json!({
            "scene_type": scene_type,
            "ticker_text": ticker_text,
            "description": description,
        });

        Self::new(
            stream_id,
            channel_name,
            timestamp,
            "vision",
            text_content,
            confidence,
            meta,
        )
    }
}
