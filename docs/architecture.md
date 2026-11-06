# Architecture and resource ownership

## Repository

| Root | Owns |
| --- | --- |
| `backend` | Rust API, integrations, persistence and local resources |
| `web` | Shared browser/workbench UI and responsive mobile layouts |
| `desktop` | Tauri desktop configuration, entrypoint and installers |
| `mobile` | Tauri Android configuration, entrypoint, Kotlin and push integration |
| `packages` | Shared UI, icons, branding, native launcher and native runtime |
| `landing/site` | Published static site, independently deployed |
| `landing/preview` | Existing React landing preview, independently built |
| `deploy` | Deployment configuration |

## Backend

The backend is one Rust crate and one runtime. `src/app` composes state, HTTP
routing and lifecycle. `src/platform` contains database initialization,
configuration, cryptography, filesystem events and process infrastructure.

`src/features/<feature>` owns its service, HTTP handlers and repository methods.
Small features need only the files they use. Feature repositories implement
operations on the shared `Store`, which owns one SQLite pool. Queries live in
the feature rather than a central store file.

HTTP route files are private child modules of the server composition module,
using explicit `#[path]` declarations to keep extraction state internal. Existing
public library paths are re-exported by `lib.rs`, preserving the embedded desktop
API. Native agent execution lives in `features/agents`; `features/integrations`
contains the native MCP and email clients. See [native harness](native-harness.md).

## Frontend

- `src/app`: startup, workbench composition, application state and mobile layouts.
- `src/features/<feature>`: components, state, feature hooks and adjacent tests.
- `src/shared`: HTTP transport, generic UI, platform helpers and the vendor design system.
- Share feature-specific UI through its feature; generic components belong in shared UI.
- Native shells compile the same launcher and runtime source, with separate packaging.

## Performance rules implemented

1. The workbench loads after authentication. Settings sections and agent configuration,
   gallery and session dialogs load on demand. Editors, terminals and database views
   retain their lazy boundaries. TextMate loads only for JavaScript/TypeScript editors.
2. HTTP transport coalesces overlapping identical GETs, up to 128 pending keys.
   Responses are not cached. Mutations and server changes invalidate sharing;
   caller-owned AbortSignals are never shared.
3. Chat startup reads one contiguous page of at most 160 records, replacing two
   role-specific pages of up to 400 each. Older pages use the server cursor and
   load 80 records at a time. Original history remains in SQLite.
4. Layout persistence uses one debounce for layout and agent metadata. Editor text
   and streamed message updates do not trigger workspace layout writes. Message
   persistence retains its separate queue and stops retry timers on unmount.
5. The project WebSocket survives project switches, coalesces events at fixed
   intervals, and forwards events for the active project. Focus/visibility events
   share a short refresh throttle. AI configuration/models do not reload on every
   project switch; opening/closing editor tabs no longer refreshes Git status.
6. Filesystem event queues are bounded at 256 items. Overflow triggers resync.
   Watcher workers hold weak references, so unwatch/shutdown can release OS resources.
   The maintenance task also holds a weak reference to application state.
7. Rate-limiter entries are periodically reclaimed. Embedded static files use
   borrowed byte buffers in release builds rather than copying each asset per request.
8. Production source maps are opt-in with `TOPH_SOURCEMAP=true`.

## Validation

```sh
npm ci
npm run check:architecture
npm test
npx tsc --noEmit -p web/tsconfig.json
npm run build:web
npm run measure:web
npm run build:desktop
npm run build:mobile
npm run build:landing
cargo fmt --manifest-path backend/Cargo.toml --check
cargo test --manifest-path backend/Cargo.toml
cargo check --manifest-path desktop/src-tauri/Cargo.toml
```

Native Android packaging needs its SDK/NDK and Rust target; the mobile Vite build
alone verifies the launcher bundle, not an APK. Windows installers require the
Windows toolchain. CI paths and release component detection follow the new roots;
desktop rebuilds when its embedded backend or web app changes.

## Measuring

Compare identical scenarios: signed-out startup, an open project, a long chat,
an editor and terminal, then closing the project. Record browser heap/DOM nodes,
network requests and backend RSS/thread counts. Bundle entry size is a loading
metric, not a measurement of runtime RAM. The native harness was implemented
after the folder reorganization; its limits and checks are documented separately.

### Results of this migration

- Main JS entry: approximately **1,454.81 kB → 430.98 kB** (about 70% smaller).
  This compares the entry file, not the total authenticated workbench download.
- Current HTML entry plus explicit JS preloads: **494,474 bytes** uncompressed;
  `npm run measure:web` reports each file and compressed estimates reproducibly.
- Initial local chat history: **2 requests / up to 800 records → 1 request /
  up to 160 records**, with contiguous cursor-based pagination for older data.
- **58 frontend tests** and **20 backend tests** passed, including concurrent-read
  deduplication, layout persistence, event connection ownership and resource release.
- Web, launcher and landing builds passed; desktop native Cargo check passed;
  an ARM64 Android debug APK was built and its signature verified.
- Browser interaction and heap profiling still require a connected desktop browser;
  these bundle and lifecycle results do not establish a percentage reduction in RAM.
