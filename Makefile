.PHONY: dev web web-landing build run test fmt mobile mobile-editor docker

web:
	cd web && npm install
	cd web && npm run build:app
	rm -rf backend/internal/webui/dist
	mkdir -p backend/internal/webui/dist
	cp -R web/dist/app/. backend/internal/webui/dist/
	touch backend/internal/webui/dist/.keep

web-landing:
	cd web && npm install
	cd web && npm run build:landing

build: web
	mkdir -p bin
	cd backend && go build -trimpath -o ../bin/toph ./cmd/toph

run:
	cd backend && go run ./cmd/toph

dev:
	@echo "API:     cd backend && go run ./cmd/toph"
	@echo "App:     cd web && npm run dev:app"
	@echo "Landing: cd web && npm run dev:landing"

test:
	cd backend && go test ./...
	cd web && npm test

fmt:
	cd backend && gofmt -w $$(find . -name '*.go')

mobile-editor:
	cd mobile/editor && npm install && npm run build

mobile: mobile-editor
	cd mobile && ./gradlew testDebugUnitTest assembleDebug

docker:
	docker compose -f deploy/compose.yaml up --build
