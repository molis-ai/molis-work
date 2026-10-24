use crate::web_identity::control_token;
use crate::web_service::molis_work_home;
use serde::Deserialize;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::Path;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const SHELF_ORIGIN: &str = "http://127.0.0.1:4173";
const SHELF_HOST: &str = "127.0.0.1:4173";
/// Shelf's routes on its Home instance, outside any project.
const SHELF_API: &str = "/api/plugins/io.molis.work.shelf";
/// The header that tells the Host the person chose this file here; the Host reads it, page script cannot send it.
const ORIGINAL_PATH_HEADER: &str = "sec-molis-work-original-path";
const FOLDER_MAX_BYTES: u64 = 32 * 1024 * 1024;

#[derive(Debug, Deserialize)]
struct AdmitResponse {
    item: Option<AdmitItem>,
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AdmitItem {
    item_id: String,
}

pub fn admit_file(path: &Path) -> Result<String, String> {
    if path.is_dir() {
        return admit_folder(path);
    }
    let bytes = fs::read(path).map_err(|error| format!("读不了这份文件：{error}"))?;
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "文件名无效".to_string())?;
    admit_bytes(filename, &bytes, Some(path))
}

/// With `origin`, the file it came from is offered to Shelf so a later recipe can check it has not changed.
pub fn admit_bytes(filename: &str, bytes: &[u8], origin: Option<&Path>) -> Result<String, String> {
    let original = origin
        .and_then(|path| fs::canonicalize(path).ok())
        .and_then(|path| path.to_str().map(str::to_owned));
    let mut body = serde_json::json!({
        "filename": filename,
        "bytes_base64": encode_base64(bytes),
        "mime": mime_for(filename),
    });
    if original.is_some() {
        body["original"] = serde_json::Value::Bool(true);
    }
    post_json_offering(&format!("{SHELF_API}/items"), &body, original.as_deref())
        .and_then(parse_item_id)
}

fn folder_entries(root: &Path) -> Result<Vec<serde_json::Value>, String> {
    fn walk(
        root: &Path,
        at: &Path,
        entries: &mut Vec<serde_json::Value>,
        size: &mut u64,
    ) -> Result<(), String> {
        let mut children = fs::read_dir(at)
            .map_err(|error| format!("读不了这个文件夹：{error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        children.sort_by_key(|entry| entry.file_name());
        for entry in children {
            let kind = entry.file_type().map_err(|error| error.to_string())?;
            let file = entry.path();
            // Do not follow symlinks out of the selected folder or into cycles.
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                walk(root, &file, entries, size)?;
            } else if kind.is_file() {
                *size += entry.metadata().map_err(|error| error.to_string())?.len();
                if *size > FOLDER_MAX_BYTES {
                    return Err("这个文件夹超过 32 MB，请把它拆成几个小一点的文件夹再放进来".into());
                }
                let bytes = fs::read(&file).map_err(|error| format!("读不了这份文件：{error}"))?;
                let relative = file
                    .strip_prefix(root)
                    .map_err(|error| error.to_string())?
                    .to_string_lossy();
                entries.push(serde_json::json!({"relative": relative, "bytes_base64": encode_base64(&bytes), "mime": mime_for(&relative)}));
            }
        }
        Ok(())
    }
    let mut entries = Vec::new();
    walk(root, root, &mut entries, &mut 0)?;
    Ok(entries)
}

fn admit_folder(path: &Path) -> Result<String, String> {
    let name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("文件夹名称无效")?;
    let body = serde_json::json!({"name": name, "entries": folder_entries(path)?});
    post_json(&format!("{SHELF_API}/folders"), &body).and_then(parse_item_id)
}

/// The wheel's 发给终端 hands the link itself over; it does not fetch the page.
pub fn admit_text_capturing(text: &str, capture_pages: bool) -> Result<String, String> {
    let body = serde_json::json!({ "text": text, "capture_pages": capture_pages });
    post_json(&format!("{SHELF_API}/items"), &body).and_then(parse_item_id)
}

pub fn admit_website(title: &str, url: &str, markdown: &str) -> Result<String, String> {
    let filename = crate::shelf_hotkeys::website_filename(title, url);
    let body = serde_json::json!({
        "filename": filename,
        "bytes_base64": encode_base64(markdown.as_bytes()),
        "mime": "text/x-shelf-website",
    });
    post_json(&format!("{SHELF_API}/items"), &body).and_then(parse_item_id)
}

/// Record a system clipboard entry. Concealed types never get this far.
pub fn record_clip(text: &str, types: &[String]) -> Result<(), String> {
    let body = serde_json::json!({ "text": text, "types": types });
    post_json(&format!("{SHELF_API}/clipboard"), &body).map(|_| ())
}

/// Appearance can turn the wheel off. Read straight from the catalog so the
/// answer is right even before the web service is up, and cache it briefly so a
/// drag does not hit the disk on every mouse move.
pub fn drop_wheel_enabled() -> bool {
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    static CACHED: AtomicBool = AtomicBool::new(true);
    static READ_AT: AtomicU64 = AtomicU64::new(0);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0);
    let last = READ_AT.load(Ordering::Relaxed);
    if last != 0 && now.saturating_sub(last) < 1_500 {
        return CACHED.load(Ordering::Relaxed);
    }
    let path = molis_work_home().join("shelf").join("catalog.json");
    let enabled = match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|value| value.get("settings")?.get("drop_wheel_enabled")?.as_bool())
            .unwrap_or(true),
        Err(_) => true,
    };
    CACHED.store(enabled, Ordering::Relaxed);
    READ_AT.store(now, Ordering::Relaxed);
    enabled
}

