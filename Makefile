COMPOSE ?= docker compose

.PHONY: build up down prune fprune test coverage

build:
	$(COMPOSE) build backend frontend

up: build
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

prune:
	$(COMPOSE) down --rmi local --volumes --remove-orphans
	docker image prune -f

fprune: prune
	rm -rf coverage .nyc_output build dist frontend/dist node_modules

test: build
	$(COMPOSE) run --rm backend npm run test:backend
	$(COMPOSE) run --rm frontend npm run test:frontend

coverage: build
	$(COMPOSE) run --rm backend npm run coverage
