.PHONY: dev web web-landing build run test fmt mobile docker

web:
	npm install
	npm run build:web

web-landing:
	npm install
	npm run build:landing

build: web
	mkdir -p bin
	TOPH_VERSION="$${TOPH_VERSION:-0.0.0-dev}" cargo build --release --manifest-path services/toph/Cargo.toml --bin toph
	cp services/toph/target/release/toph bin/toph

run:
	cd services/toph && cargo run --bin toph

dev:
	@echo "API:     cd services/toph && cargo run --bin toph"
	@echo "App:     npm run dev:web"
	@echo "Landing: npm run dev:landing"

test:
	cargo test --manifest-path services/toph/Cargo.toml
	npm test

fmt:
	cargo fmt --manifest-path services/toph/Cargo.toml
	cargo fmt --manifest-path apps/client/src-tauri/Cargo.toml

mobile:
	npm ci
	cd apps/client && npm run tauri -- android init
	cd apps/client && npm run icons
	cd apps/client && npm run android:patch
	cd apps/client && npm run tauri -- android build --debug --apk --target aarch64

docker:
	docker compose -f deploy/compose.yaml up --build
