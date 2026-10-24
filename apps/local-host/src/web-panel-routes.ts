import type { DesktopPanelApi, DesktopPanelRecord } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";
import { decodeLocalWebPathPart, respondLocalWebRefusal } from "./web-http.js";

interface PanelSpawnSpec {
  command: string;
  args: string[];
  cwd: string | null;
  env: Record<string, string>;
}

interface PanelHost {
  panels: DesktopPanelApi;
  preferredWorkspacePath(projectId: string): string | null;
  spawn(panel: DesktopPanelRecord): PanelSpawnSpec;
}

type PanelGoal = Pick<GoalRecord, "title" | "decomposition_state"> & { event_work?: boolean; event_facts?: string };

export interface PanelHttpContext {
  method: string | undefined;
  url: URL;
  projectId: string;
  text(value: string): string;
  readBody(): Promise<Record<string, unknown>>;
  respond(status: number, value: unknown): void;
  withHost<T>(operation: (host: PanelHost) => Promise<T>): Promise<T>;
  readGoal(goalId: string): PanelGoal | Promise<PanelGoal>;
  readLinkedFeedContext(goalId: string, itemId?: string): Promise<{ source_context: string } | null> | { source_context: string } | null;
  projectGuidance(): string | Promise<string>;
  isRuntimeKind(kind: string): boolean;
  launchSpec(input: { runtime_kind: string; command?: string; args?: string[]; resume_session_id?: string | null }): {
    runtime_kind: string; command: string; args: string[]; title: string;
  };
  advancePrompt(input: { goal_id: string; title: string; source_context?: string; project_guidance_prefix?: string; onboarding?: boolean; current_facts?: string }): string;
  kill(panelId: string): void;
}

type PanelHandler = (context: PanelHttpContext, host: PanelHost, id: string) => Promise<void>;

const PANEL_PATHS = [
  ["goal-panels", /^\/api\/goals\/([^/]+)\/panels$/],
  ["advance-prompt", /^\/api\/goals\/([^/]+)\/advance-prompt$/],
  ["panel", /^\/api\/panels\/([^/]+)$/],
  ["panel-exited", /^\/api\/panels\/([^/]+)\/exited$/],
  ["panel-reopen", /^\/api\/panels\/([^/]+)\/reopen$/],
] as const;

/** A parent Goal finished by its children: its terminals are history, read only. */
const isParentGoal = (goal: PanelGoal) => goal.decomposition_state === "closed_compound" && !goal.event_work;

/** The panel, when it belongs to this project; otherwise answers 404 and gives nothing. */
function ownedPanel(context: PanelHttpContext, host: PanelHost, panelId: string): DesktopPanelRecord | null {
  const panel = host.panels.get(panelId);
  if (panel.project_id === context.projectId) return panel;
  context.respond(404, { error: "找不到这个终端面板" });
  return null;
}

async function readAdvancePrompt(context: PanelHttpContext, _host: PanelHost, goalId: string) {
  const { url, respond, text: L } = context;
  const contract = await context.readGoal(goalId);
  if (isParentGoal(contract)) {
    respond(409, { error: L("这条上层 Goal 由子 Goal 共同完成，不能直接推进。请选择一个具体的子 Goal。") });
    return;
  }
  const requestedFeedItemId = url.searchParams.get("feed_item_id")?.trim() || null;
  const linkedFeedItem = await context.readLinkedFeedContext(goalId, requestedFeedItemId ?? undefined);
  if (requestedFeedItemId && !linkedFeedItem) {
    respond(409, { error: L("这条 Item 已不再关联当前 Goal，请返回 Inbox 或 Feed 重新开始处理。") });
    return;
  }
  respond(200, {
    goal_id: goalId,
    title: contract.title,
    prompt: context.advancePrompt({
      goal_id: goalId,
      title: contract.title,
      source_context: linkedFeedItem ? linkedFeedItem.source_context : undefined,
      project_guidance_prefix: await context.projectGuidance(),
      onboarding: url.searchParams.get("onboarding") === "1",
      current_facts: contract.event_facts,
    }),
  });
}

