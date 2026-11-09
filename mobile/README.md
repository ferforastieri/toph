# Toph mobile

Remote-only Tauri Android entrypoint. Native Android integrations live in
`android/`; `scripts/` applies them after `tauri android init`.

The WebView opens the server's `/app/`, so the mobile UI is the web app's
responsive shell. Its navigation is a five-tab bar: Toph, Arquivos, Git,
Trabalho and Mais. The Mais screen exposes every remaining workspace feature
(databases, web apps, debug, terminal, search, skills, harness/MCP, email,
projects, branch, settings and account).

The Android adaptive icon uses a dark brand background and the Toph foreground
at 42% of the 108dp canvas, keeping the mark inside the 66dp safe zone on
circular and squircle launchers. Regenerate icons with `npm run icons`; the
round launcher PNGs are patched from `src-tauri/android-round/`.

The launcher is shared with desktop in `packages/launcher/`. Both targets
compile `packages/native/src/lib.rs`; Android excludes the embedded Rust server
through target-specific Cargo dependencies and Rust configuration.

From the repository root:

```sh
npm ci
cd mobile
npm run sync-brand
npm run tauri -- android init
npm run icons
npm run android:patch
npm run tauri -- android build --debug --apk --target aarch64
```

Requires JDK 21, Android SDK 36, NDK 28.2 and the Android Rust target.
The application identifier and native library name are preserved for updates.
