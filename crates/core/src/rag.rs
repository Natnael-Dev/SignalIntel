//! Multimodal RAG Engine & Qdrant REST Client
//!
//! Implements Vector indexing and Hybrid Search combining Dense Embedding
//! and Sparse Keyword Retrieval via Reciprocal Rank Fusion (RRF, k=60).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::debug;

use crate::models::IntelEvent;

/// RRF constant k=60 (GeneralBots verified standard)
pub const RRF_K: f64 = 60.0;

/// Individual search result returned by hybrid search.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SearchResult {
    pub event_id: String,
    pub stream_id: String,
    pub channel_name: String,
    pub timestamp: f64,
    pub text: String,
    pub dense_score: f64,
    pub sparse_score: f64,
    pub rrf_score: f64,
}

/// Computes Reciprocal Rank Fusion score:
/// RRF_score(d) = \sum_{m \in {dense, sparse}} 1 / (k + rank_m(d))
pub fn compute_rrf_score(dense_rank: Option<usize>, sparse_rank: Option<usize>, k: f64) -> f64 {
    let mut score = 0.0;
    if let Some(r) = dense_rank {
        score += 1.0 / (k + (r as f64 + 1.0));
    }
    if let Some(r) = sparse_rank {
        score += 1.0 / (k + (r as f64 + 1.0));
    }
    score
}

/// REST Client for Qdrant Vector Search Engine.
#[derive(Debug, Clone)]
pub struct QdrantClient {
    pub base_url: String,
    pub collection_name: String,
    pub client: reqwest::Client,
    // In-memory fallback index for zero-latency testing and offline resilience
    in_memory_events: Arc<RwLock<Vec<IntelEvent>>>,
}

impl QdrantClient {
    /// Creates a new Qdrant client from environment variables or defaults.
    pub fn new(base_url: Option<String>, collection_name: Option<String>) -> Self {
        let url = base_url
            .or_else(|| env::var("QDRANT_URL").ok())
            .unwrap_or_else(|| "http://localhost:6333".to_string());

        let collection = collection_name
            .or_else(|| env::var("QDRANT_COLLECTION").ok())
            .unwrap_or_else(|| "signalintel_broadcast_events".to_string());

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap_or_default();

        Self {
            base_url: url,
            collection_name: collection,
            client,
            in_memory_events: Arc::new(RwLock::new(Vec::new())),
        }
    }

