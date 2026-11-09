use serde_json::Value;
use std::{env, fs, path::Path};

/// Compile only the tray's words from the Workbench's language files. The native shell can show these before the Host starts.
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
    let out = env::var_os("OUT_DIR").expect("Cargo output directory");
    fs::write(Path::new(&out).join("tray-words.rs"), code).expect("native tray words");
}

fn main() {
    tray_words();
    tauri_build::build();
}
