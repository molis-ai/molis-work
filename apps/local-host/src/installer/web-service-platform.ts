import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { SERVICE_LABEL, MolisWorkWebServiceError, type MolisWorkWebServiceManagerOptions, type MolisWorkWebServiceState, type MolisWorkWebServiceDetection, type WebServiceReceipt } from "./web-service-contract.js";
import { resolveConfiguredHome } from "../product-home.js";
const execFileAsync = promisify(execFile);

export class WebServiceEnvironment {
  readonly homeDirectory: string;
  readonly userHomeDirectory: string;
  readonly plistPath: string;
  readonly receiptPath: string;
  readonly stdoutLog: string;
  readonly stderrLog: string;
  readonly platform: NodeJS.Platform;
  readonly uid: number;
  readonly nodeExecutablePath: string;
  readonly runCommand: NonNullable<MolisWorkWebServiceManagerOptions["runCommand"]>;
  readonly healthCheck: NonNullable<MolisWorkWebServiceManagerOptions["healthCheck"]>;
  readonly legacyInstanceCheck: NonNullable<MolisWorkWebServiceManagerOptions["legacyInstanceCheck"]>;
  readonly portCheck: NonNullable<MolisWorkWebServiceManagerOptions["portCheck"]>;
  readonly transitionDelayMilliseconds: number;
  constructor(options: MolisWorkWebServiceManagerOptions = {}) {
    this.homeDirectory = path.resolve(options.homeDirectory ?? resolveConfiguredHome());
    this.userHomeDirectory = path.resolve(
      options.userHomeDirectory
        ?? (options.homeDirectory ? path.dirname(this.homeDirectory) : os.homedir()),
    );
    this.platform = options.platform ?? process.platform;
    this.uid = options.uid ?? (typeof process.getuid === "function" ? process.getuid() : 0);
    this.nodeExecutablePath = path.resolve(options.nodeExecutablePath ?? process.execPath);
    this.plistPath = path.join(this.userHomeDirectory, "Library", "LaunchAgents", `${SERVICE_LABEL}.plist`);
    this.receiptPath = path.join(this.homeDirectory, "config", "web-service.json");
    this.stdoutLog = path.join(this.homeDirectory, "logs", "web-service.log");
    this.stderrLog = path.join(this.homeDirectory, "logs", "web-service.error.log");
    this.runCommand = options.runCommand ?? runCommand;
    this.healthCheck = options.healthCheck ?? molisWorkWebHealthCheck;
    this.legacyInstanceCheck = options.legacyInstanceCheck ?? molisWorkLegacyWebInstanceCheck;
    this.portCheck = options.portCheck ?? molisWorkWebPortCheck;
    this.transitionDelayMilliseconds = Math.max(0, options.transitionDelayMilliseconds ?? 250);
  }
  command(): string[] {
    return [path.join(this.homeDirectory, "bin", "molis-work-web"), "--home", this.homeDirectory];
  }

  plistSource(): string {
    const args = this.command().map((value) => `      <string>${escapeXml(value)}</string>`).join("\n");
    const servicePath = [
      path.dirname(this.nodeExecutablePath),
      path.join(this.userHomeDirectory, ".local", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ].filter((value, index, all) => all.indexOf(value) === index).join(":");
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>5</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${escapeXml(servicePath)}</string>
  </dict>
  <key>StandardOutPath</key><string>${escapeXml(this.stdoutLog)}</string>
  <key>StandardErrorPath</key><string>${escapeXml(this.stderrLog)}</string>
</dict>
</plist>
`;
  }

  async launchctl(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    return this.runCommand("/bin/launchctl", args);
  }

  domainTarget(): string { return `gui/${this.uid}`; }

  serviceTarget(): string { return `${this.domainTarget()}/${SERVICE_LABEL}`; }

  detection(
    state: MolisWorkWebServiceState,
    supported: boolean,
    owned: boolean,
    running: boolean,
    command: string[],
    message: string,
  ): MolisWorkWebServiceDetection {
    return {
      provider: supported ? "macos-launchagent" : "unsupported",
      state,
      supported,
      owned,
      running,
      label: SERVICE_LABEL,
      plist_path: this.plistPath,
      command,
      stdout_log: this.stdoutLog,
      stderr_log: this.stderrLog,
      message,
    };
  }
}

export async function runCommand(file: string, args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(file, args, { encoding: "utf8" });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const failure = error as Error & { code?: number | string; stdout?: string; stderr?: string };
    return { code: typeof failure.code === "number" ? failure.code : 1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? failure.message };
  }
}

export async function molisWorkWebHealthCheck(expectedProcessId?: number): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:4173/health", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const body = await response.json() as {
      status?: unknown;
      process_id?: unknown;
      service_process_id?: unknown;
    };
    return body.status === "ok"
      && (expectedProcessId == null
        || (body.service_process_id ?? body.process_id) === expectedProcessId);
  } catch {
    return false;
  }
}

export async function molisWorkLegacyWebInstanceCheck(expectedProcessId: number): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:4173/health", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return false;
    const body = await response.json() as {
      status?: unknown;
      process_id?: unknown;
      service_process_id?: unknown;
    };
    if (body.status !== "ok" || body.process_id != null || body.service_process_id != null) {
      return false;
    }
    const listener = await runCommand("/usr/sbin/lsof", [
      "-nP",
      "-iTCP:4173",
      "-sTCP:LISTEN",
      "-Fp",
    ]);
    if (listener.code !== 0) return false;
    const processIds = new Set(
      listener.stdout
        .split(/\r?\n/)
        .filter((line) => /^p\d+$/.test(line))
        .map((line) => Number(line.slice(1))),
    );
    return processIds.size === 1 && processIds.has(expectedProcessId);
  } catch {
    return false;
  }
}

export async function molisWorkWebPortCheck(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port: 4173 });
    let settled = false;
    const finish = (occupied: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(occupied);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", (error: NodeJS.ErrnoException) => {
      finish(error.code !== "ECONNREFUSED");
    });
    socket.setTimeout(1_000, () => finish(true));
  });
}

export function commandError(action: string, result: { code: number; stderr: string }): MolisWorkWebServiceError {
  return new MolisWorkWebServiceError("service.command_failed", `launchctl ${action}失败（${result.code}）：${result.stderr.trim() || "未知错误"}`);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function launchAgentProcessId(result: { code: number; stdout: string }): number | null {
  if (result.code !== 0) return null;
  const match = result.stdout.match(/(?:^|\n)\s*pid\s*=\s*(\d+)\s*(?:\n|$)/i);
  if (!match) return null;
  const processId = Number(match[1]);
  return Number.isSafeInteger(processId) && processId > 0 ? processId : null;
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fileExists(filePath: string): Promise<boolean> {
  try { return (await fs.stat(filePath)).isFile(); } catch { return false; }
}

export async function readText(filePath: string): Promise<string | null> {
  try { return await fs.readFile(filePath, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function readReceipt(filePath: string): Promise<WebServiceReceipt | null> {
  const text = await readText(filePath);
  if (!text) return null;
  try { return JSON.parse(text) as WebServiceReceipt; } catch { return null; }
}

export async function writeAtomic(filePath: string, content: string): Promise<void> {
  const temporary = `${filePath}.tmp-${randomUUID()}`;
  await fs.writeFile(temporary, content, { encoding: "utf8", mode: 0o644 });
  await fs.rename(temporary, filePath);
}

export function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}
