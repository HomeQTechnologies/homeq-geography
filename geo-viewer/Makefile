.PHONY: help install dev start stop build test preview

PORT ?= 9009
NPM ?= npm

help:
	@echo "Geo viewer"
	@echo ""
	@echo "  make install   Install dependencies"
	@echo "  make dev       Start dev server (http://localhost:$(PORT))"
	@echo "  make start     Alias for make dev"
	@echo "  make stop      Stop dev server on port $(PORT)"
	@echo "  make build     Production build"
	@echo "  make test      Run tests"
	@echo "  make preview   Preview production build"
	@echo ""
	@echo "  Mesh files: geo-viewer/workspace/meshes (GEO_VIEWER_MESH_DIR in .env)"

install:
	$(NPM) install

dev start:
	$(NPM) run dev

stop:
	@lsof -ti :$(PORT) | xargs -r kill && echo "Stopped server on port $(PORT)" || echo "No server running on port $(PORT)"

build:
	$(NPM) run build

test:
	$(NPM) run test -- --run

preview:
	$(NPM) run preview