async function listGoalPanels(context: PanelHttpContext, host: PanelHost, goalId: string) {
  const contract = await context.readGoal(goalId);
  const panels = host.panels.list(context.projectId, goalId);
  context.respond(200, {
    panels: panels.map((panel) => ({ ...panel, spawn: host.spawn(panel) })),
    read_only: isParentGoal(contract),
  });
}

async function openGoalPanel(context: PanelHttpContext, host: PanelHost, goalId: string) {
  const { projectId, respond, text: L } = context;
  const contract = await context.readGoal(goalId);
  if (isParentGoal(contract)) {
    respond(409, { error: L("这条上层 Goal 由子 Goal 共同完成，不能直接开终端。请选择一个具体的子 Goal。") });
    return;
  }
  const body = await context.readBody();
  const runtimeKind = typeof body.runtime_kind === "string" ? body.runtime_kind : "generic";
  if (!context.isRuntimeKind(runtimeKind)) {
    respond(400, { error: "不支持的终端类型" });
    return;
  }
  const resume = typeof body.resume_session_id === "string" ? body.resume_session_id : null;
  const launch = context.launchSpec({
    runtime_kind: runtimeKind,
    command: typeof body.command === "string" ? body.command : undefined,
    args: Array.isArray(body.args) ? body.args.map((item) => String(item)) : undefined,
    resume_session_id: resume,
  });
  const cwd = typeof body.cwd === "string" && body.cwd.trim()
    ? body.cwd.trim()
    : host.preferredWorkspacePath(projectId);
  if (!cwd) {
    respond(400, { error: L("打开终端需要先把这个项目关联到一个工作目录") });
    return;
  }
  const panel = host.panels.open({
    project_id: projectId,
    goal_id: goalId,
    runtime_kind: launch.runtime_kind,
    launch_command: launch.command,
    launch_args: launch.args,
    cwd,
    title: launch.title,
    host_session_id: resume,
    actor_id: "desktop-user",
    user_confirmed: true,
  });
  respond(200, { panel, spawn: host.spawn(panel) });
}

async function closePanel(context: PanelHttpContext, host: PanelHost, panelId: string) {
  if (!ownedPanel(context, host, panelId)) return;
  host.panels.close(panelId, "desktop-user");
  context.kill(panelId);
  context.respond(200, { closed: true, panel_id: panelId });
}

async function markPanelExited(context: PanelHttpContext, host: PanelHost, panelId: string) {
  if (!ownedPanel(context, host, panelId)) return;
  context.respond(200, { panel: host.panels.markExited(panelId) });
}

async function reopenPanel(context: PanelHttpContext, host: PanelHost, panelId: string) {
  const panel = ownedPanel(context, host, panelId);
  if (!panel) return;
  const contract = await context.readGoal(panel.goal_id);
  if (isParentGoal(contract)) {
    context.respond(409, { error: context.text("这是上层 Goal 的历史终端，只能查看。请到具体的子 Goal 继续。") });
    return;
  }
  const opened = host.panels.markOpen(panelId);
  context.respond(200, { panel: opened, spawn: host.spawn(opened) });
}

const PANEL_HANDLERS: Record<string, PanelHandler> = {
  "GET advance-prompt": readAdvancePrompt,
  "GET goal-panels": listGoalPanels,
  "POST goal-panels": openGoalPanel,
  "DELETE panel": closePanel,
  "POST panel-exited": markPanelExited,
  "POST panel-reopen": reopenPanel,
};

/**
 * The Goal terminal's panels and its advance prompt; transport auth and resource lifetime stay with the caller. A refusal answers by its
 * kind and with its code: a path part that is not valid encoding and a custom terminal without a command are invalid (400) like any
 * other mistake of the caller; only a failure with no code of ours goes on to the Host's unhandled answer.
 */
export async function handlePanelHttp(context: PanelHttpContext): Promise<boolean> {
  for (const [name, pattern] of PANEL_PATHS) {
    const match = context.url.pathname.match(pattern);
    if (!match) continue;
    const handler = PANEL_HANDLERS[`${context.method} ${name}`];
    if (!handler) return false;
    try {
      const id = decodeLocalWebPathPart(match[1]);
      await context.withHost((host) => handler(context, host, id));
    } catch (error) {
      respondLocalWebRefusal(context, error);
    }
    return true;
  }
  return false;
}
