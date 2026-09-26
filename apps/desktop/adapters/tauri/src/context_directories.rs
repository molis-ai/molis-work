//! Directory access is granted by AppKit, never by a path supplied by web content.
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Url, WebviewWindow};

pub(crate) const IDS: [&str; 4] = ["downloads", "documents", "desktop", "custom"];

#[derive(Default)]
pub(crate) struct ContextDirectoryState {
    // Serializes record changes and access, including forget versus an in-flight read.
    operation: Mutex<()>,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct DirectoryStatus {
    pub id: String,
    pub name: String,
    pub path: Option<String>,
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct FilePreview {
    pub path: String,
    pub size: u64,
    pub modified_ms: u64,
    pub identity: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct DirectoryPreview {
    pub files: Vec<FilePreview>,
    pub skipped: usize,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
pub(crate) struct FileRead {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct DirectoryRead {
    pub files: Vec<FileRead>,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct DirectoryRecord {
    pub path: String,
    pub bookmark: String,
}

type Records = BTreeMap<String, DirectoryRecord>;

fn valid_id(id: &str) -> Result<(), String> {
    if IDS.contains(&id) {
        Ok(())
    } else {
        Err("未知的目录来源".into())
    }
}

pub(crate) fn directory_name(id: &str) -> &str {
    match id {
        "downloads" => "下载",
        "documents" => "文稿",
        "desktop" => "桌面",
        _ => "其他文件夹",
    }
}

fn unconnected(id: &str) -> DirectoryStatus {
    DirectoryStatus {
        id: id.into(),
        name: directory_name(id).into(),
        path: None,
        state: "unconnected".into(),
        message: None,
    }
}

fn trusted_location(label: &str, url: &Url) -> bool {
    label == "main"
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
        && url.port_or_known_default() == Some(4173)
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/onboarding"
}

pub(crate) fn validate_caller(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|_| "无法确认目录访问来源")?;
    if trusted_location(window.label(), &url) {
        Ok(())
    } else {
        Err("仅本机主窗口的工作准备页面可以访问目录".into())
    }
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    // Match the explicit Home override used by the desktop launcher and isolated QA.
    // Otherwise bookmarks belong to this installed app, independently of any project.
    let root = match std::env::var_os("MOLIS_WORK_HOME") {
        Some(value) if !value.is_empty() => {
            let path = PathBuf::from(value);
            if !path.is_absolute() {
                return Err("MOLIS_WORK_HOME 必须是绝对路径".into());
            }
            path
        }
        _ => app
            .path()
            .app_data_dir()
            .map_err(|_| "无法找到应用数据目录")?,
    };
    Ok(root.join("directory-access").join("bookmarks.json"))
}

fn load_records(path: &Path) -> Result<Records, String> {
    match std::fs::read(path) {
        Ok(bytes) => {
            serde_json::from_slice(&bytes).map_err(|_| "目录授权记录损坏，请重新连接目录".into())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Records::new()),
        Err(_) => Err("无法读取已保存的目录授权".into()),
    }
}

fn save_records(path: &Path, records: &Records) -> Result<(), String> {
    use std::io::Write;
    let directory = path.parent().ok_or("目录授权存储位置无效")?;
    std::fs::create_dir_all(directory).map_err(|_| "无法创建目录授权存储位置")?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| "无法保护目录授权存储位置")?;
    }
    let temporary = path.with_extension("json.tmp");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let mut file = options.open(&temporary).map_err(|_| "无法保存目录授权")?;
    let bytes = serde_json::to_vec(records).map_err(|_| "无法编码目录授权")?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| "无法保存目录授权")?;
    std::fs::rename(&temporary, path).map_err(|_| "无法更新目录授权".into())
}

fn status_for(id: &str, record: Option<&DirectoryRecord>) -> DirectoryStatus {
    let Some(record) = record else {
        return unconnected(id);
    };
    #[cfg(target_os = "macos")]
    let access = crate::context_directories_macos::access(record).map(|scope| scope.path.clone());
    #[cfg(not(target_os = "macos"))]
    let access: Result<String, String> = Err("目录授权仅支持 macOS 桌面应用".into());
    match access {
        Ok(path) => DirectoryStatus {
            id: id.into(),
            name: directory_name(id).into(),
            path: Some(path),
            state: "ready".into(),
            message: None,
        },
        Err(message) => DirectoryStatus {
            id: id.into(),
            name: directory_name(id).into(),
            path: Some(record.path.clone()),
            state: "unavailable".into(),
            message: Some(message),
        },
    }
}

async fn operation<T: Send + 'static>(
    app: AppHandle,
    window: WebviewWindow,
    action: impl FnOnce(&AppHandle, &WebviewWindow, &Path) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    validate_caller(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<ContextDirectoryState>();
        let _guard = state
            .operation
            .lock()
            .map_err(|_| "目录访问状态暂不可用，请重启应用")?;
        validate_caller(&window)?;
        let path = store_path(&app)?;
        action(&app, &window, &path)
    })
    .await
    .map_err(|_| "目录访问任务中断，请重试".to_string())?
}

