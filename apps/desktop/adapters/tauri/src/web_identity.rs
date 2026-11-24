//! A loopback port is an address, not an identity. The server proves knowledge of this Home's
//! control key without receiving it. A native HTTP client keeps this socket for its actual request.
use crate::native_language::tr;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use std::time::{Duration, Instant};

fn refused_message() -> String {
    tr(
        "本地服务身份校验未通过，请稍后重试。",
        "Couldn’t verify the local service. Please try again.",
        "ローカルサービスを確認できませんでした。もう一度お試しください。",
    )
    .to_string()
}
const MAX_HEAD: usize = 8192;
const MAX_BODY: usize = 4096;
/// Short lease reused only by explicitly allowlisted low-risk UI IPC commands (`S-14`).
/// Bound to the active port, the Home's current control token digest, and a monotonic invalidation
/// generation; invalidated immediately on any health failure, port change, Host stop, rollback, or exit.
pub(crate) const LOW_RISK_HEALTH_LEASE: Duration = Duration::from_millis(2500);

#[derive(Clone, Copy, Debug)]
struct HealthLease {
    port: u16,
    token_digest: [u8; 32],
    generation: u64,
    verified_at: Instant,
}

#[derive(Clone, Copy, Debug)]
struct VerifiedHostPid {
    port: u16,
    process_id: u32,
}

static LEASE_GENERATION: AtomicU64 = AtomicU64::new(1);
static HEALTH_LEASE: Mutex<Option<HealthLease>> = Mutex::new(None);
/// Kept separately from `HEALTH_LEASE` so a transient probe blip during page load does not wipe
/// the active Host PID to 0 and force destructive hard reloads; cleared only on port change, stop,
/// rollback, or exit.
static LAST_VERIFIED_PID: Mutex<Option<VerifiedHostPid>> = Mutex::new(None);

#[derive(Deserialize)]
pub(crate) struct Health {
    status: String,
    pub(crate) desktop_tui: bool,
    #[serde(default)]
    pub(crate) process_id: Option<u32>,
    #[serde(default)]
    pub(crate) active_work: Option<u32>,
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
    .map_err(|_| refused_message())?;
    let token = token.trim();
    if !(32..=512).contains(&token.len()) || token.contains(['\r', '\n', '\0']) {
        return Err(refused_message());
    }
    Ok(token.into())
}

fn token_digest(token: &str) -> [u8; 32] {
    Sha256::digest(token.as_bytes()).into()
}

pub(crate) fn invalidate_health_lease() {
    LEASE_GENERATION.fetch_add(1, Ordering::AcqRel);
    if let Ok(mut slot) = HEALTH_LEASE.lock() {
        *slot = None;
    }
}

pub(crate) fn clear_verified_process_id() {
    invalidate_health_lease();
    if let Ok(mut slot) = LAST_VERIFIED_PID.lock() {
        *slot = None;
    }
}

pub(crate) fn record_verified_process_id(port: u16, process_id: Option<u32>) {
    if port != crate::host_port::port() {
        return;
    }
    if let Some(process_id) = process_id {
        if let Ok(mut slot) = LAST_VERIFIED_PID.lock() {
            *slot = Some(VerifiedHostPid { port, process_id });
        }
    }
}

struct HealthLeaseUpdate<'a> {
    port: u16,
    active_port: u16,
    token: &'a str,
    process_id: Option<u32>,
    started_generation: u64,
    current_generation: u64,
    now: Instant,
}

fn apply_health_lease(
    lease_slot: &mut Option<HealthLease>,
    pid_slot: &mut Option<VerifiedHostPid>,
    update: HealthLeaseUpdate<'_>,
) -> bool {
    if update.port != update.active_port || update.current_generation != update.started_generation {
        return false;
    }
    *lease_slot = Some(HealthLease {
        port: update.port,
        token_digest: token_digest(update.token),
        generation: update.started_generation,
        verified_at: update.now,
    });
    if let Some(process_id) = update.process_id {
        *pid_slot = Some(VerifiedHostPid {
            port: update.port,
            process_id,
        });
    }
    true
}

fn record_health_lease(port: u16, token: &str, process_id: Option<u32>, started_generation: u64) {
    let active_port = crate::host_port::port();
    if port != active_port || LEASE_GENERATION.load(Ordering::Acquire) != started_generation {
        return;
    }
    if let (Ok(mut lease_slot), Ok(mut pid_slot)) = (HEALTH_LEASE.lock(), LAST_VERIFIED_PID.lock())
    {
        let current_generation = LEASE_GENERATION.load(Ordering::Acquire);
        apply_health_lease(
            &mut lease_slot,
            &mut pid_slot,
            HealthLeaseUpdate {
                port,
                active_port,
                token,
                process_id,
                started_generation,
                current_generation,
                now: Instant::now(),
            },
        );
    }
}

