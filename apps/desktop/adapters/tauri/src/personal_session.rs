use crate::native_language::tr;
use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Url;

static SEQUENCE: AtomicU64 = AtomicU64::new(0);
const MAX_HEAD_BYTES: usize = 8192;
const MAX_BODY_BYTES: usize = 65536;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(35);

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

#[derive(Debug, Serialize)]
pub(crate) struct AccountResponse {
    status: u16,
    body: serde_json::Value,
}

struct PersonalHttpRequest<'a> {
    address: SocketAddr,
    host: &'a str,
    origin: &'a str,
    method: &'a str,
    target: &'a str,
    native: &'a str,
    control: &'a str,
    timeout: Duration,
}

fn unreachable_message() -> String {
    tr(
        "暂时连不上本地账号服务，本地工作不受影响，稍后再试即可。",
        "Can’t reach the local account service right now. Your local work is safe — try again in a moment.",
        "ローカルのアカウントサービスに接続できません。ローカルの作業には影響ありませんので、少し待ってからもう一度お試しください。",
    )
    .to_string()
}

fn incomplete_message() -> String {
    tr(
        "账号服务响应不完整，请稍后再试。",
        "The account response was incomplete. Please try again.",
        "アカウントサービスからの応答が不完全でした。もう一度お試しください。",
    )
    .to_string()
}

fn too_large_message() -> String {
    tr(
        "账号服务返回的内容过大。",
        "The account response is too large.",
        "アカウントサービスからの応答が大きすぎます。",
    )
    .to_string()
}

fn invalid_format_message() -> String {
    tr(
        "账号服务返回的数据格式无效，请稍后再试。",
        "The account response format isn’t valid. Please try again.",
        "アカウントサービスからの応答形式が無効です。もう一度お試しください。",
    )
    .to_string()
}

fn format_request_target(url: &Url) -> String {
    match url.query() {
        Some(query) => format!("{}?{query}", url.path()),
        None => url.path().to_string(),
    }
}

fn parse_http_status(line: &str) -> Option<u16> {
    let rest = line
        .strip_prefix("HTTP/1.1 ")
        .or_else(|| line.strip_prefix("HTTP/1.0 "))?;
    let code = rest.split_whitespace().next()?;
    if code.len() == 3 && code.bytes().all(|byte| byte.is_ascii_digit()) {
        code.parse::<u16>().ok()
    } else {
        None
    }
}

fn build_http_request(req: &PersonalHttpRequest<'_>) -> Result<String, String> {
    if req.method == "GET" {
        // GET /api/personal/status authenticates the peer via same-connection HMAC challenge using
        // the control key without putting x-molis-work-control-token on the wire.
        return Ok(format!(
            "GET {} HTTP/1.1\r\n\
             Host: {}\r\n\
             Origin: {}\r\n\
             Connection: close\r\n\
             x-molis-work-native-session: {}\r\n\
             \r\n",
            req.target, req.host, req.origin, req.native
        ));
    }
    let time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| {
            tr(
                "系统时间无效。",
                "System clock isn’t valid.",
                "システム時刻が無効です。",
            )
            .to_string()
        })?
        .as_nanos();
    let key = format!(
        "native-account-{time}-{}",
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    );
    let payload = "{}";
    Ok(format!(
        "POST {} HTTP/1.1\r\n\
         Host: {}\r\n\
         Origin: {}\r\n\
         Connection: close\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {}\r\n\
         x-molis-work-native-session: {}\r\n\
         x-molis-work-control-token: {}\r\n\
         x-molis-work-idempotency-key: {key}\r\n\
         \r\n\
         {payload}",
        req.target,
        req.host,
        req.origin,
        payload.len(),
        req.native,
        req.control
    ))
}