#[tauri::command]
pub async fn context_directory_status(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<Vec<DirectoryStatus>, String> {
    operation(app, window, |_, _, path| {
        let records = load_records(path)?;
        Ok(IDS
            .iter()
            .map(|id| status_for(id, records.get(*id)))
            .collect())
    })
    .await
}

#[tauri::command]
pub async fn context_directory_authorize(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
) -> Result<DirectoryStatus, String> {
    valid_id(&id)?;
    operation(app, window, move |app, window, path| {
        let mut records = load_records(path)?;
        #[cfg(target_os = "macos")]
        {
            if let Some(record) = crate::context_directories_macos::choose(app, window, &id)? {
                validate_caller(window)?;
                records.insert(id.clone(), record);
                save_records(path, &records)?;
            }
            Ok(status_for(&id, records.get(&id)))
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (app, window, records);
            Err("目录授权仅支持 macOS 桌面应用".into())
        }
    })
    .await
}

#[tauri::command]
pub async fn context_directory_forget(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
) -> Result<DirectoryStatus, String> {
    valid_id(&id)?;
    operation(app, window, move |_, _, path| {
        let mut records = load_records(path)?;
        if records.remove(&id).is_some() {
            save_records(path, &records)?;
        }
        Ok(unconnected(&id))
    })
    .await
}

#[tauri::command]
pub async fn context_directory_preview(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    days: u16,
) -> Result<DirectoryPreview, String> {
    valid_id(&id)?;
    if ![0, 7, 30, 90].contains(&days) {
        return Err("请选择最近 7、30、90 天或全部".into());
    }
    operation(app, window, move |_, _, path| {
        let records = load_records(path)?;
        let record = records.get(&id).ok_or("请先连接这个目录")?;
        #[cfg(target_os = "macos")]
        {
            let scope = crate::context_directories_macos::access(record)?;
            crate::context_directory_files::preview(&scope.directory, days)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = record;
            Err("目录授权仅支持 macOS 桌面应用".into())
        }
    })
    .await
}

#[tauri::command]
pub async fn context_directory_read(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    files: Vec<FilePreview>,
) -> Result<DirectoryRead, String> {
    valid_id(&id)?;
    operation(app, window, move |_, _, path| {
        let records = load_records(path)?;
        let record = records.get(&id).ok_or("请先连接这个目录")?;
        #[cfg(target_os = "macos")]
        {
            let scope = crate::context_directories_macos::access(record)?;
            crate::context_directory_files::read(&scope.directory, files)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (record, files);
            Err("目录授权仅支持 macOS 桌面应用".into())
        }
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn caller_is_only_the_main_local_onboarding_page() {
        for address in [
            "http://127.0.0.1:4173/onboarding?desktop=1",
            "http://localhost:4173/onboarding",
        ] {
            assert!(trusted_location("main", &Url::parse(address).unwrap()));
            assert!(!trusted_location("capsule", &Url::parse(address).unwrap()));
        }
        for address in [
            "https://127.0.0.1:4173/onboarding",
            "http://127.0.0.1:4339/onboarding",
            "http://example.com:4173/onboarding",
            "http://localhost:4173/onboarding/child",
            "http://localhost:4173/projects/a",
            "http://user@localhost:4173/onboarding",
        ] {
            assert!(
                !trusted_location("main", &Url::parse(address).unwrap()),
                "{address}"
            );
        }
    }
    #[test]
    fn unconnected_status_has_no_path_and_cannot_access_a_directory() {
        assert_eq!(status_for("downloads", None).state, "unconnected");
        assert!(status_for("downloads", None).path.is_none());
        assert!(valid_id("../../etc").is_err());
    }
    #[test]
    fn records_persist_and_forget_without_touching_imports() {
        let path = std::env::temp_dir()
            .join(format!(
                "molis-bookmark-store-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ))
            .join("bookmarks.json");
        assert!(load_records(&path).unwrap().is_empty());
        let mut records = Records::new();
        records.insert(
            "custom".into(),
            DirectoryRecord {
                path: "/fixture".into(),
                bookmark: "fixture-data".into(),
            },
        );
        save_records(&path, &records).unwrap();
        let mut restored = load_records(&path).unwrap();
        assert_eq!(restored["custom"].bookmark, "fixture-data");
        restored.remove("custom");
        save_records(&path, &restored).unwrap();
        assert!(load_records(&path).unwrap().is_empty());
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
