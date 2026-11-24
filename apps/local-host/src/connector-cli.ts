import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { builtinCliDrivers, type CliDriver } from "./builtin-drivers.js";
import { managedCliLaunch, type ManagedCliLaunch } from "./connector-cli-launch.js";
import { activateConnectorConnection, type ConnectorActivation } from "./connector-activation.js";
import type { submitConnectorActivation } from "./connector-authorization-commit.js";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { cliExecutable } from "./connector-tool-executable.js";
import { promisify } from "node:util";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorProtocols, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";

const execute = promisify(execFile);
/**
 * The official CLIs a connection may sign in through: the drivers the built-in integrations register (D3 A, M11). Each driver gives
 * its fixed commands, where its client comes from and how its account is read; this file runs only those commands and names no service.
 */
export const CONNECTOR_CLIS: Readonly<Record<string, CliDriver>> = builtinCliDrivers();
interface CliConfiguration extends ConnectorProtocolConfiguration { protocol: "cli"; fingerprint: string; binary: string; installation_id?: string }
export class ConnectorCliError extends Error {}
function definition(service: string): CliDriver {
  const value = Object.hasOwn(CONNECTOR_CLIS, service) ? CONNECTOR_CLIS[service] : undefined;
  if (!value) throw new ConnectorCliError("此服务没有已配置的官方 CLI");
  return value;
}
export function cliAvailability(service: string) {
  const spec = definition(service);
  return { installed: Boolean(cliExecutable(spec.binary)), binary: spec.binary, install_url: spec.install, setup_available: Boolean(spec.setup), environment_fields: spec.login_environment?.map(field => ({ ...field, label: t.text(field.label) })), note: spec.note === undefined ? undefined : t.text(spec.note) };
}
function clean(raw: string): string {
  return raw.replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, "").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/gu, "")
    .replace(/((?:access_token|refresh_token|client_secret|api_key)\s*[=:]\s*)[^\s&,]+/giu, "$1[redacted]")
    .replace(/\b(?:gh[pousr]_|github_pat_|xox[baprs]-|sk_(?:live|test)_|rk_(?:live|test)_)[A-Za-z0-9_-]+/gu, "[redacted]").slice(-32_768);
}
function safeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !/(?:token|secret|password|credential|authorization|api.?key)/iu.test(key)).map(([key, val]) => [key, safeValue(val)]));
  return typeof value === "string" ? clean(value) : value;
}
function parse(raw: string): unknown { try { return safeValue(JSON.parse(raw)); } catch { return clean(raw); } }
function cliEnvironment(service: string, launch?: ManagedCliLaunch): NodeJS.ProcessEnv {
  return { ...(launch?.environment ?? process.env), NO_COLOR: "1", ...definition(service).environment };
}
async function run(service: string, args: readonly string[], signal?: AbortSignal, launch?: ManagedCliLaunch): Promise<unknown> {
  const spec = definition(service), binary = launch?.executable ?? cliExecutable(spec.binary);
  if (!binary) throw new ConnectorCliError(`尚未安装 ${spec.binary}；请按官方安装入口完成安装后重试`);
  try {
    const result = await execute(binary, [...args], { timeout: 30_000, signal, maxBuffer: 512_000, cwd: launch?.cwd, env: cliEnvironment(service, launch) });
    return parse(result.stdout);
  } catch { signal?.throwIfAborted(); throw new ConnectorCliError(`${spec.binary} 读取失败，请完成登录并检查当前账号权限`); }
}
/**
 * The service's HTTP API read through its official client (the driver's `api`): only its declared read-only paths, and the
 * user's token never leaves the client. `launch` is a managed installation's; otherwise the client on `PATH`.
 */