/// Whether the Send petal and the four recipe petals should light up.
/// Never hits the network on the caller thread: a drag uses the last cache,
/// and a stale cache is refreshed in the background.
pub fn wheel_gates() -> (bool, bool) {
    let now = gate_now();
    let (age_ok, agent, recipe) = read_gate_cache(now);
    if !age_ok {
        refresh_wheel_gates();
    }
    (agent, recipe)
}

pub fn refresh_wheel_gates() {
    use std::sync::atomic::{AtomicBool, Ordering};
    static REFRESHING: AtomicBool = AtomicBool::new(false);
    if REFRESHING.swap(true, Ordering::AcqRel) {
        return;
    }
    thread::spawn(|| {
        let parsed = get_json(&format!("{SHELF_API}/"))
            .ok()
            .and_then(|payload| parse_wheel_gates(&payload));
        // A temporarily unavailable host should not grey out a working agent.
        let (_, agent, recipe) = read_gate_cache(gate_now());
        let (agent, recipe) = parsed.unwrap_or((agent, recipe));
        write_gate_cache(gate_now(), agent, recipe);
        REFRESHING.store(false, Ordering::Release);
    });
}

fn gate_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as u64)
        .unwrap_or(0)
}

fn gate_cache() -> &'static Mutex<(u64, bool, bool)> {
    use std::sync::OnceLock;
    static CACHE: OnceLock<Mutex<(u64, bool, bool)>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new((0, false, false)))
}

fn read_gate_cache(now: u64) -> (bool, bool, bool) {
    match gate_cache().lock() {
        Ok(guard) => (
            guard.0 != 0 && now.saturating_sub(guard.0) < 1_500,
            guard.1,
            guard.2,
        ),
        Err(_) => (true, false, false),
    }
}

fn write_gate_cache(now: u64, agent: bool, recipe: bool) {
    if let Ok(mut guard) = gate_cache().lock() {
        *guard = (now, agent, recipe);
    }
}