fn health_lease_valid(
    lease: Option<HealthLease>,
    active_port: u16,
    expected_token_digest: [u8; 32],
    current_generation: u64,
    now: Instant,
    ttl: Duration,
) -> bool {
    lease.is_some_and(|entry| {
        entry.port == active_port
            && entry.token_digest == expected_token_digest
            && entry.generation == current_generation
            && now.saturating_duration_since(entry.verified_at) <= ttl
    })
}

pub(crate) fn last_verified_process_id() -> Option<u32> {
    let active_port = crate::host_port::port();
    LAST_VERIFIED_PID
        .lock()
        .ok()
        .and_then(|slot| (*slot).filter(|entry| entry.port == active_port))
        .map(|entry| entry.process_id)
}

/// Low-risk UI IPC commands reuse a verified active-port health lease for up to 2.5 s so resize/locale
/// events do not block the main thread on TCP; an expired, rotated-token, or invalidated lease falls
/// back to a fresh HMAC probe.
pub(crate) fn low_risk_health_fresh() -> bool {
    let active_port = crate::host_port::port();
    let fresh = control_token().ok().is_some_and(|token| {
        let digest = token_digest(&token);
        HEALTH_LEASE.lock().ok().is_some_and(|slot| {
            let generation = LEASE_GENERATION.load(Ordering::Acquire);
            health_lease_valid(
                *slot,
                active_port,
                digest,
                generation,
                Instant::now(),
                LOW_RISK_HEALTH_LEASE,
            )
        })
    });
    if fresh {
        return true;
    }
    health().is_ok()
}

pub(crate) fn health() -> Result<Health, String> {
    match answer()? {
        Answer::Ready(health) => Ok(health),
        Answer::Upgrading => Err(refused_message()),
    }
}

/// `/health` on the fixed port, ready or upgrading. Only the wait for the service tells them apart.
pub(crate) fn answer() -> Result<Answer, String> {
    answer_at(crate::host_port::port())
}

/// Bounded `/health` probe on the active port for background quit checks (`<= 400ms` cumulative budget).
pub(crate) fn answer_with_timeout(total_budget: Duration) -> Result<Answer, String> {
    let deadline = Instant::now() + total_budget;
    let port = crate::host_port::port();
    let generation = LEASE_GENERATION.load(Ordering::Acquire);
    let mut proved_token: Option<String> = None;
    let result = (|| {
        let connect_timeout = total_budget.min(Duration::from_millis(150));
        let token = control_token()?;
        let address = std::net::SocketAddr::from(([127, 0, 0, 1], port));
        let mut stream =
            TcpStream::connect_timeout(&address, connect_timeout).map_err(|_| refused_message())?;
        let answer = prove_until(&mut stream, &token, &format!("127.0.0.1:{port}"), deadline)?;
        proved_token = Some(token);
        Ok(answer)
    })();
    if port == crate::host_port::port() {
        match &result {
            Ok(Answer::Ready(health)) => {
                if let Some(token) = proved_token.as_deref() {
                    record_health_lease(port, token, health.process_id, generation);
                }
            }
            Ok(Answer::Upgrading) | Err(_) => invalidate_health_lease(),
        }
    }
    result
}

/// `/health` on a port not yet adopted: the address file's, proved before anything uses it.
pub(crate) fn answer_at(port: u16) -> Result<Answer, String> {
    let generation = LEASE_GENERATION.load(Ordering::Acquire);
    let mut proved_token: Option<String> = None;
    let result = (|| {
        let token = control_token()?;
        let address = std::net::SocketAddr::from(([127, 0, 0, 1], port));
        let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(250))
            .map_err(|_| refused_message())?;
        let answer = prove(&mut stream, &token, &format!("127.0.0.1:{port}"))?;
        proved_token = Some(token);
        Ok(answer)
    })();
    if port == crate::host_port::port() {
        match &result {
            Ok(Answer::Ready(health)) => {
                if let Some(token) = proved_token.as_deref() {
                    record_health_lease(port, token, health.process_id, generation);
                }
            }
            Ok(Answer::Upgrading) | Err(_) => invalidate_health_lease(),
        }
    }
    result
}

