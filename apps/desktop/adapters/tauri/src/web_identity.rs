//! A loopback port is an address, not an identity. The server proves knowledge of this Home's
//! control key without receiving it. A native HTTP client keeps this socket for its actual request.
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;
use std::fs::File;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

const REFUSED: &str = "本地服务身份验证失败";
const MAX_HEAD: usize = 8192;
const MAX_BODY: usize = 4096;

#[derive(Deserialize)]
pub(crate) struct Health {
    status: String,
    pub(crate) desktop_tui: bool,
}

/// What a 503 says of itself. Only `upgrading` is read (`upgrade-maintenance.ts` in the Host).
#[derive(Deserialize)]
struct Unavailable {
    status: String,
}

/// What `/health` proved, once the proof covers these exact bytes.
pub(crate) enum Answer {
    Ready(Health),
    /// This Home's Host, upgrading its data before it starts (upgrade-chain-design §4.2): not
    /// ready, and not dead either.
    Upgrading,
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
    match answer()? {
        Answer::Ready(health) => Ok(health),
        Answer::Upgrading => Err(REFUSED.into()),
    }
}

/// `/health` on the fixed port, ready or upgrading. Only the wait for the service tells them apart.
pub(crate) fn answer() -> Result<Answer, String> {
    answer_at(crate::host_port::port())
}

/// `/health` on a port not yet adopted: the address file's, proved before anything uses it.
pub(crate) fn answer_at(port: u16) -> Result<Answer, String> {
    let token = control_token()?;
    let address = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(250))
        .map_err(|_| REFUSED.to_string())?;
    prove(&mut stream, &token, &format!("127.0.0.1:{port}"))
}

/// A socket kept for a native request: only a ready service is sent one.
pub(crate) fn authenticate(stream: &mut TcpStream, token: &str) -> Result<Health, String> {
    match prove(stream, token, &crate::host_port::host())? {
        Answer::Ready(health) => Ok(health),
        Answer::Upgrading => Err(REFUSED.into()),
    }
}

fn prove(stream: &mut TcpStream, token: &str, host: &str) -> Result<Answer, String> {
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
    write!(
        stream,
        "GET /health?challenge={challenge} HTTP/1.1\r\nHost: {host}\r\nConnection: keep-alive\r\n\r\n"
    )
    .map_err(|_| REFUSED.to_string())?;
    verify_response(stream, token, &challenge).ok_or_else(|| REFUSED.into())
}

fn verify_response(stream: &mut impl Read, token: &str, challenge: &str) -> Option<Answer> {
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
    // The two lines the Host's Node server writes: ready, and the listener that answers while the
    // Home upgrades.
    let ready = match lines.next()? {
        "HTTP/1.1 200 OK" => true,
        "HTTP/1.1 503 Service Unavailable" => false,
        _ => return None,
    };
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
    if ready {
        let health: Health = serde_json::from_slice(&body).ok()?;
        return (health.status == "ok").then_some(Answer::Ready(health));
    }
    let unavailable: Unavailable = serde_json::from_slice(&body).ok()?;
    (unavailable.status == "upgrading").then_some(Answer::Upgrading)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Cursor};
    use std::net::TcpListener;
    use std::thread;

    const KEY: &str = "desktop-identity-fixture-control-key";
    const BODY: &str = r#"{"status":"ok","desktop_tui":true}"#;
    const READY: &str = "HTTP/1.1 200 OK";
    /// The status line and the fields the Host's maintenance listener writes.
    const UNAVAILABLE: &str = "HTTP/1.1 503 Service Unavailable";
    const UPGRADING: &str = r#"{"status":"upgrading","process_id":7,"service_process_id":7,
        "upgrade":{"done":1,"total":3,"started_at":1794100000000}}"#;
    fn response(challenge: &str, key: &str, body: &str) -> String {
        signed(READY, challenge, key, body)
    }
    fn signed(status: &str, challenge: &str, key: &str, body: &str) -> String {
        let mut mac = Hmac::<Sha256>::new_from_slice(key.as_bytes()).unwrap();
        mac.update(challenge.as_bytes());
        mac.update(b"\n");
        mac.update(body.as_bytes());
        let proof = URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes());
        format!(
            "{status}\r\nContent-Length: {}\r\nx-molis-work-proof: {proof}\r\n\r\n{body}",
            body.len()
        )
    }

    #[test]
    fn sys14_rejects_false_replayed_tampered_and_malformed_services() {
        let valid = response("fresh", KEY, BODY);
        match verify_response(&mut Cursor::new(&valid), KEY, "fresh") {
            Some(Answer::Ready(health)) => assert!(health.desktop_tui),
            _ => panic!("this Home's ready service is ready"),
        }
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

    #[test]
    fn upg19_an_upgrading_host_counts_only_with_this_homes_proof() {
        let upgrading = signed(UNAVAILABLE, "fresh", KEY, UPGRADING);
        match verify_response(&mut Cursor::new(&upgrading), KEY, "fresh") {
            Some(Answer::Upgrading) => {}
            _ => panic!("this Home's Host, upgrading, says so"),
        }
        for fake in [
            signed(UNAVAILABLE, "old", KEY, UPGRADING),
            signed(UNAVAILABLE, "fresh", "another-home", UPGRADING),
            upgrading.replace("x-molis-work-proof", "x-ignored"),
            upgrading.replace("\"upgrading\"", "\"upgraded\""),
            signed("HTTP/1.1 503 Unavailable", "fresh", KEY, UPGRADING),
            signed("HTTP/1.1 502 Bad Gateway", "fresh", KEY, UPGRADING),
            signed(READY, "fresh", KEY, UPGRADING),
            signed(UNAVAILABLE, "fresh", KEY, r#"{"status":"starting"}"#),
            signed(UNAVAILABLE, "fresh", KEY, BODY),
            signed(UNAVAILABLE, "fresh", KEY, r#"{"text":"status upgrading"}"#),
        ] {
            assert!(verify_response(&mut Cursor::new(fake), KEY, "fresh").is_none());
        }
    }

    #[test]
    fn upg19_no_native_payload_goes_to_a_host_that_is_upgrading() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            let mut request = String::new();
            while !request.ends_with("\r\n\r\n") {
                assert!(reader.read_line(&mut request).unwrap() > 0);
            }
            let challenge = request.split("challenge=").nth(1).unwrap();
            let challenge = challenge.split(' ').next().unwrap();
            let answer = signed(UNAVAILABLE, challenge, KEY, UPGRADING);
            socket.write_all(answer.as_bytes()).unwrap();
            let mut payload = String::new();
            reader.read_line(&mut payload).unwrap();
            assert_eq!(payload, "");
        });
        let mut client = TcpStream::connect(address).unwrap();
        assert!(authenticate(&mut client, KEY).is_err());
        drop(client);
        server.join().unwrap();
    }
}
