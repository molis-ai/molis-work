//! Metadata and bytes stay beneath an open authorized directory descriptor.
//! openat/O_NOFOLLOW prevents a changed directory or symlink from redirecting access.
use crate::context_directories::{DirectoryPreview, DirectoryRead, FilePreview, FileRead};
use base64::{engine::general_purpose::STANDARD, Engine};
use std::collections::HashSet;
use std::ffi::{CStr, CString};
use std::fs::{File, OpenOptions};
use std::io::Read;
use std::os::fd::{AsRawFd, FromRawFd};
use std::os::macos::fs::MetadataExt as _;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_ENTRIES: usize = 10_000;
const MAX_PREVIEW: usize = 200;
const MAX_DEPTH: usize = 8;
const MAX_FILES: usize = 50;
const MAX_BYTES: u64 = 6_000_000;

fn excluded(name: &str) -> bool {
    name.starts_with('.')
        || matches!(
            name.to_ascii_lowercase().as_str(),
            "node_modules"
                | "vendor"
                | "target"
                | "dist"
                | "build"
                | "__pycache__"
                | "pods"
                | "carthage"
        )
}
fn supported(path: &str) -> bool {
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(
        extension.as_str(),
        "md" | "markdown" | "txt" | "csv" | "json" | "html" | "htm" | "pdf" | "docx"
    )
}
fn modified_ms(seconds: i64, nanos: i64) -> u64 {
    (i128::from(seconds) * 1000 + i128::from(nanos) / 1_000_000).max(0) as u64
}

pub(crate) fn open_root(path: &Path) -> Result<File, String> {
    if path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(excluded)
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
        if excluded(name) {
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
            libc::S_IFREG if supported(name) => {
                let modified_ms = modified_ms(info.st_mtime, info.st_mtime_nsec);
                if modified_ms < output.since_ms {
                    output.skipped += 1;
                    continue;
                }
                output.files.push(FilePreview {
                    path,
                    size: info.st_size.max(0) as u64,
                    modified_ms,
                    identity: format!("{}:{}:{}:{}:{}:{}", info.st_dev, info.st_ino, info.st_mtime, info.st_mtime_nsec, info.st_ctime, info.st_ctime_nsec),
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
    if output.files.len() > MAX_PREVIEW {
        output.truncated = true;
        output.skipped += output.files.len() - MAX_PREVIEW;
        output.files.truncate(MAX_PREVIEW);
    }
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
            .any(|part| part.is_empty() || *part == "." || *part == ".." || excluded(part))
        || !supported(path)
    {
        return Err("文件不在允许的预览范围内".into());
    }
    Ok(components)
}

fn read_one(directory: &File, expected: &FilePreview) -> Result<String, String> {
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
    let mut file = open_child(&parent, components[components.len() - 1], false)?;
    let before = file.metadata().map_err(|_| "无法确认文件状态")?;
    if !before.is_file() || before.st_flags() & libc::UF_HIDDEN != 0 {
        return Err("只读取普通、非隐藏文件".into());
    }
    let identity = format!("{}:{}:{}:{}:{}:{}", before.dev(), before.ino(), before.mtime(), before.mtime_nsec(), before.ctime(), before.ctime_nsec());
    if identity != expected.identity || before.len() != expected.size
        || modified_ms(before.mtime(), before.mtime_nsec()) != expected.modified_ms
    {
        return Err("文件自预览后已改变，请刷新后重新选择".into());
    }
    if before.len() > MAX_BYTES {
        return Err("文件超过 6 MB，请缩小范围".into());
    }
    let mut bytes = Vec::with_capacity(before.len() as usize);
    (&mut file)
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "无法读取文件正文")?;
    let after = file.metadata().map_err(|_| "无法确认读取后的文件状态")?;
    if bytes.len() as u64 != before.len()
        || before.len() != after.len()
        || before.mtime() != after.mtime()
        || before.mtime_nsec() != after.mtime_nsec()
        || before.ctime() != after.ctime()
        || before.ctime_nsec() != after.ctime_nsec()
    {
        return Err("文件在读取时改变，请刷新后重新选择".into());
    }
    Ok(STANDARD.encode(bytes))
}

pub(crate) fn read(directory: &File, files: Vec<FilePreview>) -> Result<DirectoryRead, String> {
    if files.len() > MAX_FILES {
        return Err("每轮最多读取 50 份文件，请缩小范围".into());
    }
    let total = files
        .iter()
        .try_fold(0u64, |sum, file| sum.checked_add(file.size))
        .ok_or("文件总大小无效")?;
    if total > MAX_BYTES {
        return Err("每轮文件总大小最多 6 MB，请缩小范围".into());
    }
    let mut seen = HashSet::new();
    if files.iter().any(|file| !seen.insert(&file.path)) {
        return Err("同一文件不能重复选择".into());
    }
    Ok(DirectoryRead {
        files: files
            .into_iter()
            .map(|expected| {
                let result = read_one(directory, &expected);
                match result {
                    Ok(data) => FileRead {
                        path: expected.path,
                        data: Some(data),
                        reason: None,
                    },
                    Err(reason) => FileRead {
                        path: expected.path,
                        data: None,
                        reason: Some(reason),
                    },
                }
            })
            .collect(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Fixture(std::path::PathBuf);
    impl Fixture {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "molis-directory-fixture-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
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
        let result = read(&fixture.root(), vec![report]).unwrap();
        assert_eq!(
            STANDARD
                .decode(result.files[0].data.as_ref().unwrap())
                .unwrap(),
            [0, 1, 2, 255]
        );
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
        let result = read(&fixture.root(), files).unwrap();
        assert_eq!(
            result
                .files
                .iter()
                .filter(|file| file.data.is_some())
                .count(),
            1
        );
        assert!(result
            .files
            .iter()
            .find(|file| file.path == "keep.txt")
            .unwrap()
            .data
            .is_some());
        assert!(result
            .files
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
        assert!(read(&fixture.root(), files).unwrap().files[0]
            .reason
            .is_some());
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
        let time = libc::timespec { tv_sec: original.mtime(), tv_nsec: original.mtime_nsec() };
        assert_eq!(unsafe { libc::utimensat(libc::AT_FDCWD, name.as_ptr(), [time, time].as_ptr(), 0) }, 0);
        std::fs::rename(replacement, &path).unwrap();
        let result = read(&fixture.root(), files).unwrap();
        assert!(result.files[0].data.is_none());
        assert!(result.files[0].reason.as_ref().unwrap().contains("改变"));
    }
    #[test]
    fn enforces_preview_and_read_limits_and_date_ranges() {
        let fixture = Fixture::new();
        for number in 0..201 {
            std::fs::write(fixture.0.join(format!("{number}.txt")), "a").unwrap();
        }
        let result = preview(&fixture.root(), 7).unwrap();
        assert_eq!(result.files.len(), 200);
        assert!(result.truncated);
        assert!(read(&fixture.root(), result.files).is_err());
        assert!(read(
            &fixture.root(),
            vec![FilePreview {
                path: "0.txt".into(),
                size: MAX_BYTES + 1,
                modified_ms: 0,
                identity: String::new(),
            }]
        )
        .is_err());
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
