import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "./goal-application.js";

// Object work terminals are owned by the platform (`system.work-terminal`, PEQ-17); the `/pty` channel only attaches (S-103 ⑦, T-148).
// A test that needs a real running terminal in a project links a folder to the project, makes an object and calls `/api/work-terminals`.

/** Platform work-terminals route for any plugin object of a project (prefix the server's origin). */
export const workTerminalsPath = (projectId: string, pluginId: string, kind: string, id: string, suffix?: string) =>
  `/projects/${encodeURIComponent(projectId)}/api/work-terminals/${encodeURIComponent(pluginId)}/${encodeURIComponent(kind)}/${encodeURIComponent(id)}${suffix === undefined ? "" : `/${encodeURIComponent(suffix)}`}`;

/** Platform work-terminals route for a Goal of a project (prefix the server's origin). */
export const goalTerminalsPath = (projectId: string, goalId: string, key?: string) =>
  workTerminalsPath(projectId, "io.molis.work.goals", "goal", goalId, key);

/** A leaf Goal Goals will start a terminal for, written to the project's library as Goals writes it. */
export function addTerminalGoal(project: { database_path: string; project_id: string }, goalId: string): void {
  const store = new LocalProjectDatabase(project.database_path);
  try {
    const application = new GoalProjectApplication(store);
    application.projectOpened(project.project_id);
    application.goals.commands.createGoal(project.project_id, { goal_id: goalId, title: `终端 ${goalId}`, outcome: "有结果", why: "终端归属于一条 Goal",
      business_logic: "可以推进", definition_state: "accepted", decomposition_state: "closed_leaf",
      acceptance_criteria: [{ criterion_id: `${goalId}-done`, statement: "可以验收", decision_method: "inspection", pass_condition: "能判断" }] },
    { actor_id: "test-user", idempotency_key: `terminal-goal-${goalId}` });
  } finally { store.close(); }
}

/** Links `folder` (a real path) to the project as its workspace, where Goals starts the project's terminals. */
export async function linkTerminalFolder(catalog: {
  commit<T>(operation: () => T): Promise<T>;
  addWorkspaceProject(input: { canonical_path: string; project_id: string; actor_id: string; user_confirmed: boolean }): unknown;
}, projectId: string, folder: string): Promise<void> {
  await catalog.commit(() => catalog.addWorkspaceProject({ canonical_path: folder, project_id: projectId, actor_id: "test-user", user_confirmed: true }));
}
