//! Directory access is granted by AppKit, never by a path supplied by web content.
use crate::native_language::tr;
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
    // Lets the page cancel an in-flight directory preview without waiting for the operation lock.
    pub(crate) cancel_scan: std::sync::atomic::AtomicBool,
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

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub(crate) struct SkippedReasons {
    pub ignored: usize,
    pub secret: usize,
    pub unreadable: usize,
    pub time: usize,
}

#[derive(Clone, Debug, Serialize)]
pub(crate) struct DirectoryScanProgress {
    pub id: String,
    pub visited: usize,
    pub kept: usize,
    pub bytes: u64,
    pub current_path: String,
}

#[derive(Debug, Serialize)]
pub(crate) struct DirectoryPreview {
    pub files: Vec<FilePreview>,
    pub skipped: usize,
    pub truncated: bool,
    pub cancelled: bool,
    pub total_entries: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped_reasons: Option<SkippedReasons>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub ignored_rules: Vec<String>,
}

/// One chosen file as the page gets it back: the digest the Host staged it under, or why the file itself was not sent.
#[derive(Debug, Serialize)]
pub(crate) struct StagedFile {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub staged: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Deserialize)]
struct HostStaged {
    staged: Option<String>,
    error: Option<String>,
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
        Err(tr(
            "未知的文件夹来源。",
            "Unknown folder source.",
            "不明なフォルダー種別です。",
        )
        .into())
    }
}

pub(crate) fn directory_name(id: &str) -> String {
    crate::native_language::folder_name(id)
}

fn unconnected(id: &str) -> DirectoryStatus {
    DirectoryStatus {
        id: id.into(),
        name: directory_name(id),
        path: None,
        state: "unconnected".into(),
        message: None,
    }
}

fn trusted_location(label: &str, url: &Url) -> bool {
    label == "main"
        && url.scheme() == "http"
        && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
        && url.port_or_known_default() == Some(crate::host_port::port())
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/onboarding"
}

pub(crate) fn validate_caller(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|_| {
        tr(
            "无法确认当前页面来源。",
            "Couldn’t verify the folder access request.",
            "フォルダーアクセス元のページを確認できませんでした。",
        )
    })?;
    if trusted_location(window.label(), &url) {
        Ok(())
    } else {
        Err(tr(
            "只有在主窗口的工作准备页面里才能授权文件夹。",
            "Folders can only be authorized from the setup page in the main window.",
            "フォルダーの許可はメインウィンドウのセットアップ画面からのみ行えます。",
        )
        .into())
    }
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(home) = crate::web_service::packaged_test_home() {
        return Ok(home.join("directory-access").join("bookmarks.json"));
    }
    // Match the explicit Home override used by the desktop launcher and isolated QA.
    // Otherwise bookmarks belong to this installed app, independently of any project.
    let root = match std::env::var_os("MOLIS_WORK_HOME") {
        Some(value) if !value.is_empty() => {
            let path = PathBuf::from(value);
            if !path.is_absolute() {
                return Err(tr(
                    "数据目录配置无效，请使用完整路径。",
                    "The configured data folder path must be an absolute path.",
                    "データフォルダーのパスには絶対パスを指定してください。",
                )
                .into());
            }
            path
        }
        _ => app.path().app_data_dir().map_err(|_| {
            tr(
                "找不到应用数据目录。",
                "Couldn’t locate the app data folder.",
                "アプリのデータフォルダーが見つかりません。",
            )
        })?,
    };
    Ok(root.join("directory-access").join("bookmarks.json"))
}

fn load_records(path: &Path) -> Result<Records, String> {
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| {
            tr(
                "已保存的文件夹授权记录损坏了，重新选择一次文件夹即可恢复。",
                "Saved folder permissions are damaged. Select the folder again to reconnect.",
                "保存されたフォルダー権限のデータが破損しています。フォルダーを選び直してください。",
            )
            .into()
        }),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Records::new()),
        Err(_) => Err(tr(
            "暂时读不到已保存的文件夹授权。",
            "Couldn’t read saved folder permissions.",
            "保存されたフォルダー権限を読み込めませんでした。",
        )
        .into()),
    }
}

fn save_records(path: &Path, records: &Records) -> Result<(), String> {
    use std::io::Write;
    let save_err = || {
        tr(
            "没能保存文件夹授权，请稍后再试。",
            "Couldn’t save folder permissions. Please try again.",
            "フォルダー権限を保存できませんでした。もう一度お試しください。",
        )
        .to_string()
    };
    let directory = path.parent().ok_or_else(save_err)?;
    std::fs::create_dir_all(directory).map_err(|_| save_err())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|_| save_err())?;
    }
    let temporary = path.with_extension("json.tmp");
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NOFOLLOW);
    }
    let mut file = options.open(&temporary).map_err(|_| save_err())?;
    let bytes = serde_json::to_vec(records).map_err(|_| save_err())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|_| save_err())?;
    std::fs::rename(&temporary, path).map_err(|_| save_err())
}

