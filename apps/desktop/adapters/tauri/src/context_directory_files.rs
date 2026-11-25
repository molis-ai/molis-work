//! Metadata and bytes stay beneath an open authorized directory descriptor.
//! openat/O_NOFOLLOW prevents a changed directory or symlink from redirecting access.
use crate::context_directories::{DirectoryPreview, FilePreview, SkippedReasons};
use crate::native_language::tr;
use std::ffi::{CStr, CString};
use std::fs::{File, Metadata, OpenOptions};
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::macos::fs::MetadataExt as _;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

// Onboarding reads any number of files of any size (user 2026-10-22); the page asks for them one at a time. The walk emits live
// progress and checks `cancel_scan` so the person can stop a huge tree at any time and keep what was scanned; a high safety ceiling
// bounds runaway volumes (ONB-36, C4).
const MAX_ENTRIES: usize = 500_000;
const MAX_DEPTH: usize = 16;
const PROGRESS_STRIDE: usize = 250;
const MAX_IGNORED_RULES: usize = 24;

// Which entries onboarding takes in: the same rule as `contextFileSkip` in the contracts' services/materials (the Host checks the
// selection with that one; this is the shell's copy for its own walk, as the shell keeps its own loopback test). A folder that is
// never material is not walked; a file is taken unless it is a secret by its name, a hidden file other than one that only says how
// the project is kept, or a kind whose body cannot be read as text. Any other file, a stranger suffix or none, is read for what
// it holds (ONB-37). `tests/context-onboarding.test.ts` and `file_rule_matches_the_hosts` below hold the same cases.
const IGNORED_FOLDERS: [&str; 11] = [
    "node_modules",
    "vendor",
    "dist",
    "build",
    "target",
    "out",
    "coverage",
    "__pycache__",
    "venv",
    "pods",
    "carthage",
];
const HIDDEN_KEPT: [&str; 9] = [
    ".gitignore",
    ".gitattributes",
    ".editorconfig",
    ".dockerignore",
    ".prettierrc",
    ".eslintrc",
    ".nvmrc",
    ".node-version",
    ".tool-versions",
];
const UNREADABLE: [&str; 69] = [
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "tif", "tiff", "heic", "heif", "ico", "icns",
    "psd", "sketch", "fig", "mp3", "wav", "m4a", "aac", "aiff", "aif", "flac", "ogg", "mp4", "mov",
    "m4v", "webm", "avi", "mkv", "zip", "gz", "tgz", "bz2", "xz", "7z", "rar", "tar", "dmg", "pkg",
    "iso", "jar", "war", "exe", "dll", "so", "dylib", "a", "o", "obj", "class", "pyc", "wasm",
    "bin", "dat", "db", "sqlite", "sqlite3", "woff", "woff2", "ttf", "otf", "eot", "doc", "xls",
    "xlsx", "ppt", "pptx", "numbers", "pages",
];

/// A folder that is never material: hidden, dependencies, build output.
fn ignored_folder(name: &str) -> bool {
    name.starts_with('.') || IGNORED_FOLDERS.contains(&name.to_ascii_lowercase().as_str())
}
/// Why a file is not taken in by its name alone (`secret`, `ignored`, or `unreadable`).
fn file_skip_reason(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    let extension = Path::new(&lower)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let env_template = matches!(
        lower.as_str(),
        ".env.example" | ".env.sample" | ".env.template"
    );
    let secret = (!env_template && (lower == ".env" || lower.starts_with(".env.")))
        || matches!(
            extension,
            "pem" | "key" | "p12" | "pfx" | "keystore" | "jks"
        )
        || ["id_rsa", "id_ed25519", "id_ecdsa", "id_dsa"]
            .iter()
            .any(|key| lower == *key || lower == format!("{key}.pub"))
        || (lower.starts_with("credentials") && lower.ends_with(".json"))
        || ((lower.starts_with("service-account") || lower.starts_with("service_account"))
            && lower.ends_with(".json"))
        || (lower.starts_with("client_secret") && lower.ends_with(".json"))
        || lower == "auth.json"
        || matches!(lower.as_str(), ".npmrc" | ".netrc" | ".pypirc" | ".pgpass")
        || lower.starts_with("secrets.")
        || lower.starts_with("secret.")
        || extension == "tfstate"
        || extension == "tfvars"
        || lower.contains(".tfstate.");
    if secret {
        return Some("secret");
    }
    let hidden = !env_template
        && lower.starts_with('.')
        && !HIDDEN_KEPT
            .iter()
            .any(|kept| lower == *kept || lower.starts_with(&format!("{kept}.")));
    if hidden {
        return Some("ignored");
    }
    if UNREADABLE.contains(&extension) {
        return Some("unreadable");
    }
    None
}

/// A file onboarding does not take in by its name alone.
fn skipped_file(name: &str) -> bool {
    file_skip_reason(name).is_some()
}
fn modified_ms(seconds: i64, nanos: i64) -> u64 {
    (i128::from(seconds) * 1000 + i128::from(nanos) / 1_000_000).max(0) as u64
}

