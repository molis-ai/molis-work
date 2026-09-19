import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { ShelfError } from "./errors.js";
import { finalizeOutput, looksLikeDeliverable } from "./recipes.js";

export interface ShelfAgentProcessInput {
  readonly executable: string;
  readonly args: readonly string[];
  readonly workdir: string;
  readonly outputFile: string;
  readonly jobId: string;
  readonly timeoutMs?: number;
}

export interface ShelfAgentProcessResult {
  readonly exit_code: number;
  readonly last_message: string;
  readonly stderr: string;
}

export const SHELF_JOB_TIMEOUT_MS = 10 * 60 * 1000;

/** Live agent processes, so a cancel from another request can reach them. */
const RUNNING = new Map<string, ChildProcess>();

/** Agents spawn helpers of their own, so a cancel takes down the whole group. */
export function cancelAgentProcess(jobId: string): boolean {
  const child = RUNNING.get(jobId);
  if (!child) return false;
  if (child.pid) {
    try {
      process.kill(-child.pid, "SIGTERM");
      return true;
    } catch {
      /* the group is gone, fall back to the process itself */
    }
  }
  child.kill("SIGTERM");
  return true;
}

export function isAgentProcessRunning(jobId: string): boolean {
  return RUNNING.has(jobId);
}

/** DropAgent `PrintCLI.run`: run the CLI in `work/`, then read its deliverable. */
export function runAgentProcess(input: ShelfAgentProcessInput): Promise<ShelfAgentProcessResult> {
  if (!input.args.length) throw new ShelfError("shelf.no_agent", "这个 Agent 没有可用的无界面参数");
  return new Promise((resolve, reject) => {
    const child = spawn(input.executable, [...input.args], {
      cwd: input.workdir,
      env: agentEnvironment(input.executable),
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    RUNNING.set(input.jobId, child);
    const timer = setTimeout(() => {
      cancelAgentProcess(input.jobId);
    }, input.timeoutMs ?? SHELF_JOB_TIMEOUT_MS);
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      RUNNING.delete(input.jobId);
      run();
    };
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", (error) => {
      finish(() => reject(new ShelfError("shelf.no_agent", `启动 Agent 失败：${error.message}`)));
    });
    child.on("close", (code, signal) => {
      finish(() => {
        if (signal) {
          reject(new ShelfError("shelf.cancelled", "任务已取消"));
          return;
        }
        if (code !== 0) {
          reject(new ShelfError("shelf.job_failed", "任务失败，请检查终端登录或权限"));
          return;
        }
        resolve({
          exit_code: code ?? 0,
          last_message: lastMessage(input, stdout),
          stderr,
        });
      });
    });
  });
}

function lastMessage(input: ShelfAgentProcessInput, stdout: string): string {
  const existing = existsSync(input.outputFile) ? readFileSync(input.outputFile, "utf8") : "";
  if (existing) return existing;
  const formatIndex = input.args.indexOf("--output-format");
  const format = formatIndex >= 0 ? input.args[formatIndex + 1] : undefined;
  let message = "";
  if (format === "streaming-messages-json") {
    message = streamingResult(stdout);
  } else if (format === "json") {
    message = jsonResult(stdout);
  } else {
    message = stdout.trim();
  }
  if (message) writeFileSync(input.outputFile, message);
  return message;
}

function streamingResult(stdout: string): string {
  const records = stdout.split(/\r?\n/u).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
  const result = records.reverse().find((record) => record.type === "result");
  if (!result || result.is_error === true || result.subtype !== "success" || typeof result.result !== "string") {
    throw new ShelfError("shelf.job_failed", "任务失败：终端没有返回完整的最终结果");
  }
  return result.result.trim();
}

function jsonResult(stdout: string): string {
  try {
    const object = JSON.parse(stdout) as Record<string, unknown>;
    if (typeof object.text === "string") return object.text.trim();
  } catch {
    /* fall through to the shared failure copy */
  }
  throw new ShelfError("shelf.job_failed", "任务失败：终端没有返回可读取的最终结果");
}

