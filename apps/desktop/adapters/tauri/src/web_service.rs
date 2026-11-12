use crate::runtime_env::login_shell_path;
use crate::web_identity::Answer;
use semver::Version;
use serde::Deserialize;
use std::fs;
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

/// How long a started service has to answer ready. Time it spends proving it is upgrading does
/// not count (upgrade-chain-design §4.3).
const START_WAIT: Duration = Duration::from_secs(8);
/// The limit the managed service has too (`UPGRADE_WAIT_MILLISECONDS` in
/// `installer/web-service-process.ts`): an upgrade takes as long as the data does, and this still
/// ends a process that never stops saying so.
const UPGRADE_WAIT: Duration = Duration::from_secs(30 * 60);
const PROBE_INTERVAL: Duration = Duration::from_millis(120);

#[derive(Debug, PartialEq, Eq)]
enum Wait {
    Ready,
    Upgrading,
    TimedOut,
    Stopped,
}

/// What a proven upgrading answer does to a wait. A start hands the wait over at once: the desktop
/// starts on the main thread, which must not be held for as long as an upgrade takes. The rest of
/// the wait runs on a thread of its own and waits the upgrade out.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Upgrade {
    HandOver,
    WaitOut,
}

/// How a start ended when it did not fail: the service answers ready, or this Home's Host proves
/// it is upgrading and the rest of the wait is the caller's (`wait_for_upgrading_web`).
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Started {
    Ready,
    Upgrading,
}

/// Waits for the service on 4173. A ready answer ends it. While this Home's Host proves it is
/// upgrading, the 8 seconds start again from its last such answer, up to `UPGRADE_WAIT`, unless the
/// wait is handed over at the first such answer (`Upgrade::HandOver`); anything else, a 503 no one
/// can prove is this Home's among them, uses them up.
fn wait_for_web(
    upgrade: Upgrade,
    mut answer: impl FnMut() -> Option<Answer>,
    mut now: impl FnMut() -> Instant,
    mut pause: impl FnMut(),
    stopping: impl Fn() -> bool,
) -> Wait {
    let started = now();
    let mut deadline = started + START_WAIT;
    loop {
        if stopping() {
            return Wait::Stopped;
        }
        let at = now();
        if at >= deadline {
            return Wait::TimedOut;
        }
        match answer() {
            Some(Answer::Ready(_)) => return Wait::Ready,
            Some(Answer::Upgrading) if upgrade == Upgrade::HandOver => return Wait::Upgrading,
            Some(Answer::Upgrading) if at < started + UPGRADE_WAIT => deadline = at + START_WAIT,
            _ => {}
        }
        pause();
    }
}

/// The wait, on this machine's port and clock. A service that does not come up in it is stopped,
/// if this App started it; one that proves it is upgrading is left running.
fn wait_for_owned_web(
    service_state: &WebServiceState,
    upgrade: Upgrade,
) -> Result<Started, String> {
    let waited = wait_for_web(
        upgrade,
        || crate::web_identity::answer().ok(),
        Instant::now,
        || thread::sleep(PROBE_INTERVAL),
        || service_state.shutting_down.load(Ordering::Acquire),
    );
    match waited {
        Wait::Ready => Ok(Started::Ready),
        Wait::Upgrading => Ok(Started::Upgrading),
        Wait::Stopped => {
            stop_owned_web_service(service_state);
            Err("Molis Work 正在退出，不再等待 Web 服务".into())
        }
        Wait::TimedOut => {
            stop_owned_web_service(service_state);
            Err("Molis Work Web 已启动，但 127.0.0.1:4173 尚未就绪".into())
        }
    }
}

fn product_env(suffix: &str) -> Option<String> {
    let next = format!("MOLIS_WORK_{suffix}");
    std::env::var(&next)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(crate) fn molis_work_home() -> PathBuf {
    if let Some(home) = product_env("HOME") {
        return PathBuf::from(home);
    }
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into())).join(".molis-work")
}

fn web_launcher(home: &Path) -> PathBuf {
    home.join("bin").join("molis-work-web")
}

pub(crate) fn web_healthy() -> bool {
    crate::web_identity::health().is_ok()
}

