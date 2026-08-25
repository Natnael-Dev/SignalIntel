//! SignalIntel Core Engine
//! Orchestrates Multimodal Intelligence, RAG Retrieval, and Real-time Alerting.

pub mod models;
pub mod rag;
pub mod alerts;

pub use models::IntelEvent;
pub use rag::{QdrantClient, SearchResult, RRF_K, compute_rrf_score};
pub use alerts::{AlertRule, TriggeredAlert, evaluate_rules};
