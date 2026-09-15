import { createHash } from "node:crypto";
import path from "node:path";
import type { WorkSessionQueryApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ProjectWorkspaceDirectoryRecord, ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeHostApi } from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { ProjectOperationsData, ProjectOperationsProject, ProjectSessionRecord, ProjectWorkspaceRecord } from "./types.js";

export interface WorkSessionViewInput {
  projectId: string;
  sessions: WorkSessionQueryApi;
  runtime: Pick<RuntimeHostApi, "capabilities">;
  goals: readonly { goal_id: string; title: string }[];
  allGoals: readonly { goal_id: string; title: string }[];
  projects: readonly ProjectOperationsProject[];
  catalogWorkspaces: readonly ProjectWorkspaceDirectoryRecord[];
  supportedRuntimeIds: readonly string[];
  runtimeTitle(runtimeId: string): string;
  normalizeWorkspace(path: string): Pick<ProjectWorkspaceRef, "workspace_id" | "canonical_path"> | null | undefined;
  workspaceExists(path: string): boolean;
}

/** Product projection only: fact owners supply public queries; Host supplies filesystem observations. */
export function buildWorkSessionView(input: WorkSessionViewInput): ProjectOperationsData {
  const { projectId, projects, catalogWorkspaces, runtimeTitle: sessionRuntimeDisplayName } = input;
  const goalTitles = new Map(
    input.allGoals.map((goal) => [goal.goal_id, goal.title] as const),
  );
  const records = input.sessions.list({ project_id: projectId });
  const sessions: ProjectSessionRecord[] = records.map((session) => {
    const history = input.sessions.goalHistory(session.session_id);
    const capabilities = input.runtime.capabilities(session.runtime_id);
    const mode = session.native_runtime_session_id
      && capabilities.read === "native"
      ? "native"
      : input.sessions.eventCount(session.session_id) > 0
        ? "fallback"
        : "unavailable";
    return {
      id: session.session_id,
      title: session.title || goalTitles.get(session.current_goal_id ?? "") || `${sessionRuntimeDisplayName(session.runtime_id)} Session`,
      runtime: sessionRuntimeDisplayName(session.runtime_id),
      runtimeId: session.runtime_id,
      contentMode: mode,
      resumeMode: session.native_runtime_session_id ? capabilities.resume : "unsupported",
      state: session.status === "closed" ? "archived" : "idle",
      currentGoalId: session.current_goal_id,
      currentGoal: session.current_goal_id ? goalTitles.get(session.current_goal_id) ?? session.current_goal_id : null,
      goalHistory: history
        .filter((link) => link.relation === "history")
        .map((link) => goalTitles.get(link.goal_id) ?? link.goal_id),
      workspace: session.workspace_path || "未关联工作目录",
      workspacePath: session.workspace_path,
      updated: formatSessionTimestamp(session.updated_at),
      updatedAt: session.updated_at,
      summary: mode === "native"
        ? "可按需读取原 Runtime 的结构化执行历史，并合并 Molis Work TUI 记录。"
        : mode === "fallback"
          ? "当前显示 Molis Work 已持久化的 TUI 与执行事实。"
          : "这条 Session 的 Runtime 暂不提供内容读取能力。",
    };
  });

  const byPath = new Map<string, {
    catalog: ProjectWorkspaceDirectoryRecord | null;
    sessions: typeof records;
    canonicalPath: string;
  }>();
  for (const workspace of catalogWorkspaces) {
    byPath.set(workspace.canonical_path, {
      catalog: workspace,
      sessions: [],
      canonicalPath: workspace.canonical_path,
    });
  }
  for (const record of records) {
    if (!record.workspace_path) continue;
    const normalized = input.normalizeWorkspace(record.workspace_path);
    if (!normalized) continue;
    const grouped = byPath.get(normalized.canonical_path) ?? {
      catalog: null,
      sessions: [],
      canonicalPath: normalized.canonical_path,
    };
    grouped.sessions.push(record);
    byPath.set(normalized.canonical_path, grouped);
  }
  const workspaces: ProjectWorkspaceRecord[] = [...byPath.values()].map(({ catalog, sessions: linked, canonicalPath }) => {
    const workspacePath = canonicalPath;
    const workspaceIds = new Set(
      [catalog?.workspace_id, ...linked.map((item) => item.workspace_id)].filter((value): value is string => Boolean(value)),
    );
    const state: ProjectWorkspaceRecord["state"] = !input.workspaceExists(workspacePath)
      ? "missing"
      : workspaceIds.size > 1
        ? "conflict"
        : "healthy";
    const lastUpdated = [catalog?.updated_at, ...linked.map((item) => item.updated_at)]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? "";
    return {
      id: catalog?.workspace_id
        ?? input.normalizeWorkspace(workspacePath)?.workspace_id
        ?? `workspace-path-${createHash("sha256").update(workspacePath).digest("hex").slice(0, 16)}`,
      name: catalog?.display_name ?? (path.basename(workspacePath) || workspacePath),
      path: workspacePath,
      state,
      sessionCount: linked.length,
      runtimes: [...new Set(linked.map((item) => sessionRuntimeDisplayName(item.runtime_id)))].join("、") || "尚未启动",
      updated: formatSessionTimestamp(lastUpdated),
      updatedAt: lastUpdated,
      projectLinked: Boolean(catalog?.project_ids.includes(projectId)),
      projectCount: catalog?.project_ids.length ?? 0,
      sessions: linked.map((session) => ({
        id: session.session_id,
        title: session.title || goalTitles.get(session.current_goal_id ?? "") || `${sessionRuntimeDisplayName(session.runtime_id)} Session`,
        runtime: sessionRuntimeDisplayName(session.runtime_id),
        state: session.status === "closed" ? "已归档" : "可查看",
        updated: formatSessionTimestamp(session.updated_at),
      })),
      summary: state === "healthy"
        ? catalog
          ? "路径可访问，项目关系与已知 Session 均可追溯。"
          : "路径正被当前项目的 Session 使用；尚未建立独立项目关系。"
        : state === "missing"
          ? "原路径当前不可访问；修复只会更新 Molis Work 记录。"
          : "同一路径存在多个 workspace identity，需要确认关联。",
    };
  });
  const runtimeIds = [...new Set([...input.supportedRuntimeIds, ...records.map((item) => item.runtime_id)])];
  return {
    sessions,
    workspaces,
    goals: input.goals.map((goal) => ({ goal_id: goal.goal_id, title: goal.title })),
    projects: projects.map((project) => ({ project_id: project.project_id, display_name: project.display_name })),
    runtimes: runtimeIds.map((runtimeId) => ({
      runtime_id: runtimeId,
      display_name: sessionRuntimeDisplayName(runtimeId),
      capabilities: input.runtime.capabilities(runtimeId),
    })),
  };
}

function formatSessionTimestamp(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}
