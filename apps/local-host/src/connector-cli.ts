import { graphCliDistribution, type PowerShellCliDistribution } from "./connector-powershell.js";
import { githubCliDistribution, gitlabCliDistribution, atlassianCliDistribution, type NativeCliDistribution } from "./connector-native-release.js";
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
interface CliDefinition { binary: string; login: readonly string[]; setup?: readonly string[]; login_environment?: readonly { name: string; label: string; secret: boolean }[]; identity: readonly string[]; read?: readonly string[]; install: string; version?: readonly string[]; distribution?: { kind: "npm" | "python"; package: string; entrypoint?: string } | NativeCliDistribution | PowerShellCliDistribution; note?: string }
const graph = (scope: string, resource: string): CliDefinition => ({ binary: "pwsh", distribution: graphCliDistribution, version: ["-NoProfile", "-NonInteractive", "-Command", "Import-Module Microsoft.Graph.Authentication -ErrorAction Stop; (Get-Module Microsoft.Graph.Authentication).Version.ToString()"], install: "https://learn.microsoft.com/powershell/microsoftgraph/installation",
  login: ["-NoProfile", "-Command", `Import-Module Microsoft.Graph.Authentication; Connect-MgGraph -Scopes 'User.Read','${scope}' -UseDeviceCode -ContextScope CurrentUser -NoWelcome`],
  identity: ["-NoProfile", "-Command", "Import-Module Microsoft.Graph.Authentication; Connect-MgGraph -ContextScope CurrentUser -NoWelcome; Invoke-MgGraphRequest -Method GET -Uri 'https://graph.microsoft.com/v1.0/me' | ConvertTo-Json -Depth 8"],
  read: ["-NoProfile", "-Command", `Import-Module Microsoft.Graph.Authentication; Connect-MgGraph -ContextScope CurrentUser -NoWelcome; Invoke-MgGraphRequest -Method GET -Uri 'https://graph.microsoft.com/v1.0/${resource}' | ConvertTo-Json -Depth 12`],
  note: "需先安装 PowerShell 和 Microsoft.Graph.Authentication。连接使用本机 CLI 当前登录环境。" });
