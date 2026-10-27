fn main() {
    println!("cargo:rerun-if-env-changed=TOPH_VERSION");
    let version = std::env::var("TOPH_VERSION")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| std::env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "dev".into()));
    println!("cargo:rustc-env=TOPH_VERSION={version}");

    // rust-embed needs the folder to exist even for cargo test/check. Release
    // builds populate this directory with the real web UI first.
    let manifest = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let dist = manifest.join("../../apps/web/dist");
    let _ = std::fs::create_dir_all(&dist);
    if !dist.join("index.html").exists() {
        let _ = std::fs::write(
            dist.join("index.html"),
            "<!doctype html><html><body>Toph web UI was not built.</body></html>",
        );
    }
    println!("cargo:rerun-if-changed={}", dist.display());
}
