# Prosper Challenge — run everything from the repo root.
# Dependencies are managed with uv (https://docs.astral.sh/uv/).

PROJECT := backend

.PHONY: help install run api frontend dev up down demo demo-check check-guidelines lint format test clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

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

demo-check: ## Replay every demo run against the seeded agents (before only) and print the table; needs OPENAI_API_KEY (ARGS='--agent ID --run ID')
	uv run --directory $(PROJECT) python -m replay.check $(ARGS)

check-guidelines: ## Check a real copilot build of a sample (SAMPLE=name, MODEL=haiku|sonnet, DUMP=file); needs the claude CLI
	uv run --directory $(PROJECT) python -m demo.check_build $(SAMPLE) $(if $(MODEL),--model $(MODEL)) $(if $(DUMP),--dump $(DUMP))

lint: ## Check everything without changing files: ruff, ESLint, tsc, formatting
	uv run --directory $(PROJECT) ruff check .
	uv run --directory $(PROJECT) ruff format --check .
	cd frontend && npm run lint
	cd frontend && npm run format:check

format: ## Auto-fix formatting and lint in backend and frontend
	uv run --directory $(PROJECT) ruff format .
	uv run --directory $(PROJECT) ruff check --fix .
	cd frontend && npm run format

test: ## Run backend (pytest), frontend (Vitest) and the Playwright smoke spec
	uv run --directory $(PROJECT) pytest
	cd frontend && npm install && npm test && npx playwright install chromium && npm run e2e

clean: ## Remove the venv and Python caches
	rm -rf $(PROJECT)/.venv frontend/node_modules frontend/dist
	find $(PROJECT) -type d -name __pycache__ -prune -exec rm -rf {} +
