```
  ███████╗██╗ ██████╗ ███╗   ██╗ █████╗ ██╗     ██╗███╗   ██╗████████╗███████╗██╗     
  ██╔════╝██║██╔════╝ ████╗  ██║██╔══██╗██║     ██║████╗  ██║╚══██╔══╝██╔════╝██║     
  ███████╗██║██║  ███╗██╔██╗ ██║███████║██║     ██║██╔██╗ ██║   ██║   █████╗  ██║     
  ╚════██║██║██║   ██║██║╚██╗██║██╔══██║██║     ██║██║╚██╗██║   ██║   ██╔══╝  ██║     
  ███████║██║╚██████╔╝██║ ╚████║██║  ██║███████╗██║██║ ╚████║   ██║   ███████╗███████╗
  ╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝╚══════╝╚═╝╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚══════╝
  =====================================================================================
  AUTONOMOUS MULTIMODAL BROADCAST INTELLIGENCE & REAL-TIME DISPATCH PLATFORM [v1.0.0]
```

[![Rust](https://img.shields.io/badge/Rust-1.80%2B-orange?style=flat-square&logo=rust)](https://www.rust-lang.org/)
[![Python](https://img.shields.io/badge/Python-3.11%2B-blue?style=flat-square&logo=python)](https://www.python.org/)
[![React](https://img.shields.io/badge/React-18.3-cyan?style=flat-square&logo=react)](https://react.dev/)
[![Qdrant](https://img.shields.io/badge/Qdrant-v1.11-red?style=flat-square&logo=qdrant)](https://qdrant.tech/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

---

## 🛰️ Overview

**SignalIntel** is an end-to-end, high-density broadcast signals intelligence (SIGINT/OSINT) platform engineered to continuously ingest, transcribe, translate, visually inspect, index, and monitor live global video and audio streams with sub-second alert dispatch.

Combining Python-based media processing with high-throughput Rust distributed memory and retrieval architecture, SignalIntel extracts actionable intelligence from live multilingual broadcasts simultaneously.

---

## 🏛️ System Architecture

```
                                  LIVE BROADCASTS
                    (CNN, BBC, Al Jazeera, Reuters, RT Arabic, DW)
                                         │
                                         ▼
                      ┌────────────────────────────────────┐
                      │    PYTHON MEDIA SENSES (:8000)     │
                      ├────────────────────────────────────┤
                      │ • FFmpeg Ring-Buffer Ingestion     │
                      │ • Faster-Whisper ASR + Deep Trans  │
                      │ • RoI Tesseract Ticker Extraction  │
                      │ • LiteLLM / LLaVA-7b Scene VLM     │
                      └──────────────────┬─────────────────┘
                                         │ JSON Events over Async HTTP / WS
                                         ▼
                      ┌────────────────────────────────────┐
                      │     RUST HYBRID BRAIN (:8080)      │
                      ├────────────────────────────────────┤
                      │ • Event Routing & Serialization    │
                      │ • Reciprocal Rank Fusion (k=60)    │
                      │ • Priority Rule Engine (P1/P2/P3)  │
                      │ • Ring-Buffer Alert Journal        │
                      └──────────┬───────────────────┬─────┘
                                 │                   │
                     Indexed     │                   │ Omnichannel
                     Payloads    │                   │ Dispatches
                                 ▼                   ▼
                      ┌────────────────┐   ┌───────────────────────────┐
                      │ QDRANT DB      │   │ TELEGRAM / WEBHOOKS       │
                      │ (:6333)        │   │ P1 Alert Notifications    │
                      └────────────────┘   └───────────────────────────┘
                                 ▲
                                 │ REST Hybrid Search / WS Feeds
                                 │
                      ┌────────────────────────────────────┐
                      │   INTELLIGENCE CONSOLE UI (:3000)  │
                      ├────────────────────────────────────┤
                      │ • 2×2 Broadcast Monitors Grid      │
                      │ • Live Multilingual Transcriptions │
                      │ • Prioritized Critical Alert Queue │
                      │ • Client-Side Entity Tracker (NER) │
                      │ • Semantic RAG Explorer (Auto-Run) │
                      │ • 12-Node Pipeline Health Monitor  │
                      └────────────────────────────────────┘
```

---

## ⚡ Quick Start

### 1. One-Click Docker Deployment (Recommended)

Spin up the entire multimodal containerized cluster with a single command:

```bash
# Clone the repository
git clone https://github.com/Natnael-Dev/SignalIntel.git
cd SignalIntel

# Copy environment configuration
cp .env.example .env

# Launch entire containerized fleet in detached mode
make dev
```

Once running, access the services:
- 🖥️ **Intelligence Console UI**: [http://localhost:3000](http://localhost:3000)
- 🦀 **Rust Brain Gateway & API**: [http://localhost:8080](http://localhost:8080)
- 🐍 **Python Media Services API**: [http://localhost:8000](http://localhost:8000)
- 📊 **Qdrant Vector Database**: [http://localhost:6333/dashboard](http://localhost:6333/dashboard)

---

## 📋 Master Makefile Commands

The root `Makefile` provides complete lifecycle control:

| Target | Description |
|---|---|
| `make dev` | Spin up all 4 Docker containers with live builds and health checks |
| `make down` | Gracefully tear down container fleet |
| `make restart` | Rebuild and restart the container fleet |
| `make logs` | Tail aggregated live stream logs from all services |
| `make status` | Query operational telemetry and health endpoints |
| `make build` | Perform native release builds for Rust crates and UI bundle |
| `make test` | Execute unit and integration tests across Rust & Python |
| `make fmt` | Enforce code formatting standards across Rust, Python & TS |
| `make clean` | Purge transient caches, build artifacts, and Docker volumes |
| `make help` | Display formatted interactive help menu |

---

## ⚙️ Configuration & Telegram Alerts

SignalIntel uses `.env` at the root for cluster coordination:

```ini
# ==========================================
# 1. Python Media Services (Port 8000)
# ==========================================
PORT=8000
SIGNALINTEL_VISION_MODEL=llava:7b
SIGNALINTEL_BRAIN_URL=http://signalintel-brain:8080/api/v1/ingest

# ==========================================
# 2. Rust Brain & Gateway (Port 8080)
# ==========================================
GATEWAY_PORT=8080
QDRANT_URL=http://qdrant:6333
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ

# ==========================================
# 3. UI Console (Port 3000)
# ==========================================
VITE_PYTHON_URL=http://localhost:8000
VITE_PYTHON_WS_URL=ws://localhost:8000
VITE_BRAIN_URL=http://localhost:8080
VITE_OPERATOR=J.WARREN
```

### Setting up Live Telegram Notifications
1. Create a bot using [@BotFather](https://t.me/BotFather) on Telegram and obtain your API Token.
2. Set `TELEGRAM_BOT_TOKEN` in your `.env`.
3. When P1/P2 events match active keyword rules (e.g. `breaking news`, `military exercises`, `carrier strike group`), formatted alert digests with timestamps and channel origin are instantly dispatched.

---

## 🔌 API Reference

### Rust Brain Gateway (`:8080`)
- `POST /api/v1/ingest` — Ingests transcript & vision events, performs Qdrant indexing, evaluates rules, and dispatches bot alerts.
- `GET /api/v1/search?q={query}&limit={n}` — Multimodal hybrid search fusing Dense embeddings + Sparse keyword ranks via Reciprocal Rank Fusion ($k=60$).
- `GET /api/v1/alerts` — Returns chronological 200-entry ring buffer journal of all triggered intelligence alerts.
- `GET /api/v1/alerts/rules` — Returns registered alert rules and priority assignments.
- `POST /api/v1/alerts/rules` — Dynamically registers a new keyword monitoring rule.
- `GET /api/v1/health` — Returns node uptime, active rule count, and Qdrant cluster targets.

### Python Senses Gateway (`:8000`)
- `WS /api/v1/ws/transcripts` — Real-time bi-directional WebSocket broadcasting live transcript and OCR events.
- `GET /api/v1/streams` — Active FFmpeg stream capture worker telemetry.
- `GET /api/v1/health` — Media pipeline health status.

---

## 🛡️ License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
