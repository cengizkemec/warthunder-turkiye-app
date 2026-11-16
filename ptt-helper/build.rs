use std::fs;
use std::path::Path;

fn app_version() -> String {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
    let package_json = Path::new(&manifest_dir)
        .join("..")
        .join("package.json");

    if let Ok(contents) = fs::read_to_string(package_json) {
        if let Some(version_key) = contents.find("\"version\"") {
            let after_key = &contents[version_key + "\"version\"".len()..];

            if let Some(colon) = after_key.find(':') {
                let after_colon = &after_key[colon + 1..];

                if let Some(start) = after_colon.find('"') {
                    let after_quote = &after_colon[start + 1..];

                    if let Some(end) = after_quote.find('"') {
                        return after_quote[..end].to_string();
                    }
                }
            }
        }
    }

    env!("CARGO_PKG_VERSION").to_string()
}

fn four_part_version(version: &str) -> String {
    let parts: Vec<&str> = version.split('.').collect();

    match parts.len() {
        2 => format!("{version}.0.0"),
        3 => format!("{version}.0"),
        _ => version.to_string(),
    }
}

fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

    let version = four_part_version(&app_version());
    let mut resource = winres::WindowsResource::new();

    resource.set("ProductName", "wttr-app");
    resource.set("FileDescription", "wttr-app push-to-talk helper");
    resource.set("CompanyName", "Cengiz Kemec");
    resource.set("LegalCopyright", "Copyright (c) 2026 Cengiz Kemec");
    resource.set("ProductVersion", &version);
    resource.set("FileVersion", &version);
    resource.set("OriginalFilename", "ptt-helper.exe");

    resource
        .compile()
        .expect("failed to compile Windows version resources");
}
