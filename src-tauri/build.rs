fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "bridge_session",
                "check_for_updates",
                "get_latest_discussions",
                "get_session",
                "get_settings",
                "install_update",
                "logout",
                "open_auth",
                "open_external",
                "open_microphone_settings",
                "open_section",
                "open_url",
                "refresh_session",
                "request_microphone",
                "save_settings",
                "test_notification",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
