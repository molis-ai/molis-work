import { installGraphConnectorTool } from "./connector-powershell.js";
import { installNativeConnectorTool } from "./connector-native-install.js";
import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, statfsSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { managedToolDirectory } from "./connector-tool-download.js";
import { ensureManagedNode, ensureManagedUv, matchingToolRuntime } from "./connector-tool-runtime.js";
import { runToolInstallProcess, toolInstallErrors, type ToolInstallControl } from "./connector-tool-process.js";
import { validateManagedToolSource, type ManagedToolSource } from "./connector-tool-source.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorProtocols } from "./connector-protocol-store.js";
import type { LocalMcpConfiguration } from "./connector-local-mcp.js";

interface ManagedToolInstallation { id: string; source: ManagedToolSource; executable: string; runtime_path: string[]; directory: string }

function packageEnvironment(home: string, directory: string): Record<string, string> {
  const ownHome = join(directory, ".home"), temporary = join(directory, ".tmp");
  mkdirSync(ownHome, { mode: 0o700 }); mkdirSync(temporary, { mode: 0o700 });
  return { PATH: "/usr/bin:/bin", HOME: ownHome, TMPDIR: temporary, LANG: "C.UTF-8", NO_COLOR: "1", CI: "true",
    UV_CACHE_DIR: managedToolDirectory(home, "cache", "uv"), UV_PYTHON_INSTALL_DIR: managedToolDirectory(home, "runtimes", "python"), UV_PYTHON_BIN_DIR: managedToolDirectory(home, "runtimes", "python-bin"),
    UV_NO_CONFIG: "1", UV_NO_ENV_FILE: "1", UV_NO_PROGRESS: "1", UV_KEYRING_PROVIDER: "disabled", UV_LINK_MODE: "copy" };
}

async function installNpm(home: string, source: Extract<ManagedToolSource, { kind: "npm" }>, directory: string, env: Record<string, string>, control: ToolInstallControl) {
  const runtime = await ensureManagedNode(home, source.node_version, control);
  const userConfig = join(directory, "user.npmrc"), globalConfig = join(directory, "global.npmrc");
  for (const config of [userConfig, globalConfig]) writeFileSync(config, "", { mode: 0o600 });
  writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "molis-managed-tool", version: "1.0.0", private: true }), { mode: 0o600 });
  const runtimePath = [dirname(runtime.node)];
  await runToolInstallProcess(runtime.node, [runtime.npm, "install", "--save-exact", "--ignore-scripts", "--engine-strict", "--omit=dev", "--no-audit", "--no-fund",
    "--userconfig", userConfig, "--globalconfig", globalConfig, "--cache", managedToolDirectory(home, "cache", "npm"), "--registry", source.registry!, `${source.package}@${source.version}`],
  { ...control, cwd: directory, env: { ...env, PATH: [...runtimePath, "/usr/bin", "/bin"].join(delimiter) }, stage: "安装 npm 包" });
  const manifest: unknown = JSON.parse(readFileSync(join(directory, "node_modules", source.package, "package.json"), "utf8"));
  if (!manifest || typeof manifest !== "object" || !("version" in manifest) || manifest.version !== source.version || !existsSync(join(directory, "package-lock.json"))) throw toolInstallErrors.failed("npm 安装结果与所选固定版本不符");
  return { executable: source.entrypoint ? join(directory, "node_modules", source.package, source.entrypoint) : join(directory, "node_modules", ".bin", source.bin), runtime_path: runtimePath };
}

async function installPython(home: string, source: Extract<ManagedToolSource, { kind: "python" }>, directory: string, env: Record<string, string>, control: ToolInstallControl) {
  const uv = await ensureManagedUv(home, control), venv = join(directory, ".venv");
  const options = { ...control, cwd: directory, env, stage: "准备隔离 Python" };
  const existing = await matchingToolRuntime(home, "python3", `Python ${source.python_version}`, control);
  await runToolInstallProcess(uv, ["venv", "--no-config", "--no-project", "--python", existing ?? source.python_version, venv], options);
  const python = join(venv, "bin", "python");
  await runToolInstallProcess(uv, ["pip", "install", "--no-config", "--no-build", "--keyring-provider", "disabled", "--python", python, "--index-url", source.registry!, `${source.package}==${source.version}`],
    { ...options, stage: "安装 Python 包（需要该平台的 wheel）" });
  const pinned = await runToolInstallProcess(uv, ["pip", "freeze", "--no-config", "--python", python], { ...options, stage: "记录 Python 依赖版本" });
  await control.beforeEffect(); control.signal?.throwIfAborted();
  writeFileSync(join(directory, "requirements.lock"), pinned, { mode: 0o600 });
  return { executable: join(venv, "bin", source.bin), runtime_path: [join(venv, "bin")] };
}

