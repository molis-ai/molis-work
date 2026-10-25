//! Files a plugin page owns, as the shell acts on them (PG-113).
//!
//! A page names its own files by relative path. The shell does not take an absolute path from the window: it asks the Host
//! which files those are (the Host checks the page's installation, its grants and the file entries the Manifest declares),
//! checks what comes back, and only then opens, copies or drags them. A page, or anything that can call `invoke` in the main
//! window, therefore gets no way to name a file outside what the Host would give that page anyway.

use crate::shelf_http::post_json_with;
use std::path::Path;

const MAX_PATHS: usize = 100;
const MAX_RELATIVE_BYTES: usize = 1024;
const MAX_PAGE_ID_BYTES: usize = 100;
const MIN_PAGE_ID_BYTES: usize = 8;
const MAX_PROJECT_ID_BYTES: usize = 100;
const ROUTE: &str = "api/host/plugin-page-files";

/// What the page-files route is called as: the Host's own, with the project prefix a project's page carries.
fn valid_endpoint(endpoint: &str) -> bool {
    let rest = match endpoint.strip_prefix("/projects/") {
        Some(tail) => match tail.split_once('/') {
            Some((project, rest)) if plain(project, 1, MAX_PROJECT_ID_BYTES) => rest,
            _ => return false,
        },
        None => endpoint.strip_prefix('/').unwrap_or(""),
    };
    rest == ROUTE
}

fn plain(value: &str, min: usize, max: usize) -> bool {
    (min..=max).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn valid_relative(path: &str) -> bool {
    !path.is_empty()
        && path.len() <= MAX_RELATIVE_BYTES
        && !path.starts_with('/')
        && !path.contains(['\0', '\\'])
        && path
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

/// Nothing is sent unless the endpoint, the page id and every path have the shape the Host hands out.
fn checked_request<'a>(
    endpoint: &str,
    page_id: &str,
    relative: &'a [String],
) -> Result<&'a [String], String> {
    if !valid_endpoint(endpoint) {
        return Err("文件请求的地址无效".into());
    }
    if !plain(page_id, MIN_PAGE_ID_BYTES, MAX_PAGE_ID_BYTES) {
        return Err("文件请求需要当前插件页面".into());
    }
    if relative.is_empty() || relative.len() > MAX_PATHS {
        return Err("请选择要处理的文件".into());
    }
    if !relative.iter().all(|path| valid_relative(path)) {
        return Err("文件路径无效".into());
    }
    Ok(relative)
}

/// What the Host gave back, held to the same standard before the shell touches it: one absolute path per file asked for,
/// each an ordinary file that is not a link and has no second name.
fn checked_files(paths: Vec<String>, asked: usize) -> Result<Vec<String>, String> {
    if paths.len() != asked {
        return Err("宿主返回的文件数量不符".into());
    }
    for path in &paths {
        let candidate = Path::new(path);
        if !candidate.is_absolute() || path.contains('\0') {
            return Err("宿主返回了无效的文件路径".into());
        }
        let metadata = std::fs::symlink_metadata(candidate).map_err(|_| "文件已不存在")?;
        if !metadata.is_file() {
            return Err("只能处理普通文件".into());
        }
        if has_other_names(&metadata) {
            return Err("这份文件有多个名字，已拒绝".into());
        }
    }
    Ok(paths)
}

#[cfg(unix)]
fn has_other_names(metadata: &std::fs::Metadata) -> bool {
    std::os::unix::fs::MetadataExt::nlink(metadata) != 1
}

#[cfg(not(unix))]
fn has_other_names(_metadata: &std::fs::Metadata) -> bool {
    false
}

fn parse_paths(payload: &str) -> Result<Vec<String>, String> {
    #[derive(serde::Deserialize)]
    struct Resolved {
        paths: Vec<String>,
    }
    serde_json::from_str::<Resolved>(payload)
        .map(|resolved| resolved.paths)
        .map_err(|error| format!("宿主的文件响应无效：{error}"))
}

/// The absolute files a page's relative paths stand for, checked once more here. The caller acts on them straight away.
pub fn plugin_page_files(
    endpoint: &str,
    page_id: &str,
    relative: &[String],
) -> Result<Vec<String>, String> {
    let relative = checked_request(endpoint, page_id, relative)?;
    let payload = post_json_with(
        endpoint,
        &serde_json::json!({ "paths": relative }),
        &format!("x-molis-plugin-page: {page_id}\r\n"),
    )?;
    checked_files(parse_paths(&payload)?, relative.len())
}

#[cfg(test)]
mod tests {
    use super::{checked_files, checked_request, parse_paths, valid_endpoint, valid_relative};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT: AtomicU64 = AtomicU64::new(0);

    struct Directory(PathBuf);

