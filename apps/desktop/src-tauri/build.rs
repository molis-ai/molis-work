use serde_json::Value;
use std::{env, fs, path::Path};

/// Compile the shell's finite startup and tray words from the Workbench's language files. The native shell can show these before the Host starts.
fn tray_words() {
    let workspace = env::var_os("CARGO_MANIFEST_DIR").expect("Cargo manifest directory");
    let workbench = Path::new(&workspace).join("../../workbench/resources");
    let catalog = design_resource(&workbench, "languages.json");
    let languages = workbench
        .join("locales")
        .canonicalize()
        .expect("registered locales directory");
    let fields = [
        "loading",
        "loading-tip",
        "disconnected",
        "disconnected-tip",
        "syncing",
        "syncing-tip",
        "open-goal",
        "quit",
        "quit-keep-service",
        "restore-appearance",
        "stopped",
        "stopped-tip",
    ];
    let mut tray = Vec::new();
    let mut views = Vec::new();
    for descriptor in catalog["languages"]
        .as_array()
        .expect("registered platform languages")
    {
        let tag = descriptor["tag"].as_str().expect("registered language tag");
        let file = languages
            .join(format!("{tag}.json"))
            .canonicalize()
            .expect("registered locale file");
        let name = file
            .strip_prefix(&languages)
            .expect("locale is outside the registered directory");
        let pack = design_resource(&languages, name.to_str().expect("locale file name"));
        assert_eq!(pack["owner"], "workbench");
        assert_eq!(pack["locale"], tag);
        let label = |field: &str| {
            let key = format!("workbench.native-tray.{field}");
            pack["messages"][&key]
                .as_str()
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| panic!("Missing native tray word {key} for {tag}"))
        };
        let words = fields
            .into_iter()
            .map(|field| (field.replace('-', "_"), serde_json::json!(label(field))))
            .collect::<serde_json::Map<String, Value>>();
        tray.push(serde_json::json!({ "language": { "tag": tag, "html_lang": descriptor["html_lang"], "direction": descriptor["direction"] }, "words": words }));
        views.push(serde_json::json!({ "tag": tag, "html_lang": descriptor["html_lang"], "direction": descriptor["direction"],
            "intl": descriptor["intl"], "loading": label("boot-loading"), "failed": label("boot-failed"),
            "stopped": label("boot-stopped"), "open": label("boot-open") }));
    }
    let boot_tray =
        serde_json::json!({ "default": catalog["default"], "locales": tray }).to_string();
    let boot_view =
        serde_json::json!({ "default": catalog["default"], "locales": views }).to_string();
    let mut code = format!("const BOOTSTRAP_TRAY: &str = {boot_tray:?};\nconst BOOTSTRAP_VIEW: &str = {boot_view:?};\n");
    let resources = Path::new(&workspace).join("../../../packages/design-system/resources");
    let soft = design_resource(&resources, "skins/soft-workbench.json");
    let font = design_resource(&resources, "fonts/system-sans.json");
    let families = font["roles"]["body"]["families"]
        .as_array()
        .expect("body font families");
    let families = families
        .iter()
        .filter_map(|item| item["system"].as_str())
        .map(|family| {
            if family.contains(' ') {
                format!("{family:?}")
            } else {
                family.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(",");
    let colors = |mode: &str| {
        ["page", "paper", "line", "ink", "ink-soft"]
            .iter()
            .map(|role| {
                format!(
                    "--{role}:{};",
                    soft[mode][role].as_str().expect("native bootstrap role")
                )
            })
            .collect::<String>()
    };
    let css = format!(
        ":root{{--font:{families};{}}}@media(prefers-color-scheme: dark){{:root{{{}}}}}",
        colors("light"),
        colors("dark")
    );
    code.push_str(&format!("const BOOTSTRAP_TOKENS: &str = {css:?};\n"));
    let out = env::var_os("OUT_DIR").expect("Cargo output directory");
    fs::write(Path::new(&out).join("tray-words.rs"), code).expect("native tray words");
}

fn design_resource(resources: &Path, name: &str) -> Value {
    let file = resources.join(name);
    println!("cargo:rerun-if-changed={}", file.display());
    serde_json::from_str(&fs::read_to_string(file).expect("native startup design resource"))
        .expect("native startup design JSON")
}

fn main() {
    tray_words();
    tauri_build::build();
}