export const CONNECTOR_CLIS: Readonly<Record<string, CliDefinition>> = {
  github: { distribution: githubCliDistribution("cli/cli", "gh", (v, p, a) => `gh_${v}_${p === "darwin" ? "macOS" : p}_${a === "x64" ? "amd64" : a}.${p === "darwin" ? "zip" : "tar.gz"}`, (v, p, a) => `gh_${v}_${p === "darwin" ? "macOS" : p}_${a === "x64" ? "amd64" : a}/bin/gh`), binary: "gh", login: ["auth", "login", "--web", "--hostname", "github.com", "--git-protocol", "https", "--skip-ssh-key", "--scopes", "notifications,read:user"], identity: ["api", "user"], read: ["api", "notifications"], install: "https://cli.github.com/" },
  gitlab: { distribution: gitlabCliDistribution, binary: "glab", login: ["auth", "login", "--hostname", "gitlab.com", "--web"], identity: ["api", "user"], read: ["api", "events?per_page=20"], install: "https://docs.gitlab.com/cli/" },
  notion: { distribution: { kind: "npm", package: "ntn", entrypoint: `dist/ntn-${process.platform}-${process.arch}/ntn` }, binary: "ntn", login: ["login"], identity: ["api", "v1/users/me", "-X", "GET"], read: ["api", "v1/users", "-X", "GET"], install: "https://developers.notion.com/cli/get-started/overview" },
  box: { login_environment: [{ name: "CLIENT_ID", label: "应用 Client ID", secret: false }, { name: "CLIENT_SECRET", label: "应用 Client Secret", secret: true }], distribution: { kind: "npm", package: "@box/cli" }, binary: "box", login: ["login", "--default-box-app"], identity: ["users:get", "me", "--json"], read: ["folders:items", "0", "--json"], install: "https://developer.box.com/guides/cli/" },
  outlook: graph("Mail.Read", "me/messages?$top=20"), onedrive: graph("Files.Read.All", "me/drive/root/children?$top=20"), sharepoint: graph("Sites.Read.All", "sites?search=*"), teams: graph("Chat.Read", "me/chats?$top=20"),
  feishu: { setup: ["config", "init", "--brand", "feishu"], distribution: githubCliDistribution("larksuite/cli", "lark-cli", (v, p, a) => `lark-cli-${v}-${p}-${a === "x64" ? "amd64" : a}.tar.gz`, () => "lark-cli"), binary: "lark-cli", login: ["auth", "login", "--scope", "contact:user.base:readonly calendar:calendar:readonly calendar:calendar.event:read docx:document:readonly wiki:wiki:readonly im:chat:readonly offline_access"], identity: ["auth", "status", "--json", "--verify"], read: ["calendar", "+agenda", "--as", "user"], install: "https://github.com/larksuite/cli", note: "请先用 lark-cli config init 配置飞书应用；应用所属地区必须匹配。" },
  lark: { setup: ["config", "init", "--brand", "lark"], distribution: githubCliDistribution("larksuite/cli", "lark-cli", (v, p, a) => `lark-cli-${v}-${p}-${a === "x64" ? "amd64" : a}.tar.gz`, () => "lark-cli"), binary: "lark-cli", login: ["auth", "login", "--scope", "contact:user.base:readonly calendar:calendar:readonly calendar:calendar.event:read docx:document:readonly wiki:wiki:readonly im:chat:readonly offline_access"], identity: ["auth", "status", "--json", "--verify"], read: ["calendar", "+agenda", "--as", "user"], install: "https://github.com/larksuite/cli", note: "请先用 lark-cli config init 配置国际版 Lark 应用；同一 CLI 环境只使用其当前地区。" },
  vercel: { distribution: { kind: "npm", package: "vercel" }, binary: "vercel", login: ["login"], identity: ["whoami"], read: ["project", "ls", "--format=json"], install: "https://vercel.com/docs/cli" },
  cloudflare: { distribution: { kind: "npm", package: "wrangler" }, binary: "wrangler", login: ["login", "--scopes", "account:read", "user:read", "zone:read"], identity: ["whoami", "--json"], install: "https://developers.cloudflare.com/workers/wrangler/install-and-update/" },
  huggingface: { version: ["version"], distribution: { kind: "python", package: "huggingface_hub" }, binary: "hf", login: ["auth", "login"], identity: ["auth", "whoami"], install: "https://huggingface.co/docs/huggingface_hub/guides/cli" },
  sentry: { distribution: { kind: "npm", package: "sentry" }, binary: "sentry", login: ["auth", "login", "--read-only", "--url", "https://sentry.io"], identity: ["auth", "whoami", "--json", "--fresh"], install: "https://cli.sentry.dev/", note: "此入口连接 Sentry 官方云服务 sentry.io。" },
  supabase: { distribution: { kind: "npm", package: "supabase" }, binary: "supabase", login: ["login"], identity: ["whoami", "--output-format", "json"], read: ["projects", "list", "--output", "json"], install: "https://supabase.com/docs/guides/local-development/cli/getting-started", note: "需要 Supabase CLI 2.118.0 或更新版本。" },
  salesforce: { distribution: { kind: "npm", package: "@salesforce/cli" }, binary: "sf", login: ["org", "login", "web", "--set-default"], identity: ["api", "request", "rest", "/services/oauth2/userinfo", "--method", "GET", "--json"], read: ["data", "query", "--query", "SELECT Id,Subject,LastModifiedDate FROM Task ORDER BY LastModifiedDate DESC LIMIT 20", "--json"], install: "https://developer.salesforce.com/tools/salesforcecli" },
  stripe: { distribution: githubCliDistribution("stripe/stripe-cli", "stripe", (v, p, a) => `stripe_${v}_${p === "darwin" ? "mac-os" : p}_${a === "x64" ? "x86_64" : a}.tar.gz`, () => "stripe"), binary: "stripe", login: ["login"], identity: ["get", "/v1/account"], read: ["get", "/v1/events", "-d", "limit=20"], install: "https://docs.stripe.com/stripe-cli", note: "CLI 使用默认测试环境；正式支付账号可用 API Key 或 OAuth。" },
  jira: { distribution: atlassianCliDistribution, binary: "acli", login: ["jira", "auth", "login", "--web"], identity: ["jira", "auth", "status"], read: ["jira", "workitem", "search", "--jql", "assignee=currentUser() ORDER BY updated DESC", "--limit", "20", "--json"], install: "https://developer.atlassian.com/cloud/acli/guides/introduction/" },
  hubspot: { binary: "hubspot", login: ["auth", "login"], identity: ["whoami"], read: ["objects", "list", "--type", "contacts", "--format", "json"], install: "https://developers.hubspot.com/docs/developer-tooling/local-development/agent-cli/guide", note: "官方未提供可固定版本的发行物，暂不支持受管理安装；请先按官方说明安装，再连接已有 CLI。" },
  x: { login_environment: [{ name: "CLIENT_ID", label: "应用 Client ID", secret: false }, { name: "CLIENT_SECRET", label: "应用 Client Secret", secret: true }], distribution: githubCliDistribution("xdevplatform/xurl", "xurl", (_, p, a) => `xurl_${p === "darwin" ? "Darwin" : "Linux"}_${a === "x64" ? "x86_64" : a}.tar.gz`, () => "xurl"), binary: "xurl", login: ["auth", "oauth2"], identity: ["--auth", "oauth2", "/2/users/me"], read: ["--auth", "oauth2", "/2/users/me"], install: "https://github.com/xdevplatform/xurl", note: "首次登录填写 X 开发应用的 Client ID 和 Client Secret，并登记回调 http://localhost:8080/callback；已配置的客户端可留空。xurl 保存并刷新本机授权。" },
};
interface CliConfiguration extends ConnectorProtocolConfiguration { protocol: "cli"; fingerprint: string; binary: string; installation_id?: string }
export class ConnectorCliError extends Error {}
function definition(service: string): CliDefinition {
  const value = Object.hasOwn(CONNECTOR_CLIS, service) ? CONNECTOR_CLIS[service] : undefined;
  if (!value) throw new ConnectorCliError("此服务没有已配置的官方 CLI");
  return value;
}
export function cliAvailability(service: string) {
  const spec = definition(service);
  return { installed: Boolean(cliExecutable(spec.binary)), binary: spec.binary, install_url: spec.install, setup_available: Boolean(spec.setup), environment_fields: spec.login_environment, note: spec.note };
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
  return { ...(launch?.environment ?? process.env), NO_COLOR: "1", ...(service === "sentry" ? { SENTRY_HOST: "https://sentry.io", SENTRY_URL: "https://sentry.io" } : {}) };
}
async function run(service: string, args: readonly string[], signal?: AbortSignal, launch?: ManagedCliLaunch): Promise<unknown> {
  const spec = definition(service), binary = launch?.executable ?? cliExecutable(spec.binary);
  if (!binary) throw new ConnectorCliError(`尚未安装 ${spec.binary}；请按官方安装入口完成安装后重试`);
  try {
    const result = await execute(binary, [...args], { timeout: 30_000, signal, maxBuffer: 512_000, cwd: launch?.cwd, env: cliEnvironment(service, launch) });
    return parse(result.stdout);
  } catch { signal?.throwIfAborted(); throw new ConnectorCliError(`${spec.binary} 读取失败，请完成登录并检查当前账号权限`); }
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function identity(service: string, value: unknown): { label: string; fingerprint: string } {
  const obj = record(value), data = record(obj.data ?? obj);
  let label: unknown, stable: unknown;
  if (["feishu", "lark"].includes(service)) {
    const user = record(record(obj.identities).user);
    if (obj.brand !== service || user.available !== true || user.verified !== true || !user.openId || !obj.appId) throw new ConnectorCliError("CLI 当前应用地区或用户身份不匹配；请配置对应地区应用并完成用户授权");
    label = user.userName || user.openId; stable = [obj.brand, obj.appId, user.openId];
  } else if (service === "jira" && typeof value === "string") {
    const site = /^\s*Site:\s*(\S+)\s*$/mu.exec(value)?.[1];
    const email = /^\s*Email:\s*(\S+)\s*$/mu.exec(value)?.[1];
    label = email;
    stable = site && email ? [new URL(site.startsWith("https:") ? site : `https://${site}`).origin, email.toLowerCase()] : undefined;
  } else if (service === "hubspot" && typeof value === "string") {
    const user = /^\s*User:\s*(.+)$/mu.exec(value)?.[1]?.trim();
    const portal = /^\s*Portal:\s*(\d+)\s*$/mu.exec(value)?.[1];
    label = user === "(HUBSPOT_ACCESS_TOKEN)" ? `HubSpot · ${portal}` : user;
    stable = portal && user ? [portal, user === "(HUBSPOT_ACCESS_TOKEN)" ? "service-key" : user.toLowerCase()] : undefined;
  } else if (service === "sentry") {
    const host = "https://sentry.io";
    if (obj.type === "org-auth-token") {
      label = obj.organization; stable = obj.organization_id ? [host, obj.organization_id] : undefined;
    } else { label = obj.email || obj.username || obj.name; stable = obj.id ? [host, obj.id] : undefined; }
  } else if (service === "salesforce") {
    const result = record(record(obj.result).body);
    label = result.preferred_username || result.email || result.user_id; stable = result.user_id && result.organization_id ? [result.organization_id, result.user_id] : undefined;
  } else if (service === "cloudflare") {
    if (obj.loggedIn !== true) throw new ConnectorCliError("请先登录 Wrangler");
    const accounts = Array.isArray(obj.accounts) ? obj.accounts.map(record) : [];
    label = obj.email || accounts[0]?.name;
    stable = typeof obj.email === "string" ? obj.email.toLowerCase() : (obj.authType === "Account API Token" && accounts.length === 1 ? accounts[0]?.id : undefined);
  } else if (service === "notion") {
    const bot = record(data.bot);
    label = bot.workspace_name || data.name || data.id;
    stable = data.id ? [bot.workspace_id || "", data.id] : undefined;
  } else if (typeof value === "string") {
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
  const result = await run(service, definition(service).identity, signal, launch);
  const obj = record(result);
  if (service === "sentry" && obj.type === "org-auth-token") {
    const organizations = await run(service, ["org", "list", "--json", "--fresh"], signal, launch);
    const found = Array.isArray(organizations) ? organizations.map(record).find(row => row.slug === obj.organization) : undefined;
    if (!found?.id) throw new ConnectorCliError("Sentry 未确认组织权限，请检查凭据");
    obj.organization_id = found.id;
  }
  return result;
}
export async function connectCli(home: string, input: { serviceId: string; displayName: string; installationId?: string }, signal?: AbortSignal, beforeCommit?: () => void | Promise<void>,
  commit?: (completion: ConnectorActivation) => ReturnType<typeof submitConnectorActivation>) {
  const spec = definition(input.serviceId);
  const expectedRevisions = withConnectorConnections(home, store => store.cliRevisions(input.serviceId));
  const launch = input.installationId ? managedCliLaunch(home, input.installationId) : undefined;
  const result = await readIdentity(input.serviceId, signal, launch);
  await beforeCommit?.();
  // Status-only CLIs must also complete a genuine read before registration.
  if (["feishu", "lark", "jira"].includes(input.serviceId)) await run(input.serviceId, spec.read!, signal, launch);
  signal?.throwIfAborted();
  await beforeCommit?.();
  const account = identity(input.serviceId, result);
  const completion: ConnectorActivation = { kind: "cli", input: { serviceId: input.serviceId, displayName: input.displayName,
    externalId: `${spec.binary}:${account.fingerprint}`, accountLabel: account.label }, revisions: [...expectedRevisions], binary: spec.binary, fingerprint: account.fingerprint, ...(input.installationId ? { installation_id: input.installationId } : {}) };
  return { ...(commit ? commit(completion) : { connection: activateConnectorConnection(home, completion) }), result };
}
export async function inspectCliConnection(home: string, id: string, read = false, signal?: AbortSignal, beforeRead?: () => void | Promise<void>) {
  return withConnectorRequest(home, id, signal, async activeSignal => {
    const connection = withConnectorConnections(home, store => store.require(id));
    if (!connection.enabled || connection.disconnected_at || connection.auth_method !== "cli") throw new ConnectorCliError("CLI 连接已断开");
    const config = withConnectorProtocols(home, store => store.get<CliConfiguration>(id));
    if (!config || config.protocol !== "cli") throw new ConnectorCliError("请重新连接此 CLI");
    const assertCurrent = () => {
      activeSignal.throwIfAborted();
      const current = withConnectorConnections(home, store => store.require(id));
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
  const { spawn } = await import("node-pty");
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