pub(crate) fn open_root(path: &Path) -> Result<File, String> {
    if path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(ignored_folder)
    {
        return Err(tr(
            "请选择普通工作文件夹，隐藏文件夹和依赖文件夹不参与整理。",
            "Choose a regular folder. Hidden and dependency folders aren’t included.",
            "通常のフォルダーを選択してください。隠しフォルダーや依存関係フォルダーは対象外です。",
        )
        .into());
    }
    let directory = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)
        .map_err(|_| {
            tr(
                "文件夹已移动、无法访问或授权已失效，请重新选择。",
                "This folder moved, can’t be read, or its permission expired. Please select it again.",
                "フォルダーが移動されたか、アクセスできない状態です。もう一度選択してください。",
            )
        })?;
    if directory
        .metadata()
        .map_err(|_| {
            tr(
                "无法确认文件夹状态。",
                "Couldn’t check folder status.",
                "フォルダーの状態を確認できませんでした。",
            )
        })?
        .st_flags()
        & libc::UF_HIDDEN
        != 0
    {
        return Err(tr(
            "隐藏文件夹不参与整理。",
            "Hidden folders aren’t included.",
            "隠しフォルダーは対象外です。",
        )
        .into());
    }
    Ok(directory)
}

fn open_child(directory: &File, name: &str, is_directory: bool) -> Result<File, String> {
    let name = CString::new(name).map_err(|_| {
        tr(
            "文件路径无效。",
            "This file path isn’t valid.",
            "ファイルパスが無効です。",
        )
    })?;
    let flags = libc::O_RDONLY
        | libc::O_NOFOLLOW
        | libc::O_CLOEXEC
        | libc::O_NONBLOCK
        | if is_directory { libc::O_DIRECTORY } else { 0 };
    // name is one validated component and the descriptor remains owned by directory.
    let fd = unsafe { libc::openat(directory.as_raw_fd(), name.as_ptr(), flags) };
    if fd < 0 {
        Err(tr(
            "文件已移走、是快捷方式或无法访问，刷新预览后再试即可。",
            "This file moved, is a link, or can’t be read. Refresh the preview and try again.",
            "ファイルが移動されたかリンクになっているため読み取れません。プレビューを更新してからお試しください。",
        )
        .into())
    } else {
        Ok(unsafe { File::from_raw_fd(fd) })
    }
}

struct DirectoryStream(*mut libc::DIR);
impl Drop for DirectoryStream {
    fn drop(&mut self) {
        unsafe {
            libc::closedir(self.0);
        }
    }
}

struct Scan<'a> {
    files: Vec<FilePreview>,
    bytes: u64,
    skipped: usize,
    visited: usize,
    resume_offset: usize,
    truncated: bool,
    cancelled: bool,
    since_ms: u64,
    reasons: SkippedReasons,
    ignored_rules: Vec<String>,
    cancel: &'a AtomicBool,
    on_progress: &'a mut dyn FnMut(usize, usize, u64, &str),
}

impl Scan<'_> {
    fn record_rule(&mut self, rule: &str) {
        if rule.is_empty() || self.ignored_rules.len() >= MAX_IGNORED_RULES {
            return;
        }
        if !self.ignored_rules.iter().any(|existing| existing == rule) {
            self.ignored_rules.push(rule.to_string());
        }
    }

    fn record_skipped_file(&mut self, name: &str, reason: &str) {
        self.skipped += 1;
        match reason {
            "secret" => self.reasons.secret += 1,
            "ignored" => {
                self.reasons.ignored += 1;
                self.record_rule(name);
            }
            _ => self.reasons.unreadable += 1,
        }
    }
}

