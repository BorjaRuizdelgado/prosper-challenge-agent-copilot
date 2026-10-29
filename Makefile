# Prosper Challenge — run everything from the repo root.
# Dependencies are managed with uv (https://docs.astral.sh/uv/).

PROJECT := backend

.PHONY: help install run api frontend dev up down demo test clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Create the venv and install dependencies (from uv.lock)
	uv sync --directory $(PROJECT)

run: ## Run the voice runner on :7860 (calls are started from the builder UI)
	uv run --directory $(PROJECT) python bot.py

api: ## Run the agents API on :8000
	uv run --directory $(PROJECT) uvicorn api.app:app --port 8000 --reload

frontend: ## Run the Vite dev server on :5173 (proxies /api and /voice)
	cd frontend && npm install && npm run dev

dev: ## Run API, voice runner and frontend together (open http://localhost:5173)
	@trap 'kill $$(jobs -p) 2>/dev/null' INT TERM EXIT; \
		$(MAKE) api & $(MAKE) run & $(MAKE) frontend & wait

up: install ## One command: install everything, create backend/.env if missing, run all services
	@test -f $(PROJECT)/.env || { cp $(PROJECT)/.env.example $(PROJECT)/.env; \
		echo ">> Created $(PROJECT)/.env — add your OPENAI_API_KEY and ELEVENLABS_API_KEY for voice calls."; }
	cd frontend && npm install
	@echo ">> Open http://localhost:5173"
	@$(MAKE) dev

down: ## Stop the API, voice runner and frontend (by process and by port)
	@pkill -f "[u]vicorn api.app" 2>/dev/null; \
		pkill -f "[p]ython bot.py" 2>/dev/null; pkill -f "[f]rontend/node_modules/.bin/vite" 2>/dev/null; \
		sleep 1; \
		for port in 8000 7860 5173; do \
			pids=$$(lsof -ti tcp:$$port -sTCP:LISTEN); \
			if [ -n "$$pids" ]; then kill -9 $$pids; fi; \
		done; echo "Stopped."

demo: ## Seed the demo agents into the agents directory, resetting them if they exist
	uv run --directory $(PROJECT) python -m demo.seed

test: ## Run backend (pytest), frontend (Vitest) and the Playwright smoke spec
	uv run --directory $(PROJECT) pytest
	cd frontend && npm install && npm test && npx playwright install chromium && npm run e2e

clean: ## Remove the venv and Python caches
	rm -rf $(PROJECT)/.venv frontend/node_modules frontend/dist
	find $(PROJECT) -type d -name __pycache__ -prune -exec rm -rf {} +