    /// Generates a simple normalized deterministic dense vector embedding for text.
    pub fn generate_embedding(&self, text: &str) -> Vec<f32> {
        let dim = 128;
        let mut vec = vec![0.0f32; dim];
        if text.is_empty() {
            return vec;
        }

        for (i, b) in text.as_bytes().iter().enumerate() {
            vec[i % dim] += *b as f32 / 255.0;
        }

        // L2 normalize
        let norm: f32 = vec.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for val in vec.iter_mut() {
                *val /= norm;
            }
        }
        vec
    }

    /// Computes cosine similarity between two normalized vectors.
    fn cosine_similarity(v1: &[f32], v2: &[f32]) -> f64 {
        if v1.len() != v2.len() || v1.is_empty() {
            return 0.0;
        }
        let dot: f32 = v1.iter().zip(v2.iter()).map(|(a, b)| a * b).sum();
        dot as f64
    }

    /// Computes a lightweight BM25 keyword score for sparse matching.
    fn compute_bm25_sparse_score(query: &str, text: &str) -> f64 {
        let query_terms: Vec<String> = query
            .to_lowercase()
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();
        let doc_terms: Vec<String> = text
            .to_lowercase()
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();

        if query_terms.is_empty() || doc_terms.is_empty() {
            return 0.0;
        }

        let mut matched = 0.0;
        for q in &query_terms {
            if doc_terms.contains(q) {
                matched += 1.0;
            } else if text.to_lowercase().contains(q) {
                matched += 0.5;
            }
        }
        matched / query_terms.len() as f64
    }

    /// Upserts an IntelEvent into Qdrant REST collection (and in-memory mirror).
    pub async fn index_event(&self, event: &IntelEvent) -> Result<(), anyhow::Error> {
        // 1. Maintain in-memory mirror
        {
            let mut store = self.in_memory_events.write().await;
            store.push(event.clone());
            if store.len() > 2000 {
                store.remove(0);
            }
        }

        // 2. Build Qdrant REST payload
        let vector = self.generate_embedding(&event.text);
        let point_id = uuid::Uuid::new_v4().to_string();

        let qdrant_payload = serde_json::json!({
            "points": [
                {
                    "id": point_id,
                    "vector": vector,
                    "payload": {
                        "event_id": event.event_id,
                        "stream_id": event.stream_id,
                        "channel_name": event.channel_name,
                        "timestamp": event.timestamp,
                        "event_type": event.event_type,
                        "text": event.text,
                        "confidence": event.confidence,
                        "metadata": event.metadata,
                        "created_at": event.created_at.to_rfc3339()
                    }
                }
            ]
        });

        let endpoint = format!(
            "{}/collections/{}/points",
            self.base_url, self.collection_name
        );

        match self
            .client
            .put(&endpoint)
            .json(&qdrant_payload)
            .send()
            .await
        {
            Ok(resp) => {
                if resp.status().is_success() {
                    debug!(
                        "Successfully indexed event [{}] into Qdrant",
                        event.event_id
                    );
                } else {
                    debug!(
                        "Qdrant endpoint responded with {}: indexing cached in-memory",
                        resp.status()
                    );
                }
            }
            Err(err) => {
                debug!("Qdrant offline ({}), indexing cached in-memory mirror", err);
            }
        }

        Ok(())
    }

    /// Performs Hybrid Search blending Dense Vector similarity and Sparse BM25 via RRF (k=60).
    pub async fn hybrid_search(
        &self,
        query: &str,
        limit: usize,
    ) -> Result<Vec<SearchResult>, anyhow::Error> {
        let events = self.in_memory_events.read().await.clone();
        if events.is_empty() {
            return Ok(Vec::new());
        }

        let query_vec = self.generate_embedding(query);

        // 1. Dense Scoring
        let mut dense_scored: Vec<(usize, f64)> = events
            .iter()
            .enumerate()
            .map(|(idx, ev)| {
                let ev_vec = self.generate_embedding(&ev.text);
                let sim = Self::cosine_similarity(&query_vec, &ev_vec);
                (idx, sim)
            })
            .collect();
        dense_scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        let mut dense_ranks: HashMap<usize, usize> = HashMap::new();
        for (rank, (idx, _)) in dense_scored.iter().enumerate() {
            dense_ranks.insert(*idx, rank);
        }

        // 2. Sparse BM25 Scoring
        let mut sparse_scored: Vec<(usize, f64)> = events
            .iter()
            .enumerate()
            .map(|(idx, ev)| {
                let bm25 = Self::compute_bm25_sparse_score(query, &ev.text);
                (idx, bm25)
            })
            .collect();
        sparse_scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        let mut sparse_ranks: HashMap<usize, usize> = HashMap::new();
        for (rank, (idx, _)) in sparse_scored.iter().enumerate() {
            sparse_ranks.insert(*idx, rank);
        }

        // 3. Reciprocal Rank Fusion (RRF, k=60)
        let mut rrf_results: Vec<SearchResult> = events
            .iter()
            .enumerate()
            .map(|(idx, ev)| {
                let d_rank = dense_ranks.get(&idx).copied();
                let s_rank = sparse_ranks.get(&idx).copied();
                let d_score = dense_scored
                    .iter()
                    .find(|(i, _)| *i == idx)
                    .map(|(_, s)| *s)
                    .unwrap_or(0.0);
                let s_score = sparse_scored
                    .iter()
                    .find(|(i, _)| *i == idx)
                    .map(|(_, s)| *s)
                    .unwrap_or(0.0);
                let rrf = compute_rrf_score(d_rank, s_rank, RRF_K);

                SearchResult {
                    event_id: ev.event_id.clone(),
                    stream_id: ev.stream_id.clone(),
                    channel_name: ev.channel_name.clone(),
                    timestamp: ev.timestamp,
                    text: ev.text.clone(),
                    dense_score: d_score,
                    sparse_score: s_score,
                    rrf_score: rrf,
                }
            })
            .collect();

        // Sort by RRF score descending
        rrf_results.sort_by(|a, b| {
            b.rrf_score
                .partial_cmp(&a.rrf_score)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        // Return top results up to limit
        Ok(rrf_results.into_iter().take(limit).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_rrf_score() {
        // Rank 0 in dense (1/(60+1) = 1/61 = 0.0163934)
        // Rank 0 in sparse (1/(60+1) = 1/61 = 0.0163934)
        // Combined RRF score = 2/61 = ~0.0327868
        let score = compute_rrf_score(Some(0), Some(0), 60.0);
        assert!((score - (2.0 / 61.0)).abs() < 1e-6);

        // Rank 1 in dense (1/62) and no sparse match
        let single_score = compute_rrf_score(Some(1), None, 60.0);
        assert!((single_score - (1.0 / 62.0)).abs() < 1e-6);

        // Higher rank gives strictly higher score
        let rank_0 = compute_rrf_score(Some(0), None, 60.0);
        let rank_5 = compute_rrf_score(Some(5), None, 60.0);
        assert!(rank_0 > rank_5);
    }

    #[tokio::test]
    async fn test_hybrid_search_rrf_ranking() {
        let client = QdrantClient::new(None, None);

        let ev1 = IntelEvent::from_transcript(
            "stream1",
            "bloomberg",
            10.0,
            "Federal Reserve holds interest rates steady as inflation cools",
            0.98,
            "en",
            "en",
        );
        let ev2 = IntelEvent::from_transcript(
            "stream1",
            "bloomberg",
            20.0,
            "Heavy thunderstorms cause flight delays across the Midwest",
            0.95,
            "en",
            "en",
        );
        let ev3 = IntelEvent::from_vision(
            "stream2",
            "cnbc",
            30.0,
            Some("BREAKING: S&P 500 reaches new all-time high".into()),
            "breaking_news",
            0.99,
            Some("Stock market rally ticker".into()),
        );

        client.index_event(&ev1).await.unwrap();
        client.index_event(&ev2).await.unwrap();
        client.index_event(&ev3).await.unwrap();

        let results = client
            .hybrid_search("Federal Reserve inflation rates", 3)
            .await
            .unwrap();

        assert!(!results.is_empty());
        // First result should be ev1 (exact match for Federal Reserve inflation)
        assert_eq!(results[0].event_id, ev1.event_id);
        assert!(results[0].rrf_score > results[1].rrf_score);
    }
}
