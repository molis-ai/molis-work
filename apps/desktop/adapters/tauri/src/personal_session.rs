use crate::native_language::tr;
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Url;

static SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn account_url(path: &str, method: &str) -> Result<Url, String> {
    let unsupported = || {
        tr(
            "不支持这项账号请求。",
            "This account request isn’t supported.",
            "このアカウントリクエストには対応していません。",
        )
        .to_string()
    };
    if path.len() > 8192
        || !path.starts_with("/api/personal/")
        || path.contains(['\r', '\n', '\\', '#'])
    {
        return Err(unsupported());
    }
    let url = Url::parse(&format!("{}{path}", crate::host_port::origin())).map_err(|_| {
        tr(
            "账号服务地址无效。",
            "The account service address isn’t valid.",
            "アカウントサービスのアドレスが無効です。",
        )
    })?;
    let allowed = match method {
        "GET" => url.path() == "/api/personal/status",
        "POST" => matches!(
            url.path(),
            "/api/personal/login"
                | "/api/personal/login-cancel"
                | "/api/personal/switch"
                | "/api/personal/logout"
                | "/api/personal/space"
                | "/api/personal/prepare"
        ),
        _ => false,
    };
    if !allowed || url.origin().ascii_serialization() != crate::host_port::origin() {
        return Err(unsupported());
    }
    Ok(url)
}

fn read_token(name: &str) -> Result<String, String> {
    let value = std::fs::read_to_string(
        crate::web_service::molis_work_home()
            .join("config")
            .join(name),
    )
    .map_err(|_| {
        tr(
            "读不到本地账号凭据，请重新打开 Molis Work 后再试。",
            "Couldn’t read local account credentials. Reopen Molis Work and try again.",
            "ローカルのアカウント認証情報を読み込めませんでした。Molis Work を開き直してからお試しください。",
        )
    })?;
    let value = value.trim();
    if !(32..=512).contains(&value.len())
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return Err(tr(
            "本地账号凭据无效，请重新打开 Molis Work 后再试。",
            "Local account credentials aren’t valid. Reopen Molis Work and try again.",
            "ローカルのアカウント認証情報が無効です。Molis Work を開き直してからお試しください。",
        )
        .into());
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
        .map_err(|_| {
            tr(
                "暂时无法连接账号服务，请稍后再试。",
                "Couldn’t initialize the account connection. Please try again.",
                "アカウント接続を初期化できませんでした。もう一度お試しください。",
            )
        })?;
    let mut request = client
        .request(
            if method == "GET" {
                reqwest::Method::GET
            } else {
                reqwest::Method::POST
            },
            url,
        )
        .header("Origin", crate::host_port::origin())
        .header("x-molis-work-native-session", native)
        .header("x-molis-work-control-token", control);
    if method == "POST" {
        let time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| {
                tr(
                    "系统时间无效。",
                    "System clock isn’t valid.",
                    "システム時刻が無効です。",
                )
            })?
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
    let mut response = request.send().await.map_err(|_| {
        tr(
            "暂时连不上本地账号服务，本地工作不受影响，稍后再试即可。",
            "Can’t reach the local account service right now. Your local work is safe — try again in a moment.",
            "ローカルのアカウントサービスに接続できません。ローカルの作業には影響ありませんので、少し待ってからもう一度お試しください。",
        )
    })?;
    let status = response.status().as_u16();
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| {
        tr(
            "账号服务响应不完整，请稍后再试。",
            "The account response was incomplete. Please try again.",
            "アカウントサービスからの応答が不完全でした。もう一度お試しください。",
        )
    })? {
        if body.len() + chunk.len() > 65536 {
            return Err(tr(
                "账号服务返回的内容过大。",
                "The account response is too large.",
                "アカウントサービスからの応答が大きすぎます。",
            )
            .into());
        }
        body.extend_from_slice(&chunk);
    }
    let body = serde_json::from_slice(&body).map_err(|_| {
        tr(
            "账号服务返回的数据格式无效，请稍后再试。",
            "The account response format isn’t valid. Please try again.",
            "アカウントサービスからの応答形式が無効です。もう一度お試しください。",
        )
    })?;
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
        assert!(account_url("/api/personal/login-cancel?attempt=attempt", "POST").is_ok());
        assert!(account_url("/api/personal/space?kind=personal", "POST").is_ok());
        assert!(account_url(
            "/api/personal/prepare?action=ack&page=page&id=preparation",
            "POST"
        )
        .is_ok());
        for path in [
            "https://evil.test/",
            "//127.0.0.1:9999/",
            "/api/personal/../pages",
            "/api/personal/native-attach",
            "/api/personal/local",
            "/account/callback",
            "/api/personal/login\r\nHeader:x",
        ] {
            assert!(account_url(path, "POST").is_err());
        }
        assert!(account_url("/api/personal/login", "GET").is_err());
        assert!(account_url("/api/personal/status", "DELETE").is_err());
    }
}