fn read_http_response(
    stream: &mut TcpStream,
    deadline: Instant,
) -> Result<AccountResponse, String> {
    let mut raw = Vec::new();
    let mut buf = [0_u8; 4096];
    let mut head_end: Option<usize> = None;
    let mut is_chunked = false;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(incomplete_message());
        }
        stream
            .set_read_timeout(Some(remaining))
            .map_err(|_| incomplete_message())?;
        match stream.read(&mut buf) {
            Ok(0) => break,
            Ok(read) => {
                raw.extend_from_slice(&buf[..read]);
                if head_end.is_none() {
                    if let Some(pos) = raw.windows(4).position(|window| window == b"\r\n\r\n") {
                        if pos > MAX_HEAD_BYTES {
                            return Err(incomplete_message());
                        }
                        let head_text =
                            std::str::from_utf8(&raw[..pos]).map_err(|_| incomplete_message())?;
                        is_chunked = head_text.split("\r\n").skip(1).any(|line| {
                            line.split_once(':').is_some_and(|(name, value)| {
                                name.trim().eq_ignore_ascii_case("transfer-encoding")
                                    && value.to_ascii_lowercase().contains("chunked")
                            })
                        });
                        head_end = Some(pos);
                    } else if raw.len() > MAX_HEAD_BYTES {
                        return Err(incomplete_message());
                    }
                }
                if let Some(pos) = head_end {
                    let body_len = raw.len().saturating_sub(pos + 4);
                    let limit = if is_chunked {
                        MAX_BODY_BYTES + 8192
                    } else {
                        MAX_BODY_BYTES
                    };
                    if body_len > limit {
                        return Err(too_large_message());
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return Err(incomplete_message()),
        }
    }
    let Some((head, raw_body)) = crate::shelf_http::split_http(&raw) else {
        return Err(incomplete_message());
    };
    let head_str = std::str::from_utf8(head).map_err(|_| incomplete_message())?;
    let mut lines = head_str.split("\r\n");
    let status = lines
        .next()
        .and_then(parse_http_status)
        .ok_or_else(incomplete_message)?;
    let mut content_length: Option<usize> = None;
    for line in lines.filter(|line| !line.is_empty()) {
        let Some((name, value)) = line.split_once(':') else {
            return Err(incomplete_message());
        };
        if name.trim().eq_ignore_ascii_case("content-length") {
            let parsed = value
                .trim()
                .parse::<usize>()
                .map_err(|_| incomplete_message())?;
            if parsed > MAX_BODY_BYTES {
                return Err(too_large_message());
            }
            content_length = Some(parsed);
        }
    }
    let body_bytes = if is_chunked {
        let decoded = crate::shelf_http::decode_chunked(raw_body).ok_or_else(incomplete_message)?;
        if decoded.len() > MAX_BODY_BYTES {
            return Err(too_large_message());
        }
        decoded
    } else {
        if raw_body.len() > MAX_BODY_BYTES {
            return Err(too_large_message());
        }
        if let Some(expected) = content_length {
            if raw_body.len() < expected {
                return Err(incomplete_message());
            }
            raw_body[..expected].to_vec()
        } else {
            raw_body.to_vec()
        }
    };
    let body = serde_json::from_slice(&body_bytes).map_err(|_| invalid_format_message())?;
    Ok(AccountResponse { status, body })
}

fn send_authenticated_request(req: &PersonalHttpRequest<'_>) -> Result<AccountResponse, String> {
    let deadline = Instant::now() + req.timeout;
    let connect_limit = req.timeout.min(CONNECT_TIMEOUT);
    let mut stream = TcpStream::connect_timeout(&req.address, connect_limit)
        .map_err(|_| unreachable_message())?;
    // S-14 / SYS-14: prove the peer holds this Home's control key on this exact TCP socket before
    // transmitting any native session or control credential.
    crate::web_identity::authenticate(&mut stream, req.control)?;
    let wire = build_http_request(req)?;
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        return Err(unreachable_message());
    }
    stream
        .set_write_timeout(Some(remaining))
        .map_err(|_| unreachable_message())?;
    stream
        .write_all(wire.as_bytes())
        .map_err(|_| unreachable_message())?;
    read_http_response(&mut stream, deadline)
}