export function cliApiFetch(service: string, launch?: ManagedCliLaunch): typeof fetch {
  const spec = definition(service), api = spec.api;
  if (!api) throw new ConnectorCliError("此 CLI 连接请通过连接设置中的只读操作使用");
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== api.origin || !api.paths.some(path => path.test(url.pathname)) || (init?.method && init.method !== "GET")) throw new ConnectorCliError(`${spec.binary} 只允许当前连接的只读接口`);
    let output: unknown;
    try {
      const binary = launch?.executable ?? cliExecutable(spec.binary);
      if (binary) output = JSON.parse((await execute(binary, api.args(url), { timeout: 30_000, signal: init?.signal ?? undefined, maxBuffer: 3 * 1024 * 1024, cwd: launch?.cwd, env: cliEnvironment(service, launch) })).stdout);
    } catch { init?.signal?.throwIfAborted(); }
    const { status, body } = api.response(output);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
}

/** A CLI connection's API reads: the client's account is checked to still be this connection's before and after each one. */
export function cliConnectionApi(home: string, id: string, service: string): { token: string; fetchImpl: typeof fetch } {
  const config = withConnectorProtocols(home, store => store.get<CliConfiguration>(id), true);
  const read = cliApiFetch(service, config?.installation_id ? managedCliLaunch(home, config.installation_id) : undefined);
  return { token: definition(service).binary, fetchImpl: async (input, init) => {
    await inspectCliConnection(home, id);
    const result = await read(input, init);
    await inspectCliConnection(home, id);
    return result;
  } };
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
const refuse = (message: string): never => { throw new ConnectorCliError(message); };
function identity(service: string, value: unknown): { label: string; fingerprint: string } {
  const obj = record(value), data = record(obj.data ?? obj), driver = definition(service);
  let label: unknown, stable: unknown;
  // The driver reads its own client's account; otherwise the common shapes: one line naming the user, or the usual fields.
  if (driver.account) ({ label, stable } = driver.account(value, refuse));
  else if (typeof value === "string") {
    const lines = clean(value).split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
    const userLine = lines.find(line => /^(?:username|user|email|logged in as)\s*:/iu.test(line));
    const candidate = userLine ? userLine.replace(/^(?:username|user|email|logged in as)\s*:\s*/iu, "") : lines.length === 1 ? lines[0] : "";
    label = candidate; stable = candidate;
  } else {
    label = data.login || data.username || data.email || data.name || data.id;
    stable = data.id || data.user_id || data.login || data.username || data.email;
  }
  if (!stable || !label || (typeof stable === "string" && !stable.trim())) throw new ConnectorCliError("官方 CLI 未返回可确认的账号身份；请升级 CLI、登录后重试");
  return { label: String(label).slice(0, 120), fingerprint: createHash("sha256").update(JSON.stringify([service, stable])).digest("hex") };
}
async function readIdentity(service: string, signal?: AbortSignal, launch?: ManagedCliLaunch) {
  const driver = definition(service), result = await run(service, driver.identity, signal, launch);
  await driver.complete?.(record(result), args => run(service, args, signal, launch), refuse);
  return result;
}
export async function connectCli(home: string, input: { serviceId: string; displayName: string; installationId?: string }, signal?: AbortSignal, beforeCommit?: () => void | Promise<void>,
  commit?: (completion: ConnectorActivation) => ReturnType<typeof submitConnectorActivation>) {
  const spec = definition(input.serviceId);
  const expectedRevisions = withConnectorConnections(home, store => store.cliRevisions(input.serviceId), true) ?? new Map();
  const launch = input.installationId ? managedCliLaunch(home, input.installationId) : undefined;
  const result = await readIdentity(input.serviceId, signal, launch);
  await beforeCommit?.();
  // Status-only CLIs must also complete a genuine read before registration.
  if (spec.verify_read && spec.read) await run(input.serviceId, spec.read, signal, launch);
  signal?.throwIfAborted();
  await beforeCommit?.();
  const account = identity(input.serviceId, result);
  const completion: ConnectorActivation = { kind: "cli", input: { serviceId: input.serviceId, displayName: input.displayName,
    externalId: `${spec.binary}:${account.fingerprint}`, accountLabel: account.label }, revisions: [...expectedRevisions], binary: spec.binary, fingerprint: account.fingerprint, ...(input.installationId ? { installation_id: input.installationId } : {}) };
  return { ...(commit ? commit(completion) : { connection: activateConnectorConnection(home, completion) }), result };
}
export async function inspectCliConnection(home: string, id: string, read = false, signal?: AbortSignal, beforeRead?: () => void | Promise<void>) {
  return withConnectorRequest(home, id, signal, async activeSignal => {
    const connection = withConnectorConnections(home, store => store.require(id), "required");
    if (!connection.enabled || connection.disconnected_at || connection.auth_method !== "cli") throw new ConnectorCliError("CLI 连接已断开");
    const config = withConnectorProtocols(home, store => store.get<CliConfiguration>(id), true);
    if (!config || config.protocol !== "cli") throw new ConnectorCliError("请重新连接此 CLI");
    const assertCurrent = () => {
      activeSignal.throwIfAborted();
      const current = withConnectorConnections(home, store => store.require(id), "required");
      if (!current.enabled || current.disconnected_at || current.updated_at !== connection.updated_at) throw new ConnectorCliError("检查期间 CLI 连接已变化，请重新检查");
    };
    const spec = definition(connection.service_id), launch = config.installation_id ? managedCliLaunch(home, config.installation_id) : undefined;
    const result = await readIdentity(connection.service_id, activeSignal, launch);
    assertCurrent();
    if (identity(connection.service_id, result).fingerprint !== config.fingerprint) throw new ConnectorCliError("CLI 当前账号已改变，请在设置中重新连接，避免读取另一账号");
    if (read && spec.read) { await beforeRead?.(); assertCurrent(); }
    const output = read && spec.read ? await run(connection.service_id, spec.read, activeSignal, launch) : result;
    assertCurrent();
    if (read && spec.read && identity(connection.service_id, await readIdentity(connection.service_id, activeSignal, launch)).fingerprint !== config.fingerprint) throw new ConnectorCliError("读取期间 CLI 账号已改变，请重新连接");
    assertCurrent();
    return { account: connection.account_label, verified_account: { login: identity(connection.service_id, result).label, account_id: config.fingerprint },
      ...(read && spec.read && Array.isArray(output) ? { record_count: output.length } : {}), result: output };
  });
}

type LoginPtySpawn = (command: string, args: string[], options: {
  name: string;
  cols: number;
  rows: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
}) => {
  kill(signal?: string): void;
  write(data: string): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number }) => void): void;
};

