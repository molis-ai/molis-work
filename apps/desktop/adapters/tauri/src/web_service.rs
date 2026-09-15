use crate::runtime_env::login_shell_path;
use semver::Version;
use serde::Deserialize;
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Default)]
pub(crate) struct WebServiceState {
    pub(crate) owned_child: Mutex<Option<std::process::Child>>,
    pub(crate) shutting_down: AtomicBool,
}

fn product_env(suffix: &str) -> Option<String> {
    let next = format!("MOLIS_WORK_{suffix}");
    if let Ok(value) = std::env::var(&next) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Some(trimmed.to_string());
        }
    }
    let legacy = format!("GOALBOARD_{suffix}");
    std::env::var(legacy)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn molis_work_home() -> PathBuf {
    if let Some(home) = product_env("HOME") {
        return PathBuf::from(home);
    }
    let user_home = PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into()));
    let next = user_home.join(".molis-work");
    let legacy = user_home.join(".goalboard");
    if !next.exists() && legacy.exists() {
        let _ = fs::rename(&legacy, &next);
    }
    if next.exists() && !legacy.exists() {
        let _ = std::os::unix::fs::symlink(&next, &legacy);
    }
    if next.exists() || !legacy.exists() {
        next
    } else {
        legacy
    }
}

fn web_launcher(home: &Path) -> PathBuf {
    ["molis-work-web", "goalboard-web"]
        .into_iter()
        .map(|name| home.join("bin").join(name))
        .find(|path| path.is_file())
        .unwrap_or_else(|| home.join("bin").join("molis-work-web"))
}

pub(crate) fn web_healthy() -> bool {
    health_body()
        .map(|body| body.contains("\"status\":\"ok\"") || body.contains("\"status\": \"ok\""))
        .unwrap_or(false)
}

fn web_desktop_ready() -> bool {
    health_body()
        .map(|body| body.contains("\"desktop_tui\":true") || body.contains("\"desktop_tui\": true"))
        .unwrap_or(false)
}

fn health_body() -> Option<String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 4173));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(250)).ok()?;
    let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
    stream
        .write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1:4173\r\nConnection: close\r\n\r\n")
        .ok()?;
    let mut body = String::new();
    let _ = stream.read_to_string(&mut body);
    if body.contains("200") {
        Some(body)
    } else {
        None
    }
}

fn embedded_molis_work_source(resource_dir: &Path) -> Option<(PathBuf, PathBuf)> {
    for relative in ["molis-work-runtime", "resources/molis-work-runtime"] {
        let source = resource_dir.join(relative);
        let node = source.join("runtime").join("node");
        let installer = source.join("dist").join("cli").join("main.js");
        if node.is_file() && installer.is_file() {
            return Some((source, node));
        }
    }
    None
}

#[derive(Deserialize)]
struct RuntimeVersionMetadata {
    version: String,
}

fn read_runtime_version(path: &Path) -> Option<Version> {
    let metadata = serde_json::from_slice::<RuntimeVersionMetadata>(&fs::read(path).ok()?).ok()?;
    Version::parse(metadata.version.trim()).ok()
}

fn embedded_version_is_upgrade(embedded: &Version, installed: Option<&Version>) -> bool {
    installed.map(|version| embedded > version).unwrap_or(true)
}

fn embedded_runtime_upgrade_available(resource_dir: &Path, home: &Path) -> bool {
    let Some((source, _)) = embedded_molis_work_source(resource_dir) else {
        return false;
    };
    let Some(embedded_version) = read_runtime_version(&source.join("package.json")) else {
        return false;
    };
    let installed_version = read_runtime_version(&home.join("config").join("installation.json"));
    embedded_version_is_upgrade(&embedded_version, installed_version.as_ref())
}

#[cfg(test)]
mod embedded_runtime_version_tests {
    use super::{embedded_version_is_upgrade, sync_managed_web_service_after_upgrade, Version};
    use std::{
        fs,
        os::unix::fs::PermissionsExt,
        path::PathBuf,
        process,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn only_missing_or_newer_embedded_runtimes_install() {
        let old = Version::parse("0.1.4").unwrap();
        let current = Version::parse("0.1.5").unwrap();
        let newer = Version::parse("0.1.6").unwrap();

        assert!(embedded_version_is_upgrade(&current, None));
        assert!(embedded_version_is_upgrade(&newer, Some(&current)));
        assert!(!embedded_version_is_upgrade(&current, Some(&current)));
        assert!(!embedded_version_is_upgrade(&old, Some(&current)));
    }

    #[test]
    fn embedded_runtime_upgrade_repairs_the_owned_service_configuration() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let home = std::env::temp_dir().join(format!(
            "molis-work-desktop-service-refresh-{}-{nonce}",
            process::id(),
        ));
        let bin = home.join("bin");
        let cli = bin.join("molis-work");
        let receipt = home.join("called.txt");
        fs::create_dir_all(&bin).unwrap();
        fs::write(
            &cli,
            format!(
                "#!/bin/sh\nprintf '%s\\n' \"$*\" > '{}'\n",
                receipt.display()
            ),
        )
        .unwrap();
        let mut permissions = fs::metadata(&cli).unwrap().permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&cli, permissions).unwrap();

        let refreshed = sync_managed_web_service_after_upgrade(&home);

