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

/**
 * What the Shelf asks of the platform's local tools service (`services.localTools`, PG-112): where each of the declared tools is on this
 * machine, and whether one path the person chose is a runnable file. The Shelf looks nowhere else and starts nothing.
 */
export interface ShelfLocalToolsPort {
  find(): Promise<readonly { readonly tool_id: string; readonly executable: string | null }[]>;
  isExecutable(path: string): Promise<boolean>;
}

/** Where the Shelf looks for terminal Agents. Without `tools` it finds none. */
export interface ShelfRuntimeLookup {
  readonly tools?: ShelfLocalToolsPort;
  /** The person's pick (`auto` or an engine key); else the first one found. */
  readonly preferred?: string | null;
  readonly customRuntimes?: readonly ShelfCustomRuntime[];
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
  readonly kind: "tui" | "cli";
  readonly install_url: string;
}

/** The nine presets are the platform's tools of the same ids (`local_tools` in the Manifest); custom runtimes sit beside them, same rules. */
async function foundRuntimes(lookup: ShelfRuntimeLookup): Promise<FoundRuntime[]> {
  const tools = lookup.tools;
  if (!tools) return [];
  const executables = new Map((await tools.find()).map(tool => [tool.tool_id, tool.executable]));
  const found: FoundRuntime[] = [];
  for (const engine of SHELF_ENGINES) {
    const executable = executables.get(engine.key);
    if (executable) found.push({ key: engine.key, title: engine.title, executable, kind: "tui", install_url: engine.install_url });
  }
  for (const custom of lookup.customRuntimes ?? []) {
    if (!custom.executable.startsWith("/") || !(await tools.isExecutable(custom.executable))) continue;
    found.push({ key: `custom:${custom.id}`, title: custom.title, executable: custom.executable, kind: custom.kind, install_url: "" });
  }
  return found;
}

/** Everything this Mac could run a recipe in, installed or not. */
export async function shelfRuntimeCatalog(lookup: ShelfRuntimeLookup = {}): Promise<ShelfRuntimeInstall[]> {
  return catalogOf(lookup, await foundRuntimes(lookup));
}

function catalogOf(lookup: ShelfRuntimeLookup, foundRows: readonly FoundRuntime[]): ShelfRuntimeInstall[] {
  const found = new Map(foundRows.map(runtime => [runtime.key, runtime]));
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
  for (const custom of lookup.customRuntimes ?? []) {
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
 * The Agent a person would open a terminal in: their pick, else the first one found in DropAgent's preference order. What it can run
 * headless is not asked (nothing here starts a CLI), so it is reported as not yet known.
 */
export async function detectShelfRuntime(lookup: ShelfRuntimeLookup = {}): Promise<ShelfRuntimeStatus> {
  const found = await foundRuntimes(lookup);
  const catalog = catalogOf(lookup, found);
  if (!found.length) return { ...emptyShelfRuntime(), catalog };
  const wanted = lookup.preferred && lookup.preferred !== "auto"
    ? found.find((runtime) => runtime.key === lookup.preferred)
    : undefined;
  const chosen = wanted ?? found[0];
  return {
    image_text: false,
    runtime_key: chosen.key,
    title: chosen.title,
    executable: chosen.executable,
    kind: chosen.kind,
    installed: found.map((runtime) => runtime.key),
    catalog,
    isolation: "unknown",
    isolation_fact: "执行能力与隔离范围在执行时检查，登录尚未确认",
    can_run_job: false,
    capability_pending: true,
  };
}