async function loadCliLoginPty(): Promise<LoginPtySpawn> {
  // Use a runtime specifier so TypeScript can build without the optional package.
  const moduleName = "node-pty";
  try {
    const nodePty: { spawn: LoginPtySpawn } = await import(moduleName);
    return nodePty.spawn;
  } catch (cause) {
    throw new ConnectorCliError(
      "当前环境缺少终端原生组件，暂无法启动交互式 CLI 登录。请补齐运行环境或使用预构建安装包。",
      { cause },
    );
  }
}

type LoginJob = { home: string; service: string; configure: boolean; installationId?: string; status: "running" | "succeeded" | "failed"; output: string; submitted: string[]; input: (value: string) => void; kill: () => void; timer: ReturnType<typeof setTimeout> };
const jobs = new Map<string, LoginJob>();
/** Only fixed, official login commands run in the terminal; no submitted shell or arguments. */
export async function startCliLogin(home: string, service: string, installationId?: string, request?: { id?: string; configure?: boolean; environment?: Record<string, string>; beforeEffect(): void | Promise<void>; complete?(signal: AbortSignal): Promise<unknown> }) {
  const launch = installationId ? managedCliLaunch(home, installationId) : undefined;
  const spec = definition(service), binary = launch?.executable ?? cliExecutable(spec.binary);
  if (!binary) throw new ConnectorCliError(`请先安装 ${spec.binary}`);
  const args = request?.configure ? spec.setup : spec.login;
  if (!args) throw new ConnectorCliError("此客户端没有交互配置操作");
  const environment = request?.environment ?? {}, fields = spec.login_environment ?? [];
  if (Object.keys(environment).length && (request?.configure || Object.keys(environment).some(name => !fields.some(field => field.name === name))
    || fields.some(field => !environment[field.name] || environment[field.name]!.length > 8192 || environment[field.name]!.includes("\0")))) throw new ConnectorCliError("请完整填写该客户端要求的应用信息，或全部留空使用已有配置");
  const spawn = await loadCliLoginPty();
  await request?.beforeEffect();
  if ([...jobs.values()].some(job => job.home === resolve(home) && job.service === service && job.installationId === installationId && job.status === "running")) throw new ConnectorCliError("该 CLI 登录已经在进行，请完成当前登录");
  const id = randomUUID();
  const running = withConnectorRequest(home, request?.id ?? id, undefined, signal => new Promise<void>(done => {
    const child = spawn(binary, [...args], { name: "xterm-color", cols: 90, rows: 24, cwd: launch?.cwd ?? home, env: { ...cliEnvironment(service, launch), ...environment } });
    let cancelled = false, killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (signal?: string) => { try { child.kill(signal); } catch { /* The PTY may have exited before its exit notification arrives. */ } };
    const stop = () => {
      cancelled = true; job.status = "failed"; kill();
      killTimer ??= setTimeout(() => kill("SIGKILL"), 1000); killTimer.unref();
    };
    const job: LoginJob = { home: resolve(home), service, configure: request?.configure === true, installationId, status: "running", output: "", submitted: Object.values(environment), input: value => child.write(value), kill: stop, timer: setTimeout(stop, 10 * 60_000) };
    jobs.set(id, job); signal.addEventListener("abort", stop, { once: true });
    child.onData(data => {
      let output = job.output + data;
      for (const value of job.submitted) output = output.split(value).join("[redacted]");
      job.output = clean(output);
    });
    child.onExit(({ exitCode }) => {
      clearTimeout(job.timer); clearTimeout(killTimer); signal.removeEventListener("abort", stop);
      void (async () => {
        try {
          if (exitCode !== 0 || cancelled || signal.aborted) { job.status = "failed"; return; }
          await request?.complete?.(signal); signal.throwIfAborted(); job.status = "succeeded";
        } catch { job.status = "failed"; job.output = clean(job.output + "\n客户端操作已结束，但接入尚未完成。请检查当前请求和账号权限后重试。"); }
        finally { setTimeout(() => jobs.delete(id), 10 * 60_000).unref(); done(); }
      })();
    });
  }));
  if (!jobs.has(id)) await running;
  void running.catch(() => { const job = jobs.get(id); if (job) job.status = "failed"; });
  return { job_id: id };
}
export function cliLoginJob(home: string, id: string, input?: string, cancel = false) {
  const job = jobs.get(id);
  if (!job || job.home !== resolve(home)) throw new ConnectorCliError("登录已结束或应用已重启，请重新开始");
  if (cancel && job.status === "running") job.kill();
  if (input !== undefined && job.status === "running") {
    if (input.length > 4096) throw new ConnectorCliError("输入过长");
    if (input) job.submitted.push(input);
    job.input(`${input}\r`);
  }
  // Some official CLIs echo input, even for a secret prompt. Mask submitted text
  // and any trailing prefix split across PTY chunks before sending output to the UI.
  let output = job.output;
  for (const submitted of job.submitted) {
    output = output.split(submitted).join("[redacted]");
    for (let length = Math.min(output.length, submitted.length - 1); length > 0; length--) {
      if (output.endsWith(submitted.slice(0, length))) { output = output.slice(0, -length); break; }
    }
  }
  return { status: job.status, output, service_id: job.service, operation: job.configure ? "configure" : "login" };
}
