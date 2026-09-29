import { spawnSync } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type {
  ShelfCustomRuntime,
  ShelfIsolationGrade,
  ShelfRuntimeInstall,
  ShelfRuntimeStatus,
} from "@molis-ai/molis-work-contracts/modules/shelf";

/**
 * DropAgent `AgentEngine` + `AgentService` + `HeadlessCLI`, in Node.
 * The shelf only runs recipes through a terminal Agent that has a headless job
 * entry; a TUI without one can still take a send, never a job.
 */
export interface ShelfEngine {
  readonly key: string;
  readonly title: string;
  readonly binaries: readonly string[];
  readonly install_url: string;
}

export const SHELF_ENGINES: readonly ShelfEngine[] = [
  { key: "grok", title: "Grok", binaries: ["grok"], install_url: "https://docs.x.ai/docs/build/overview" },
  { key: "claude", title: "Claude", binaries: ["claude"], install_url: "https://docs.anthropic.com/en/docs/claude-code" },
  { key: "gemini", title: "Gemini", binaries: ["gemini"], install_url: "https://github.com/google-gemini/gemini-cli" },
  { key: "opencode", title: "OpenCode", binaries: ["opencode"], install_url: "https://opencode.ai/docs/cli/" },
  { key: "cursor", title: "Cursor CLI", binaries: ["cursor-agent"], install_url: "https://cursor.com/docs/cli/overview" },
  { key: "codex", title: "Codex", binaries: ["codex"], install_url: "https://github.com/openai/codex" },
  { key: "kimi", title: "Kimi Code", binaries: ["kimi", "kimi-code"], install_url: "https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started" },
  { key: "codebuddy", title: "CodeBuddy", binaries: ["codebuddy", "cbc"], install_url: "https://www.workbuddy.ai/docs/cli/overview" },
  { key: "qwen", title: "Qwen Code", binaries: ["qwen"], install_url: "https://github.com/QwenLM/qwen-code" },
];

export interface ShelfRuntimeProbe {
  readonly pathEnvironment?: string;
  readonly home?: string;
  readonly preferred?: string | null;
  readonly customRuntimes?: readonly ShelfCustomRuntime[];
  /** Look nowhere: an isolated trial or a test that must not meet this Mac's CLIs. */
  readonly disabled?: boolean;
  /** Passive by default. Only an explicit job may set false to probe its chosen CLI. */
  readonly skipHelp?: boolean;
}

const HELP_CACHE = new Map<string, string>();
const SANDBOX_CACHE = new Map<string, boolean>();

