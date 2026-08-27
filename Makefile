# ==============================================================================
# SignalIntel Master Build & Orchestration Makefile
# ==============================================================================

SHELL := /bin/bash
.DEFAULT_GOAL := help

# Colors for terminal output
CYAN   := \033[0;36m
GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
NC     := \033[0m # No Color

.PHONY: help dev up down restart logs build clean test status fmt

## help: Display this help message with available targets
help:
	@echo ""
	@echo -e "$(CYAN)╔════════════════════════════════════════════════════════════════╗$(NC)"
	@echo -e "$(CYAN)║          SIGNALINTEL — MISSION CONTROL ORCHESTRATION           ║$(NC)"
	@echo -e "$(CYAN)╚════════════════════════════════════════════════════════════════╝$(NC)"
	@echo ""
	@echo -e "$(YELLOW)Available Make Targets:$(NC)"
	@echo ""
	@grep -E '^## [a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = "(: |## )"}; {printf "  $(GREEN)%-12s$(NC) %s\n", $$2, $$3}'
	@grep -E '^## [a-zA-Z_-]+:' $(MAKEFILE_LIST) | grep -v '## .*##' | sed 's/## //' | awk '{printf "  $(GREEN)%-12s$(NC)\n", $$1}'
	@echo ""

## dev: Spin up the entire SignalIntel stack in Docker containers (detached mode)
dev:
	@echo -e "$(CYAN)--> Launching SignalIntel Multimodal Stack (Docker Compose)...$(NC)"
	docker compose up -d --build
	@echo -e "$(GREEN)--> Stack operational!$(NC)"
	@echo -e "    $(CYAN)• Web Console UI:$(NC) http://localhost:3000"
	@echo -e "    $(CYAN)• Rust Brain API:$(NC) http://localhost:8080"
	@echo -e "    $(CYAN)• Python Senses: $(NC) http://localhost:8000"
	@echo -e "    $(CYAN)• Qdrant Engine: $(NC) http://localhost:6333"

## up: Alias for 'make dev'
up: dev

## down: Tear down all running SignalIntel containers
down:
	@echo -e "$(YELLOW)--> Stopping SignalIntel containers...$(NC)"
	docker compose down

## restart: Restart all SignalIntel containers
restart: down dev

## logs: Tail live aggregated logs from all containerized services
logs:
	docker compose logs -f

## status: Check health and running status of all services
status:
	@echo -e "$(CYAN)--> Container Status:$(NC)"
	docker compose ps
	@echo ""
	@echo -e "$(CYAN)--> Rust Gateway Health:$(NC)"
	@curl -s http://localhost:8080/api/v1/health || echo -e "$(RED)Gateway Offline$(NC)"
	@echo ""
	@echo -e "$(CYAN)--> Python Senses Health:$(NC)"
	@curl -s http://localhost:8000/api/v1/health || echo -e "$(RED)Python Offline$(NC)"

## build: Build all services natively (Rust release binaries + UI production bundle)
build:
	@echo -e "$(CYAN)--> Building Rust Crates (release mode)...$(NC)"
	cd crates && cargo build --release
	@echo -e "$(CYAN)--> Building React/Vite UI bundle...$(NC)"
	cd ui && npm run build
	@echo -e "$(GREEN)--> Native builds complete!$(NC)"

## test: Run unit & integration tests across Rust and Python suites
test:
	@echo -e "$(CYAN)--> Running Rust workspace unit tests...$(NC)"
	cd crates && cargo test
	@echo -e "$(CYAN)--> Running Python pipeline tests...$(NC)"
	pytest tests/ -v
	@echo -e "$(GREEN)--> All test suites passed!$(NC)"

## fmt: Format codebase across Rust, Python, and TypeScript
fmt:
	@echo -e "$(CYAN)--> Formatting Rust crates...$(NC)"
	cd crates && cargo fmt --all
	@echo -e "$(CYAN)--> Formatting Python code...$(NC)"
	ruff format services/ tests/ scripts/ || true
	@echo -e "$(GREEN)--> Code formatting complete!$(NC)"

## clean: Tear down containers and wipe temporary build artifacts
clean:
	@echo -e "$(YELLOW)--> Wiping build artifacts and containers...$(NC)"
	docker compose down -v --remove-orphans || true
	rm -rf crates/target
	rm -rf ui/dist ui/node_modules/.vite
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	@echo -e "$(GREEN)--> Clean complete.$(NC)"