fn scan(directory: &File, prefix: &str, depth: usize, output: &mut Scan<'_>) -> Result<(), String> {
    // A fresh descriptor gives readdir its own offset and leaves the caller's handle intact.
    let stream_fd = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            c".".as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC,
        )
    };
    if stream_fd < 0 {
        return Err(tr(
            "暂时无法预览这个文件夹，请重新选择。",
            "Couldn’t preview this folder. Please select it again.",
            "このフォルダーをプレビューできませんでした。もう一度選択してください。",
        )
        .into());
    }
    let stream = unsafe { libc::fdopendir(stream_fd) };
    if stream.is_null() {
        unsafe {
            libc::close(stream_fd);
        }
        return Err(tr(
            "暂时无法预览这个文件夹，请重新选择。",
            "Couldn’t preview this folder. Please select it again.",
            "このフォルダーをプレビューできませんでした。もう一度選択してください。",
        )
        .into());
    }
    // Collect and sort entries deterministically so a cancelled scan can resume from `resume_offset` without duplicating or dropping items.
    let mut raw_entries: Vec<(Vec<u8>, u8)> = Vec::new();
    {
        let stream = DirectoryStream(stream);
        loop {
            unsafe {
                *libc::__error() = 0;
            }
            let entry = unsafe { libc::readdir(stream.0) };
            if entry.is_null() {
                if unsafe { *libc::__error() } != 0 {
                    return Err(tr(
                        "部分子文件夹无法访问，请刷新预览。",
                        "Some folders couldn’t be read. Refresh the preview and try again.",
                        "一部のフォルダーを読み取れませんでした。プレビューを更新してください。",
                    )
                    .into());
                }
                break;
            }
            let name_bytes = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) }.to_bytes();
            if name_bytes == b"." || name_bytes == b".." {
                continue;
            }
            raw_entries.push((name_bytes.to_vec(), unsafe { (*entry).d_type }));
        }
    }
    raw_entries.sort_unstable_by(|left, right| left.0.cmp(&right.0));
    for (raw_name, d_type) in raw_entries {
        if output.cancel.load(Ordering::Relaxed) {
            output.cancelled = true;
            output.truncated = true;
            break;
        }
        if output.visited.saturating_sub(output.resume_offset) >= MAX_ENTRIES {
            output.truncated = true;
            break;
        }
        output.visited += 1;
        let skipping_prior = output.visited <= output.resume_offset;
        let Ok(name) = std::str::from_utf8(&raw_name) else {
            if !skipping_prior {
                output.skipped += 1;
                output.reasons.unreadable += 1;
            }
            continue;
        };
        if skipping_prior
            && ((d_type != libc::DT_DIR && d_type != libc::DT_UNKNOWN)
                || ignored_folder(name)
                || depth >= MAX_DEPTH)
        {
            continue;
        }
        if let Some(reason) = (!skipping_prior && name.starts_with('.'))
            .then(|| file_skip_reason(name))
            .flatten()
        {
            output.record_skipped_file(name, reason);
            continue;
        }
        let component = CString::new(name).map_err(|_| {
            tr(
                "文件名称无效。",
                "This file name isn’t valid.",
                "ファイル名が無効です。",
            )
        })?;
        let mut info = std::mem::MaybeUninit::<libc::stat>::uninit();
        let result = unsafe {
            libc::fstatat(
                directory.as_raw_fd(),
                component.as_ptr(),
                info.as_mut_ptr(),
                libc::AT_SYMLINK_NOFOLLOW,
            )
        };
        if result != 0 {
            if !skipping_prior {
                output.skipped += 1;
                output.reasons.unreadable += 1;
            }
            continue;
        }
        let info = unsafe { info.assume_init() };
        if info.st_flags & libc::UF_HIDDEN != 0 {
            if !skipping_prior {
                output.skipped += 1;
                output.reasons.ignored += 1;
            }
            continue;
        }
        let path = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{prefix}/{name}")
        };
        match info.st_mode & libc::S_IFMT {
            libc::S_IFDIR => {
                // A hidden folder and a folder by these names are left out, as the host's rule does; a file named `build` or `out` is read.
                let lower = name.to_ascii_lowercase();
                if ignored_folder(name) {
                    if !skipping_prior {
                        output.skipped += 1;
                        output.reasons.ignored += 1;
                        output.record_rule(if name.starts_with('.') { name } else { &lower });
                    }
                    continue;
                }
                if depth >= MAX_DEPTH {
                    if !skipping_prior {
                        output.skipped += 1;
                        output.reasons.ignored += 1;
                        output.truncated = true;
                    }
                    continue;
                }
                match open_child(directory, name, true) {
                    Ok(child) => {
                        if scan(&child, &path, depth + 1, output).is_err() && !skipping_prior {
                            output.skipped += 1;
                            output.reasons.unreadable += 1;
                        }
                    }
                    Err(_) => {
                        if !skipping_prior {
                            output.skipped += 1;
                            output.reasons.unreadable += 1;
                        }
                    }
                }
                if output.cancelled
                    || (output.visited.saturating_sub(output.resume_offset) >= MAX_ENTRIES
                        && output.truncated)
                {
                    break;
                }
            }
            libc::S_IFREG => {
                if !skipping_prior {
                    match file_skip_reason(name) {
                        Some(reason) => output.record_skipped_file(name, reason),
                        None => {
                            let modified_ms = modified_ms(info.st_mtime, info.st_mtime_nsec);
                            if modified_ms < output.since_ms {
                                output.skipped += 1;
                                output.reasons.time += 1;
                            } else {
                                let size = info.st_size.max(0) as u64;
                                output.bytes = output.bytes.saturating_add(size);
                                output.files.push(FilePreview {
                                    path: path.clone(),
                                    size,
                                    modified_ms,
                                    identity: format!(
                                        "{}:{}:{}:{}:{}:{}",
                                        info.st_dev,
                                        info.st_ino,
                                        info.st_mtime,
                                        info.st_mtime_nsec,
                                        info.st_ctime,
                                        info.st_ctime_nsec
                                    ),
                                });
                            }
                        }
                    }
                }
            }
            _ => {
                if !skipping_prior {
                    output.skipped += 1;
                    output.reasons.unreadable += 1;
                }
            }
        }
        if !skipping_prior && output.visited % PROGRESS_STRIDE == 0 {
            (output.on_progress)(output.visited, output.files.len(), output.bytes, &path);
        }
    }
    Ok(())
}