/// A socket kept for a native request: only a ready service is sent one.
pub(crate) fn authenticate(stream: &mut TcpStream, token: &str) -> Result<Health, String> {
    let port = crate::host_port::port();
    let generation = LEASE_GENERATION.load(Ordering::Acquire);
    match prove(stream, token, &crate::host_port::host()) {
        Ok(Answer::Ready(health)) => {
            record_health_lease(port, token, health.process_id, generation);
            Ok(health)
        }
        Ok(Answer::Upgrading) | Err(_) => {
            invalidate_health_lease();
            Err(refused_message())
        }
    }
}

fn prove(stream: &mut TcpStream, token: &str, host: &str) -> Result<Answer, String> {
    prove_until(
        stream,
        token,
        host,
        Instant::now() + Duration::from_millis(400),
    )
}

fn prove_until(
    stream: &mut TcpStream,
    token: &str,
    host: &str,
    deadline: Instant,
) -> Result<Answer, String> {
    let remaining = deadline.saturating_duration_since(Instant::now());
    if remaining.is_zero() {
        return Err(refused_message());
    }
    let mut random = [0_u8; 32];
    File::open("/dev/urandom")
        .and_then(|mut source| source.read_exact(&mut random))
        .map_err(|_| refused_message())?;
    let challenge = URL_SAFE_NO_PAD.encode(random);
    stream
        .set_write_timeout(Some(remaining))
        .map_err(|_| refused_message())?;
    write!(
        stream,
        "GET /health?challenge={challenge} HTTP/1.1\r\nHost: {host}\r\nConnection: keep-alive\r\n\r\n"
    )
    .map_err(|_| refused_message())?;
    let read_remaining = deadline.saturating_duration_since(Instant::now());
    if read_remaining.is_zero() {
        return Err(refused_message());
    }
    stream
        .set_read_timeout(Some(read_remaining))
        .map_err(|_| refused_message())?;
    verify_response_until(stream, token, &challenge, Some(deadline)).ok_or_else(refused_message)
}

trait DeadlineRead: Read {
    fn set_deadline_timeout(&mut self, timeout: Duration) -> std::io::Result<()>;
}

impl DeadlineRead for TcpStream {
    fn set_deadline_timeout(&mut self, timeout: Duration) -> std::io::Result<()> {
        self.set_read_timeout(Some(timeout))
    }
}

#[cfg(test)]
impl<T: AsRef<[u8]>> DeadlineRead for std::io::Cursor<T> {
    fn set_deadline_timeout(&mut self, _timeout: Duration) -> std::io::Result<()> {
        Ok(())
    }
}

/// Reads exactly `buf.len()` bytes while refreshing the socket's read timeout before every syscall
/// so a slow-drip peer cannot stretch `SO_RCVTIMEO` past the cumulative `deadline`.
fn read_exact_until(
    stream: &mut impl DeadlineRead,
    mut buf: &mut [u8],
    deadline: Option<Instant>,
) -> Option<()> {
    while !buf.is_empty() {
        if let Some(limit) = deadline {
            let remaining = limit.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return None;
            }
            stream.set_deadline_timeout(remaining).ok()?;
        }
        match stream.read(buf) {
            Ok(0) => return None,
            Ok(n) => buf = &mut buf[n..],
            Err(err) if err.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return None,
        }
    }
    Some(())
}

#[cfg(test)]
fn verify_response(stream: &mut impl DeadlineRead, token: &str, challenge: &str) -> Option<Answer> {
    verify_response_until(stream, token, challenge, None)
}

