//! Metadata and bytes stay beneath an open authorized directory descriptor.
//! openat/O_NOFOLLOW prevents a changed directory or symlink from redirecting access.
use crate::context_directories::{DirectoryPreview, FilePreview};
use std::ffi::{CStr, CString};
use std::fs::{File, Metadata, OpenOptions};
use std::io::{Read, Write};
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::macos::fs::MetadataExt as _;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

// Onboarding reads any number of files of any size (user 2026-10-22); the page asks for them one at a time. What stays bounded
// is the walk: how many directory entries one preview visits and how deep it goes, so pointing at a huge tree (a home
// directory, a mounted volume) cannot keep the walk going without end. Those bound directories, not the files chosen.
const MAX_ENTRIES: usize = 10_000;
const MAX_DEPTH: usize = 8;

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
/// A file onboarding does not take in by its name alone.
fn skipped_file(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    let extension = Path::new(&name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let secret = name == ".env"
        || name.starts_with(".env.")
        || matches!(
            extension,
            "pem" | "key" | "p12" | "pfx" | "keystore" | "jks"
        )
        || ["id_rsa", "id_ed25519", "id_ecdsa", "id_dsa"]
            .iter()
            .any(|key| name == *key || name == format!("{key}.pub"));
    let hidden = name.starts_with('.')
        && !HIDDEN_KEPT
            .iter()
            .any(|kept| name == *kept || name.starts_with(&format!("{kept}.")));
    secret || hidden || UNREADABLE.contains(&extension)
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
        return Err("请选择普通工作目录，隐藏目录和依赖目录不参与整理".into());
    }
    let directory = OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_DIRECTORY | libc::O_NOFOLLOW | libc::O_CLOEXEC)
        .open(path)
        .map_err(|_| "目录已移动、不可访问或授权失效，请重新选择")?;
    if directory
        .metadata()
        .map_err(|_| "无法确认目录状态")?
        .st_flags()
        & libc::UF_HIDDEN
        != 0
    {
        return Err("隐藏目录不参与整理".into());
    }
    Ok(directory)
}