    impl Directory {
        fn new() -> Self {
            let sequence = NEXT.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "molis-page-files-{}-{sequence}",
                std::process::id()
            ));
            fs::create_dir(&path).unwrap();
            Self(path.canonicalize().unwrap())
        }

        fn file(&self, name: &str) -> String {
            let path = self.0.join(name);
            fs::write(&path, b"x").unwrap();
            path.to_string_lossy().into_owned()
        }
    }

    impl Drop for Directory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn strings(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    // RAC-670: only the Host's own page-files route, with the project prefix a project's page carries, is asked.
    #[test]
    fn rac_670_endpoint_is_the_hosts_page_files_route() {
        assert!(valid_endpoint("/api/host/plugin-page-files"));
        assert!(valid_endpoint(
            "/projects/prj_01-a/api/host/plugin-page-files"
        ));
        for refused in [
            "",
            "api/host/plugin-page-files",
            "http://127.0.0.1:4173/api/host/plugin-page-files",
            "/api/host/plugin-page-files/",
            "/api/host/plugin-page-files?x=1",
            "/api/host/plugin-page-actions",
            "/api/plugins/io.molis.work.shelf/jobs",
            "/projects//api/host/plugin-page-files",
            "/projects/a b/api/host/plugin-page-files",
            "/projects/a/b/api/host/plugin-page-files",
            "/projects/../api/host/plugin-page-files",
            "//api/host/plugin-page-files",
        ] {
            assert!(!valid_endpoint(refused), "{refused:?} was accepted");
        }
        assert!(!valid_endpoint(&format!(
            "/projects/{}/api/host/plugin-page-files",
            "a".repeat(101)
        )));
    }

    // RAC-670: nothing is sent for a page id or a path the Host would never have handed out.
    #[test]
    fn rac_670_request_shape_is_checked_before_anything_is_sent() {
        let endpoint = "/api/host/plugin-page-files";
        let good = strings(&["items/a1/original.pdf", "a.txt"]);
        assert!(checked_request(endpoint, "page_0123456789", &good).is_ok());
        assert!(checked_request("/x", "page_0123456789", &good).is_err());
        for id in [
            "",
            "short",
            "page id 0123",
            "page/0123456789",
            &"p".repeat(101),
        ] {
            assert!(checked_request(endpoint, id, &good).is_err(), "{id:?}");
        }
        assert!(checked_request(endpoint, "page_0123456789", &[]).is_err());
        let many: Vec<String> = (0..101).map(|index| format!("f{index}")).collect();
        assert!(checked_request(endpoint, "page_0123456789", &many).is_err());
        assert!(checked_request(endpoint, "page_0123456789", &many[..100]).is_ok());
        for path in [
            "",
            "/etc/passwd",
            "../outside",
            "a/../b",
            "a//b",
            "./a",
            "a\\b",
            "a\0b",
        ] {
            assert!(!valid_relative(path), "{path:?} was accepted");
        }
        assert!(!valid_relative(&"a".repeat(1025)));
        assert!(valid_relative("a..b/c.d"));
    }

    // RAC-670: what comes back from the Host is checked again before the shell acts on it.
    #[test]
    fn rac_670_files_from_the_host_are_checked_again() {
        let directory = Directory::new();
        let first = directory.file("a.txt");
        let second = directory.file("b.txt");
        assert_eq!(
            checked_files(vec![first.clone(), second.clone()], 2),
            Ok(vec![first.clone(), second.clone()])
        );
        // A different number of files than were asked for.
        assert!(checked_files(vec![first.clone()], 2).is_err());
        assert!(checked_files(vec![first.clone(), second.clone()], 1).is_err());
        // Not absolute, not there, not a file.
        assert!(checked_files(strings(&["a.txt"]), 1).is_err());
        assert!(checked_files(
            vec![directory.0.join("none").to_string_lossy().into_owned()],
            1
        )
        .is_err());
        assert!(checked_files(vec![directory.0.to_string_lossy().into_owned()], 1).is_err());
        assert!(checked_files(vec![format!("{first}\0")], 1).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn rac_670_a_link_or_a_second_name_is_refused() {
        let directory = Directory::new();
        let file = directory.file("a.txt");
        let link = directory.0.join("link.txt");
        std::os::unix::fs::symlink(&file, &link).unwrap();
        assert!(checked_files(vec![link.to_string_lossy().into_owned()], 1).is_err());
        let second_name = directory.0.join("second.txt");
        fs::hard_link(&file, &second_name).unwrap();
        assert!(checked_files(vec![file.clone()], 1).is_err());
        assert!(checked_files(vec![second_name.to_string_lossy().into_owned()], 1).is_err());
    }

    #[test]
    fn rac_670_the_hosts_answer_is_read_as_a_list_of_paths_only() {
        assert_eq!(
            parse_paths(r#"{"paths":["/a","/b"]}"#),
            Ok(strings(&["/a", "/b"]))
        );
        assert!(parse_paths(r#"{"error":"x"}"#).is_err());
        assert!(parse_paths(r#"{"paths":"/a"}"#).is_err());
        assert!(parse_paths("").is_err());
    }
}