export function shelfSearchDirectories(pathEnvironment: string, home: string): string[] {
  const directories = pathEnvironment.split(":").filter(Boolean);
  directories.push(
    path.join(home, ".grok/bin"),
    path.join(home, ".local/bin"),
    path.join(home, ".opencode/bin"),
    path.join(home, ".cursor/bin"),
    path.join(home, ".kimi-code/bin"),
    path.join(home, ".codebuddy/bin"),
    path.join(home, ".qwen/bin"),
    path.join(home, "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin",
    path.join(home, "Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/bin"),
  );
  return [...new Set(directories)];
}

export function shelfRuntimeCandidates(engine: ShelfEngine, probe: ShelfRuntimeProbe = {}): string[] {
  const directories = probe.pathEnvironment === undefined
    ? shelfSearchDirectories(pathEnvironmentOf(probe), homeOf(probe))
    : probe.pathEnvironment.split(path.delimiter).filter(Boolean);
  const urls: string[] = [];
  for (const directory of directories) {
    for (const binary of engine.binaries) urls.push(path.join(directory, binary));
  }
  return [...new Set(urls)];
}

function pathEnvironmentOf(probe: ShelfRuntimeProbe): string {
  return probe.pathEnvironment ?? process.env.PATH ?? "";
}

function homeOf(probe: ShelfRuntimeProbe): string {
  return probe.home ?? homedir();
}

function isExecutableFile(candidate: string): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Executables on this device, in DropAgent's preference order. */
export function installedShelfEngines(probe: ShelfRuntimeProbe = {}): { engine: ShelfEngine; executable: string }[] {
  const found: { engine: ShelfEngine; executable: string }[] = [];
  for (const engine of SHELF_ENGINES) {
    const executable = shelfRuntimeCandidates(engine, probe).find(isExecutableFile);
    if (executable) found.push({ engine, executable });
  }
  return found;
}

export function readCliHelp(executable: string): string {
  const cached = HELP_CACHE.get(executable);
  if (cached !== undefined) return cached;
  const help = runCapture(executable, ["--help"]);
  // A probe that timed out or could not start says nothing about the CLI: ask again next time
  // instead of reporting "no headless entry" until the process restarts.
  if (help.completed) HELP_CACHE.set(executable, help.text);
  return help.text;
}

export function supportsWorkspaceSandbox(executable: string): boolean {
  const cached = SANDBOX_CACHE.get(executable);
  if (cached !== undefined) return cached;
  const probe = runCapture(executable, ["exec", "--help"]);
  const supported = probe.text.includes("--sandbox") && probe.text.includes("workspace-write");
  if (probe.completed) SANDBOX_CACHE.set(executable, supported);
  return supported;
}

function runCapture(executable: string, args: readonly string[]): { text: string; completed: boolean } {
  try {
    const result = spawnSync(executable, [...args], {
      timeout: 3_000,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { text: `${result.stdout ?? ""}${result.stderr ?? ""}`, completed: !result.error && result.status !== null };
  } catch {
    return { text: "", completed: false };
  }
}

/** DropAgent `HeadlessCLI.canRunJob`. */
export function canRunJob(engineKey: string, help: string): boolean {
  switch (engineKey) {
    case "codex":
      return /\bexec\b/u.test(help);
    case "grok":
      return help.includes("--prompt-file") || help.includes("--single");
    case "claude":
    case "cursor":
    case "codebuddy":
      return help.includes("--print") || help.includes("-p,") || help.includes("-p ");
    case "gemini":
      return help.includes("--prompt");
    case "kimi":
    case "qwen":
      return help.includes("--prompt") || help.includes("-p,") || help.includes("-p ");
    case "opencode":
      return hasRunCommand(help);
    default:
      return help.includes("--print")
        || help.includes("--prompt-file")
        || help.includes("--prompt")
        || hasRunCommand(help);
  }
}

function hasRunCommand(help: string): boolean {
  return help.includes("run [message")
    || help.includes("opencode run")
    || /^\s+run\b/mu.test(help);
}

export function isolationFact(grade: ShelfIsolationGrade): string {
  switch (grade) {
    case "workspace":
      return "Workspace Sandbox：Agent 只能写任务工作区";
    case "unknown":
      return "未确认工作区限制，仍在副本目录跑";
    case "tui":
      return "在终端执行，不是副本沙箱";
    default:
      return "未发现 Agent";
  }
}

export const NO_AGENT_REASON = "未发现终端 Agent。";

export function missingJobReason(title: string): string {
  return `${title} 没有无界面执行入口，动作不能跑。`;
}

export function emptyShelfRuntime(): ShelfRuntimeStatus {
  return {
    runtime_key: "",
    title: "Agent",
    executable: "",
    kind: "tui",
    isolation: "none",
    isolation_fact: isolationFact("none"),
    can_run_job: false,
    image_text: false,
    installed: [],
    catalog: [],
  };
}

interface FoundRuntime {
  readonly key: string;
  readonly title: string;
  readonly executable: string;
  readonly engine: ShelfEngine | null;
  readonly kind: "tui" | "cli";
  readonly install_url: string;
}

/** Custom runtimes sit beside the nine presets, same rules. */
function foundRuntimes(probe: ShelfRuntimeProbe): FoundRuntime[] {
  const found: FoundRuntime[] = installedShelfEngines(probe).map((entry) => ({
    key: entry.engine.key,
    title: entry.engine.title,
    executable: entry.executable,
    engine: entry.engine,
    kind: "tui",
    install_url: entry.engine.install_url,
  }));
  for (const custom of probe.customRuntimes ?? []) {
    if (!isExecutableFile(custom.executable)) continue;
    found.push({
      key: `custom:${custom.id}`,
      title: custom.title,
      executable: custom.executable,
      engine: null,
      kind: custom.kind,
      install_url: "",
    });
  }
  return found;
}

function runtimeCanRunJob(runtime: FoundRuntime, help: string): boolean {
  if (runtime.engine) return canRunJob(runtime.engine.key, help);
  if (runtime.kind === "cli") return true;
  return canRunJob("", help);
}

/** Everything this Mac could run a recipe in, installed or not. */
export function shelfRuntimeCatalog(probe: ShelfRuntimeProbe = {}): ShelfRuntimeInstall[] {
  if (probe.disabled) return [];
  const found = new Map(foundRuntimes(probe).map((runtime) => [runtime.key, runtime]));
  const rows: ShelfRuntimeInstall[] = SHELF_ENGINES.map((engine) => {
    const live = found.get(engine.key);
    return {
      runtime_key: engine.key,
      title: engine.title,
      executable: live?.executable ?? "",
      kind: "tui",
      can_run_job: false,
      ...(live ? { capability_pending: true } : {}),
      install_url: engine.install_url,
    };
  });
  for (const custom of probe.customRuntimes ?? []) {
    const live = found.get(`custom:${custom.id}`);
    rows.push({
      runtime_key: `custom:${custom.id}`,
      title: custom.title,
      executable: custom.executable,
      kind: custom.kind,
      can_run_job: false,
      ...(live ? { capability_pending: true } : {}),
      install_url: "",
    });
  }
  return rows;
}

/**
 * The Agent a recipe would run in, DropAgent `recipePresence`: pick the TUI
 * (preference, else install order), then ask whether it has a job entry.
 */
export function detectShelfRuntime(probe: ShelfRuntimeProbe = {}): ShelfRuntimeStatus {
  if (probe.disabled) return emptyShelfRuntime();
  const found = foundRuntimes(probe);
  const catalog = shelfRuntimeCatalog(probe);
  if (!found.length) return { ...emptyShelfRuntime(), catalog };
  const wanted = probe.preferred && probe.preferred !== "auto"
    ? found.find((runtime) => runtime.key === probe.preferred)
    : undefined;
  const chosen = wanted ?? found[0];
  const status = {
    image_text: false,
    runtime_key: chosen.key,
    title: chosen.title,
    executable: chosen.executable,
    kind: chosen.kind,
    installed: found.map((runtime) => runtime.key),
    catalog,
  };
  if (probe.skipHelp !== false) {
    return { ...status, isolation: "unknown", isolation_fact: "执行能力与隔离范围在执行时检查，登录尚未确认", can_run_job: false, capability_pending: true };
  }
  const help = readCliHelp(chosen.executable);
  if (!runtimeCanRunJob(chosen, help)) {
    return { ...status, isolation: "tui", isolation_fact: isolationFact("tui"), can_run_job: false };
  }
  const isolation: ShelfIsolationGrade = chosen.key === "codex" && supportsWorkspaceSandbox(chosen.executable)
    ? "workspace"
    : "unknown";
  return { ...status, isolation, isolation_fact: isolationFact(isolation), can_run_job: true };
}

export function clearShelfRuntimeCache(): void {
  HELP_CACHE.clear();
  SANDBOX_CACHE.clear();
}