fn status_for(id: &str, record: Option<&DirectoryRecord>) -> DirectoryStatus {
    let Some(record) = record else {
        return unconnected(id);
    };
    #[cfg(target_os = "macos")]
    let access = crate::context_directories_macos::access(record).map(|scope| scope.path.clone());
    #[cfg(not(target_os = "macos"))]
    let access: Result<String, String> = Err(tr(
        "文件夹授权目前仅支持 macOS 桌面应用。",
        "Folder authorization is currently available only in the macOS desktop app.",
        "フォルダーの許可は現在 macOS デスクトップアプリでのみ利用できます。",
    )
    .into());
    match access {
        Ok(path) => DirectoryStatus {
            id: id.into(),
            name: directory_name(id),
            path: Some(path),
            state: "ready".into(),
            message: None,
        },
        Err(message) => DirectoryStatus {
            id: id.into(),
            name: directory_name(id),
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
        let _guard = state.operation.lock().map_err(|_| {
            tr(
                "文件夹访问暂时不可用，请重新打开应用后再试。",
                "Folder access is temporarily unavailable. Reopen the app and try again.",
                "フォルダーアクセスが一時的に利用できません。アプリを開き直してからお試しください。",
            )
        })?;
        validate_caller(&window)?;
        let path = store_path(&app)?;
        action(&app, &window, &path)
    })
    .await
    .map_err(|_| {
        tr(
            "文件夹读取中断了，请再试一次。",
            "Folder access was interrupted. Please try again.",
            "フォルダーの処理が中断されました。もう一度お試しください。",
        )
        .to_string()
    })?
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
            Err(tr(
                "文件夹授权目前仅支持 macOS 桌面应用。",
                "Folder authorization is currently available only in the macOS desktop app.",
                "フォルダーの許可は現在 macOS デスクトップアプリでのみ利用できます。",
            )
            .into())
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

#[tauri::command(rename_all = "snake_case")]
pub async fn context_directory_preview(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    days: u16,
    cancel: Option<bool>,
    resume_offset: Option<usize>,
) -> Result<DirectoryPreview, String> {
    valid_id(&id)?;
    if cancel == Some(true) {
        validate_caller(&window)?;
        app.state::<ContextDirectoryState>()
            .cancel_scan
            .store(true, std::sync::atomic::Ordering::SeqCst);
        return Ok(DirectoryPreview {
            files: Vec::new(),
            skipped: 0,
            truncated: true,
            cancelled: true,
            total_entries: 0,
            skipped_reasons: None,
            ignored_rules: Vec::new(),
        });
    }
    if ![0, 7, 30, 90].contains(&days) {
        return Err(tr(
            "请选择最近 7 天、30 天、90 天或全部。",
            "Choose the last 7, 30, or 90 days, or all time.",
            "過去 7 日・30 日・90 日、または全期間から選んでください。",
        )
        .into());
    }
    let offset = resume_offset.unwrap_or(0);
    operation(app, window, move |app, window, path| {
        let state = app.state::<ContextDirectoryState>();
        state
            .cancel_scan
            .store(false, std::sync::atomic::Ordering::SeqCst);
        let records = load_records(path)?;
        let record = records.get(&id).ok_or_else(|| {
            tr(
                "请先连接这个文件夹。",
                "Connect this folder first.",
                "先にこのフォルダーを接続してください。",
            )
        })?;
        #[cfg(target_os = "macos")]
        {
            use tauri::Emitter;
            let scope = crate::context_directories_macos::access(record)?;
            let progress_id = id.clone();
            crate::context_directory_files::preview_with_progress(
                &scope.directory,
                days,
                offset,
                &state.cancel_scan,
                |visited, kept, bytes, current_path| {
                    let _ = window.emit(
                        "molis:directory-scan-progress",
                        DirectoryScanProgress {
                            id: progress_id.clone(),
                            visited,
                            kept,
                            bytes,
                            current_path: current_path.to_string(),
                        },
                    );
                },
            )
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (app, window, record, offset);
            Err(tr(
                "文件夹授权目前仅支持 macOS 桌面应用。",
                "Folder authorization is currently available only in the macOS desktop app.",
                "フォルダーの許可は現在 macOS デスクトップアプリでのみ利用できます。",
            )
            .into())
        }
    })
    .await
}

/// The onboarding round a file goes into: the id the page made for it (a UUID), so it can only name a place in the Host's route.
fn valid_journey(journey: &str) -> Result<(), String> {
    if (1..=64).contains(&journey.len())
        && journey
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        Ok(())
    } else {
        Err(tr(
            "这次准备会话已失效，请刷新页面后重试。",
            "This setup session isn’t valid. Refresh the page and try again.",
            "セットアップセッションが無効です。ページを再読み込みしてからもう一度お試しください。",
        )
        .into())
    }
}

