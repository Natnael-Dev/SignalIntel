//! SignalIntel Core Engine
//! Orchestrates Multimodal Intelligence, RAG Retrieval, and Real-time Alerting.

pub mod alerts;
pub mod models;
pub mod rag;

pub use alerts::{evaluate_rules, AlertRule, TriggeredAlert};
pub use models::IntelEvent;
pub use rag::{compute_rrf_score, QdrantClient, SearchResult, RRF_K};
