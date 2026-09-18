use crate::web_service::molis_work_home;
use serde::Deserialize;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const SHELF_ORIGIN: &str = "http://127.0.0.1:4173";
const SHELF_HOST: &str = "127.0.0.1:4173";

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
    let bytes = fs::read(path).map_err(|error| format!("读不了这份文件：{error}"))?;
    let filename = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "文件名无效".to_string())?;
    let body = serde_json::json!({
        "filename": filename,
        "bytes_base64": encode_base64(&bytes),
        "mime": mime_for(filename),
    });
    post_json("/api/shelf/items", &body)
        .and_then(parse_item_id)
}

pub fn admit_text(text: &str) -> Result<String, String> {
    let body = serde_json::json!({ "text": text });
    post_json("/api/shelf/items", &body).and_then(parse_item_id)
}

pub fn admit_website(title: &str, url: &str, markdown: &str) -> Result<String, String> {
    let filename = crate::shelf_hotkeys::website_filename(title, url);
    let body = serde_json::json!({
        "filename": filename,
        "bytes_base64": encode_base64(markdown.as_bytes()),
        "mime": "text/x-shelf-website",
    });
    post_json("/api/shelf/items", &body).and_then(parse_item_id)
}

/// Record a system clipboard entry. Concealed types never get this far.
pub fn record_clip(text: &str, types: &[String]) -> Result<(), String> {
    let body = serde_json::json!({ "text": text, "types": types });
    post_json("/api/shelf/clipboard", &body).map(|_| ())
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

/// A wheel petal runs its recipe with the default option, no confirmation page.
pub fn run_recipe(recipe: &str, item_ids: &[String]) -> Result<(), String> {
    if item_ids.is_empty() {
        return Err("没有可处理的材料".into());
    }
    let body = serde_json::json!({
        "recipe": recipe,
        "item_ids": item_ids,
    });
    let payload = post_json("/api/shelf/jobs", &body)?;
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
    let token = control_token()?;
    let encoded = body.to_string();
    let key = idempotency_key();
    let request = format!(
        "POST {path} HTTP/1.1\r\n\
         Host: {SHELF_HOST}\r\n\
         Origin: {SHELF_ORIGIN}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\
         x-molis-work-control-token: {token}\r\n\
         x-molis-work-idempotency-key: {key}\r\n\
         \r\n\
         {encoded}",
        encoded.len()
    );
    let addr = SocketAddr::from(([127, 0, 0, 1], 4173));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(800))
        .map_err(|error| format!("置物架服务连不上：{error}"))?;
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(30)));
    stream
        .write_all(request.as_bytes())
        .map_err(|error| format!("送不到置物架：{error}"))?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| format!("置物架没有回音：{error}"))?;
    let Some((_, body)) = response.split_once("\r\n\r\n") else {
        return Err("置物架响应不完整".into());
    };
    if !response.starts_with("HTTP/1.1 2") && !response.contains(" 200 ") && !response.contains(" 201 ") {
        return Err(json_error(body).unwrap_or_else(|| "置物架拒绝了这次投放".into()));
    }
    Ok(body.to_string())
}

fn control_token() -> Result<String, String> {
    let path: PathBuf = molis_work_home().join("config").join("web-control-token");
    let token = fs::read_to_string(path)
        .map_err(|_| "找不到本地控制令牌".to_string())?
        .trim()
        .to_string();
    if token.len() < 32 {
        return Err("本地控制令牌无效".into());
    }
    Ok(token)
}

fn idempotency_key() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    format!("shelf-wheel-{nanos}")
}

fn mime_for(filename: &str) -> &'static str {
    match filename.rsplit('.').next().unwrap_or("").to_ascii_lowercase().as_str() {
        "pdf" => "application/pdf",
        "png" => "image/png",
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
    use super::encode_base64;

    #[test]
    fn base64_encodes_padding() {
        assert_eq!(encode_base64(b"Man"), "TWFu");
        assert_eq!(encode_base64(b"Ma"), "TWE=");
        assert_eq!(encode_base64(b"M"), "TQ==");
    }
}