/// Sends one chosen file straight into the Host's staging for this onboarding round (user 2026-10-22): the file is read and sent in
/// pieces over the shell's authenticated loopback socket, so a file of any size takes the same small memory, and the page gets back
/// only its digest. A problem with the file itself is its own reason; the Host refusing (a full disk, a round no longer being chosen)
/// stops the upload with the Host's words.
fn stage_on_host(
    directory: &std::fs::File,
    journey: &str,
    expected: &FilePreview,
) -> Result<StagedFile, String> {
    use crate::context_directory_files::{stream_one, StreamFailure};
    use std::io::{Read, Write};
    let unreachable = || {
        tr(
            "暂时连不上 Molis Work 服务，请稍后再试。",
            "Can’t reach the Molis Work service right now. Please try again in a moment.",
            "現在 Molis Work サービスに接続できません。少し待ってからもう一度お試しください。",
        )
        .to_string()
    };
    let token = crate::web_identity::control_token()?;
    let mut target = Url::parse(&format!(
        "{}/api/onboarding/context/{journey}/files",
        crate::host_port::origin()
    ))
    .map_err(|_| {
        tr(
            "这次准备会话已失效，请刷新页面后重试。",
            "This setup session isn’t valid. Refresh the page and try again.",
            "セットアップセッションが無効です。ページを再読み込みしてからもう一度お試しください。",
        )
    })?;
    target.query_pairs_mut().append_pair("path", &expected.path);
    let address = crate::host_port::address();
    let mut stream =
        std::net::TcpStream::connect_timeout(&address, std::time::Duration::from_millis(800))
            .map_err(|_| unreachable())?;
    crate::web_identity::authenticate(&mut stream, &token)?;
    let _ = stream.set_write_timeout(Some(std::time::Duration::from_secs(120)));
    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(600)));
    let key = format!(
        "context-directory-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0)
    );
    write!(
        stream,
        "POST {}?{} HTTP/1.1\r\nHost: {}\r\nOrigin: {}\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\nx-molis-work-control-token: {token}\r\nx-molis-work-idempotency-key: {key}\r\n\r\n",
        target.path(),
        target.query().unwrap_or(""),
        crate::host_port::host(),
        crate::host_port::origin(),
        expected.size
    )
    .map_err(|_| unreachable())?;
    match stream_one(directory, expected, &mut stream) {
        Ok(()) => {}
        // Dropping the connection part-way makes the Host discard what it had received of this file.
        Err(StreamFailure::File(reason)) => {
            return Ok(StagedFile {
                path: expected.path.clone(),
                staged: None,
                reason: Some(reason),
            })
        }
        Err(StreamFailure::Sink) => return Err(unreachable()),
    }
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|_| unreachable())?;
    let (head, body) = crate::shelf_http::split_http(&response).ok_or_else(unreachable)?;
    let head = String::from_utf8_lossy(head).to_ascii_lowercase();
    let body = if head.contains("transfer-encoding: chunked") {
        crate::shelf_http::decode_chunked(body).ok_or_else(unreachable)?
    } else {
        body.to_vec()
    };
    let answer: HostStaged = serde_json::from_slice(&body).map_err(|_| unreachable())?;
    match (head.starts_with("http/1.1 201"), answer.staged) {
        (true, Some(staged)) => Ok(StagedFile {
            path: expected.path.clone(),
            staged: Some(staged),
            reason: None,
        }),
        _ => Err(answer.error.unwrap_or_else(|| {
            tr(
                "这份文件没能存下，请再试一次。",
                "Couldn’t save this file. Please try again.",
                "このファイルを保存できませんでした。もう一度お試しください。",
            )
            .into()
        })),
    }
}

#[tauri::command]
pub async fn context_directory_stage(
    app: AppHandle,
    window: WebviewWindow,
    id: String,
    journey: String,
    file: FilePreview,
) -> Result<StagedFile, String> {
    valid_id(&id)?;
    valid_journey(&journey)?;
    operation(app, window, move |_, _, path| {
        let records = load_records(path)?;
        let record = records.get(&id).ok_or_else(|| {
            tr(
                "请先连接这个文件夹。",
                "Connect this folder first.",
                "先にこのフォルダーを接続してください。",
            )
        })?;
        #[cfg(target_os = "macos")]
        {
            let scope = crate::context_directories_macos::access(record)?;
            stage_on_host(&scope.directory, &journey, &file)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = (record, journey, file);
            Err(tr(
                "文件夹授权目前仅支持 macOS 桌面应用。",
                "Folder authorization is currently available only in the macOS desktop app.",
                "フォルダーの許可は現在 macOS デスクトップアプリでのみ利用できます。",
            )
            .into())
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
            "http://[::1]:4173/onboarding?desktop=1",
            "http://[::1]:4173/onboarding",
        ] {
            assert!(trusted_location("main", &Url::parse(address).unwrap()));
            assert!(!trusted_location("capsule", &Url::parse(address).unwrap()));
        }
        for address in [
            "https://127.0.0.1:4173/onboarding",
            "https://[::1]:4173/onboarding",
            "http://127.0.0.1:4339/onboarding",
            "http://[::1]:4339/onboarding",
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
