# Primordial Soup — convenience targets. Override vars on the command line, e.g.
#   make up PORT=9000        make game PLAYERS=4
.DEFAULT_GOAL := help

IMAGE     ?= primordial-soup
CONTAINER ?= primordial-soup
PORT      ?= 8787
PLAYERS   ?= 3
BASE_URL  ?= http://localhost:$(PORT)

.PHONY: help build up down restart logs game dev test typecheck

help: ## Show this help
	@echo "Primordial Soup — make targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

build: ## Build the single Docker image (client + server)
	docker build -f docker/Dockerfile -t $(IMAGE) .

up: ## Run the image in the background on $(PORT)
	docker run -d --rm --name $(CONTAINER) -p $(PORT):8787 \
	  -e PORT=8787 -e PUBLIC_BASE_URL=$(BASE_URL) $(IMAGE)
	@echo "Primordial Soup is up at $(BASE_URL) — create a game with 'make game'"

down: ## Stop and remove the running container
	-docker rm -f $(CONTAINER)

restart: down up ## Restart the container

logs: ## Follow the container logs
	docker logs -f $(CONTAINER)

game: ## Create a game and print one seat link per player (PLAYERS=3)
	@echo "Seat links (open each in a browser):"
	@curl -s -XPOST $(BASE_URL)/api/games -H 'content-type: application/json' \
	  -d '{"playerCount":$(PLAYERS)}' | grep -oE 'http://[^"]+/play[^"]+' \
	  || echo "  Could not reach $(BASE_URL) — is the server up? Try 'make up' or 'make dev'."

dev: ## Print the two commands to run the dev servers (hot reload, no Docker)
	@echo "Run these in two terminals from the repo root:"
	@echo "  npm run dev:server   # server + WS on :8787"
	@echo "  npm run dev:client   # Vite client on :5173 (proxies /api and /ws)"
	@echo "Then: make game BASE_URL=http://localhost:5173"

test: ## Run the full Vitest suite
	npm test

typecheck: ## Type-check every workspace
	npm run typecheck