fn web_desktop_ready() -> bool {
    crate::web_identity::health().is_ok_and(|health| health.desktop_tui)
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

#[derive(Deserialize)]
struct RollbackHold {
    schema_version: u32,
    rolled_back_from: RuntimeVersionMetadata,
}

/// After `home rollback` (upgrade-continuity U3 §5.3), the version the Home came back from: the desktop does not put it back on its own.
fn read_rollback_hold(home: &Path) -> Option<Version> {
    let path = home.join("config").join("rollback-hold.json");
    let hold = serde_json::from_slice::<RollbackHold>(&fs::read(path).ok()?).ok()?;
    if hold.schema_version != 1 {
        return None;
    }
    Version::parse(hold.rolled_back_from.version.trim()).ok()
}

fn embedded_version_is_upgrade(
    embedded: &Version,
    installed: Option<&Version>,
    held: Option<&Version>,
) -> bool {
    if held.is_some_and(|held| embedded <= held) {
        return false;
    }
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
    embedded_version_is_upgrade(
        &embedded_version,
        installed_version.as_ref(),
        read_rollback_hold(home).as_ref(),
    )
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
    let cli = home.join("bin").join("molis-work");
    if !cli.is_file() {
        return false;
    }
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

/// 现在的本机服务是不是这个桌面应用拉起的；是的话退出时一起停。
pub(crate) fn desktop_owns_web_service(state: &WebServiceState) -> bool {
    state
        .owned_child
        .lock()
        .map(|child| child.is_some())
        .unwrap_or(false)
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

/// Brings the service on 4173 up and waits on the calling thread until it answers ready: the health
/// monitor's recovery, on a thread of its own.
pub(crate) fn ensure_molis_work_web(
    resource_dir: Option<&Path>,
    service_state: &WebServiceState,
) -> Result<(), String> {
    match start_molis_work_web(resource_dir, service_state)? {
        Started::Ready => Ok(()),
        Started::Upgrading => wait_for_upgrading_web(service_state),
    }
}

/// The rest of a start that met this Home's Host proving it is upgrading: the 8 seconds start
/// again from each such answer, up to `UPGRADE_WAIT`. It can take as long as the data does, so it
/// is for a thread of its own.
pub(crate) fn wait_for_upgrading_web(service_state: &WebServiceState) -> Result<(), String> {
    wait_for_owned_web(service_state, Upgrade::WaitOut).map(|_| ())
}

/// Brings the service on 4173 up as far as the main thread may wait for it: a ready answer, or the
/// first proof that this Home's Host is upgrading, which hands the rest over
/// (`wait_for_upgrading_web`). Without that proof a started service still has its 8 seconds.
// D0295: a failed installer may reuse only the authenticated service that is still healthy.
fn install_or_reuse_healthy(
    install: impl FnOnce() -> Result<(), String>,
    healthy: impl FnOnce() -> bool,
) -> Result<bool, String> {
    match install() {
        Ok(()) => Ok(true),
        Err(_) if healthy() => {
            eprintln!("嵌入运行时更新失败，继续使用仍健康的现有 Molis Work 服务；本次更新未完成。");
            Ok(false)
        }
        Err(error) => Err(error),
    }
}

pub(crate) fn start_molis_work_web(
    resource_dir: Option<&Path>,
    service_state: &WebServiceState,
) -> Result<Started, String> {
    let home = molis_work_home();
    let mut bin = web_launcher(&home);
    // Never replace the runtime while this Home is already upgrading its data.
    if matches!(crate::web_identity::answer(), Ok(Answer::Upgrading)) {
        return Ok(Started::Upgrading);
    }
    let healthy_before = web_healthy();
    let upgraded_runtime = if let Some(resource_dir) =
        resource_dir.filter(|resource_dir| embedded_runtime_upgrade_available(resource_dir, &home))
    {
        install_or_reuse_healthy(
            || install_embedded_molis_work(resource_dir, &home),
            || healthy_before && web_healthy(),
        )?
    } else {
        false
    };
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
        return Ok(Started::Ready);
    }
    // This Home's Host is already upgrading its data (the managed service, or one this App
    // started): another would only fail on the Home's lock, and replacing it stops the upgrade.
    if matches!(crate::web_identity::answer(), Ok(Answer::Upgrading)) {
        return Ok(Started::Upgrading);
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
    let mut command = Command::new(&bin);
    command
        .args(["--home", home.to_str().unwrap_or_default()])
        .env("PATH", &path);
    let child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn()
        .map_err(|error| format!("无法启动 Molis Work Web：{error}"))?;
    replace_owned_web_child(service_state, child)?;
    wait_for_owned_web(service_state, Upgrade::HandOver)
}

#[cfg(test)]
mod embedded_runtime_version_tests {
    use super::{
        embedded_version_is_upgrade, install_or_reuse_healthy, read_rollback_hold,
        sync_managed_web_service_after_upgrade, Version,
    };
    use std::{
        fs,
        os::unix::fs::PermissionsExt,
        path::PathBuf,
        process,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn d0295_failed_install_reuses_only_a_still_healthy_service() {
        assert!(!install_or_reuse_healthy(|| Err("installer failed".into()), || true).unwrap());
        assert_eq!(
            install_or_reuse_healthy(|| Err("installer failed".into()), || false),
            Err("installer failed".into())
        );
        assert!(install_or_reuse_healthy(
            || Ok(()),
            || panic!("successful install follows normal restart")
        )
        .unwrap());
    }

    #[test]
    fn only_missing_or_newer_embedded_runtimes_install() {
        let old = Version::parse("0.1.4").unwrap();
        let current = Version::parse("0.1.5").unwrap();
        let newer = Version::parse("0.1.6").unwrap();

        assert!(embedded_version_is_upgrade(&current, None, None));
        assert!(embedded_version_is_upgrade(&newer, Some(&current), None));
        assert!(!embedded_version_is_upgrade(&current, Some(&current), None));
        assert!(!embedded_version_is_upgrade(&old, Some(&current), None));
    }

    #[test]
    fn upgr04_a_home_that_went_back_is_not_updated_again_to_the_version_it_left() {
        let old = Version::parse("0.1.4").unwrap();
        let left = Version::parse("0.1.5").unwrap();
        let newer = Version::parse("0.1.6").unwrap();

        assert!(!embedded_version_is_upgrade(&left, Some(&old), Some(&left)));
        assert!(
            embedded_version_is_upgrade(&newer, Some(&old), Some(&left)),
            "a later version installs as usual"
        );

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let home =
            std::env::temp_dir().join(format!("molis-rollback-hold-{}-{nonce}", process::id()));
        fs::create_dir_all(home.join("config")).unwrap();
        assert_eq!(read_rollback_hold(&home), None);
        let hold = home.join("config").join("rollback-hold.json");
        fs::write(&hold, r#"{"schema_version":1,"held_version":"0.1.4","rolled_back_from":{"version":"0.1.5","content_digest":"x"},"at":"t"}"#).unwrap();
        assert_eq!(read_rollback_hold(&home), Some(left));
        fs::write(
            &hold,
            r#"{"schema_version":2,"rolled_back_from":{"version":"0.1.5"}}"#,
        )
        .unwrap();
        assert_eq!(
            read_rollback_hold(&home),
            None,
            "a hold this build cannot read holds nothing"
        );
        fs::remove_dir_all(home).unwrap();
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

#[cfg(test)]
mod upgrade_wait_tests {
    use super::{wait_for_web, Upgrade, Wait, START_WAIT, UPGRADE_WAIT};
    use crate::web_identity::Answer;
    use std::cell::Cell;
    use std::time::{Duration, Instant};

    const READY: &str = r#"{"status":"ok","desktop_tui":true}"#;
    const STEP: Duration = Duration::from_secs(1);

    /// The wait on a clock that moves only while it pauses, a second at a time: how it ended, and
    /// after how long. `says` is what 4173 answers that far in.
    fn waited_by(
        upgrade: Upgrade,
        mut says: impl FnMut(Duration) -> Option<Answer>,
    ) -> (Wait, Duration) {
        let start = Instant::now();
        let clock = Cell::new(start);
        let wait = wait_for_web(
            upgrade,
            || says(clock.get() - start),
            || clock.get(),
            || clock.set(clock.get() + STEP),
            || false,
        );
        (wait, clock.get() - start)
    }

    /// The wait on a thread of its own, which waits an upgrade out.
    fn waited(says: impl FnMut(Duration) -> Option<Answer>) -> (Wait, Duration) {
        waited_by(Upgrade::WaitOut, says)
    }

    /// The start's wait, on the main thread, which hands an upgrade over.
    fn handed_over(says: impl FnMut(Duration) -> Option<Answer>) -> (Wait, Duration) {
        waited_by(Upgrade::HandOver, says)
    }

    fn ready() -> Option<Answer> {
        let health = serde_json::from_str(READY).unwrap();
        Some(Answer::Ready(health))
    }

    #[test]
    fn upg19_an_upgrading_host_is_not_stopped_and_has_its_eight_seconds_after() {
        let upgrade = Duration::from_secs(120);
        let (wait, after) = waited(|elapsed| {
            if elapsed < upgrade {
                Some(Answer::Upgrading)
            } else if elapsed < upgrade + Duration::from_secs(5) {
                None
            } else {
                ready()
            }
        });
        assert_eq!(wait, Wait::Ready);
        assert_eq!(after, upgrade + Duration::from_secs(5));
    }

    #[test]
    fn upg19_without_a_proven_upgrading_answer_the_service_still_has_eight_seconds() {
        assert_eq!(waited(|_| None), (Wait::TimedOut, START_WAIT));
        let upgrade = Duration::from_secs(120);
        let (wait, after) = waited(|elapsed| (elapsed < upgrade).then_some(Answer::Upgrading));
        assert_eq!(wait, Wait::TimedOut);
        assert_eq!(after, upgrade - STEP + START_WAIT);
    }

    #[test]
    fn upg19_a_host_that_never_stops_upgrading_is_still_given_up_on() {
        let (wait, after) = waited(|_| Some(Answer::Upgrading));
        assert_eq!(wait, Wait::TimedOut);
        assert_eq!(after, UPGRADE_WAIT - STEP + START_WAIT);
    }

    #[test]
    fn upg19_the_start_holds_the_main_thread_no_longer_than_eight_seconds() {
        let at = Duration::from_secs(5);
        let (wait, after) = handed_over(|elapsed| (elapsed >= at).then_some(Answer::Upgrading));
        assert_eq!(wait, Wait::Upgrading);
        assert_eq!(after, at);
        assert_eq!(
            handed_over(|_| Some(Answer::Upgrading)),
            (Wait::Upgrading, Duration::ZERO)
        );
        assert_eq!(handed_over(|_| ready()), (Wait::Ready, Duration::ZERO));
        assert_eq!(handed_over(|_| None), (Wait::TimedOut, START_WAIT));
    }
}
