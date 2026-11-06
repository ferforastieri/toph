# Shared native runtime

`src/lib.rs` is compiled by the small entrypoints in `desktop/src-tauri` and
`mobile/src-tauri`. Each application owns its Tauri configuration, capabilities,
build script and distribution assets. This keeps the Rust command handlers and
local-server lifecycle in a single implementation without another process.

`tauri::generate_context!()` uses the consuming entrypoint's Cargo manifest.
The Android target excludes local-server functionality and its backend dependency.
