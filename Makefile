.PHONY: dev web build run test fmt android android-editor docker

web:
	cd web && npm install
	cd web && npm run build
	rm -rf internal/webui/dist
	mkdir -p internal/webui/dist
	cp -R web/dist/. internal/webui/dist/
	touch internal/webui/dist/.keep

build: web
	mkdir -p bin
	go build -trimpath -o bin/toph ./cmd/toph

run:
	go run ./cmd/toph

dev:
	@echo "Run 'go run ./cmd/toph' and 'cd web && npm run dev' in separate terminals."

test:
	go test ./...
	cd web && npm test

fmt:
	gofmt -w $$(find . -name '*.go' -not -path './web/node_modules/*')

android-editor:
	cd android/editor && npm install && npm run build

android: android-editor
	cd android && ./gradlew testDebugUnitTest assembleDebug

docker:
	docker compose -f deploy/compose.yaml up --build
