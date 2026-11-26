use crate::native_language::tr;
use base64::Engine;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const MAX_BYTES: u64 = 32 * 1024 * 1024;
const ADMIT_TTL: Duration = Duration::from_secs(300);
const MAX_ADMITTED_PATHS: usize = 64;

static ADMITTED_PATHS: Mutex<Vec<(PathBuf, Instant)>> = Mutex::new(Vec::new());

#[derive(serde::Serialize)]
pub struct SelectedFile {
    name: String,
    bytes_base64: String,
}

/// Rejects any path inside the Molis Work Home directory (tokens, secrets, databases).
pub(crate) fn is_blocked_home_path(canonical: &Path, home: &Path) -> bool {
    if canonical.starts_with(home) {
        return true;
    }
    home.canonicalize()
        .ok()
        .is_some_and(|real_home| canonical.starts_with(real_home))
}

/// Records canonical paths returned by `shelf_find_files` in a bounded short-lived allowlist.
pub(crate) fn admit_search_results(paths: &[PathBuf]) {
    admit_search_results_with_home(paths, &crate::web_service::molis_work_home(), Instant::now());
}

fn admit_search_results_with_home(paths: &[PathBuf], home: &Path, now: Instant) {
    let Ok(mut entries) = ADMITTED_PATHS.lock() else {
        return;
    };
    entries.retain(|(_, at)| now.saturating_duration_since(*at) <= ADMIT_TTL);
    for path in paths {
        let Ok(meta) = std::fs::symlink_metadata(path) else {
            continue;
        };
        if meta.file_type().is_symlink() || !meta.is_file() {
            continue;
        }
        let Ok(real) = path.canonicalize() else {
            continue;
        };
        if is_blocked_home_path(&real, home) {
            continue;
        }
        entries.retain(|(existing, _)| existing != &real);
        entries.push((real, now));
    }
    if entries.len() > MAX_ADMITTED_PATHS {
        let excess = entries.len() - MAX_ADMITTED_PATHS;
        entries.drain(..excess);
    }
}

fn is_admitted_path(canonical: &Path, now: Instant) -> bool {
    let Ok(mut entries) = ADMITTED_PATHS.lock() else {
        return false;
    };
    entries.retain(|(_, at)| now.saturating_duration_since(*at) <= ADMIT_TTL);
    entries.iter().any(|(existing, _)| existing == canonical)
}

fn open_regular_nonblocking(path: &Path) -> std::io::Result<std::fs::File> {
    let mut options = std::fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    options.open(path)
}

fn same_inode(a: &std::fs::Metadata, b: &std::fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        a.dev() == b.dev() && a.ino() == b.ino()
    }
    #[cfg(not(unix))]
    {
        let _ = (a, b);
        true
    }
}

/// Called only by the trusted desktop picker after the person selects its search result.
#[tauri::command]
pub async fn platform_read_selected_file(path: String) -> Result<SelectedFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        read_selected_with(
            Path::new(&path),
            &crate::web_service::molis_work_home(),
            Instant::now(),
        )
    })
    .await
    .map_err(|error| {
        eprintln!("platform_read_selected_file join error: {error}");
        tr(
            "读取所选文件没能完成，请再试一次。",
            "Couldn’t finish reading the selected file. Please try again.",
            "選択したファイルの読み込みを完了できませんでした。もう一度お試しください。",
        )
        .to_string()
    })?
}