pub fn parse_wheel_gates(payload: &str) -> Option<(bool, bool)> {
    let value: serde_json::Value = serde_json::from_str(payload).ok()?;
    let runtime = value.get("runtime")?;
    let executable = runtime
        .get("executable")
        .and_then(|item| item.as_str())
        .unwrap_or("")
        .trim();
    let can_run = runtime
        .get("can_run_job")
        .and_then(|item| item.as_bool())
        .unwrap_or(false);
    Some((!executable.is_empty(), can_run))
}

/// A wheel petal runs its recipe with the default option, no confirmation page.
pub fn run_recipe(recipe: &str, item_ids: &[String]) -> Result<(), String> {
    if item_ids.is_empty() {
        return Err("没有可处理的材料".into());
    }
    let body = serde_json::json!({
        "recipe": recipe,
        "item_ids": item_ids,
    });
    let payload = post_json(&format!("{SHELF_API}/jobs"), &body)?;
    if payload.contains("\"error\"") {
        return Err(json_error(&payload).unwrap_or_else(|| "这次动作没跑成".into()));
    }
    Ok(())
}

fn parse_item_id(payload: String) -> Result<String, String> {
    let parsed: AdmitResponse =
        serde_json::from_str(&payload).map_err(|error| format!("置物架响应无效：{error}"))?;
    if let Some(error) = parsed.error {
        return Err(error);
    }
    parsed
        .item
        .map(|item| item.item_id)
        .ok_or_else(|| "置物架没有收下这份材料".to_string())
}

fn json_error(payload: &str) -> Option<String> {
    serde_json::from_str::<AdmitResponse>(payload)
        .ok()
        .and_then(|value| value.error)
}

fn post_json(path: &str, body: &serde_json::Value) -> Result<String, String> {
    post_json_offering(path, body, None)
}

fn post_json_offering(
    path: &str,
    body: &serde_json::Value,
    original: Option<&str>,
) -> Result<String, String> {
    let token = control_token()?;
    let encoded = body.to_string();
    let key = idempotency_key();
    let offered = original
        .map(|file| format!("{ORIGINAL_PATH_HEADER}: {}\r\n", percent_encode_path(file)))
        .unwrap_or_default();
    let request = format!(
        "POST {path} HTTP/1.1\r\n\
         Host: {SHELF_HOST}\r\n\
         Origin: {SHELF_ORIGIN}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         x-molis-work-control-token: {token}\r\n\
         x-molis-work-idempotency-key: {key}\r\n\
         {offered}\
         \r\n\
         {encoded}",
        encoded.len()
    );
    exchange_http(
        &request,
        Duration::from_millis(800),
        Duration::from_secs(if path.ends_with("/jobs") { 620 } else { 30 }),
    )
}

/// The Host decodes the header with `decodeURIComponent`; everything but a path's plain characters is escaped.
fn percent_encode_path(path: &str) -> String {
    let mut out = String::with_capacity(path.len());
    for byte in path.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'-' | b'_' | b'.' | b'~') {
            out.push(byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn get_json(path: &str) -> Result<String, String> {
    let token = control_token()?;
    let request = format!(
        "GET {path} HTTP/1.1\r\n\
         Host: {SHELF_HOST}\r\n\
         Origin: {SHELF_ORIGIN}\r\n\
         Connection: close\r\n\
         x-molis-work-control-token: {token}\r\n\
         \r\n"
    );
    exchange_http(&request, Duration::from_millis(400), Duration::from_secs(3))
}

fn exchange_http(request: &str, connect: Duration, read: Duration) -> Result<String, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 4173));
    let mut stream = TcpStream::connect_timeout(&addr, connect)
        .map_err(|error| format!("置物架服务连不上：{error}"))?;
    crate::web_identity::authenticate(&mut stream, &control_token()?)?;
    let _ = stream.set_read_timeout(Some(read));
    let _ = stream.set_write_timeout(Some(read));
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("送不到置物架：{error}"))?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| format!("置物架没有回音：{error}"))?;
    http_payload(&response)
}