fn verify_response_until(
    stream: &mut impl DeadlineRead,
    token: &str,
    challenge: &str,
    deadline: Option<Instant>,
) -> Option<Answer> {
    let mut head = Vec::new();
    while !head.ends_with(b"\r\n\r\n") {
        if head.len() == MAX_HEAD || deadline.is_some_and(|limit| Instant::now() >= limit) {
            return None;
        }
        let mut byte = [0];
        read_exact_until(stream, &mut byte, deadline)?;
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
    read_exact_until(stream, &mut body, deadline)?;
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

    #[test]
    fn s14_low_risk_health_lease_expires_and_rejects_port_change() {
        let now = Instant::now();
        let digest = token_digest(KEY);
        let other_digest = token_digest("rotated-control-key");
        let lease = Some(HealthLease {
            port: 4173,
            token_digest: digest,
            generation: 7,
            verified_at: now,
        });
        assert!(health_lease_valid(
            lease,
            4173,
            digest,
            7,
            now,
            LOW_RISK_HEALTH_LEASE
        ));
        assert!(health_lease_valid(
            lease,
            4173,
            digest,
            7,
            now + Duration::from_millis(2499),
            LOW_RISK_HEALTH_LEASE
        ));
        assert!(!health_lease_valid(
            lease,
            4173,
            digest,
            7,
            now + Duration::from_millis(2501),
            LOW_RISK_HEALTH_LEASE
        ));
        assert!(!health_lease_valid(
            lease,
            4174,
            digest,
            7,
            now,
            LOW_RISK_HEALTH_LEASE
        ));
        assert!(!health_lease_valid(
            lease,
            4173,
            other_digest,
            7,
            now,
            LOW_RISK_HEALTH_LEASE
        ));
        assert!(!health_lease_valid(
            lease,
            4173,
            digest,
            8,
            now,
            LOW_RISK_HEALTH_LEASE
        ));
        assert!(!health_lease_valid(
            None,
            4173,
            digest,
            7,
            now,
            LOW_RISK_HEALTH_LEASE
        ));

        // Stale in-flight probe cannot resurrect a lease after invalidation, while transient
        // invalidation preserves LAST_VERIFIED_PID until explicit clear.
        let mut lease_slot = None;
        let mut pid_slot = None;
        let generation = 7;
        assert!(apply_health_lease(
            &mut lease_slot,
            &mut pid_slot,
            HealthLeaseUpdate {
                port: 4173,
                active_port: 4173,
                token: KEY,
                process_id: Some(4242),
                started_generation: generation,
                current_generation: generation,
                now,
            },
        ));
        assert!(lease_slot.is_some());
        assert_eq!(pid_slot.map(|entry| entry.process_id), Some(4242));
        // Simulated transient invalidation: generation bumps and lease clears, PID stays.
        lease_slot = None;
        let bumped_generation = generation + 1;
        assert_eq!(
            pid_slot.map(|entry| entry.process_id),
            Some(4242),
            "transient probe failure must not wipe loaded Host PID"
        );
        assert!(!apply_health_lease(
            &mut lease_slot,
            &mut pid_slot,
            HealthLeaseUpdate {
                port: 4173,
                active_port: 4173,
                token: KEY,
                process_id: Some(9999),
                started_generation: generation,
                current_generation: bumped_generation,
                now,
            },
        ));
        assert!(
            lease_slot.is_none(),
            "stale in-flight probe with older generation cannot resurrect lease"
        );
        assert_eq!(pid_slot.map(|entry| entry.process_id), Some(4242));

        let with_active = response(
            "fresh",
            KEY,
            r#"{"status":"ok","desktop_tui":true,"process_id":99,"active_work":3}"#,
        );
        match verify_response(&mut Cursor::new(&with_active), KEY, "fresh") {
            Some(Answer::Ready(health)) => {
                assert_eq!(health.process_id, Some(99));
                assert_eq!(health.active_work, Some(3));
            }
            _ => panic!("verified health should parse process_id and active_work"),
        }
    }

    #[test]
    fn s14_prove_until_enforces_cumulative_deadline_under_slow_drip_peer() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            let _ = socket.set_read_timeout(Some(Duration::from_secs(2)));
            let mut reader = BufReader::new(socket.try_clone().unwrap());
            let mut request = String::new();
            while !request.ends_with("\r\n\r\n") {
                if reader.read_line(&mut request).unwrap_or(0) == 0 {
                    return;
                }
            }
            let challenge = request
                .split("challenge=")
                .nth(1)
                .unwrap()
                .split(' ')
                .next()
                .unwrap();
            let full = response(challenge, KEY, BODY);
            for byte in full.as_bytes() {
                if socket.write_all(&[*byte]).is_err() {
                    break;
                }
                thread::sleep(Duration::from_millis(35));
            }
        });
        let mut client = TcpStream::connect(address).unwrap();
        let started = Instant::now();
        let budget = Duration::from_millis(160);
        let result = prove_until(&mut client, KEY, &address.to_string(), started + budget);
        let elapsed = started.elapsed();
        drop(client);
        assert!(result.is_err(), "slow-drip response must abort at deadline");
        assert!(
            elapsed < Duration::from_millis(450),
            "cumulative deadline should bound slow-drip reads (elapsed {elapsed:?})"
        );
        server.join().unwrap();
    }
}
