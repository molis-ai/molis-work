export const DESKTOP_RUNTIME_KINDS = [
  "codex",
  "claude-code",
  "opencode",
  "pi-agent",
  "grok-build",
  "generic",
] as const;
export type DesktopRuntimeKind = (typeof DESKTOP_RUNTIME_KINDS)[number];
type NamedDesktopRuntimeKind = Exclude<DesktopRuntimeKind, "generic">;

export function isDesktopRuntimeKind(value: string): value is DesktopRuntimeKind {
  return (DESKTOP_RUNTIME_KINDS as readonly string[]).includes(value);
}

function isNamedDesktopRuntimeKind(value: string): value is NamedDesktopRuntimeKind {
  return value !== "generic" && isDesktopRuntimeKind(value);
}

export interface DesktopLaunchSpec {
  runtime_kind: DesktopRuntimeKind;
  command: string;
  args: string[];
  title: string;
}

interface DesktopRuntimeRecipe {
  command: string;
  title: string;
  resumeArgs: (sessionId: string) => string[];
}

const DESKTOP_RUNTIME_RECIPES: Record<NamedDesktopRuntimeKind, DesktopRuntimeRecipe> = {
  codex: { command: "codex", title: "Codex", resumeArgs: (sessionId) => ["resume", sessionId] },
  "claude-code": { command: "claude", title: "Claude Code", resumeArgs: (sessionId) => ["--resume", sessionId] },
  opencode: { command: "opencode", title: "OpenCode", resumeArgs: (sessionId) => ["--session", sessionId] },
  "pi-agent": { command: "pi", title: "Pi Agent", resumeArgs: (sessionId) => ["--session", sessionId] },
  "grok-build": { command: "grok", title: "Grok Build", resumeArgs: (sessionId) => ["--resume", sessionId] },
};

export function desktopRuntimeTitle(runtimeKind: string): string {
  if (runtimeKind === "generic") return "自定义命令";
  return isNamedDesktopRuntimeKind(runtimeKind) ? DESKTOP_RUNTIME_RECIPES[runtimeKind].title : runtimeKind;
}

export function desktopLaunchSpec(input: {
  runtime_kind: string;
  command?: string;
  args?: string[];
  resume_session_id?: string | null;
}): DesktopLaunchSpec {
  const resume = input.resume_session_id?.trim() || null;
  if (isNamedDesktopRuntimeKind(input.runtime_kind)) {
    const recipe = DESKTOP_RUNTIME_RECIPES[input.runtime_kind];
    return {
      runtime_kind: input.runtime_kind,
      command: input.command?.trim() || recipe.command,
      args: resume ? recipe.resumeArgs(resume) : [...(input.args ?? [])],
      title: resume ? `${recipe.title} · ${resume.slice(0, 8)}` : recipe.title,
    };
  }
  const command = input.command?.trim();
  if (!command) throw new Error("自定义终端需要提供启动命令");
  return { runtime_kind: "generic", command, args: [...(input.args ?? [])], title: command };
}

export function desktopPanelEnv(input: {
  homeDirectory: string;
  runtimeId: string;
  sessionId?: string | null;
  panelId: string;
  workContextId: string;
  goalId: string;
  webUrl?: string;
}): Record<string, string> {
  const webUrl = input.webUrl?.trim() || "http://127.0.0.1:4173";
  return {
    MOLIS_WORK_HOME: input.homeDirectory,
    MOLIS_WORK_MCP_AUDIENCE: "runtime",
    MOLIS_WORK_RUNTIME_ID: input.runtimeId,
    ...(input.sessionId?.trim() ? { MOLIS_WORK_SESSION_ID: input.sessionId.trim() } : {}),
    MOLIS_WORK_WORK_CONTEXT_ID: input.workContextId,
    MOLIS_WORK_WORK_CONTEXT_STABLE: "true",
    MOLIS_WORK_PANEL_ID: input.panelId,
    MOLIS_WORK_GOAL_ID: input.goalId,
    MOLIS_WORK_WEB_URL: webUrl,
    TERM: "xterm-256color",
    COLORTERM: "truecolor",
  };
}
