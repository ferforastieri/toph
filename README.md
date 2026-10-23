# Toph

**Toph** is a self-hosted workbench for your homelab. It brings code, databases, AI sessions and web apps into one place, with a workspace that feels close to VS Code and runs in your browser or as an Android app.

Toph is built for people who keep their own services, repositories and data on machines they control. There is no hosted account, no vendor backend and no telemetry.

## Public pages

- `/` — redirects to the workbench.
- `/app` — the workbench (sign-in required).

The installed server does not serve the landing page or documentation. The landing source lives in `web/landing/` for separate local work only; it is not part of the installer, release or backend bundle.

## What it does

- Browse and edit project files with tabs, a file tree, search and Git status.
- Run a real terminal attached to the server.
- Edit SQL table rows with primary-key safety.
- Connect to PostgreSQL, MySQL/MariaDB, SQLite, SQL Server, Oracle, ClickHouse, Cassandra, MongoDB, Redis, Elasticsearch and Neo4j, inspect schemas, run queries and inspect results.
- Talk to OpenCode, OpenAI-compatible endpoints, Codex, Claude or Ollama from the Agent tab without leaving the workbench.
- Configure the AI URL, API key and model in Settings → AI; API keys are encrypted at rest.
- Enable editor autocomplete backed by the configured AI provider.
- Add server folders as workspace roots in Settings → Workspace, without Docker bind mounts.
- Keep web apps from the homelab in their own tabs.
- Switch between projects without losing the state of the current one.
- Use the same backend from the browser and from the Android app.
- Get an in-app toast when a new web build or Android release is available.
- Personalize the web app with light/dark/auto themes, the Toph brand palette, Night Wolf Black, accents, liquid-glass intensity, backgrounds, radius, density, sidebar width, editor and terminal typography, tab styles, and file icon themes.

## Repository layout

```text
backend/   Go API, workspace, terminals, databases, OpenCode proxy
mobile/    Android app (Kotlin/Compose)
web/       web application plus landing source (separate builds)
deploy/    Docker Compose
```

The backend embeds only the application. The landing page is never installed, embedded, released or served by the Toph server.

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

## Security

- Passwords use Argon2id; sessions are stored as token hashes.
- Browser sessions use `HttpOnly`, `Secure` and `SameSite=Strict` cookies when `TOPH_SECURE_COOKIES=true`.
- Cookie-authenticated mutations require a double-submit CSRF token.
- Login and API endpoints have per-client rate limits.
- `X-Forwarded-For` is only trusted from loopback or the CIDRs in `TOPH_TRUSTED_PROXIES`.
- The OpenCode proxy drops browser cookies and authorization headers before forwarding.
- API responses use `Cache-Control: no-store` and responses are protected against framing.

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
cd backend
go run ./cmd/toph
```

In another terminal:

```sh
cd web
npm install
npm run dev:app
```

Landing source, separately (not part of the installable app):

```sh
cd web
npm run dev:landing
```

App: `http://localhost:5173/app/`. Landing source: `http://localhost:5174/`.

### Production build

```sh
make build
./bin/toph
```

`make build` builds the web client and embeds it into the Go binary. Open `http://127.0.0.1:8787`.

### One-command install

On a Debian/Ubuntu server or LXC:

```sh
curl -fsSL https://github.com/ferforastieri/toph/releases/latest/download/install.sh | sudo sh
```

The installer creates the `toph` user, installs the binary, creates a systemd
service, generates the first password and starts Toph on port `8787`.

### Docker

```sh
TOPH_WORKSPACES_HOST=/srv/workspaces docker compose -f deploy/compose.yaml up --build
```

Mount the repositories you want to expose under `/workspaces` and keep `TOPH_DATA_DIR` on a persistent volume. The container runs as UID 1000; make sure the mounted workspace is writable by that user, or adjust the Compose `user:` setting.

### Android

Download the signed APK from [GitHub Releases](https://github.com/ferforastieri/toph/releases). Debug APKs are not published.

For development, the mobile client lives in `mobile/`. It needs JDK 17+, Android SDK 36 and either `ANDROID_HOME` or `mobile/local.properties` pointing at the SDK. A local debug build is only for development:

```sh
cd mobile
./gradlew assembleDebug
```

It connects to the Toph server URL configured during onboarding. Use LAN, VPN or Tailscale; do not expose the server directly to the internet.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `TOPH_ADDR` | `127.0.0.1:8787` | HTTP listen address |
| `TOPH_DATA_DIR` | `./data` | SQLite, master key and runtime data |
| `TOPH_WORKSPACES` | `/workspaces` | Colon-separated roots that projects may use |
| `TOPH_ADMIN_PASSWORD` | generated on first run | Initial admin password |
| `TOPH_SECURE_COOKIES` | `false` | Require HTTPS for browser sessions; the installer sets `true` |
| `TOPH_TRUSTED_PROXIES` | empty | Comma-separated proxy IPs/CIDRs allowed to supply `X-Forwarded-For` |
| `TOPH_OPENCODE_URL` | `http://127.0.0.1:3005` | Fallback OpenCode server; Settings → AI overrides it |
| `TOPH_OPENCODE_AUTH` | empty | Fallback raw `Authorization` value for OpenCode |
| `TOPH_WEB_DIR` | embedded build | Serve a web build from disk in development |

## Security

Toph can read files, open shells and reach databases. Treat it as a remote administration tool:

- bind it to localhost, LAN or a VPN;
- put TLS in front of it;
- use a strong password and keep the data directory private;
- do not publish it on the public internet.

## License

MIT.
