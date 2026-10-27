fn main() {
    let attributes =
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "validate_server",
            "open_server",
            "start_local_server",
            "is_mobile",
            "environment_status",
            "install_environment",
            "restart_app",
            "download_update",
        ]));
    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
