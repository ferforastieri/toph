# Toph Client

Tauri 2 Windows/Linux entrypoint. The launcher UI is in `packages/launcher/`
and the shared Rust runtime is in `packages/native/`. Android has its own
entrypoint in `mobile/`.

## Modes

- **Server:** asks only for a Toph server URL, validates `/api/health`, then opens the normal Toph web app in a native window.
- **Local (desktop only):** asks for a workspace folder, starts the embedded Rust Toph backend on loopback, authenticates the embedded WebView, and opens the local workbench. Closing the workspace window stops the backend and its terminal sessions.

The local backend stores SQLite, the generated local admin password and master key under the app data directory. It does not use or expose a remote server. The workspace folder is passed as `TOPH_WORKSPACES`, so its projects are the local working set.

On Windows the backend uses ConPTY for terminals; on Linux it uses a Unix PTY. The remote server page runs inside the system WebView (WebView2 on Windows, WebKitGTK on Linux) and receives no Tauri IPC capability.

Android is remote-only. The Android app hides local mode and connects to a Toph server URL.

## Development

From the repository root:

```bash
npm install
make build
cd desktop
npm run tauri dev
```

For local mode, the Rust Toph server is embedded in the Tauri process. The launcher picks a folder and starts it on loopback; no `bin/toph` sidecar is needed. The launcher also offers an optional development-environment installer (Git, Node.js, pnpm, Rust, Go and Python).

## Build

```bash
cd desktop
npm run tauri -- build
```

Linux requires WebKitGTK/GTK development packages. Windows requires WebView2 and the MSVC Rust toolchain. The Linux and Windows CI jobs build the Rust server as part of the Tauri binary. Android does not compile the desktop server crate.

## Android

From the repository root:

```bash
npm ci
cd mobile
npm run tauri -- android init
npm run tauri -- android build --debug --apk --target aarch64
```

Requires JDK 21, Android SDK 36 and NDK 28.2. The generated `src-tauri/gen/android` project is intentionally not committed; `tauri android init` recreates it. The Android client is remote-only.
