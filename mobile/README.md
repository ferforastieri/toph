# Toph mobile

Remote-only Tauri Android entrypoint. The native Android project is committed
in `src-tauri/gen/android/`, so no initialization or patch step is needed after
checkout.

The WebView opens the server's `/app/`, so the mobile UI is the web app's
responsive shell. Its navigation is a five-tab bar: Toph, Arquivos, Git,
Trabalho and Mais. The Mais screen exposes every remaining workspace feature
(databases, web apps, debug, terminal, search, skills, harness/MCP, email,
projects, branch, settings and account).

The Android adaptive icon uses a dark brand background and the Toph foreground
at 42% of the 108dp canvas, keeping the mark inside the 66dp safe zone on
circular and squircle launchers. Regenerate icons with `npm run icons`.

The Firebase client config (`src-tauri/gen/android/app/google-services.json`)
is not tracked. CI writes it from the `GOOGLE_SERVICES_JSON` secret; for a local
Android build, copy the Firebase `google-services.json` to that path.

The launcher is shared with desktop in `packages/launcher/`. Both targets
compile `packages/native/src/lib.rs`; Android excludes the embedded Rust server
through target-specific Cargo dependencies and Rust configuration.

From the repository root:

```sh
npm ci
cd mobile
npm run icons
npm run tauri -- android build --debug --apk --target aarch64
```

Requires JDK 21, Android SDK 36, NDK 28.2 and the Android Rust target.
The application identifier and native library name are preserved for updates.
Release signing reads `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` from the environment.
