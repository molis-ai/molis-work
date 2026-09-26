import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { accessSync, constants } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorProtocols, type ConnectorProtocolConfiguration } from "./connector-protocol-store.js";

const execute = promisify(execFile);
export interface CliDefinition { binary: string; login: readonly string[]; identity: readonly string[]; read?: readonly string[]; install: string; note?: string }
const graph = (scope: string, resource: string): CliDefinition => ({ binary: "pwsh", install: "https://learn.microsoft.com/powershell/microsoftgraph/installation",
  login: ["-NoProfile", "-Command", `Import-Module Microsoft.Graph.Authentication; Connect-MgGraph -Scopes 'User.Read','${scope}' -UseDeviceCode -ContextScope CurrentUser -NoWelcome`],
  identity: ["-NoProfile", "-Command", "Import-Module Microsoft.Graph.Authentication; Connect-MgGraph -ContextScope CurrentUser -NoWelcome; Invoke-MgGraphRequest -Method GET -Uri 'https://graph.microsoft.com/v1.0/me' | ConvertTo-Json -Depth 8"],
  read: ["-NoProfile", "-Command", `Import-Module Microsoft.Graph.Authentication; Connect-MgGraph -ContextScope CurrentUser -NoWelcome; Invoke-MgGraphRequest -Method GET -Uri 'https://graph.microsoft.com/v1.0/${resource}' | ConvertTo-Json -Depth 12`],
  note: "需先安装 PowerShell 和 Microsoft.Graph.Authentication。连接使用本机 CLI 当前登录环境。" });