        assert!(refreshed);
        assert_eq!(
            fs::read_to_string(&receipt).unwrap().trim(),
            format!(
                "service install --home {} --confirm",
                PathBuf::from(&home).display()
            ),
        );
        fs::remove_dir_all(home).unwrap();
    }
}

fn install_embedded_molis_work(resource_dir: &Path, home: &Path) -> Result<(), String> {
    let (source, node) = embedded_molis_work_source(resource_dir).ok_or_else(|| {
        "Molis Work App 不含可用的 Runtime payload，请重新下载安装包。".to_string()
    })?;
    let installer = source.join("dist").join("cli").join("main.js");
    let output = Command::new(&node)
        .arg(&installer)
        .arg("install")
        .arg("--home")
        .arg(home)
        .arg("--source")
        .arg(&source)
        .arg("--json")
        .stdin(Stdio::null())
        .output()
        .map_err(|error| format!("无法运行 Molis Work 内置安装器：{error}"))?;
    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if detail.is_empty() {
        "Molis Work 内置 Runtime 安装失败。".to_string()
    } else {
        format!("Molis Work 内置 Runtime 安装失败：{detail}")
    })
}

fn sync_managed_web_service_after_upgrade(home: &Path) -> bool {
    let cli = ["molis-work", "goalboard"]
        .into_iter()
        .map(|name| home.join("bin").join(name))
        .find(|path| path.is_file());
    let Some(cli) = cli else {
        return false;
    };
    Command::new(cli)
        .args(["service", "install", "--home"])
        .arg(home)
        .arg("--confirm")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn terminate_owned_web_child(child: &mut std::process::Child) {
    if child.try_wait().ok().flatten().is_none() {
        let pid = child.id().to_string();
        let process_group = format!("-{}", child.id());
        let _ = Command::new("/bin/kill")
            .args(["-TERM", process_group.as_str()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = Command::new("/bin/kill")
            .args(["-TERM", pid.as_str()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        for _ in 0..20 {
            if child.try_wait().ok().flatten().is_some() {
                return;
            }
            thread::sleep(Duration::from_millis(25));
        }
        let _ = Command::new("/bin/kill")
            .args(["-KILL", process_group.as_str()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = child.kill();
    }
    let _ = child.wait();
}

fn replace_owned_web_child(
    state: &WebServiceState,
    mut child: std::process::Child,
) -> Result<(), String> {
    let mut owned_child = state
        .owned_child
        .lock()
        .map_err(|error| error.to_string())?;
    if state.shutting_down.load(Ordering::Acquire) {
        drop(owned_child);
        terminate_owned_web_child(&mut child);
        return Err("Molis Work 正在退出，不再启动 Web 服务".into());
    }
    let previous = owned_child.replace(child);
    drop(owned_child);
    if let Some(mut previous) = previous {
        terminate_owned_web_child(&mut previous);
    }
    Ok(())
}

pub(crate) fn stop_owned_web_service(state: &WebServiceState) -> bool {
    let child = state
        .owned_child
        .lock()
        .ok()
        .and_then(|mut child| child.take());
    if let Some(mut child) = child {
        terminate_owned_web_child(&mut child);
        return true;
    }
    false
}

pub(crate) fn ensure_molis_work_web(
    resource_dir: Option<&Path>,
    service_state: &WebServiceState,
) -> Result<(), String> {
    let home = molis_work_home();
    let mut bin = web_launcher(&home);
    let upgraded_runtime = resource_dir
        .filter(|resource_dir| embedded_runtime_upgrade_available(resource_dir, &home))
        .map(|resource_dir| install_embedded_molis_work(resource_dir, &home))
        .transpose()?
        .is_some();
    if upgraded_runtime {
        let _ = sync_managed_web_service_after_upgrade(&home);
        bin = web_launcher(&home);
    }
    if web_healthy() {
        if !web_desktop_ready() {
            eprintln!(
        "127.0.0.1:4173 上的 Molis Work Web 不含桌面终端。请在仓库运行 pnpm install:local 后执行 molis-work service restart --confirm，再重新打开 App。"
      );
        }
        return Ok(());
    }
    if !bin.is_file() {
        if let Some(resource_dir) = resource_dir {
            // A first-run App can seed its self-contained Runtime. Existing installs are
            // only replaced above when the bundled version is newer, so an older App can
            // never overwrite a same-version local build while the service restarts.
            install_embedded_molis_work(resource_dir, &home)?;
            bin = web_launcher(&home);
        }
    }
    if !bin.is_file() {
        return Err(format!(
            "Molis Work Web 未安装：找不到 {}。源码运行请先执行 pnpm install:local。",
            bin.display()
        ));
    }
    let path = login_shell_path();
    let child = Command::new(&bin)
        .args(["--home", home.to_str().unwrap_or_default()])
        .env("PATH", &path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|error| format!("无法启动 Molis Work Web：{error}"))?;
    replace_owned_web_child(service_state, child)?;
    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        if service_state.shutting_down.load(Ordering::Acquire) {
            stop_owned_web_service(service_state);
            return Err("Molis Work 正在退出，不再等待 Web 服务".into());
        }
        if web_healthy() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(120));
    }
    stop_owned_web_service(service_state);
    Err("Molis Work Web 已启动，但 127.0.0.1:4173 尚未就绪".into())
}