pub(crate) fn preview_with_progress<F>(
    directory: &File,
    days: u16,
    resume_offset: usize,
    cancel: &AtomicBool,
    mut on_progress: F,
) -> Result<DirectoryPreview, String>
where
    F: FnMut(usize, usize, u64, &str),
{
    if ![0, 7, 30, 90].contains(&days) {
        return Err(tr(
            "时间范围无效。",
            "Invalid time range.",
            "期間の設定が無効です。",
        )
        .into());
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            tr(
                "系统时间无效。",
                "System clock isn’t valid.",
                "システム時刻が無効です。",
            )
        })?
        .as_millis() as u64;
    let since_ms = if days == 0 {
        0
    } else {
        now.saturating_sub(u64::from(days) * 86_400_000)
    };
    let mut output = Scan {
        files: Vec::new(),
        bytes: 0,
        skipped: 0,
        visited: 0,
        resume_offset,
        truncated: false,
        cancelled: false,
        since_ms,
        reasons: SkippedReasons::default(),
        ignored_rules: Vec::new(),
        cancel,
        on_progress: &mut on_progress,
    };
    scan(directory, "", 0, &mut output)?;
    output.files.sort_by(|left, right| {
        right
            .modified_ms
            .cmp(&left.modified_ms)
            .then(left.path.cmp(&right.path))
    });
    let skipped_reasons = if output.skipped > 0 {
        Some(output.reasons)
    } else {
        None
    };
    Ok(DirectoryPreview {
        files: output.files,
        skipped: output.skipped,
        truncated: output.truncated,
        cancelled: output.cancelled,
        total_entries: output.visited,
        skipped_reasons,
        ignored_rules: output.ignored_rules,
    })
}

#[cfg(test)]
pub(crate) fn preview(directory: &File, days: u16) -> Result<DirectoryPreview, String> {
    preview_with_progress(directory, days, 0, &AtomicBool::new(false), |_, _, _, _| {})
}

fn relative_components(path: &str) -> Result<Vec<&str>, String> {
    if path.is_empty() || path.len() > 4096 || path.contains(['\\', '\0']) {
        return Err(tr(
            "文件路径无效。",
            "This file path isn’t valid.",
            "ファイルパスが無効です。",
        )
        .into());
    }
    let components = path.split('/').collect::<Vec<_>>();
    if components.len() > MAX_DEPTH + 1
        || components
            .iter()
            .any(|part| part.is_empty() || *part == "." || *part == "..")
        || components[..components.len() - 1]
            .iter()
            .any(|part| ignored_folder(part))
        || skipped_file(components[components.len() - 1])
    {
        return Err(tr(
            "这份文件不在可预览的范围内。",
            "This file isn’t within the allowed preview scope.",
            "このファイルはプレビュー可能な範囲外です。",
        )
        .into());
    }
    Ok(components)
}

/// Why one chosen file did not go on: the file itself (a reason the page shows beside it), or the place it was being sent.
#[derive(Debug)]
pub(crate) enum StreamFailure {
    File(String),
    Sink,
}

fn open_checked(directory: &File, expected: &FilePreview) -> Result<(File, Metadata), String> {
    let components = relative_components(&expected.path)?;
    let mut parent = directory.try_clone().map_err(|_| {
        tr(
            "文件夹访问已中断。",
            "Folder access was interrupted.",
            "フォルダーへのアクセスが中断されました。",
        )
    })?;
    for component in &components[..components.len() - 1] {
        parent = open_child(&parent, component, true)?;
        if parent
            .metadata()
            .map_err(|_| {
                tr(
                    "无法确认子文件夹状态。",
                    "Couldn’t check subfolder status.",
                    "サブフォルダーの状態を確認できませんでした。",
                )
            })?
            .st_flags()
            & libc::UF_HIDDEN
            != 0
        {
            return Err(tr(
                "隐藏文件夹不参与整理。",
                "Hidden folders aren’t included.",
                "隠しフォルダーは対象外です。",
            )
            .into());
        }
    }
    let file = open_child(&parent, components[components.len() - 1], false)?;
    let before = file.metadata().map_err(|_| {
        tr(
            "无法确认文件状态。",
            "Couldn’t check file status.",
            "ファイルの状態を確認できませんでした。",
        )
    })?;
    if !before.is_file() || before.st_flags() & libc::UF_HIDDEN != 0 {
        return Err(tr(
            "只读取普通、非隐藏的文件。",
            "Only regular, non-hidden files can be read.",
            "通常の非隠しファイルのみ読み込めます。",
        )
        .into());
    }
    let identity = format!(
        "{}:{}:{}:{}:{}:{}",
        before.dev(),
        before.ino(),
        before.mtime(),
        before.mtime_nsec(),
        before.ctime(),
        before.ctime_nsec()
    );
    if identity != expected.identity
        || before.len() != expected.size
        || modified_ms(before.mtime(), before.mtime_nsec()) != expected.modified_ms
    {
        return Err(tr(
            "文件在预览后发生了变化，刷新后再重新选择即可。",
            "This file changed after preview. Refresh and select it again.",
            "プレビュー後にファイルが変更されました。更新してからもう一度選択してください。",
        )
        .into());
    }
    Ok((file, before))
}

