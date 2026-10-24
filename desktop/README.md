# Toph Desktop

Desktop shell for Toph, built with Tauri 2.

## Modes

- **Server:** asks only for a Toph server URL, validates `/api/health`, then opens the normal Toph web app in a native window.
- **Local:** reserved for a bundled/local Toph backend. Currently reports that the local backend is not available in this build.

The same project builds the Windows and Linux installers with a system WebView and a size-optimized release profile. The remote page runs inside the system webview (WebView2 on Windows, WebKitGTK on Linux); it does not receive Tauri IPC capabilities.

## Development

```bash
npm install
npm run tauri dev
```

## Build

```bash
npm run tauri build
```

Linux requires WebKitGTK/GTK development packages. Windows requires WebView2 and the MSVC Rust toolchain.

## Local backend roadmap

Local mode needs a sidecar Toph binary plus a platform terminal adapter (ConPTY on Windows, PTY on Linux), local data directory and local authentication/bootstrap. It is intentionally not faked by opening a localhost URL.
