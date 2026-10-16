use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Url;

const ORIGIN: &str = "http://127.0.0.1:4173";
static SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn account_url(path: &str, method: &str) -> Result<Url, String> {
    if path.len() > 8192
        || !path.starts_with("/api/personal/")
        || path.contains(['\r', '\n', '\\', '#'])
    {
        return Err("不支持此账号请求。".into());
    }
    let url = Url::parse(&format!("{ORIGIN}{path}")).map_err(|_| "账号地址无效。")?;
    let allowed = match method {
        "GET" => url.path() == "/api/personal/status",
        "POST" => matches!(
            url.path(),
            "/api/personal/login"
                | "/api/personal/switch"
                | "/api/personal/logout"
                | "/api/personal/space"
                | "/api/personal/local"
        ),
        _ => false,
    };
    if !allowed || url.origin().ascii_serialization() != ORIGIN {
        return Err("不支持此账号请求。".into());
    }
    Ok(url)
}

fn read_token(name: &str) -> Result<String, String> {
    let value = std::fs::read_to_string(
        crate::web_service::molis_work_home()
            .join("config")
            .join(name),
    )
    .map_err(|_| "无法读取本机账号接入凭据，请更新并重启本地服务。")?;
    let value = value.trim();
    if !(32..=512).contains(&value.len())
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err("本机账号接入凭据无效。".into());
    }
    Ok(value.to_owned())
}

#[derive(Serialize)]
pub(crate) struct AccountResponse {
    status: u16,
    body: serde_json::Value,
}

// Tauri capability grants only the main loopback WebView access. No arbitrary
// destination, headers or body are accepted; no native credential reaches JS.
#[tauri::command]
pub(crate) async fn personal_account_request(
    path: String,
    method: String,
) -> Result<AccountResponse, String> {
    let url = account_url(&path, &method)?;
    let native = read_token("native-session-token")?;
    let control = read_token("web-control-token")?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(35))
        .build()
        .map_err(|_| "无法初始化账号连接。")?;
    let mut request = client
        .request(
            if method == "GET" {
                reqwest::Method::GET
            } else {
                reqwest::Method::POST
            },
            url,
        )
        .header("Origin", ORIGIN)
        .header("x-molis-work-native-session", native)
        .header("x-molis-work-control-token", control);
    if method == "POST" {
        let time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| "系统时间无效。")?
            .as_nanos();
        let key = format!(
            "native-account-{time}-{}",
            SEQUENCE.fetch_add(1, Ordering::Relaxed)
        );
        request = request
            .header("x-molis-work-idempotency-key", key)
            .header("Content-Type", "application/json")
            .body("{}");
    }
    let mut response = request
        .send()
        .await
        .map_err(|_| "暂时无法连接本机账号服务。")?;
    let status = response.status().as_u16();
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "账号响应不完整。")? {
        if body.len() + chunk.len() > 65536 {
            return Err("账号响应过大。".into());
        }
        body.extend_from_slice(&chunk);
    }
    let body = serde_json::from_slice(&body).map_err(|_| "账号响应格式无效。")?;
    Ok(AccountResponse { status, body })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_bridge_only_targets_fixed_account_routes() {
        assert_eq!(
            account_url("/api/personal/status?attempt=test", "GET")
                .unwrap()
                .host_str(),
            Some("127.0.0.1")
        );
        assert!(account_url("/api/personal/login?returnTo=%2F", "POST").is_ok());
        assert!(account_url("/api/personal/space?kind=personal", "POST").is_ok());
        for path in [
            "https://evil.test/",
            "//127.0.0.1:9999/",
            "/api/personal/../pages",
            "/api/personal/native-attach",
            "/account/callback",
            "/api/personal/login\r\nHeader:x",
        ] {
            assert!(account_url(path, "POST").is_err());
        }
        assert!(account_url("/api/personal/login", "GET").is_err());
        assert!(account_url("/api/personal/status", "DELETE").is_err());
    }
}