/** DropAgent `InteractiveLaunch.processEnvironmentMap`. */
export function agentEnvironment(executable: string): NodeJS.ProcessEnv {
  const home = process.env.HOME ?? homedir();
  const extras = [
    path.dirname(executable),
    path.join(home, ".grok/bin"),
    path.join(home, ".local/bin"),
    path.join(home, ".opencode/bin"),
    path.join(home, ".cursor/bin"),
    path.join(home, ".kimi-code/bin"),
    path.join(home, ".codebuddy/bin"),
    path.join(home, ".qwen/bin"),
    "/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin",
    path.join(home, "Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const current = (process.env.PATH ?? "").split(":").filter(Boolean);
  const search = [...new Set([...extras, ...current])].filter(Boolean);
  return {
    ...process.env,
    PATH: search.join(":"),
    HOME: home,
    LANG: process.env.LANG ?? "en_US.UTF-8",
  };
}

export interface ShelfCollectInput {
  readonly outputFile: string;
  readonly work: string;
  readonly input: string;
  readonly inputNames: readonly string[];
  readonly lastMessage: string;
}

/**
 * DropAgent `RecipeOutput.collect`: the deliverable is the written file, else a
 * new file the Agent left in `work/`, else its final message. Material copies
 * never count.
 */
export function collectRecipeOutput(input: ShelfCollectInput): void {
  if (hasDeliverable(input.outputFile)) {
    finalizeFile(input.outputFile);
    return;
  }
  const harvested = harvest(input);
  if (harvested) {
    rmSync(input.outputFile, { force: true });
    mkdirSync(path.dirname(input.outputFile), { recursive: true });
    copyFileSync(harvested, input.outputFile);
    finalizeFile(input.outputFile);
    return;
  }
  if (looksLikeDeliverable(input.lastMessage)) {
    writeFileSync(input.outputFile, input.lastMessage);
    finalizeFile(input.outputFile);
    return;
  }
  rmSync(input.outputFile, { force: true });
  throw new ShelfError("shelf.missing_output", "这次没有生成文件");
}

export function hasDeliverable(file: string): boolean {
  if (!existsSync(file)) return false;
  try {
    return looksLikeDeliverable(readFileSync(file, "utf8"));
  } catch {
    return false;
  }
}

function finalizeFile(file: string): void {
  const raw = readFileSync(file, "utf8");
  const cleaned = finalizeOutput(raw, path.basename(file));
  if (cleaned !== raw) writeFileSync(file, cleaned);
}

function harvest(input: ShelfCollectInput): string | null {
  const preferredName = path.basename(input.outputFile);
  const preferred = path.join(input.work, preferredName);
  if (isNewDeliverable(preferred, input)) return preferred;
  const candidates = walk(input.work).filter((file) => isNewDeliverable(file, input));
  const named = candidates.filter((file) => path.basename(file) === preferredName);
  const newestNamed = newest(named);
  if (newestNamed) return newestNamed;
  const wantedExt = path.extname(preferredName).toLowerCase();
  if (wantedExt) {
    const matching = candidates.filter((file) => path.extname(file).toLowerCase() === wantedExt);
    const newestMatching = newest(matching);
    if (newestMatching) return newestMatching;
  }
  return newest(candidates);
}

function walk(root: string): string[] {
  const found: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) found.push(full);
    }
  };
  if (existsSync(root)) visit(root);
  return found;
}

function isNewDeliverable(file: string, input: ShelfCollectInput): boolean {
  if (!existsSync(file)) return false;
  if (!statSync(file).isFile()) return false;
  if (isMaterialCopy(file, input)) return false;
  return hasDeliverable(file);
}

function isMaterialCopy(file: string, input: ShelfCollectInput): boolean {
  const relative = path.relative(input.work, file);
  if (!relative || relative.startsWith("..")) return true;
  if (existsSync(path.join(input.input, relative))) return true;
  if (path.resolve(path.dirname(file)) === path.resolve(input.work) && input.inputNames.includes(path.basename(file))) return true;
  return false;
}

function newest(files: readonly string[]): string | null {
  let best: string | null = null;
  let bestTime = -1;
  for (const file of files) {
    const time = statSync(file).mtimeMs;
    if (time > bestTime) {
      best = file;
      bestTime = time;
    }
  }
  return best;
}
