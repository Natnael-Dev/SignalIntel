# SignalIntel

> **Real-time Polyglot Multimodal Intelligence & Stream Processing Platform**

SignalIntel is a unified signal intelligence platform designed to ingest multi-stream video, audio, and visual data, orchestrate real-time transcription and translation, perform OCR on visual tickers, and deliver low-latency hybrid RAG retrieval and automated alerting.

---

## 🏗️ Polyglot Architecture Overview

SignalIntel is structured as a high-performance polyglot monorepo:

```text
SignalIntel/
├── scripts/                    # Automation and developer workflows
│   └── commit_human.py         # Git history simulation & authoring
├── crates/                     # High-Performance Rust Workspace (The Brain)
│   ├── core/                   # GeneralBots-derived Core (RAG, Rule Engine, Alerts)
│   ├── ocr/                    # Kreuzberg/Xberg OCR FFI & Bounding Box Extractor
│   └── Cargo.toml              # Workspace Root Manifest
├── services/                   # Python AI & Media Pipelines (The Senses)
│   ├── ingestion/              # SatelliteEye-derived Video/Stream Ingestion
│   ├── audio/                  # SubForge-derived Silero VAD + Faster-Whisper + Translation
│   ├── vision/                 # Scene Classification & VLM Analysis
│   └── requirements.txt        # Verified Pipeline Dependencies
├── serving/                    # Xinference Multi-Model Serving & Orchestration
├── ui/                         # Real-time Signal Monitoring Dashboard (Phase 6)
├── docker/                     # Container Definitions for Rust & Python microservices
├── pyproject.toml              # Python Workspace Configuration
└── README.md
```

---

## 🔬 Verified Architectural Foundations (Forensic Audit Summary)

SignalIntel integrates verified subsystem patterns backed by live manifest audits:

| Subsystem | Verified Source Baseline | Forensic Reality & Architectural Strategy |
|---|---|---|
| **Audio Pipeline** | `yumiaura/SubForge` | Uses `faster-whisper` (Silero VAD via `vad_filter=True`) + `deep-translator` + `srt`. |
| **Stream Ingestion** | `byerlikaya/SatelliteEye` | Asynchronous `ffmpeg` subprocess capture (`pcm_s16le`, 16kHz audio, scaled 720p PNG frames) + `litellm` VLM interface. |
| **Core Brain & RAG** | `generalbots/generalbots` | 100% Rust workspace with Axum gateway, Tokio runtime, Reciprocal Rank Fusion (RRF k=60), and Task Manifest alert evaluation. |
| **OCR Intelligence** | `xberg-io/xberg` (Kreuzberg) | Native Rust FFI document intelligence and Tesseract / ONNX OCR bindings. |
| **Model Serving** | `xorbitsai/inference` (Xinference) | Actor-supervised multi-model runtime concurrently hosting Whisper STT and dense embedding models via OpenAI-compatible endpoints. |

---

## 🚀 Quick Start

### Rust Workspace
```bash
cd crates
cargo build
```

### Python Services
```bash
# Using uv or pip
pip install -r services/requirements.txt
```

### Model Serving (Xinference)
```bash
xinference-local --host 0.0.0.0 --port 9997
```

---

## 📜 License
MIT License
