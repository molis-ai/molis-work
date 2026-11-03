//! A loopback port is an address, not an identity. The server proves knowledge of this Home's
//! control key without receiving it. A native HTTP client keeps this socket for its actual request.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;
use std::fs::File;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

const REFUSED: &str = "本地服务身份验证失败";
const MAX_HEAD: usize = 8192;
const MAX_BODY: usize = 4096;

#[derive(Deserialize)]
pub(crate) struct Health {
    status: String,
    pub(crate) desktop_tui: bool,
}

pub(crate) fn control_token() -> Result<String, String> {
    let token = std::fs::read_to_string(
        crate::web_service::molis_work_home().join("config/web-control-token"),
    )
    .map_err(|_| REFUSED.to_string())?;
    let token = token.trim();
    if !(32..=512).contains(&token.len()) || token.contains(['\r', '\n', '\0']) {
        return Err(REFUSED.into());
    }
    Ok(token.into())
}

pub(crate) fn health() -> Result<Health, String> {
    let token = control_token()?;
    let address = SocketAddr::from(([127, 0, 0, 1], 4173));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(250))
        .map_err(|_| REFUSED.to_string())?;
    authenticate(&mut stream, &token)
}

pub(crate) fn authenticate(stream: &mut TcpStream, token: &str) -> Result<Health, String> {
    let mut random = [0_u8; 32];
    File::open("/dev/urandom")
        .and_then(|mut source| source.read_exact(&mut random))
        .map_err(|_| REFUSED.to_string())?;
    let challenge = URL_SAFE_NO_PAD.encode(random);
    stream
        .set_read_timeout(Some(Duration::from_millis(400)))
        .map_err(|_| REFUSED.to_string())?;
    stream
        .set_write_timeout(Some(Duration::from_millis(400)))
        .map_err(|_| REFUSED.to_string())?;
    write!(stream, "GET /health?challenge={challenge} HTTP/1.1\r\nHost: 127.0.0.1:4173\r\nConnection: keep-alive\r\n\r\n")
        .map_err(|_| REFUSED.to_string())?;
    verify_response(stream, token, &challenge).ok_or_else(|| REFUSED.into())
}

fn verify_response(stream: &mut impl Read, token: &str, challenge: &str) -> Option<Health> {
    let mut head = Vec::new();
    while !head.ends_with(b"\r\n\r\n") {
        if head.len() == MAX_HEAD {
            return None;
        }
        let mut byte = [0];
        stream.read_exact(&mut byte).ok()?;
        head.push(byte[0]);
    }
    let head = std::str::from_utf8(&head).ok()?;
    let mut lines = head.split("\r\n");
    if lines.next()? != "HTTP/1.1 200 OK" {
        return None;
    }
    let mut length = None;
    let mut proof = None;
    for line in lines.filter(|line| !line.is_empty()) {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("content-length") {
            if length.is_some() {
                return None;
            }
            length = Some(value.trim().parse::<usize>().ok()?);
        } else if name.eq_ignore_ascii_case("x-molis-work-proof") {
            if proof.is_some() {
                return None;
            }
            proof = Some(URL_SAFE_NO_PAD.decode(value.trim()).ok()?);
        } else if name.eq_ignore_ascii_case("transfer-encoding") {
            return None;
        }
    }
    let length = length.filter(|length| *length <= MAX_BODY)?;
    let mut body = vec![0; length];
    stream.read_exact(&mut body).ok()?;
    let mut mac = Hmac::<Sha256>::new_from_slice(token.as_bytes()).ok()?;
    mac.update(challenge.as_bytes());
    mac.update(b"\n");
    mac.update(&body);
    mac.verify_slice(&proof?).ok()?;
    let health: Health = serde_json::from_slice(&body).ok()?;
    (health.status == "ok").then_some(health)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Cursor};
    use std::net::TcpListener;
    use std::thread;

    const KEY: &str = "desktop-identity-fixture-control-key";
    const BODY: &str = r#"{"status":"ok","desktop_tui":true}"#;
    fn response(challenge: &str, key: &str, body: &str) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).unwrap();
        mac.update(challenge.as_bytes());
        mac.update(b"\n");
        mac.update(body.as_bytes());
        let proof = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
        format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nx-molis-work-proof: {proof}\r\n\r\n{body}",
            body.len()
        )
    }

    #[test]
    fn sys14_rejects_false_replayed_tampered_and_malformed_services() {
        let valid = response("fresh", KEY, BODY);
        assert!(
            verify_response(&mut Cursor::new(&valid), KEY, "fresh")
                .unwrap()
                .desktop_tui
        );
        for fake in [
            response("old", KEY, BODY),
            response("fresh", "another-home", BODY),
            valid.replace("true", "false"),
            valid.replace("200 OK", "503 Unavailable"),
            valid.replace("Content-Length:", "Ignored-Length:"),
            valid.replace("Content-Length:", "Content-Length: 1\r\nContent-Length:"),
            valid.replace(
                "Content-Length:",
                "Transfer-Encoding: chunked\r\nContent-Length:",
            ),
            "HTTP/1.1 200 OK\r\nContent-Length: 34\r\n\r\n{\"status\":\"ok\",\"desktop_tui\":true}"
                .into(),
            response("fresh", KEY, r#"{"status":"starting","desktop_tui":true}"#),
            response("fresh", KEY, r#"{"text":"status ok desktop_tui true"}"#),
        ] {
            assert!(verify_response(&mut Cursor::new(fake), KEY, "fresh").is_none());
        }
        assert!(
            verify_response(&mut Cursor::new("x".repeat(MAX_HEAD + 1)), KEY, "fresh").is_none()
        );
    }

    #[test]
    fn sys14_live_socket_proves_identity_before_receiving_any_key_or_native_payload() {
        for valid in [false, true] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let address = listener.local_addr().unwrap();
            let server = thread::spawn(move || {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(2)))
                    .unwrap();
                let mut reader = BufReader::new(socket.try_clone().unwrap());
                let mut request = String::new();
                loop {
                    let mut line = String::new();
                    reader.read_line(&mut line).unwrap();
                    request.push_str(&line);
                    if line == "\r\n" {
                        break;
                    }
                }
                assert!(!request.contains(KEY));
                assert!(!request.contains("native-payload"));
                let challenge = request
                    .split("challenge=")
                    .nth(1)
                    .unwrap()
                    .split(' ')
                    .next()
                    .unwrap();
                assert_eq!(challenge.len(), 43);
                let answer = response(challenge, if valid { KEY } else { "fake-service" }, BODY);
                socket.write_all(answer.as_bytes()).unwrap();
                let mut payload = String::new();
                reader.read_line(&mut payload).unwrap();
                assert_eq!(payload, if valid { "native-payload\n" } else { "" });
            });
            let mut client = TcpStream::connect(address).unwrap();
            let verified = authenticate(&mut client, KEY);
            assert_eq!(verified.is_ok(), valid);
            if verified.is_ok() {
                client.write_all(b"native-payload\n").unwrap();
            }
            drop(client);
            server.join().unwrap();
        }
    }
}
