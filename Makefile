COMPOSE ?= docker compose

.PHONY: build up down prune fprune deepprune df test coverage re

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

# Aggressive cleanup: images, containers, volumes, networks, builder cache
deepprune:
	docker system prune -a --volumes -f
	docker builder prune -a -f

# Show Docker disk usage summary
df:
	docker system df -v

test: build
	$(COMPOSE) run --rm frontend npm run test_classes

coverage: build
	$(COMPOSE) run --rm backend npm run coverage