/// One chosen file, checked against its preview, written to `sink` piece by piece as it is read (any size, never whole in memory;
/// user 2026-10-22), and checked again afterwards: a file that changed while it was read is refused, and what was sent is not named.
pub(crate) fn stream_one(
    directory: &File,
    expected: &FilePreview,
    sink: &mut dyn Write,
) -> Result<(), StreamFailure> {
    let (file, before) = open_checked(directory, expected).map_err(StreamFailure::File)?;
    let mut reader = (&file).take(before.len());
    let mut buffer = vec![0_u8; 256 * 1024];
    let mut copied = 0_u64;
    loop {
        let read = reader.read(&mut buffer).map_err(|_| {
            StreamFailure::File(
                tr(
                    "没能读取文件内容。",
                    "Couldn’t read the file content.",
                    "ファイルの内容を読み込めませんでした。",
                )
                .into(),
            )
        })?;
        if read == 0 {
            break;
        }
        sink.write_all(&buffer[..read])
            .map_err(|_| StreamFailure::Sink)?;
        copied += read as u64;
    }
    let after = file.metadata().map_err(|_| {
        StreamFailure::File(
            tr(
                "没能确认读取后的文件状态。",
                "Couldn’t verify the file after reading.",
                "読み込み後のファイル状態を確認できませんでした。",
            )
            .into(),
        )
    })?;
    if copied != before.len()
        || before.len() != after.len()
        || before.mtime() != after.mtime()
        || before.mtime_nsec() != after.mtime_nsec()
        || before.ctime() != after.ctime()
        || before.ctime_nsec() != after.ctime_nsec()
    {
        return Err(StreamFailure::File(
            tr(
                "文件在读取时发生了变化，刷新后再重新选择即可。",
                "This file changed while being read. Refresh and select it again.",
                "読み込み中にファイルが変更されました。更新してからもう一度選択してください。",
            )
            .into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Read {
        path: String,
        data: Option<Vec<u8>>,
        reason: Option<String>,
    }
    /// Each file streamed into memory, as the Host would receive it.
    fn read(directory: &File, files: Vec<FilePreview>) -> Vec<Read> {
        files
            .into_iter()
            .map(|expected| {
                let mut sink = Vec::new();
                match stream_one(directory, &expected, &mut sink) {
                    Ok(()) => Read {
                        path: expected.path,
                        data: Some(sink),
                        reason: None,
                    },
                    Err(StreamFailure::File(reason)) => Read {
                        path: expected.path,
                        data: None,
                        reason: Some(reason),
                    },
                    Err(StreamFailure::Sink) => unreachable!("a Vec takes every write"),
                }
            })
            .collect()
    }
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            // Parallel tests can observe the same clock tick; the sequence keeps their directories distinct.
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "molis-directory-fixture-{}-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            std::fs::create_dir(&path).unwrap();
            Self(path)
        }
        fn root(&self) -> File {
            open_root(&self.0).unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn file_rule_matches_the_hosts() {
        // The same cases as `tests/context-onboarding.test.ts` (ONB-37): the shell walks with what the Host checks.
        for path in [
            "src/main.ts",
            "lib/util.js",
            "tool.py",
            "src/lib.rs",
            "cmd/main.go",
            "View.swift",
            "scripts/run.sh",
            "config.yaml",
            "Cargo.toml",
            "README",
            "LICENSE",
            "Makefile",
            ".gitignore",
            ".env.example",
            ".env.sample",
            ".env.template",
            "notes.weird-suffix",
            "paper.pdf",
            "brief.docx",
            "yarn.lock",
        ] {
            assert!(relative_components(path).is_ok(), "{path} is taken");
        }
        for path in [
            "node_modules/x/index.js",
            "dist/app.js",
            ".git/config",
            "src/.cache/a.txt",
            ".DS_Store",
            ".env",
            ".env.local",
            ".env.example.local",
            "certs/server.pem",
            "id_rsa",
            "logo.png",
            "demo.mp4",
            "bundle.zip",
            "app.wasm",
            "old.xlsx",
            "credentials.json",
            "service-account-prod.json",
            "service_account.json",
            "client_secret_app.json",
            "auth.json",
            ".npmrc",
            ".netrc",
            ".pypirc",
            ".pgpass",
            "secrets.yaml",
            "secrets.prod.yaml",
            "prod.tfstate",
            "prod.tfvars",
        ] {
            assert!(relative_components(path).is_err(), "{path} is left out");
        }
        for secret_name in [
            ".env",
            ".env.local",
            ".env.example.local",
            "credentials.json",
            "service-account-prod.json",
            "service_account.json",
            "client_secret_app.json",
            "auth.json",
            ".npmrc",
            ".netrc",
            ".pypirc",
            ".pgpass",
            "secrets.prod.yaml",
        ] {
            assert_eq!(
                file_skip_reason(secret_name),
                Some("secret"),
                "{secret_name} is secret"
            );
        }
        for safe_template in [".env.example", ".env.sample", ".env.template"] {
            assert_eq!(
                file_skip_reason(safe_template),
                None,
                "{safe_template} is allowed template"
            );
        }
    }
    #[test]
    fn previews_supported_metadata_and_reads_only_selected_files() {
        let fixture = Fixture::new();
        std::fs::write(fixture.0.join("notes.txt"), "chosen content").unwrap();
        std::fs::write(fixture.0.join("report.pdf"), [0, 1, 2, 255]).unwrap();
        std::fs::write(fixture.0.join("ignored.png"), "not supported").unwrap();
        std::fs::create_dir(fixture.0.join("node_modules")).unwrap();
        std::fs::write(fixture.0.join("node_modules/secret.txt"), "excluded").unwrap();
        std::fs::write(fixture.0.join(".hidden.txt"), "excluded").unwrap();
        let preview = preview(&fixture.root(), 0).unwrap();
        assert_eq!(preview.files.len(), 2);
        assert_eq!(preview.skipped, 3);
        let report = preview
            .files
            .into_iter()
            .find(|file| file.path == "report.pdf")
            .unwrap();
        let result = read(&fixture.root(), vec![report]);
        assert_eq!(result[0].data.as_deref().unwrap(), [0, 1, 2, 255]);
    }
    #[test]
    fn walk_leaves_out_only_folders_by_the_ignored_names() {
        // The host's rule (`contextFileSkip`, ONB-37) leaves out folders called build/out/target, never a file of that name.
        let fixture = Fixture::new();
        std::fs::write(fixture.0.join("build"), "#!/bin/sh").unwrap();
        std::fs::write(fixture.0.join("out"), "notes").unwrap();
        std::fs::create_dir(fixture.0.join("target")).unwrap();
        std::fs::write(fixture.0.join("target/app.rs"), "excluded").unwrap();
        std::fs::create_dir(fixture.0.join(".gitignore")).unwrap();
        std::fs::write(fixture.0.join(".gitignore/note.txt"), "excluded").unwrap();
        let preview = preview(&fixture.root(), 0).unwrap();
        let mut paths: Vec<_> = preview
            .files
            .iter()
            .map(|file| file.path.as_str())
            .collect();
        paths.sort();
        assert_eq!(paths, ["build", "out"]);
        assert_eq!(preview.skipped, 2);
    }
    #[test]
    fn previews_and_reads_any_number_of_files_of_any_size() {
        let fixture = Fixture::new();
        for index in 0..260 {
            std::fs::write(fixture.0.join(format!("note-{index}.txt")), "small").unwrap();
        }
        let large = vec![b'a'; 7_000_000];
        std::fs::write(fixture.0.join("large.txt"), &large).unwrap();
        let preview = preview(&fixture.root(), 0).unwrap();
        assert_eq!(preview.files.len(), 261);
        assert!(!preview.truncated);
        let result = read(&fixture.root(), preview.files);
        assert!(result.iter().all(|file| file.data.is_some()));
        let read_large = result.iter().find(|file| file.path == "large.txt").unwrap();
        assert_eq!(read_large.data.as_deref().unwrap(), large.as_slice());
    }
    #[test]
    fn rejects_links_traversal_hidden_paths_and_changed_files_with_partial_success() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let outside = Fixture::new();
        std::fs::write(outside.0.join("outside.txt"), "outside").unwrap();
        std::fs::write(fixture.0.join("keep.txt"), "keep").unwrap();
        std::fs::write(fixture.0.join("change.txt"), "before").unwrap();
        symlink(outside.0.join("outside.txt"), fixture.0.join("link.txt")).unwrap();
        symlink(&outside.0, fixture.0.join("linked-folder")).unwrap();
        let mut files = preview(&fixture.root(), 0).unwrap().files;
        assert_eq!(files.len(), 2);
        std::fs::write(fixture.0.join("change.txt"), "after the preview").unwrap();
        for path in [
            "../outside.txt",
            "/etc/passwd.txt",
            "link.txt",
            "linked-folder/outside.txt",
            ".hidden/a.txt",
            "node_modules/a.txt",
            "a//b.txt",
            "a/./b.txt",
        ] {
            files.push(FilePreview {
                path: path.into(),
                size: 7,
                modified_ms: 0,
                identity: String::new(),
            });
        }
        let result = read(&fixture.root(), files);
        assert_eq!(result.iter().filter(|file| file.data.is_some()).count(), 1);
        assert!(result
            .iter()
            .find(|file| file.path == "keep.txt")
            .unwrap()
            .data
            .is_some());
        assert!(result
            .iter()
            .find(|file| file.path == "change.txt")
            .unwrap()
            .reason
            .as_ref()
            .unwrap()
            .contains("变化"));
    }
    #[test]
    fn replacing_a_previewed_subdirectory_with_a_symlink_is_rejected() {
        use std::os::unix::fs::symlink;
        let fixture = Fixture::new();
        let outside = Fixture::new();
        std::fs::create_dir(fixture.0.join("docs")).unwrap();
        std::fs::write(fixture.0.join("docs/a.txt"), "original").unwrap();
        std::fs::write(outside.0.join("a.txt"), "outside").unwrap();
        let files = preview(&fixture.root(), 0).unwrap().files;
        std::fs::rename(fixture.0.join("docs"), fixture.0.join("old-docs")).unwrap();
        symlink(&outside.0, fixture.0.join("docs")).unwrap();
        assert!(read(&fixture.root(), files)[0].reason.is_some());
    }
    #[test]
    fn replacement_with_same_size_and_mtime_is_rejected() {
        let fixture = Fixture::new();
        let path = fixture.0.join("notes.txt");
        std::fs::write(&path, "before").unwrap();
        let original = std::fs::metadata(&path).unwrap();
        let files = preview(&fixture.root(), 0).unwrap().files;
        let replacement = fixture.0.join("replacement.txt");
        std::fs::write(&replacement, "after!").unwrap();
        let name = CString::new(replacement.to_str().unwrap()).unwrap();
        let time = libc::timespec {
            tv_sec: original.mtime(),
            tv_nsec: original.mtime_nsec(),
        };
        assert_eq!(
            unsafe { libc::utimensat(libc::AT_FDCWD, name.as_ptr(), [time, time].as_ptr(), 0) },
            0
        );
        std::fs::rename(replacement, &path).unwrap();
        let result = read(&fixture.root(), files);
        assert!(result[0].data.is_none());
        assert!(result[0].reason.as_ref().unwrap().contains("变化"));
    }
    #[test]
    fn previews_by_date_range() {
        let fixture = Fixture::new();
        for number in 0..3 {
            std::fs::write(fixture.0.join(format!("{number}.txt")), "a").unwrap();
        }
        let result = preview(&fixture.root(), 7).unwrap();
        assert_eq!(result.files.len(), 3);
        let old_path = CString::new(fixture.0.join("0.txt").to_str().unwrap()).unwrap();
        let old = libc::timespec {
            tv_sec: 1,
            tv_nsec: 0,
        };
        assert_eq!(
            unsafe { libc::utimensat(libc::AT_FDCWD, old_path.as_ptr(), [old, old].as_ptr(), 0) },
            0
        );
        assert!(!preview(&fixture.root(), 7)
            .unwrap()
            .files
            .iter()
            .any(|file| file.path == "0.txt"));
        assert!(preview(&fixture.root(), 1).is_err());
    }
    #[test]
    fn reports_total_entries_skipped_reasons_and_ignored_rules() {
        let fixture = Fixture::new();
        std::fs::write(fixture.0.join("notes.md"), "hello").unwrap();
        std::fs::write(fixture.0.join(".env"), "API_KEY=secret").unwrap();
        std::fs::write(fixture.0.join("photo.png"), [1, 2, 3]).unwrap();
        std::fs::write(fixture.0.join(".DS_Store"), "meta").unwrap();
        std::fs::create_dir(fixture.0.join("node_modules")).unwrap();
        std::fs::write(fixture.0.join("node_modules/pkg.js"), "x").unwrap();
        std::fs::write(fixture.0.join("old.txt"), "old").unwrap();
        let old_path = CString::new(fixture.0.join("old.txt").to_str().unwrap()).unwrap();
        let old = libc::timespec {
            tv_sec: 1,
            tv_nsec: 0,
        };
        assert_eq!(
            unsafe { libc::utimensat(libc::AT_FDCWD, old_path.as_ptr(), [old, old].as_ptr(), 0) },
            0
        );
        let result = preview(&fixture.root(), 7).unwrap();
        assert_eq!(result.files.len(), 1);
        assert_eq!(result.total_entries, 6);
        assert_eq!(result.skipped, 5);
        assert!(!result.cancelled);
        assert_eq!(
            result.skipped_reasons,
            Some(SkippedReasons {
                ignored: 2,
                secret: 1,
                unreadable: 1,
                time: 1,
            })
        );
        assert!(result
            .ignored_rules
            .iter()
            .any(|rule| rule == "node_modules"));
        assert!(result.ignored_rules.iter().any(|rule| rule == ".DS_Store"));
    }
    #[test]
    fn scans_past_ten_thousand_entries_with_progress_and_supports_cancellation() {
        let fixture = Fixture::new();
        std::fs::create_dir(fixture.0.join("sub")).unwrap();
        for index in 0..10_500 {
            std::fs::write(fixture.0.join(format!("sub/f-{index}.txt")), "x").unwrap();
        }
        let mut ticks = 0_usize;
        let full = preview_with_progress(
            &fixture.root(),
            0,
            0,
            &AtomicBool::new(false),
            |visited, kept, _bytes, path| {
                ticks += 1;
                assert!(visited >= kept);
                assert!(!path.is_empty());
            },
        )
        .unwrap();
        assert_eq!(full.files.len(), 10_500);
        assert_eq!(full.total_entries, 10_501);
        assert!(!full.truncated);
        assert!(!full.cancelled);
        assert!(ticks >= 40);

        let cancel = AtomicBool::new(false);
        let partial = preview_with_progress(&fixture.root(), 0, 0, &cancel, |visited, _, _, _| {
            if visited >= 500 {
                cancel.store(true, Ordering::SeqCst);
            }
        })
        .unwrap();
        assert!(partial.cancelled);
        assert!(partial.truncated);
        assert!(!partial.files.is_empty());
        assert!(partial.files.len() < 10_500);
    }
    #[test]
    fn cancels_and_resumes_from_offset_without_duplicating_or_dropping_files() {
        let fixture = Fixture::new();
        std::fs::create_dir(fixture.0.join("alpha")).unwrap();
        std::fs::create_dir(fixture.0.join("beta")).unwrap();
        std::fs::create_dir(fixture.0.join("node_modules")).unwrap();
        std::fs::write(fixture.0.join("node_modules/pkg.js"), "ignored").unwrap();
        std::fs::write(fixture.0.join(".env"), "SECRET=1").unwrap();
        std::fs::write(fixture.0.join(".DS_Store"), "meta").unwrap();
        std::fs::write(fixture.0.join("beta/cover.png"), [1, 2, 3]).unwrap();
        for index in 0..400 {
            std::fs::write(fixture.0.join(format!("alpha/a-{index:03}.md")), "a").unwrap();
            std::fs::write(fixture.0.join(format!("beta/b-{index:03}.md")), "b").unwrap();
        }
        let full = preview(&fixture.root(), 0).unwrap();
        assert_eq!(full.files.len(), 800);
        assert_eq!(full.skipped, 4);

        let cancel_first = AtomicBool::new(false);
        let first =
            preview_with_progress(&fixture.root(), 0, 0, &cancel_first, |visited, _, _, _| {
                if visited >= 250 {
                    cancel_first.store(true, Ordering::SeqCst);
                }
            })
            .unwrap();
        assert!(first.cancelled);
        assert!(first.truncated);
        assert!(first.total_entries >= 250 && first.total_entries < full.total_entries);

        let cancel_second = AtomicBool::new(false);
        let second = preview_with_progress(
            &fixture.root(),
            0,
            first.total_entries,
            &cancel_second,
            |visited, _, _, _| {
                if visited >= first.total_entries + 250 {
                    cancel_second.store(true, Ordering::SeqCst);
                }
            },
        )
        .unwrap();
        assert!(second.cancelled);
        assert!(second.total_entries > first.total_entries);

        let third = preview_with_progress(
            &fixture.root(),
            0,
            second.total_entries,
            &AtomicBool::new(false),
            |_, _, _, _| {},
        )
        .unwrap();
        assert!(!third.cancelled);
        assert!(!third.truncated);
        assert_eq!(third.total_entries, full.total_entries);

        let mut combined_paths: Vec<String> = first
            .files
            .iter()
            .chain(second.files.iter())
            .chain(third.files.iter())
            .map(|file| file.path.clone())
            .collect();
        combined_paths.sort();
        let mut expected_paths: Vec<String> =
            full.files.iter().map(|file| file.path.clone()).collect();
        expected_paths.sort();
        assert_eq!(combined_paths, expected_paths);
        assert_eq!(first.skipped + second.skipped + third.skipped, full.skipped);
        let sum_reason = |pick: fn(&SkippedReasons) -> usize| {
            first.skipped_reasons.as_ref().map_or(0, pick)
                + second.skipped_reasons.as_ref().map_or(0, pick)
                + third.skipped_reasons.as_ref().map_or(0, pick)
        };
        let expected_reasons = full.skipped_reasons.unwrap();
        assert_eq!(sum_reason(|r| r.ignored), expected_reasons.ignored);
        assert_eq!(sum_reason(|r| r.secret), expected_reasons.secret);
        assert_eq!(sum_reason(|r| r.unreadable), expected_reasons.unreadable);
        assert_eq!(sum_reason(|r| r.time), expected_reasons.time);
    }
}
