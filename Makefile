.PHONY: dev server web eval test docker-up docker-down

server:
	cd server && uv run python -m people_mcp.server

web:
	cd web && npm run dev

dev:
	@echo "Run 'make server' and 'make web' in separate terminals."

eval:
	cd server && uv run --extra dev python -m eval.run_eval

test:
	cd server && uv run pytest
	cd web && npm test

docker-up:
	docker compose up

docker-down:
	docker compose down -v
