import type { DesktopPanelApi, DesktopPanelRecord } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { GoalRecord } from "@molis-ai/molis-work-contracts/modules/goals";

interface PanelSpawnSpec {
  command: string;
  args: string[];
  cwd: string | null;
  env: Record<string, string>;
  sessionId: string | null;
}

interface WorkPanelHost {
  panels: DesktopPanelApi;
  preferredWorkspacePath(projectId: string): string | null;
  sessionIds(panelIds: readonly string[]): Promise<Map<string, string>>;
  spawn(panel: DesktopPanelRecord, sessionId: string | null): PanelSpawnSpec;
}

export interface WorkPanelHttpContext {
  method: string | undefined;
  url: URL;
  projectId: string;
  text(value: string): string;
  readBody(): Promise<Record<string, unknown>>;
  respond(status: number, value: unknown): void;
  withHost<T>(operation: (host: WorkPanelHost) => Promise<T>): Promise<T>;
  readGoal(goalId: string): Pick<GoalRecord, "title" | "decomposition_state"> & { event_work?: boolean; event_facts?: string };
  readLinkedFeedContext(goalId: string, itemId?: string): { source_context: string } | null;
  projectGuidance(): string;
  isRuntimeKind(kind: string): boolean;
  launchSpec(input: { runtime_kind: string; command?: string; args?: string[]; resume_session_id?: string | null }): {
    runtime_kind: string; command: string; args: string[]; title: string;
  };
  advancePrompt(input: { goal_id: string; title: string; source_context?: string; project_guidance_prefix?: string; onboarding?: boolean; event_work?: boolean; current_facts?: string }): string;
  kill(panelId: string): void;
  classifyError(error: unknown): number | null;
}

/** Existing Work terminal HTTP product flow; transport auth and resource lifetime stay in Host. */
export async function handleWorkPanelHttp(context: WorkPanelHttpContext): Promise<boolean> {
  const { method, url, projectId, respond, text: L } = context;
  const panelsMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/panels$/);
  const promptMatch = url.pathname.match(/^\/api\/goals\/([^/]+)\/advance-prompt$/);
  const panelMatch = url.pathname.match(/^\/api\/panels\/([^/]+)$/);
  const exitedMatch = url.pathname.match(/^\/api\/panels\/([^/]+)\/exited$/);
  const reopenMatch = url.pathname.match(/^\/api\/panels\/([^/]+)\/reopen$/);
  if (!panelsMatch && !promptMatch && !panelMatch && !exitedMatch && !reopenMatch) return false;

  try {
    return await context.withHost(async (host) => {
      if (method === "GET" && promptMatch) {
        const goalId = decodeURIComponent(promptMatch[1]);
        const contract = context.readGoal(goalId);
        if (contract.decomposition_state === "closed_compound" && !contract.event_work) {
          respond(409, {
            error: L("这条上层 Goal 由子 Goal 共同完成，不能直接推进。请选择一个具体的子 Goal。"),
          });
          return true;
        }
        const requestedFeedItemId = url.searchParams.get("feed_item_id")?.trim() || null;
        const linkedFeedItem = context.readLinkedFeedContext(goalId, requestedFeedItemId ?? undefined);
        if (requestedFeedItemId && !linkedFeedItem) {
          respond(409, {
            error: L("这条 Item 已不再关联当前 Goal，请返回 Inbox 或 Feed 重新开始处理。"),
          });
          return true;
        }
        const sourceContext = linkedFeedItem
          ? linkedFeedItem.source_context
          : undefined;
        respond(200, {
          goal_id: goalId,
          title: contract.title,
          prompt: context.advancePrompt({
            goal_id: goalId,
            title: contract.title,
            source_context: sourceContext,
            project_guidance_prefix: context.projectGuidance(),
            onboarding: url.searchParams.get("onboarding") === "1",
            event_work: contract.event_work === true,
            current_facts: contract.event_facts,
          }),
        });
        return true;
      }
      if (method === "GET" && panelsMatch) {
        const goalId = decodeURIComponent(panelsMatch[1]);
        const contract = context.readGoal(goalId);
        const panels = host.panels.list(projectId, goalId);
        const sessionIds = await host.sessionIds(panels.map((panel) => panel.panel_id));
        respond(200, {
          panels: panels.map((panel) => ({
            ...panel,
            spawn: host.spawn(panel, sessionIds.get(panel.panel_id) ?? null),
          })),
          read_only: contract.decomposition_state === "closed_compound" && !contract.event_work,
        });
        return true;
      }
      if (method === "POST" && panelsMatch) {
        const goalId = decodeURIComponent(panelsMatch[1]);
        const contract = context.readGoal(goalId);
        if (contract.decomposition_state === "closed_compound" && !contract.event_work) {
          respond(409, {
            error: L("这条上层 Goal 由子 Goal 共同完成，不能直接开终端。请选择一个具体的子 Goal。"),
          });
          return true;
        }
        const body = await context.readBody();
        const runtimeKind = typeof body.runtime_kind === "string" ? body.runtime_kind : "generic";
        if (!context.isRuntimeKind(runtimeKind)) {
          respond(400, { error: "不支持的终端类型" });
          return true;
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
          return true;
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
        const sessionIds = await host.sessionIds([panel.panel_id]);
        respond(200, {
          panel,
          spawn: host.spawn(panel, sessionIds.get(panel.panel_id) ?? null),
        });
        return true;
      }
      if (method === "DELETE" && panelMatch) {
        const panelId = decodeURIComponent(panelMatch[1]);
        const panel = host.panels.get(panelId);
        if (panel.project_id !== projectId) {
          respond(404, { error: "找不到这个终端面板" });
          return true;
        }
        host.panels.close(panelId, "desktop-user");
        context.kill(panelId);
        respond(200, { closed: true, panel_id: panelId });
        return true;
      }
      if (method === "POST" && exitedMatch) {
        const panelId = decodeURIComponent(exitedMatch[1]);
        const panel = host.panels.get(panelId);
        if (panel.project_id !== projectId) {
          respond(404, { error: "找不到这个终端面板" });
          return true;
        }
        respond(200, { panel: host.panels.markExited(panelId) });
        return true;
      }
      if (method === "POST" && reopenMatch) {
        const panelId = decodeURIComponent(reopenMatch[1]);
        const panel = host.panels.get(panelId);
        if (panel.project_id !== projectId) {
          respond(404, { error: "找不到这个终端面板" });
          return true;
        }
        const contract = context.readGoal(panel.goal_id);
        if (contract.decomposition_state === "closed_compound" && !contract.event_work) {
          respond(409, {
            error: L("这是上层 Goal 的历史终端，只能查看。请到具体的子 Goal 继续。"),
          });
          return true;
        }
        const opened = host.panels.markOpen(panelId);
        const sessionIds = await host.sessionIds([opened.panel_id]);
        respond(200, {
          panel: opened,
          spawn: host.spawn(opened, sessionIds.get(opened.panel_id) ?? null),
        });
        return true;
      }
      return false;
    });
  } catch (error) {
    const status = context.classifyError(error);
    if (status !== null) {
      respond(status, { error: (error as Error).message });
      return true;
    }
    if (error instanceof Error) {
      respond(400, { error: error.message });
      return true;
    }
    throw error;
  }
}
