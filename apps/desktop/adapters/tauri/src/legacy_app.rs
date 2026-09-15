use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const LEGACY_MACOS_APP_BUNDLE_ID: &str = "com.adeptify.goalboard";
const LEGACY_MACOS_APP_NAME: &str = "GoalBoard.app";

pub(crate) fn retire_legacy_desktop_apps() {
    #[cfg(target_os = "macos")]
    {
        let home = match std::env::var("HOME") {
            Ok(value) if !value.trim().is_empty() => PathBuf::from(value),
            _ => return,
        };
        let system = std::env::var("MOLIS_WORK_SYSTEM_APP_DIR")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "/Applications".to_string());
        let trash = std::env::var("MOLIS_WORK_TRASH_DIR")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".Trash"));
        let current_bundle = current_app_bundle();
        retire_legacy_desktop_apps_in(
            &home.join("Applications"),
            Path::new(&system),
            &trash,
            current_bundle.as_deref(),
        );
    }
}

pub(crate) fn retire_legacy_desktop_apps_in(
    user_applications: &Path,
    system_applications: &Path,
    trash_dir: &Path,
    current_bundle: Option<&Path>,
) -> Vec<PathBuf> {
    let mut moved = Vec::new();
    let mut seen = Vec::new();
    for directory in [user_applications, system_applications] {
        let app = directory.join(LEGACY_MACOS_APP_NAME);
        if !app.is_dir() {
            continue;
        }
        let resolved = fs::canonicalize(&app).unwrap_or(app);
        if seen.iter().any(|existing| existing == &resolved) {
            continue;
        }
        seen.push(resolved.clone());
        if let Some(current) = current_bundle {
            if let Ok(current) = fs::canonicalize(current) {
                if current == resolved {
                    continue;
                }
            }
        }
        if let Some(destination) = retire_owned_legacy_app(&resolved, trash_dir) {
            moved.push(destination);
        }
    }
    moved
}

fn retire_owned_legacy_app(app: &Path, trash_dir: &Path) -> Option<PathBuf> {
    if macos_app_bundle_id(app).as_deref() != Some(LEGACY_MACOS_APP_BUNDLE_ID) {
        return None;
    }
    let _ = fs::create_dir_all(trash_dir);
    let destination = unique_trash_path(trash_dir, LEGACY_MACOS_APP_NAME);
    fs::rename(app, &destination).ok()?;
    Some(destination)
}

fn macos_app_bundle_id(app: &Path) -> Option<String> {
    let plist = app.join("Contents/Info.plist");
    if !plist.is_file() {
        return None;
    }
    let from_buddy = Command::new("/usr/libexec/PlistBuddy")
        .args(["-c", "Print :CFBundleIdentifier", plist.to_str()?])
        .output()
        .ok()
        .and_then(command_stdout);
    if from_buddy.as_ref().is_some_and(|value| !value.is_empty()) {
        return from_buddy;
    }
    let from_plutil = Command::new("plutil")
        .args(["-extract", "CFBundleIdentifier", "raw", plist.to_str()?])
        .output()
        .ok()
        .and_then(command_stdout);
    if from_plutil.as_ref().is_some_and(|value| !value.is_empty()) {
        return from_plutil;
    }
    bundle_id_from_xml(&fs::read_to_string(plist).ok()?)
}

fn bundle_id_from_xml(text: &str) -> Option<String> {
    let key = "<key>CFBundleIdentifier</key>";
    let rest = text.split_once(key)?.1;
    let start = rest.find("<string>")? + "<string>".len();
    let value = rest[start..].split_once("</string>")?.0.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn command_stdout(output: std::process::Output) -> Option<String> {
    if !output.status.success() {
        return None;
    }
    let value = String::from_utf8(output.stdout).ok()?.trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn unique_trash_path(trash_dir: &Path, name: &str) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let mut destination = trash_dir.join(format!("{name}.{stamp}"));
    let mut n = 1;
    while destination.exists() {
        destination = trash_dir.join(format!("{name}.{stamp}.{n}"));
        n += 1;
    }
    destination
}

fn current_app_bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let macos = exe.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    if bundle.extension()?.eq_ignore_ascii_case("app") {
        Some(bundle.to_path_buf())
    } else {
        None
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::{retire_legacy_desktop_apps_in, LEGACY_MACOS_APP_BUNDLE_ID, LEGACY_MACOS_APP_NAME};
    use std::{
        fs,
        path::Path,
        process,
        time::{SystemTime, UNIX_EPOCH},
    };

    fn write_app(directory: &Path, bundle_id: &str) {
        let contents = directory.join("Contents");
        fs::create_dir_all(&contents).unwrap();
        fs::write(
            contents.join("Info.plist"),
            format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>{bundle_id}</string>
</dict>
</plist>
"#
            ),
        )
        .unwrap();
    }

    fn unique_root() -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "molis-work-legacy-app-{}-{nonce}",
            process::id()
        ))
    }

    #[test]
    fn owned_goalboard_apps_move_to_trash_and_foreign_bundles_stay() {
        let root = unique_root();
        let user_apps = root.join("user-apps");
        let system_apps = root.join("system-apps");
        let trash = root.join("trash");
        let owned = user_apps.join(LEGACY_MACOS_APP_NAME);
        let system_owned = system_apps.join(LEGACY_MACOS_APP_NAME);
        fs::create_dir_all(&user_apps).unwrap();
        fs::create_dir_all(&system_apps).unwrap();
        write_app(&owned, LEGACY_MACOS_APP_BUNDLE_ID);
        write_app(&system_owned, "com.example.other");
        let moved =
            retire_legacy_desktop_apps_in(&user_apps, &system_apps, &trash, None);
        assert_eq!(moved.len(), 1);
        assert!(!owned.exists());
        assert!(system_owned.is_dir());
        assert!(moved[0].starts_with(&trash));
        assert!(moved[0].is_dir());
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn running_bundle_is_not_retired() {
        let root = unique_root();
        let user_apps = root.join("user-apps");
        let system_apps = root.join("system-apps");
        let trash = root.join("trash");
        let owned = user_apps.join(LEGACY_MACOS_APP_NAME);
        fs::create_dir_all(&user_apps).unwrap();
        fs::create_dir_all(&system_apps).unwrap();
        write_app(&owned, LEGACY_MACOS_APP_BUNDLE_ID);
        let moved =
            retire_legacy_desktop_apps_in(&user_apps, &system_apps, &trash, Some(&owned));
        assert!(moved.is_empty());
        assert!(owned.is_dir());
        let _ = fs::remove_dir_all(&root);
    }
}
