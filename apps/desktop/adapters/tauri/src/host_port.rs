//! Where this Home's Host listens (specs/proactive-assistant/resident-runtime-design.md §6, BL-108).
//!
//! The Host writes `run/endpoint.json` once it listens. The file only points the way: the desktop
//! connects to that port only after the Host there proves it holds this Home's control key
//! (`web_identity`, S-07). With no file, or one whose Host does not prove itself, the desktop looks
//! on 4173 as before, and starts a Host of its own on a spare port when 4173 is another program's.
//!
//! The port is the one proved at start. Every address the shell builds, and the IPC grants for the
//! pages it loads (`runtime-capabilities/`, granted at start for that port), use it; a Host on any
//! other port or origin gets nothing (S-14).
use serde::Deserialize;
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::Path;
use std::sync::atomic::{AtomicU16, Ordering};
use std::time::Duration;
use tauri::Url;

pub(crate) const DEFAULT_PORT: u16 = 4173;
const SPARE_PORTS: std::ops::RangeInclusive<u16> = 4174..=4199;
const ENDPOINT_SCHEMA_VERSION: u32 = 1;

static PORT: AtomicU16 = AtomicU16::new(DEFAULT_PORT);

/// The proved port (4173 until a start proves another).
pub(crate) fn port() -> u16 {
    PORT.load(Ordering::Acquire)
}

pub(crate) fn set_port(port: u16) {
    PORT.store(port, Ordering::Release);
}

/// `127.0.0.1:<port>`, for a request's Host line.
pub(crate) fn host() -> String {
    format!("127.0.0.1:{}", port())
}

/// `http://127.0.0.1:<port>`: the one origin of the pages the shell loads.
pub(crate) fn origin() -> String {
    format!("http://{}", host())
}

pub(crate) fn address() -> SocketAddr {
    SocketAddr::from(([127, 0, 0, 1], port()))
}

/// The Host's own origin exactly: http, the loopback address, the proved port.
pub(crate) fn is_host_url(url: &Url) -> bool {
    is_origin(url, port())
}

fn is_origin(url: &Url, port: u16) -> bool {
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.port_or_known_default() == Some(port)
}

#[derive(Deserialize)]
struct Endpoint {
    schema_version: u32,
    port: u32,
}

/// The port the Home's address file names, when it is one this version wrote. The caller still
/// proves who answers there.
pub(crate) fn endpoint_port(home: &Path) -> Option<u16> {
    let text = std::fs::read(home.join("run").join("endpoint.json")).ok()?;
    endpoint_port_of(&text)
}

fn endpoint_port_of(text: &[u8]) -> Option<u16> {
    let endpoint = serde_json::from_slice::<Endpoint>(text).ok()?;
    if endpoint.schema_version != ENDPOINT_SCHEMA_VERSION {
        return None;
    }
    u16::try_from(endpoint.port).ok().filter(|port| *port > 0)
}

/// Something listens on this port, whoever it is.
pub(crate) fn occupied(port: u16) -> bool {
    TcpStream::connect_timeout(
        &SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(250),
    )
    .is_ok()
}

/// A port of 4174–4199 that nothing listens on, for a Host this desktop starts while 4173 is
/// another program's.
pub(crate) fn spare_port() -> Option<u16> {
    SPARE_PORTS
        .clone()
        .find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
}

/// The shell's IPC grants. They are the files in `runtime-capabilities/`, with the proved port put
/// in; nothing else is granted, and they name no other port, host or scheme.
const CAPABILITY_TEMPLATES: [&str; 6] = [
    include_str!("../../../src-tauri/runtime-capabilities/default.json"),
    include_str!("../../../src-tauri/runtime-capabilities/context-directories.json"),
    include_str!("../../../src-tauri/runtime-capabilities/main-external-links.json"),
    include_str!("../../../src-tauri/runtime-capabilities/main-rollback.json"),
    include_str!("../../../src-tauri/runtime-capabilities/capsule-runtime.json"),
    include_str!("../../../src-tauri/runtime-capabilities/main-running.json"),
];

pub(crate) fn capabilities(port: u16) -> Vec<String> {
    CAPABILITY_TEMPLATES
        .iter()
        .map(|template| template.replace("{port}", &port.to_string()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn res07_the_address_file_is_read_only_in_the_shape_this_version_writes() {
        assert_eq!(
            endpoint_port_of(
                br#"{"schema_version":1,"port":4190,"process_id":7,"started_at":"x"}"#
            ),
            Some(4190)
        );
        for refused in [
            &br#"{"schema_version":2,"port":4190}"#[..],
            br#"{"schema_version":1,"port":0}"#,
            br#"{"schema_version":1,"port":70000}"#,
            br#"{"schema_version":1,"port":"4190"}"#,
            br#"{"port":4190}"#,
            b"not json",
        ] {
            assert_eq!(
                endpoint_port_of(refused),
                None,
                "{}",
                String::from_utf8_lossy(refused)
            );
        }
    }

    // RES-08 / S-14: the grants are the templates with only the proved port put in. Every remote
    // address is this Host's loopback origin on that port; another port, host or scheme is not one.
    #[test]
    fn res08_s14_grants_reach_only_the_proved_port() {
        for port in [4173_u16, 4190] {
            let granted = capabilities(port);
            assert_eq!(granted.len(), 6);
            for capability in &granted {
                assert!(!capability.contains("{port}"));
                let value: serde_json::Value = serde_json::from_str(capability).unwrap();
                let urls = value["remote"]["urls"].as_array().expect("remote urls");
                assert!(!urls.is_empty());
                for url in urls {
                    let url = url.as_str().unwrap();
                    assert!(
                        url.starts_with(&format!("http://127.0.0.1:{port}/"))
                            || url.starts_with(&format!("http://localhost:{port}/")),
                        "{url}"
                    );
                }
            }
        }
        let proved = Url::parse("http://127.0.0.1:4190/desktop/capsule").unwrap();
        assert!(is_origin(&proved, 4190));
        for other in [
            "http://127.0.0.1:4173/desktop/capsule",
            "http://localhost:4190/desktop/capsule",
            "https://127.0.0.1:4190/desktop/capsule",
            "http://example.org:4190/",
            "tauri://localhost/index.html",
        ] {
            assert!(!is_origin(&Url::parse(other).unwrap(), 4190), "{other}");
        }
    }
}
