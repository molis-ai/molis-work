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
            Err(format!(
                "Molis Work Web 已启动，但 {} 尚未就绪",
                crate::host_port::host()
            ))
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
    if let Some(home) = packaged_test_home() {
        return home;
    }
    if let Some(home) = product_env("HOME") {
        return PathBuf::from(home);
    }
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into())).join(".molis-work")
}

pub(crate) fn packaged_test_home() -> Option<PathBuf> {
    option_env!("MOLIS_WORK_TEST_DESKTOP_HOME").map(|relative| {
        PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/".into())).join(relative)
    })
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

/// A program the desktop compares: its version, and when it was built. Development builds all share a version, so
/// between two of them only the build time tells which is newer (batch 94-1, DSV-01～05).
#[derive(Debug, Clone, PartialEq, Eq)]
struct Program {
    version: Version,
    built: Option<String>,
}

/// `dist/.molis-work-build.json` (`format.build.manifest` 1): `pnpm build` writes it, the App's payload carries it and
/// every release the installer makes from that payload keeps it byte for byte, so two programs compare without
/// hashing either.
#[derive(Deserialize)]
struct BuildManifest {
    schema_version: u32,
    created_at: String,
}

/// `Date.prototype.toISOString()` in UTC, `YYYY-MM-DDTHH:MM:SS.sssZ`: of two such times the later one sorts later as text.
fn is_utc_instant(text: &str) -> bool {
    const SHAPE: &[u8; 24] = b"0000-00-00T00:00:00.000Z";
    text.len() == SHAPE.len()
        && text
            .bytes()
            .zip(SHAPE.iter())
            .all(|(byte, shape)| match shape {
                b'0' => byte.is_ascii_digit(),
                other => byte == *other,
            })
}

fn read_build_time(program: &Path) -> Option<String> {
    let path = program.join("dist").join(".molis-work-build.json");
    let manifest = serde_json::from_slice::<BuildManifest>(&fs::read(path).ok()?).ok()?;
    (manifest.schema_version == 1 && is_utc_instant(&manifest.created_at))
        .then_some(manifest.created_at)
}

#[derive(Deserialize)]
struct Installation {
    version: String,
    release_path: Option<String>,
}

/// The program `config/installation.json` names. Its build time is read only when its release path is the one the
/// installer gives that version, `releases/molis-work-<version>` (`safeReleaseName`); any other path, or none, leaves
/// the version without a build time.
fn read_installed_program(home: &Path) -> Option<Program> {
    let path = home.join("config").join("installation.json");
    let installation = serde_json::from_slice::<Installation>(&fs::read(path).ok()?).ok()?;
    let version = Version::parse(installation.version.trim()).ok()?;
    let release = format!("releases/molis-work-{}", installation.version.trim());
    let built = (installation.release_path.as_deref() == Some(release.as_str()))
        .then(|| read_build_time(&home.join(&release)))
        .flatten();
    Some(Program { version, built })
}

fn embedded_is_upgrade(
    embedded: &Program,
    installed: Option<&Program>,
    held: Option<&Version>,
) -> bool {
    if held.is_some_and(|held| embedded.version <= *held) {
        return false;
    }
    let Some(installed) = installed else {
        return true;
    };
    match embedded.version.cmp(&installed.version) {
        std::cmp::Ordering::Greater => true,
        std::cmp::Ordering::Less => false,
        // Only a later build of the same version: an App built earlier never puts its program over a newer one,
        // such as one `pnpm install:local` put there since. Without both times it is not an upgrade, as before.
        std::cmp::Ordering::Equal => matches!(
            (&embedded.built, &installed.built),
            (Some(embedded), Some(installed)) if embedded > installed
        ),
    }
}

fn embedded_runtime_upgrade_available(resource_dir: &Path, home: &Path) -> bool {
    let Some((source, _)) = embedded_molis_work_source(resource_dir) else {
        return false;
    };
    let Some(version) = read_runtime_version(&source.join("package.json")) else {
        return false;
    };
    let embedded = Program {
        version,
        built: read_build_time(&source),
    };
    embedded_is_upgrade(
        &embedded,
        read_installed_program(home).as_ref(),
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
    crate::web_identity::invalidate_health_lease();
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

/// The port this start looks at first: the one the Home's address file names, once the Host there
/// proves it holds this Home's control key; otherwise 4173, as before. A file only points the way.
fn adopt_endpoint_port(home: &Path) {
    // Proved first, then adopted: no other thread ever reads a port nobody has proved.
    if let Some(port) = crate::host_port::endpoint_port(home) {
        if crate::web_identity::answer_at(port).is_ok() {
            crate::host_port::set_port(port);
            return;
        }
    }
    crate::host_port::set_port(crate::host_port::DEFAULT_PORT);
}

/// The `--port` for a Host this desktop starts: none while 4173 is free, a spare one while something
/// else holds it, a refusal when 4174–4199 are all taken too.
fn start_port(occupied: impl Fn(u16) -> bool) -> Result<Option<u16>, String> {
    if !occupied(crate::host_port::DEFAULT_PORT) {
        return Ok(None);
    }
    crate::host_port::spare_port()
        .map(Some)
        .ok_or_else(|| "127.0.0.1 的 4173–4199 端口都被别的程序占着，Molis Work 起不来".to_string())
}

pub(crate) fn start_molis_work_web(
    resource_dir: Option<&Path>,
    service_state: &WebServiceState,
) -> Result<Started, String> {
    let home = molis_work_home();
    let mut bin = web_launcher(&home);
    adopt_endpoint_port(&home);
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
        if packaged_test_home().is_none() {
            let _ = sync_managed_web_service_after_upgrade(&home);
            adopt_endpoint_port(&home);
        }
        bin = web_launcher(&home);
    }
    if web_healthy() {
        if !web_desktop_ready() {
            eprintln!(
        "{} 上的 Molis Work Web 不含桌面终端。请在仓库运行 pnpm install:local 后执行 molis-work service restart --confirm，再重新打开 App。",
        crate::host_port::host()
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
            // only replaced above by a newer version or a later build of the same one, so an
            // older App can never overwrite a newer local build while the service restarts.
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
    // 4173 answers, but not as this Home's Host: another program's port. This Host listens on a spare
    // one and says so in its address file (resident-runtime-design §6).
    if let Some(port) = start_port(crate::host_port::occupied)? {
        crate::host_port::set_port(port);
        command.args(["--port", &port.to_string()]);
    }
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
    // RES-07: a Host the desktop starts takes 4173 while it is free, and a spare port while another
    // program holds it.
    #[test]
    fn res07_a_started_host_moves_off_4173_only_while_another_program_holds_it() {
        assert_eq!(super::start_port(|_| false), Ok(None));
        let spare = super::start_port(|port| port == crate::host_port::DEFAULT_PORT)
            .unwrap()
            .expect("a spare port");
        assert!((4174..=4199).contains(&spare));
    }

    use super::{
        embedded_is_upgrade, embedded_runtime_upgrade_available, install_or_reuse_healthy,
        is_utc_instant, read_installed_program, read_rollback_hold,
        sync_managed_web_service_after_upgrade, Program, Version,
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

    fn program(version: &str, built: Option<&str>) -> Program {
        Program {
            version: Version::parse(version).unwrap(),
            built: built.map(str::to_string),
        }
    }

    fn scratch(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("molis-{name}-{}-{nonce}", process::id()))
    }

    const A: &str = "2026-11-19T07:42:18.353Z";
    const B: &str = "2026-11-19T07:49:40.943Z";

    #[test]
    fn only_missing_or_newer_embedded_runtimes_install() {
        let old = program("0.1.4", None);
        let current = program("0.1.5", None);
        let newer = program("0.1.6", None);

        assert!(embedded_is_upgrade(&current, None, None));
        assert!(embedded_is_upgrade(&newer, Some(&current), None));
        assert!(!embedded_is_upgrade(&current, Some(&current), None));
        assert!(!embedded_is_upgrade(&old, Some(&current), None));
    }

    /// Batch 94-1: DSV-01, DSV-02, DSV-04, DSV-05.
    #[test]
    fn dsv_a_later_build_of_the_same_version_installs_once_and_nothing_else_does() {
        let a = program("0.1.0", Some(A));
        let b = program("0.1.0", Some(B));
        assert!(embedded_is_upgrade(&b, Some(&a), None), "DSV-01: B after A");
        assert!(!embedded_is_upgrade(&b, Some(&b), None), "DSV-02: B again");
        assert!(
            !embedded_is_upgrade(&a, Some(&b), None),
            "DSV-05: an App built earlier leaves a newer build alone"
        );
        assert!(
            !embedded_is_upgrade(&b, Some(&program("0.1.1", Some(A))), None),
            "DSV-04: a newer version stays, whenever it was built"
        );
        assert!(
            embedded_is_upgrade(&program("0.1.1", Some(A)), Some(&b), None),
            "a newer version installs, whenever it was built"
        );
        let unknown = program("0.1.0", None);
        assert!(
            !embedded_is_upgrade(&unknown, Some(&a), None),
            "no build time, no upgrade"
        );
        assert!(
            !embedded_is_upgrade(&b, Some(&unknown), None),
            "no build time, no upgrade"
        );
    }

    #[test]
    fn dsv_only_a_utc_iso_instant_counts_as_a_build_time() {
        assert!(is_utc_instant(A));
        for text in [
            "",
            "2026-11-19T07:42:18Z",
            "2026-11-19T07:42:18.353+00:00",
            "2026-11-19 07:42:18.353Z",
            "9999-99-99T99:99:99.999z",
            "x026-11-19T07:42:18.353Z",
        ] {
            assert!(!is_utc_instant(text), "{text}");
        }
    }

    fn write_build(program: &std::path::Path, created_at: &str) {
        fs::create_dir_all(program.join("dist")).unwrap();
        fs::write(
            program.join("dist").join(".molis-work-build.json"),
            format!(r#"{{"schema_version":1,"source_digest":"x","created_at":"{created_at}"}}"#),
        )
        .unwrap();
    }

    fn write_installation(home: &std::path::Path, release_path: &str) {
        fs::write(
            home.join("config").join("installation.json"),
            format!(r#"{{"schema_version":1,"installer":"molis-work-home-install-v1","version":"0.1.0","release_path":"{release_path}","content_digest":"x","updated_at":"t"}}"#),
        )
        .unwrap();
    }

    /// The App's payload and the Home's program are read where the installer and the build put them.
    #[test]
    fn dsv_the_desktop_reads_both_build_times_from_the_files_themselves() {
        let root = scratch("same-version");
        let payload = root.join("resources").join("molis-work-runtime");
        fs::create_dir_all(payload.join("runtime")).unwrap();
        fs::create_dir_all(payload.join("dist").join("cli")).unwrap();
        fs::write(payload.join("runtime").join("node"), "").unwrap();
        fs::write(payload.join("dist").join("cli").join("main.js"), "").unwrap();
        fs::write(payload.join("package.json"), r#"{"version":"0.1.0"}"#).unwrap();
        write_build(&payload, B);
        let home = root.join("home");
        let release = home.join("releases").join("molis-work-0.1.0");
        fs::create_dir_all(home.join("config")).unwrap();
        write_build(&release, A);
        write_installation(&home, "releases/molis-work-0.1.0");

        assert_eq!(
            read_installed_program(&home),
            Some(program("0.1.0", Some(A)))
        );
        assert!(embedded_runtime_upgrade_available(&root, &home), "DSV-01");
        write_build(&release, B);
        assert!(!embedded_runtime_upgrade_available(&root, &home), "DSV-02");

        // DSV-03: after going back, the build it left is not put back.
        write_build(&release, A);
        fs::write(
            home.join("config").join("rollback-hold.json"),
            r#"{"schema_version":1,"held_version":"0.1.0","rolled_back_from":{"version":"0.1.0","content_digest":"x"},"at":"t"}"#,
        )
        .unwrap();
        assert!(!embedded_runtime_upgrade_available(&root, &home), "DSV-03");
        fs::remove_file(home.join("config").join("rollback-hold.json")).unwrap();

        // DSV-03 holds a later build of the same version too, until the person lifts the hold (settings › Update
        // 「Install … again」), which installs it on the next start.
        write_build(&payload, "2026-11-20T00:00:00.000Z");
        fs::write(
            home.join("config").join("rollback-hold.json"),
            r#"{"schema_version":1,"held_version":"0.1.0","rolled_back_from":{"version":"0.1.0","content_digest":"x"},"at":"t"}"#,
        )
        .unwrap();
        assert!(!embedded_runtime_upgrade_available(&root, &home), "DSV-03");
        fs::remove_file(home.join("config").join("rollback-hold.json")).unwrap();
        assert!(
            embedded_runtime_upgrade_available(&root, &home),
            "hold lifted"
        );
        write_build(&payload, B);

        // Only the installer's own path for the version gives a build time; a missing one is still installed.

        for outside in [
            "../outside",
            "/tmp/outside",
            "",
            "releases/./molis-work-0.1.0",
            "releases/other",
        ] {
            write_build(&root.join("outside"), A);
            write_installation(&home, outside);
            assert_eq!(
                read_installed_program(&home),
                Some(program("0.1.0", None)),
                "{outside}"
            );
            assert!(
                !embedded_runtime_upgrade_available(&root, &home),
                "{outside}"
            );
        }
        fs::write(
            home.join("config").join("installation.json"),
            r#"{"schema_version":1,"version":"0.1.0"}"#,
        )
        .unwrap();
        assert_eq!(read_installed_program(&home), Some(program("0.1.0", None)));
        assert!(!embedded_runtime_upgrade_available(&root, &home));
        write_installation(&home, "releases/molis-work-0.1.0");
        fs::write(
            release.join("dist").join(".molis-work-build.json"),
            format!(r#"{{"schema_version":2,"created_at":"{A}"}}"#),
        )
        .unwrap();
        assert_eq!(read_installed_program(&home), Some(program("0.1.0", None)));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn upgr05_a_home_that_went_back_is_not_updated_again_to_the_version_it_left() {
        let old = program("0.1.4", None);
        let left = program("0.1.5", Some(B));
        let newer = program("0.1.6", None);
        let held = Version::parse("0.1.5").unwrap();

        assert!(!embedded_is_upgrade(&left, Some(&old), Some(&held)));
        assert!(
            !embedded_is_upgrade(&left, Some(&program("0.1.5", Some(A))), Some(&held)),
            "DSV-03: nor to a later build of it"
        );
        assert!(
            embedded_is_upgrade(&newer, Some(&old), Some(&held)),
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
        assert_eq!(read_rollback_hold(&home), Some(held));
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