// Tauri capability grants only the main loopback WebView access. No arbitrary
// destination, headers or body are accepted; no native credential reaches JS.
#[tauri::command]
pub(crate) async fn personal_account_request(
    path: String,
    method: String,
) -> Result<AccountResponse, String> {
    let url = account_url(&path, &method)?;
    let target = format_request_target(&url);
    tauri::async_runtime::spawn_blocking(move || {
        let native = read_token("native-session-token")?;
        let control = read_token("web-control-token")?;
        let host = crate::host_port::host();
        let origin = crate::host_port::origin();
        let req = PersonalHttpRequest {
            address: crate::host_port::address(),
            host: &host,
            origin: &origin,
            method: &method,
            target: &target,
            native: &native,
            control: &control,
            timeout: REQUEST_TIMEOUT,
        };
        send_authenticated_request(&req)
    })
    .await
    .map_err(|_| unreachable_message())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    use hmac::{Hmac, Mac};
    use sha2::Sha256;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;
    use std::thread;

    const TEST_CONTROL: &str = "personal-session-test-control-key-0123456789";
    const TEST_NATIVE: &str = "personal-session-test-native-key-0123456789";
    const HEALTH_BODY: &str = r#"{"status":"ok","desktop_tui":true}"#;

    fn signed_health(challenge: &str, key: &str) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).unwrap();
        mac.update(challenge.as_bytes());
        mac.update(b"\n");
        mac.update(HEALTH_BODY.as_bytes());
        let proof = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
        format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nx-molis-work-proof: {proof}\r\n\r\n{HEALTH_BODY}",
            HEALTH_BODY.len()
        )
    }

    fn read_http_head(reader: &mut BufReader<TcpStream>) -> String {
        let mut head = String::new();
        loop {
            let mut line = String::new();
            let read = reader.read_line(&mut line).unwrap_or(0);
            if read == 0 {
                break;
            }
            head.push_str(&line);
            if line == "\r\n" {
                break;
            }
        }
        head
    }

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

    #[test]
    fn sys14_personal_request_refuses_unverified_peer_without_sending_any_secret() {
        for (method, target) in [
            ("GET", "/api/personal/status"),
            ("POST", "/api/personal/login"),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut reader = BufReader::new(socket.try_clone().unwrap());
                let first = read_http_head(&mut reader);
                assert!(!first.contains(TEST_CONTROL));
                assert!(!first.contains(TEST_NATIVE));
                let challenge = first
                    .split("challenge=")
                    .nth(1)
                    .unwrap()
                    .split(' ')
                    .next()
                    .unwrap();
                let forged = signed_health(challenge, "wrong-home-control-key");
                socket.write_all(forged.as_bytes()).unwrap();
                let mut follow_up = String::new();
                let _ = reader.read_to_string(&mut follow_up);
                assert!(
                    follow_up.is_empty(),
                    "must not send any follow-up bytes after failed HMAC auth: {follow_up:?}"
                );
            });
            let host = address.to_string();
            let origin = format!("http://{host}");
            let req = PersonalHttpRequest {
                address,
                host: &host,
                origin: &origin,
                method,
                target,
                native: TEST_NATIVE,
                control: TEST_CONTROL,
                timeout: Duration::from_secs(5),
            };
            assert!(send_authenticated_request(&req).is_err());
            server.join().unwrap();
        }
    }

    #[test]
    fn sys14_personal_request_reuses_authenticated_socket_and_omits_control_token_on_get() {
        for (method, target, expect_control) in [
            ("GET", "/api/personal/status?attempt=1", false),
            ("POST", "/api/personal/login", true),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut reader = BufReader::new(socket.try_clone().unwrap());
                let first = read_http_head(&mut reader);
                assert!(!first.contains(TEST_CONTROL));
                assert!(!first.contains(TEST_NATIVE));
                let challenge = first
                    .split("challenge=")
                    .nth(1)
                    .unwrap()
                    .split(' ')
                    .next()
                    .unwrap();
                let answer = signed_health(challenge, TEST_CONTROL);
                socket.write_all(answer.as_bytes()).unwrap();

                let second = read_http_head(&mut reader);
                assert!(second.contains(&format!("x-molis-work-native-session: {TEST_NATIVE}")));
                assert_eq!(
                    second.contains("x-molis-work-control-token:"),
                    expect_control,
                    "{method} request control token header mismatch: {second}"
                );
                if expect_control {
                    let expected_control = format!("x-molis-work-control-token: {TEST_CONTROL}");
                    assert!(second.contains(&expected_control));
                    assert!(second.contains("x-molis-work-idempotency-key: native-account-"));
                    let mut body = [0_u8; 2];
                    reader.read_exact(&mut body).unwrap();
                    assert_eq!(&body, b"{}");
                }
                let payload = r#"{"ok":true}"#;
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{payload}",
                    payload.len()
                );
                socket.write_all(response.as_bytes()).unwrap();
            });
            let host = address.to_string();
            let origin = format!("http://{host}");
            let req = PersonalHttpRequest {
                address,
                host: &host,
                origin: &origin,
                method,
                target,
                native: TEST_NATIVE,
                control: TEST_CONTROL,
                timeout: Duration::from_secs(5),
            };
            let result = send_authenticated_request(&req).unwrap();
            assert_eq!(result.status, 200);
            assert_eq!(result.body, serde_json::json!({ "ok": true }));
            server.join().unwrap();
        }
    }
}
