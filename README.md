# Toph

**Toph** is a self-hosted workbench for your homelab. It brings code, databases, AI sessions and web apps into one place, with a workspace that feels close to VS Code and runs in your browser or as an Android app.

Toph is built for people who keep their own services, repositories and data on machines they control. There is no hosted account, no vendor backend and no telemetry.

## What it does

- Browse and edit project files with tabs, a file tree, search and Git status.
- Run a real terminal attached to the server.
- Connect to SQL databases, inspect schemas, run queries and inspect results.
- Talk to an OpenCode server without leaving the workbench.
- Keep web apps from the homelab in their own tabs.
- Switch between projects without losing the state of the current one.
- Use the same backend from the browser and from the Android app.

## Architecture

```text
Browser (React)                     Android (Kotlin/Compose)
        │                                    │
        └──────────── HTTPS / WSS ───────────┘
                          │
                    toph (Go)
        ├── auth and sessions
        ├── projects and workspace files
        ├── terminal (PTY over WebSocket)
        ├── database gateway
        ├── OpenCode proxy
        └── web target registry
                          │
        repositories · PostgreSQL · SQLite · MySQL · OpenCode
```

The Go server is the only component that touches repositories, database credentials and shells. Clients are thin: they render tabs and stream data. The browser build is embedded in the Go binary; the Android app connects to the same API.

## Run it

### Requirements

- Go 1.26+
- Node.js 22+
- SQLite (embedded through `modernc.org/sqlite`)
- Linux, macOS or a Linux container
- Docker and Docker Compose v2, optional

### Development

```sh
cp .env.example .env
go run ./cmd/toph
```

In another terminal:

```sh
cd web
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies `/api` and WebSocket traffic to `http://127.0.0.1:8787`.

### Production build

```sh
make build
./bin/toph
```

`make build` builds the web client and embeds it into the Go binary. Open `http://127.0.0.1:8787`.

### Docker

```sh
TOPH_WORKSPACES_HOST=/srv/workspaces docker compose -f deploy/compose.yaml up --build
```

Mount the repositories you want to expose under `/workspaces` and keep `TOPH_DATA_DIR` on a persistent volume. The container runs as UID 1000; make sure the mounted workspace is writable by that user, or adjust the Compose `user:` setting.

### Android

The Android client lives in `android/`. It needs JDK 17+, Android SDK 36 and either `ANDROID_HOME` or `android/local.properties` pointing at the SDK. Build a debug APK with:

```sh
cd android
./gradlew assembleDebug
```

The APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. It connects to the Toph server URL configured during onboarding. Use LAN, VPN or Tailscale; do not expose the server directly to the internet.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `TOPH_ADDR` | `127.0.0.1:8787` | HTTP listen address |
| `TOPH_DATA_DIR` | `./data` | SQLite, master key and runtime data |
| `TOPH_WORKSPACES` | `/workspaces` | Colon-separated roots that projects may use |
| `TOPH_ADMIN_PASSWORD` | generated on first run | Initial admin password |
| `TOPH_SECURE_COOKIES` | `false` | Require HTTPS for browser sessions |
| `TOPH_OPENCODE_URL` | `http://127.0.0.1:3005` | OpenCode server |
| `TOPH_OPENCODE_AUTH` | empty | Raw `Authorization` value for OpenCode |
| `TOPH_WEB_DIR` | embedded build | Serve a web build from disk in development |

## Security

Toph can read files, open shells and reach databases. Treat it as a remote administration tool:

- bind it to localhost, LAN or a VPN;
- put TLS in front of it;
- use a strong password and keep the data directory private;
- do not publish it on the public internet.

## License

MIT.
