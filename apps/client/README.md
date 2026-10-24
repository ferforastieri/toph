# Toph Client

Tauri 2 client for Toph. This project contains both the Windows/Linux desktop app and the remote-only Android target.

## Modes

- **Server:** asks only for a Toph server URL, validates `/api/health`, then opens the normal Toph web app in a native window.
- **Local (desktop only):** asks for a workspace folder, starts the bundled Toph Go backend on loopback, authenticates the embedded WebView, and opens the local workbench. Closing the workspace window stops the backend and its terminal sessions.

The local backend stores SQLite, the generated local admin password and master key under the app data directory. It does not use or expose a remote server. The workspace folder is passed as `TOPH_WORKSPACES`, so its projects are the local working set.

On Windows the backend uses ConPTY for terminals; on Linux it uses a Unix PTY. The remote server page runs inside the system WebView (WebView2 on Windows, WebKitGTK on Linux) and receives no Tauri IPC capability.

Android is remote-only. Tauri mobile cannot run an external sidecar, so the Android app hides local mode and connects to a Toph server URL.

## Development

From the repository root:

```bash
npm install
make build
cd apps/client
npm run tauri dev
```

For local mode, `make build` creates `bin/toph`; the launcher can then pick a folder and start it.

## Build

```bash
cd apps/client
npm run tauri -- build
```

Linux requires WebKitGTK/GTK development packages. Windows requires WebView2 and the MSVC Rust toolchain. The Linux and Windows CI jobs build the matching Go sidecar from `services/toph` before Tauri and bundle it as a resource.

## Android

From the repository root:

```bash
npm ci
cd apps/client
npm run tauri -- android init
npm run tauri -- android build --debug --apk --target aarch64
```

Requires JDK 21, Android SDK 36 and NDK 28.2. The generated `src-tauri/gen/android` project is intentionally not committed; `tauri android init` recreates it. The Android client is remote-only.