export const CONNECTOR_CLIS: Readonly<Record<string, CliDefinition>> = {
  github: { binary: "gh", login: ["auth", "login", "--web", "--hostname", "github.com", "--git-protocol", "https", "--skip-ssh-key", "--scopes", "notifications,read:user"], identity: ["api", "user"], read: ["api", "notifications"], install: "https://cli.github.com/" },
  gitlab: { binary: "glab", login: ["auth", "login", "--hostname", "gitlab.com", "--web"], identity: ["api", "user"], read: ["api", "events?per_page=20"], install: "https://docs.gitlab.com/cli/" },
  notion: { binary: "ntn", login: ["login"], identity: ["api", "v1/users/me", "-X", "GET"], read: ["api", "v1/users", "-X", "GET"], install: "https://developers.notion.com/cli/get-started/overview" },
  box: { binary: "box", login: ["login", "--default-box-app"], identity: ["users:get", "me", "--json"], read: ["folders:items", "0", "--json"], install: "https://developer.box.com/guides/cli/" },
  outlook: graph("Mail.Read", "me/messages?$top=20"), onedrive: graph("Files.Read.All", "me/drive/root/children?$top=20"), sharepoint: graph("Sites.Read.All", "sites?search=*"), teams: graph("Chat.Read", "me/chats?$top=20"),
  feishu: { binary: "lark-cli", login: ["auth", "login", "--scope", "contact:user.base:readonly calendar:calendar:readonly calendar:calendar.event:read docx:document:readonly wiki:wiki:readonly im:chat:readonly offline_access"], identity: ["auth", "status", "--json", "--verify"], read: ["calendar", "+agenda", "--as", "user"], install: "https://github.com/larksuite/cli", note: "请先用 lark-cli config init 配置飞书应用；应用所属地区必须匹配。" },
  lark: { binary: "lark-cli", login: ["auth", "login", "--scope", "contact:user.base:readonly calendar:calendar:readonly calendar:calendar.event:read docx:document:readonly wiki:wiki:readonly im:chat:readonly offline_access"], identity: ["auth", "status", "--json", "--verify"], read: ["calendar", "+agenda", "--as", "user"], install: "https://github.com/larksuite/cli", note: "请先用 lark-cli config init 配置国际版 Lark 应用；同一 CLI 环境只使用其当前地区。" },
  vercel: { binary: "vercel", login: ["login"], identity: ["whoami"], read: ["project", "ls", "--format=json"], install: "https://vercel.com/docs/cli" },
  cloudflare: { binary: "wrangler", login: ["login", "--scopes", "account:read", "user:read", "zone:read"], identity: ["whoami", "--json"], install: "https://developers.cloudflare.com/workers/wrangler/install-and-update/" },
  huggingface: { binary: "hf", login: ["auth", "login"], identity: ["auth", "whoami"], install: "https://huggingface.co/docs/huggingface_hub/guides/cli" },
  sentry: { binary: "sentry", login: ["auth", "login", "--read-only", "--url", "https://sentry.io"], identity: ["auth", "whoami", "--json", "--fresh"], install: "https://cli.sentry.dev/", note: "此入口连接 Sentry 官方云服务 sentry.io。" },
  supabase: { binary: "supabase", login: ["login"], identity: ["whoami", "--output-format", "json"], read: ["projects", "list", "--output", "json"], install: "https://supabase.com/docs/guides/local-development/cli/getting-started", note: "需要 Supabase CLI 2.118.0 或更新版本。" },
  salesforce: { binary: "sf", login: ["org", "login", "web", "--set-default"], identity: ["api", "request", "rest", "/services/oauth2/userinfo", "--method", "GET", "--json"], read: ["data", "query", "--query", "SELECT Id,Subject,LastModifiedDate FROM Task ORDER BY LastModifiedDate DESC LIMIT 20", "--json"], install: "https://developer.salesforce.com/tools/salesforcecli" },
  stripe: { binary: "stripe", login: ["login"], identity: ["get", "/v1/account"], read: ["get", "/v1/events", "-d", "limit=20"], install: "https://docs.stripe.com/stripe-cli", note: "CLI 使用默认测试环境；正式支付账号可用 API Key 或 OAuth。" },
  jira: { binary: "acli", login: ["jira", "auth", "login", "--web"], identity: ["jira", "auth", "status"], read: ["jira", "workitem", "search", "--jql", "assignee=currentUser() ORDER BY updated DESC", "--limit", "20", "--json"], install: "https://developer.atlassian.com/cloud/acli/guides/introduction/" },
  hubspot: { binary: "hubspot", login: ["auth", "login"], identity: ["whoami"], read: ["objects", "list", "--type", "contacts", "--format", "json"], install: "https://developers.hubspot.com/docs/developer-tooling/local-development/agent-cli/guide" },
  x: { binary: "xurl", login: ["auth", "oauth2"], identity: ["--auth", "oauth2", "/2/users/me"], read: ["--auth", "oauth2", "/2/users/me"], install: "https://github.com/xdevplatform/xurl", note: "先在 xurl 配置自己的 X 开发应用；xurl 负责本机 OAuth 刷新。" },
};
interface CliConfiguration extends ConnectorProtocolConfiguration { protocol: "cli"; fingerprint: string; binary: string }
export class ConnectorCliError extends Error {}
function definition(service: string): CliDefinition {
  const value = CONNECTOR_CLIS[service];
  if (!value) throw new ConnectorCliError("此服务没有已配置的官方 CLI");
  return value;
}
export function cliExecutable(binary: string): string | null {
  for (const directory of (process.env.PATH || "").split(delimiter)) {
    if (!directory) continue;
    const path = join(directory, binary);
    try { accessSync(path, constants.X_OK); return path; } catch { /* Continue PATH lookup. */ }
  }
  return null;
}
export function cliAvailability(service: string) {
  const spec = definition(service);
  return { installed: Boolean(cliExecutable(spec.binary)), binary: spec.binary, install_url: spec.install, note: spec.note };
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
function cliEnvironment(service: string): NodeJS.ProcessEnv {
  return { ...process.env, NO_COLOR: "1", ...(service === "sentry" ? { SENTRY_HOST: "https://sentry.io", SENTRY_URL: "https://sentry.io" } : {}) };
}
async function run(service: string, args: readonly string[]): Promise<unknown> {
  const spec = definition(service), binary = cliExecutable(spec.binary);
  if (!binary) throw new ConnectorCliError(`尚未安装 ${spec.binary}；请按官方安装入口完成安装后重试`);
  try {
    const result = await execute(binary, [...args], { timeout: 30_000, maxBuffer: 512_000, env: cliEnvironment(service) });
    return parse(result.stdout);
  } catch { throw new ConnectorCliError(`${spec.binary} 读取失败，请完成登录并检查当前账号权限`); }
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
async function readIdentity(service: string) {
  const result = await run(service, definition(service).identity);
  const obj = record(result);
  if (service === "sentry" && obj.type === "org-auth-token") {
    const organizations = await run(service, ["org", "list", "--json", "--fresh"]);
    const found = Array.isArray(organizations) ? organizations.map(record).find(row => row.slug === obj.organization) : undefined;
    if (!found?.id) throw new ConnectorCliError("Sentry 未确认组织权限，请检查凭据");
    obj.organization_id = found.id;
  }
  return result;
}
export async function connectCli(home: string, input: { serviceId: string; displayName: string }) {
  const spec = definition(input.serviceId);
  const result = await readIdentity(input.serviceId);
  // Status-only CLIs must also complete a genuine read before registration.
  if (["feishu", "lark", "jira"].includes(input.serviceId)) await run(input.serviceId, spec.read!);
  const account = identity(input.serviceId, result);
  const connection = withConnectorConnections(home, store => store.saveCli({ serviceId: input.serviceId, displayName: input.displayName,
    externalId: `${spec.binary}:${account.fingerprint}`, accountLabel: account.label }));
  withConnectorProtocols(home, store => store.save({ connectionId: connection.connection_id, serviceId: input.serviceId, protocol: "cli", binary: spec.binary, fingerprint: account.fingerprint } as CliConfiguration));
  return { connection: withConnectorConnections(home, store => store.view(connection)), result };
}
export async function inspectCliConnection(home: string, id: string, read = false) {
  const connection = withConnectorConnections(home, store => store.require(id));
  if (connection.disconnected_at || connection.auth_method !== "cli") throw new ConnectorCliError("CLI 连接已断开");
  const config = withConnectorProtocols(home, store => store.get<CliConfiguration>(id));
  if (!config || config.protocol !== "cli") throw new ConnectorCliError("请重新连接此 CLI");
  const spec = definition(connection.service_id);
  const result = await readIdentity(connection.service_id);
  if (identity(connection.service_id, result).fingerprint !== config.fingerprint) throw new ConnectorCliError("CLI 当前账号已改变，请在设置中重新连接，避免读取另一账号");
  const output = read && spec.read ? await run(connection.service_id, spec.read) : result;
  if (read && spec.read && identity(connection.service_id, await readIdentity(connection.service_id)).fingerprint !== config.fingerprint) throw new ConnectorCliError("读取期间 CLI 账号已改变，请重新连接");
  if (withConnectorConnections(home, store => store.require(id)).disconnected_at) throw new ConnectorCliError("CLI 连接已断开");
  return { account: connection.account_label, result: output };
}
type LoginJob = { home: string; service: string; status: "running" | "succeeded" | "failed"; output: string; submitted: string[]; input: (value: string) => void; kill: () => void; timer: ReturnType<typeof setTimeout> };
const jobs = new Map<string, LoginJob>();
/** Only fixed, official login commands run in the terminal; no submitted shell or arguments. */
export async function startCliLogin(home: string, service: string) {
  const spec = definition(service), binary = cliExecutable(spec.binary);
  if (!binary) throw new ConnectorCliError(`请先安装 ${spec.binary}`);
  if ([...jobs.values()].some(job => job.home === resolve(home) && job.service === service && job.status === "running")) throw new ConnectorCliError("该 CLI 登录已经在进行，请完成当前登录");
  const { spawn } = await import("node-pty");
  const process = spawn(binary, [...spec.login], { name: "xterm-color", cols: 90, rows: 24, cwd: home, env: cliEnvironment(service) });
  const id = randomUUID();
  const job: LoginJob = { home: resolve(home), service, status: "running", output: "", submitted: [], input: value => process.write(value), kill: () => process.kill(), timer: setTimeout(() => process.kill(), 10 * 60_000) };
  jobs.set(id, job);
  process.onData(data => { job.output = clean(job.output + data); });
  process.onExit(({ exitCode }) => { clearTimeout(job.timer); job.status = exitCode === 0 ? "succeeded" : "failed"; setTimeout(() => jobs.delete(id), 10 * 60_000).unref(); });
  return { job_id: id };
}
export function cliLoginJob(home: string, id: string, input?: string, cancel = false) {
  const job = jobs.get(id);
  if (!job || job.home !== resolve(home)) throw new ConnectorCliError("登录已结束或应用已重启，请重新开始");
  if (cancel) job.kill();
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
  return { status: job.status, output, service_id: job.service };
}
