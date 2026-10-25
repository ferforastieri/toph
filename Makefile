.PHONY: dev web web-landing build run test fmt mobile docker

web:
	npm install
	npm run build:web
	rm -rf services/toph/internal/webui/dist
	mkdir -p services/toph/internal/webui/dist
	cp -R apps/web/dist/. services/toph/internal/webui/dist/
	touch services/toph/internal/webui/dist/.keep

web-landing:
	npm install
	npm run build:landing

build: web
	mkdir -p bin
	cd services/toph && go build -trimpath -o ../../bin/toph ./cmd/toph

run:
	cd services/toph && go run ./cmd/toph

dev:
	@echo "API:     cd services/toph && go run ./cmd/toph"
	@echo "App:     npm run dev:web"
	@echo "Landing: npm run dev:landing"

test:
	cd services/toph && go test ./...
	npm test

fmt:
	cd services/toph && gofmt -w $$(find . -name '*.go')

mobile:
	npm ci
	cd apps/client && npm run tauri -- android init
	cd apps/client && npm run icons
	cd apps/client && npm run tauri -- android build --debug --apk --target aarch64

docker:
	docker compose -f deploy/compose.yaml up --build
