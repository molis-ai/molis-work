use serde_json::Value;
use std::{env, fs, path::Path};

/// Compile the shell's finite startup and tray words from the Workbench's language files. The native shell can show these before the Host starts.
fn tray_words() {
    let workspace = env::var_os("CARGO_MANIFEST_DIR").expect("Cargo manifest directory");
    let languages = Path::new(&workspace).join("../../workbench/resources/locales");
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
        "boot-loading",
        "boot-failed",
    ];
    let mut code = String::new();
    for (tag, name) in [("zh", "ZH"), ("en", "EN")] {
        let file = languages.join(format!("{tag}.json"));
        println!("cargo:rerun-if-changed={}", file.display());
        let pack: Value =
            serde_json::from_str(&fs::read_to_string(file).expect("Workbench language file"))
                .expect("Workbench language JSON");
        code.push_str(&format!("const {name}: TrayWords = TrayWords {{\n"));
        for field in fields {
            let key = format!("workbench.native-tray.{field}");
            let label = pack["messages"][&key]
                .as_str()
                .filter(|label| !label.is_empty())
                .unwrap_or_else(|| panic!("Missing native tray word {key} for {tag}"));
            code.push_str(&format!("    {}: {label:?},\n", field.replace('-', "_")));
        }
        code.push_str("};\n");
    }
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
        ["page", "ink", "ink-soft"]
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
