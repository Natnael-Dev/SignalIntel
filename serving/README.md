# Model Serving (Xinference Orchestration)

SignalIntel utilizes **Xinference** (`xorbitsai/inference`) as its unified multi-model serving engine.

## Capabilities
- **Simultaneous Model Hosting**: Serves Whisper Speech-to-Text and Vector Embedding models concurrently under actor supervision.
- **OpenAI-Compatible REST APIs**:
  - `POST /v1/audio/transcriptions`
  - `POST /v1/audio/translations`
  - `POST /v1/embeddings`
  - `POST /v1/chat/completions`

## Launch Command
```bash
xinference-local --host 0.0.0.0 --port 9997 --log-level INFO
```
