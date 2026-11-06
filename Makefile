.PHONY: dev web web-landing build run test fmt mobile docker

web:
	npm install
	npm run build:web

web-landing:
	npm install
	npm run build:landing

build: web
	mkdir -p bin
	TOPH_VERSION="$${TOPH_VERSION:-0.0.0-dev}" cargo build --release --manifest-path backend/Cargo.toml --bin toph
	cp backend/target/release/toph bin/toph

run:
	cd backend && cargo run --bin toph

dev:
	@echo "API:     cd backend && cargo run --bin toph"
	@echo "App:     npm run dev:web"
	@echo "Landing: npm run dev:landing"

test:
	cargo test --manifest-path backend/Cargo.toml
	npm test

fmt:
	cargo fmt --manifest-path backend/Cargo.toml
	cargo fmt --manifest-path desktop/src-tauri/Cargo.toml
	cargo fmt --manifest-path mobile/src-tauri/Cargo.toml

mobile:
	npm ci
	cd mobile && npm run tauri -- android init
	cd mobile && npm run icons
	cd mobile && npm run android:patch
	cd mobile && npm run tauri -- android build --debug --apk --target aarch64

docker:
	docker compose -f deploy/compose.yaml up --build
