import { execFile as execFileCallback, execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { readProductEnv } from "@molis-ai/molis-work-storage";

const execFile = promisify(execFileCallback);
const CLI_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const CLI_MARKER = "lark-cli";
const USER_SCOPES = "im:chat:readonly docx:document:readonly wiki:wiki:readonly offline_access";
let setupProcess: ChildProcess | null = null;
let loginProcess: ChildProcess | null = null;

export type FeishuCliStatus = { installed: boolean; configured: boolean; authorized: boolean; account?: string; problem?: string };

function executable(): string {
  const configured = readProductEnv("FEISHU_CLI_PATH")?.trim();
  if (configured) return configured;
  const sibling = path.join(path.dirname(process.execPath), "lark-cli");
  return existsSync(sibling) ? sibling : "lark-cli";
}

function parseJson(raw: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("飞书 CLI 未返回 JSON 对象");
  return parsed as Record<string, unknown>;
}

function statusFromOutput(output: Record<string, unknown>): FeishuCliStatus {
  if (output.ok === false) return { installed: true, configured: false, authorized: false, problem: "请先配置飞书 CLI 应用" };
  const identities = output.identities && typeof output.identities === "object" ? output.identities as Record<string, unknown> : {};
  const user = identities.user && typeof identities.user === "object" ? identities.user as Record<string, unknown> : {};
  const authorized = user.available === true || output.identity === "user";
  return {
    installed: true, configured: true, authorized,
    ...(typeof user.userName === "string" ? { account: user.userName } : typeof user.name === "string" ? { account: user.name } : {}),
    ...(!authorized ? { problem: "请在飞书 CLI 中完成用户授权" } : {}),
  };
}

export function feishuCliStatus(): FeishuCliStatus {
  try {
    const raw = execFileSync(executable(), ["auth", "status", "--json"], {
      encoding: "utf8", timeout: 3_000, maxBuffer: 100_000, stdio: ["ignore", "pipe", "ignore"],
    });
    return statusFromOutput(parseJson(raw));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    if (code === "ENOENT") return { installed: false, configured: false, authorized: false, problem: "请先安装飞书 CLI" };
    return { installed: true, configured: false, authorized: false, problem: "飞书 CLI 状态不可用，请运行 lark-cli auth status" };
  }
}

/** Launch the CLI's official app setup and return only its Feishu URL. */
export function startFeishuCliSetup(): Promise<string> {
  if (setupProcess) throw new Error("飞书 CLI 应用配置已在进行中");
  return new Promise((resolve, reject) => {
    const child = spawn(executable(), ["config", "init", "--new"], { stdio: ["ignore", "pipe", "pipe"] });
    setupProcess = child;
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) { settled = true; child.kill(); reject(new Error("飞书 CLI 未返回配置链接")); }
    }, 15_000);
    const receive = (chunk: Buffer) => {
      if (settled) return;
      output = (output + chunk.toString("utf8")).slice(-20_000);
      const match = /https:\/\/open\.feishu\.cn\/page\/cli\?[^\s]+/u.exec(output);
      if (!match) return;
      const url = new URL(match[0]);
      if (!url.searchParams.get("user_code")) return;
      settled = true;
      clearTimeout(timeout);
      resolve(url.toString());
    };
    child.stdout.on("data", receive);
    child.stderr.on("data", receive);
    child.once("error", () => { if (!settled) { settled = true; clearTimeout(timeout); reject(new Error("无法启动飞书 CLI")); } setupProcess = null; });
    child.once("exit", () => { setupProcess = null; if (!settled) { settled = true; clearTimeout(timeout); reject(new Error("飞书 CLI 应用配置未完成")); } });
  });
}

export async function startFeishuCliLogin(): Promise<string> {
  const status = feishuCliStatus();
  if (!status.installed || !status.configured) throw new Error(status.problem || "请先配置飞书 CLI 应用");
  if (loginProcess) throw new Error("飞书授权已在进行中");
  const started = await runCli(["auth", "login", "--scope", USER_SCOPES, "--no-wait", "--json"]);
  const url = typeof started.verification_url === "string" ? new URL(started.verification_url) : null;
  const deviceCode = typeof started.device_code === "string" ? started.device_code : "";
  if (!url || !["accounts.feishu.cn", "open.feishu.cn"].includes(url.hostname) || url.protocol !== "https:" || !deviceCode) {
    throw new Error("飞书 CLI 未返回有效授权链接");
  }
  const child = spawn(executable(), ["auth", "login", "--device-code", deviceCode, "--json"], {
    stdio: ["ignore", "ignore", "ignore"],
  });
  loginProcess = child;
  const timeout = setTimeout(() => child.kill(), 10 * 60_000);
  child.once("error", () => { clearTimeout(timeout); loginProcess = null; });
  child.once("exit", () => { clearTimeout(timeout); loginProcess = null; });
  return url.toString();
}

async function runCli(args: string[]): Promise<Record<string, unknown>> {
  try {
    const { stdout } = await execFile(executable(), args, { timeout: CLI_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES });
    return parseJson(stdout);
  } catch (error) {
    const raw = error && typeof error === "object" && "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
    let message = "飞书 CLI 调用失败，请检查登录及所需权限";
    try {
      const parsed = parseJson(raw);
      const detail = parsed.error && typeof parsed.error === "object" ? parsed.error as Record<string, unknown> : {};
      if (typeof detail.hint === "string" && detail.hint.trim()) message = detail.hint;
      else if (typeof detail.message === "string" && detail.message.trim()) message = detail.message;
    } catch { /* Avoid returning arbitrary CLI stderr or credentials. */ }
    throw new Error(message);
  }
}

const ALLOWED_PATHS = [
  /^\/open-apis\/authen\/v1\/user_info$/u,
  /^\/open-apis\/im\/v1\/chats$/u,
  /^\/open-apis\/wiki\/v2\/spaces\/get_node$/u,
  /^\/open-apis\/docx\/v1\/documents\/[A-Za-z0-9_-]{10,128}$/u,
  /^\/open-apis\/docx\/v1\/documents\/[A-Za-z0-9_-]{10,128}\/raw_content$/u,
];

/** Only the connector's read-only API paths may cross the CLI process boundary. */
export async function feishuCliFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://open.feishu.cn" || !ALLOWED_PATHS.some((pattern) => pattern.test(url.pathname))
    || (init?.method && init.method !== "GET")) throw new Error("飞书 CLI 只允许当前 Connector 的只读接口");
  const args = ["api", "GET", url.pathname, "--as", "user", "--format", "json"];
  if (url.search) args.push("--params", JSON.stringify(Object.fromEntries(url.searchParams)));
  try {
    const result = await runCli(args);
    if (result.ok !== true) throw new Error("飞书 CLI 未完成请求");
    const data = result.data && typeof result.data === "object" && !Array.isArray(result.data)
      ? result.data as Record<string, unknown> : {};
    if (typeof data.code === "number" && data.code !== 0) throw new Error("飞书 API 返回错误");
    const payload = data.code === 0 ? data : { code: 0, data };
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ code: 99991668, msg: "飞书 CLI 授权或权限不足，请检查连接" }), {
      status: 401, headers: { "content-type": "application/json" },
    });
  }
}

export function feishuCliMarker(): string { return CLI_MARKER; }
