COMPOSE ?= docker compose

.PHONY: build up down prune test coverage

build:
	$(COMPOSE) build backend frontend

up: build
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

prune:
	$(COMPOSE) down --rmi local --volumes --remove-orphans
	docker image prune -f

test: build
	$(COMPOSE) run --rm backend npm run test:backend
	$(COMPOSE) run --rm frontend npm run test:frontend

coverage: build
	$(COMPOSE) run --rm backend npm run coverage