fn read_selected_with(path: &Path, home: &Path, now: Instant) -> Result<SelectedFile, String> {
    let invalid_path = || {
        tr(
            "所选文件路径无效。",
            "The selected file path isn’t valid.",
            "選択したファイルのパスが無効です。",
        )
        .to_string()
    };
    let not_allowed = || {
        tr(
            "所选文件未通过安全核验，已拒绝读取。",
            "The selected file didn’t pass security checks and was blocked.",
            "選択したファイルはセキュリティ確認を通過しなかったため読み込めませんでした。",
        )
        .to_string()
    };
    let not_regular = || {
        tr(
            "只能读取普通文件。",
            "Only regular files can be read.",
            "通常のファイルのみ読み込めます。",
        )
        .to_string()
    };
    if !path.is_absolute() || path.to_string_lossy().contains('\0') {
        return Err(invalid_path());
    }
    let read_err = || {
        tr(
            "读不了所选文件，请检查文件是否还在以及访问权限。",
            "Couldn’t read the selected file. Check that it still exists and is readable.",
            "選択したファイルを読み込めませんでした。ファイルの存在とアクセス権を確認してください。",
        )
        .to_string()
    };
    let too_large = || {
        tr(
            "请选择不超过 32 MB 的单个文件。",
            "Choose a file up to 32 MB.",
            "32 MB 以下のファイルを選択してください。",
        )
        .to_string()
    };
    let link_meta = std::fs::symlink_metadata(path).map_err(|error| {
        eprintln!("selected_file metadata error: {error}");
        read_err()
    })?;
    if link_meta.file_type().is_symlink() {
        return Err(not_allowed());
    }
    if !link_meta.is_file() {
        return Err(not_regular());
    }
    let file = open_regular_nonblocking(path).map_err(|error| {
        eprintln!("selected_file open error: {error}");
        read_err()
    })?;
    let metadata = file.metadata().map_err(|error| {
        eprintln!("selected_file fstat error: {error}");
        read_err()
    })?;
    if !metadata.is_file() {
        return Err(not_regular());
    }
    let real = path.canonicalize().map_err(|error| {
        eprintln!("selected_file canonicalize error: {error}");
        read_err()
    })?;
    let real_meta = std::fs::symlink_metadata(&real).map_err(|_| read_err())?;
    if real_meta.file_type().is_symlink() || !same_inode(&metadata, &real_meta) {
        return Err(not_allowed());
    }
    if is_blocked_home_path(&real, home) || !is_admitted_path(&real, now) {
        return Err(not_allowed());
    }
    if metadata.len() > MAX_BYTES {
        return Err(too_large());
    }
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| {
            eprintln!("selected_file read error: {error}");
            read_err()
        })?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(too_large());
    }
    Ok(SelectedFile {
        name: real
            .file_name()
            .ok_or_else(|| {
                tr(
                    "所选文件缺少文件名。",
                    "The selected file doesn’t have a valid name.",
                    "選択したファイルに有効なファイル名がありません。",
                )
            })?
            .to_string_lossy()
            .into_owned(),
        bytes_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

    fn scratch_dir(label: &str) -> PathBuf {
        let seq = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "molis-selected-file-{label}-{}-{seq}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn selected_file_is_bounded_and_enforces_allowlist_and_home_exclusion() {
        let root = scratch_dir("allowlist");
        let home = root.join("home");
        let docs = root.join("docs");
        std::fs::create_dir_all(home.join("config")).unwrap();
        std::fs::create_dir_all(&docs).unwrap();
        let now = Instant::now();

        let path = docs.join("chosen.txt");
        std::fs::write(&path, b"chosen content").unwrap();
        // Rejects path that was never returned by shelf_find_files.
        assert!(read_selected_with(&path, &home, now).is_err());

        admit_search_results_with_home(std::slice::from_ref(&path), &home, now);
        let selected = read_selected_with(&path, &home, now).unwrap();
        assert_eq!(selected.name, "chosen.txt");
        assert_eq!(selected.bytes_base64, "Y2hvc2VuIGNvbnRlbnQ=");

        // Expired admission is refused.
        let expired = now + ADMIT_TTL + Duration::from_secs(1);
        assert!(read_selected_with(&path, &home, expired).is_err());

        // Relative path and directory are refused.
        assert!(read_selected_with(Path::new("chosen.txt"), &home, now).is_err());
        assert!(read_selected_with(&docs, &home, now).is_err());

        // Secret inside Molis Work Home is never admitted or read.
        let secret = home.join("config").join("native-session-token");
        std::fs::write(&secret, b"super-secret-native-token").unwrap();
        admit_search_results_with_home(std::slice::from_ref(&secret), &home, now);
        assert!(read_selected_with(&secret, &home, now).is_err());

        // Over 32 MB is refused.
        std::fs::File::create(&path)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert!(read_selected_with(&path, &home, now).is_err());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn selected_file_rejects_symlinks_and_fifos_without_blocking() {
        use std::ffi::CString;
        use std::os::unix::ffi::OsStrExt;
        use std::os::unix::fs::symlink;

        let root = scratch_dir("unix");
        let home = root.join("home");
        let docs = root.join("docs");
        std::fs::create_dir_all(&home).unwrap();
        std::fs::create_dir_all(&docs).unwrap();
        let now = Instant::now();

        let target = docs.join("real.txt");
        std::fs::write(&target, b"real").unwrap();
        admit_search_results_with_home(std::slice::from_ref(&target), &home, now);

        let link = docs.join("link.txt");
        symlink(&target, &link).unwrap();
        admit_search_results_with_home(std::slice::from_ref(&link), &home, now);
        assert!(read_selected_with(&link, &home, now).is_err());

        let fifo = docs.join("pipe.fifo");
        let c_fifo = CString::new(fifo.as_os_str().as_bytes()).unwrap();
        let rc = unsafe { libc::mkfifo(c_fifo.as_ptr(), 0o600) };
        assert_eq!(rc, 0);
        // Must reject immediately without blocking on FIFO open.
        assert!(read_selected_with(&fifo, &home, now).is_err());
        let fifo_fd = open_regular_nonblocking(&fifo).unwrap();
        assert!(!fifo_fd.metadata().unwrap().is_file());

        std::fs::remove_dir_all(root).unwrap();
    }
}