fn open_child(directory: &File, name: &str, is_directory: bool) -> Result<File, String> {
    let name = CString::new(name).map_err(|_| "文件路径无效")?;
    let flags = libc::O_RDONLY
        | libc::O_NOFOLLOW
        | libc::O_CLOEXEC
        | libc::O_NONBLOCK
        | if is_directory { libc::O_DIRECTORY } else { 0 };
    // name is one validated component and the descriptor remains owned by directory.
    let fd = unsafe { libc::openat(directory.as_raw_fd(), name.as_ptr(), flags) };
    if fd < 0 {
        Err("文件已移走、是链接或无法访问，请刷新预览".into())
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

struct Scan {
    files: Vec<FilePreview>,
    skipped: usize,
    visited: usize,
    truncated: bool,
    since_ms: u64,
}

fn scan(directory: &File, prefix: &str, depth: usize, output: &mut Scan) -> Result<(), String> {
    // A fresh descriptor gives readdir its own offset and leaves the caller's handle intact.
    let stream_fd = unsafe {
        libc::openat(
            directory.as_raw_fd(),
            c".".as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC,
        )
    };
    if stream_fd < 0 {
        return Err("无法预览目录，请重新选择".into());
    }
    let stream = unsafe { libc::fdopendir(stream_fd) };
    if stream.is_null() {
        unsafe {
            libc::close(stream_fd);
        }
        return Err("无法预览目录，请重新选择".into());
    }
    let stream = DirectoryStream(stream);
    loop {
        unsafe {
            *libc::__error() = 0;
        }
        let entry = unsafe { libc::readdir(stream.0) };
        if entry.is_null() {
            if unsafe { *libc::__error() } != 0 {
                return Err("部分目录无法访问，请刷新预览".into());
            }
            break;
        }
        let name = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) };
        if name.to_bytes() == b"." || name.to_bytes() == b".." {
            continue;
        }
        if output.visited >= MAX_ENTRIES {
            output.truncated = true;
            break;
        }
        output.visited += 1;
        let Ok(name) = name.to_str() else {
            output.skipped += 1;
            continue;
        };
        if name.starts_with('.') && skipped_file(name)
            || IGNORED_FOLDERS.contains(&name.to_ascii_lowercase().as_str())
        {
            output.skipped += 1;
            continue;
        }
        let component = CString::new(name).map_err(|_| "文件名称无效")?;
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
            output.skipped += 1;
            continue;
        }
        let info = unsafe { info.assume_init() };
        if info.st_flags & libc::UF_HIDDEN != 0 {
            output.skipped += 1;
            continue;
        }
        let path = if prefix.is_empty() {
            name.to_string()
        } else {
            format!("{prefix}/{name}")
        };
        match info.st_mode & libc::S_IFMT {
            libc::S_IFDIR => {
                if depth >= MAX_DEPTH {
                    output.skipped += 1;
                    output.truncated = true;
                    continue;
                }
                match open_child(directory, name, true) {
                    Ok(child) => {
                        if scan(&child, &path, depth + 1, output).is_err() {
                            output.skipped += 1;
                        }
                    }
                    Err(_) => output.skipped += 1,
                }
                if output.visited >= MAX_ENTRIES && output.truncated {
                    break;
                }
            }
            libc::S_IFREG if !skipped_file(name) => {
                let modified_ms = modified_ms(info.st_mtime, info.st_mtime_nsec);
                if modified_ms < output.since_ms {
                    output.skipped += 1;
                    continue;
                }
                output.files.push(FilePreview {
                    path,
                    size: info.st_size.max(0) as u64,
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
            _ => output.skipped += 1,
        }
    }
    Ok(())
}

pub(crate) fn preview(directory: &File, days: u16) -> Result<DirectoryPreview, String> {
    if ![0, 7, 30, 90].contains(&days) {
        return Err("时间范围无效".into());
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "系统时间无效")?
        .as_millis() as u64;
    let since_ms = if days == 0 {
        0
    } else {
        now.saturating_sub(u64::from(days) * 86_400_000)
    };
    let mut output = Scan {
        files: Vec::new(),
        skipped: 0,
        visited: 0,
        truncated: false,
        since_ms,
    };
    scan(directory, "", 0, &mut output)?;
    output.files.sort_by(|left, right| {
        right
            .modified_ms
            .cmp(&left.modified_ms)
            .then(left.path.cmp(&right.path))
    });
    Ok(DirectoryPreview {
        files: output.files,
        skipped: output.skipped,
        truncated: output.truncated,
    })
}

fn relative_components(path: &str) -> Result<Vec<&str>, String> {
    if path.is_empty() || path.len() > 4096 || path.contains(['\\', '\0']) {
        return Err("文件路径无效".into());
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
        return Err("文件不在允许的预览范围内".into());
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
    let mut parent = directory.try_clone().map_err(|_| "目录访问已中断")?;
    for component in &components[..components.len() - 1] {
        parent = open_child(&parent, component, true)?;
        if parent
            .metadata()
            .map_err(|_| "无法确认子目录状态")?
            .st_flags()
            & libc::UF_HIDDEN
            != 0
        {
            return Err("隐藏目录不参与整理".into());
        }
    }
    let file = open_child(&parent, components[components.len() - 1], false)?;
    let before = file.metadata().map_err(|_| "无法确认文件状态")?;
    if !before.is_file() || before.st_flags() & libc::UF_HIDDEN != 0 {
        return Err("只读取普通、非隐藏文件".into());
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
        return Err("文件自预览后已改变，请刷新后重新选择".into());
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
        let read = reader
            .read(&mut buffer)
            .map_err(|_| StreamFailure::File("无法读取文件正文".into()))?;
        if read == 0 {
            break;
        }
        sink.write_all(&buffer[..read])
            .map_err(|_| StreamFailure::Sink)?;
        copied += read as u64;
    }
    let after = file
        .metadata()
        .map_err(|_| StreamFailure::File("无法确认读取后的文件状态".into()))?;
    if copied != before.len()
        || before.len() != after.len()
        || before.mtime() != after.mtime()
        || before.mtime_nsec() != after.mtime_nsec()
        || before.ctime() != after.ctime()
        || before.ctime_nsec() != after.ctime_nsec()
    {
        return Err(StreamFailure::File(
            "文件在读取时改变，请刷新后重新选择".into(),
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
            "certs/server.pem",
            "id_rsa",
            "logo.png",
            "demo.mp4",
            "bundle.zip",
            "app.wasm",
            "old.xlsx",
        ] {
            assert!(relative_components(path).is_err(), "{path} is left out");
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
            .contains("改变"));
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
        assert!(result[0].reason.as_ref().unwrap().contains("改变"));
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
}
