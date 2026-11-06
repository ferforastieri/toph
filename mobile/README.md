# Toph mobile

Remote-only Tauri Android entrypoint. Native Android integrations live in
`android/`; `scripts/` applies them after `tauri android init`.

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