fn http_payload(raw: &[u8]) -> Result<String, String> {
    let Some((head, body)) = split_http(raw) else {
        return Err("置物架响应不完整".into());
    };
    let head_text = std::str::from_utf8(head).unwrap_or("");
    let payload = if head_text
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked")
    {
        let joined = decode_chunked(body).ok_or("置物架分块响应不完整")?;
        String::from_utf8(joined).map_err(|_| "置物架响应不是文本".to_string())?
    } else {
        String::from_utf8(body.to_vec()).map_err(|_| "置物架响应不是文本".to_string())?
    };
    let ok = head_text.starts_with("HTTP/1.1 2")
        || head_text.starts_with("HTTP/1.0 2")
        || head_text.contains(" 200 ")
        || head_text.contains(" 201 ");
    if !ok {
        return Err(json_error(&payload).unwrap_or_else(|| "置物架拒绝了这次投放".into()));
    }
    Ok(payload)
}

pub(crate) fn split_http(raw: &[u8]) -> Option<(&[u8], &[u8])> {
    let pos = raw.windows(4).position(|window| window == b"\r\n\r\n")?;
    Some((&raw[..pos], &raw[pos + 4..]))
}

/// A chunked HTTP body put back together; None when it is cut short or a chunk size cannot be read.
pub(crate) fn decode_chunked(body: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    let mut index = 0;
    while index < body.len() {
        let line_end = body[index..]
            .windows(2)
            .position(|window| window == b"\r\n")
            .map(|offset| index + offset)?;
        let size_line = std::str::from_utf8(&body[index..line_end]).ok()?;
        let size =
            usize::from_str_radix(size_line.split(';').next().unwrap_or("").trim(), 16).ok()?;
        index = line_end + 2;
        if size == 0 {
            break;
        }
        if index + size > body.len() {
            return None;
        }
        out.extend_from_slice(&body[index..index + size]);
        index += size;
        if body.get(index..index + 2) != Some(b"\r\n".as_ref()) {
            return None;
        }
        index += 2;
    }
    Some(out)
}

fn idempotency_key() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    format!("shelf-wheel-{nanos}")
}

fn mime_for(filename: &str) -> &'static str {
    match filename
        .rsplit('.')
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "pdf" => "application/pdf",
        "png" => "image/png",
        "tif" | "tiff" => "image/tiff",
        "heic" | "heif" => "image/heic",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "md" | "markdown" => "text/markdown",
        "txt" => "text/plain",
        "json" => "application/json",
        "html" | "htm" => "text/html",
        _ => "application/octet-stream",
    }
}

fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (a << 16) | (b << 8) | c;
        out.push(TABLE[((triple >> 18) & 63) as usize] as char);
        out.push(TABLE[((triple >> 12) & 63) as usize] as char);
        if chunk.len() > 1 {
            out.push(TABLE[((triple >> 6) & 63) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(TABLE[(triple & 63) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{
        encode_base64, folder_entries, http_payload, parse_wheel_gates, percent_encode_path,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let sequence = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "molis-shelf-folder-{}-{stamp}-{sequence}",
                std::process::id()
            ));
            fs::create_dir(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn shelf_folder_reads_nested_files_with_their_names_and_contents() {
        let temp = TestDirectory::new();
        fs::create_dir_all(temp.0.join("中文目录/deep")).unwrap();
        fs::write(temp.0.join("first file.txt"), b"hello").unwrap();
        fs::write(temp.0.join("中文目录/deep/note.md"), b"# note\n").unwrap();

        assert_eq!(
            folder_entries(&temp.0).unwrap(),
            vec![
                serde_json::json!({"relative": "first file.txt", "bytes_base64": "aGVsbG8=", "mime": "text/plain"}),
                serde_json::json!({"relative": "中文目录/deep/note.md", "bytes_base64": "IyBub3RlCg==", "mime": "text/markdown"}),
            ]
        );
    }

    #[cfg(unix)]
    #[test]
    fn shelf_folder_skips_symlink_files_directories_and_cycles() {
        use std::os::unix::fs::symlink;
        let temp = TestDirectory::new();
        let source = temp.0.join("source");
        let outside = temp.0.join("outside");
        fs::create_dir(&source).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(source.join("kept.txt"), b"hello").unwrap();
        fs::write(outside.join("private.txt"), b"must stay outside").unwrap();
        symlink(outside.join("private.txt"), source.join("linked-file.txt")).unwrap();
        symlink(&outside, source.join("linked-directory")).unwrap();
        symlink(&source, source.join("cycle")).unwrap();

        assert_eq!(
            folder_entries(&source).unwrap(),
            vec![
                serde_json::json!({"relative": "kept.txt", "bytes_base64": "aGVsbG8=", "mime": "text/plain"}),
            ]
        );
        assert_eq!(
            fs::read(outside.join("private.txt")).unwrap(),
            b"must stay outside"
        );
    }

    #[test]
    fn shelf_folder_rejects_a_total_over_32_mib_before_reading_the_large_file() {
        let temp = TestDirectory::new();
        fs::write(temp.0.join("a.txt"), b"x").unwrap();
        // A sparse file exercises the actual metadata limit without allocating 32 MiB.
        fs::File::create(temp.0.join("z-large.bin"))
            .unwrap()
            .set_len(32 * 1024 * 1024)
            .unwrap();
        let error =
            folder_entries(&temp.0).expect_err("the limit applies to the combined folder size");
        assert_eq!(
            error,
            "这个文件夹超过 32 MB，请把它拆成几个小一点的文件夹再放进来"
        );
    }

    #[test]
    fn original_path_header_survives_spaces_and_non_ascii_names() {
        assert_eq!(
            percent_encode_path("/Users/me/中文 资料/a&b.pdf"),
            "/Users/me/%E4%B8%AD%E6%96%87%20%E8%B5%84%E6%96%99/a%26b.pdf"
        );
    }

    #[test]
    fn base64_encodes_padding() {
        assert_eq!(encode_base64(b"Man"), "TWFu");
        assert_eq!(encode_base64(b"Ma"), "TWE=");
        assert_eq!(encode_base64(b"M"), "TQ==");
    }

    #[test]
    fn wheel_gates_follow_runtime_executable_and_job_entry() {
        assert_eq!(
            parse_wheel_gates(r#"{"runtime":{"executable":"/opt/grok","can_run_job":true}}"#),
            Some((true, true))
        );
        assert_eq!(
            parse_wheel_gates(r#"{"runtime":{"executable":"","can_run_job":false}}"#),
            Some((false, false))
        );
        assert_eq!(
            parse_wheel_gates(
                r#"{"runtime":{"executable":"/usr/bin/claude","can_run_job":false}}"#
            ),
            Some((true, false))
        );
        assert_eq!(parse_wheel_gates("{}"), None);
    }

    #[test]
    fn chunked_shelf_snapshot_still_reads_runtime() {
        let json = r#"{"runtime":{"executable":"/opt/grok","can_run_job":true}}"#;
        let chunk = format!("{:x}\r\n{}\r\n0\r\n\r\n", json.len(), json);
        let raw = format!("HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{chunk}");
        let body = http_payload(raw.as_bytes()).expect("decode chunked shelf body");
        assert_eq!(parse_wheel_gates(&body), Some((true, true)));
        assert!(parse_wheel_gates(&chunk).is_none());
    }

    #[test]
    fn identity_shelf_snapshot_still_reads_runtime() {
        let json = r#"{"runtime":{"executable":"/opt/grok","can_run_job":true}}"#;
        let raw = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{json}",
            json.len()
        );
        let body = http_payload(raw.as_bytes()).expect("read identity shelf body");
        assert_eq!(parse_wheel_gates(&body), Some((true, true)));
    }
}