/** Installs a fixed candidate. The caller connects/validates it before selecting it for any existing connection. */
export async function installManagedConnectorTool(home: string, input: ManagedToolSource, control: ToolInstallControl & { onPrepared?(id: string): void }): Promise<ManagedToolInstallation> {
  const source = validateManagedToolSource(input);
  await control.beforeEffect(); control.signal?.throwIfAborted();
  const disk = statfsSync(home);
  if (disk.bavail * disk.bsize < 512 * 1024 * 1024) throw toolInstallErrors.failed("安装需要至少 512 MiB 可用空间");
  const id = randomUUID(), directory = managedToolDirectory(home, "installs", id);
  try {
    writeFileSync(join(directory, "installation.json"), JSON.stringify({ id, source, created_at: new Date().toISOString() }), { mode: 0o600, flag: "wx" });
    control.onPrepared?.(id);
    const env = packageEnvironment(home, directory);
    const launch = source.kind === "powershell" ? await installGraphConnectorTool(home, source, directory, env, control) : source.kind === "native" ? await installNativeConnectorTool(source, directory, control) : source.kind === "npm" ? await installNpm(home, source, directory, env, control) : await installPython(home, source, directory, env, control);
    let executable: string;
    try { executable = realpathSync(launch.executable); }
    catch { throw toolInstallErrors.failed("安装的包没有提供所选命令，请核对包的启动说明"); }
    if (source.kind !== "powershell" && !executable.startsWith(`${realpathSync(directory)}/`) || !lstatSync(executable).isFile()) throw toolInstallErrors.failed("所选命令不属于这次安装的包，请核对包的启动说明");
    await control.beforeEffect(); control.signal?.throwIfAborted();
    if (source.kind === "npm" && source.entrypoint) chmodSync(executable, 0o755);
    const result = { id, source, ...launch, executable, directory };
    writeFileSync(join(directory, "installation.json"), JSON.stringify({ ...result, ready: true, created_at: new Date().toISOString() }), { mode: 0o600 });
    return result;
  } catch (error) { rmSync(directory, { recursive: true, force: true }); throw error; }
}

/** Only our unreferenced installation directory is removable. Working data and shared runtimes live elsewhere. */
export function removeManagedConnectorTool(home: string, id: string): "in-use" | "absent" | "removed" {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/u.test(id)) throw toolInstallErrors.invalid("受管理安装标识无效");
  const referenced = withConnectorConnections(home, store => store.list()).some(row =>
    withConnectorProtocols(home, store => store.get<LocalMcpConfiguration>(row.connection_id))?.installation_id === id);
  if (referenced) return "in-use";
  const directory = join(realpathSync(home), "runtime", "connectors", "installs", id);
  if (!existsSync(directory)) return "absent";
  if (lstatSync(directory).isSymbolicLink() || realpathSync(directory) !== directory) throw toolInstallErrors.invalid("受管理安装目录已改变，未移除任何文件");
  const record = join(directory, "installation.json");
  if (!existsSync(record)) throw toolInstallErrors.invalid("安装所有权记录缺失，未移除任何文件");
  let owner: unknown;
  try { owner = JSON.parse(readFileSync(record, "utf8")); }
  catch { throw toolInstallErrors.invalid("安装所有权记录无法读取，未移除任何文件"); }
  if (!owner || typeof owner !== "object" || !("id" in owner) || owner.id !== id) throw toolInstallErrors.invalid("安装所有权记录不符，未移除任何文件");
  rmSync(directory, { recursive: true, force: true });
  return "removed";
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
/** Only the ready record installManagedConnectorTool writes last is a completed installation; any other shape is refused before it is used. */
const readyRecord = (value: unknown): value is ManagedToolInstallation & { ready: true } => object(value) && value.ready === true && typeof value.id === "string"
  && typeof value.directory === "string" && typeof value.executable === "string" && Array.isArray(value.runtime_path) && object(value.source) && typeof value.source.kind === "string";
/** A completed candidate can resume protocol verification after failure, without another package installation. */
export function readManagedConnectorTool(home: string, id: string, source?: ManagedToolSource): ManagedToolInstallation {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/u.test(id)) throw toolInstallErrors.invalid("受管理安装标识无效");
  const directory = join(realpathSync(home), "runtime", "connectors", "installs", id);
  if (!existsSync(directory)) throw toolInstallErrors.invalid("受管理安装不存在，请重新准备接入");
  if (realpathSync(directory) !== directory) throw toolInstallErrors.invalid("受管理安装目录已改变");
  let value: unknown;
  try { value = JSON.parse(readFileSync(join(directory, "installation.json"), "utf8")); }
  catch { throw toolInstallErrors.invalid("安装所有权记录无法读取，请重新准备接入"); }
  if (!readyRecord(value) || value.id !== id || value.directory !== directory || source && JSON.stringify(value.source) !== JSON.stringify(source)
    || value.source.kind !== "powershell" && !value.executable.startsWith(`${directory}/`) || !existsSync(value.executable) || realpathSync(value.executable) !== value.executable) throw toolInstallErrors.invalid("已有安装与本次方案不符，请重新准备接入");
  return { id, directory, source: value.source, executable: value.executable, runtime_path: value.runtime_path };
}
