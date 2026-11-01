import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "./goal-application.js";

// A Goal's terminal is started by Goals over `services.terminal`; the `/pty` channel only attaches (S-103 ⑦, T-148). A test that needs a
// real running terminal in a project links a folder to the project, makes a Goal and asks Goals' route to start the program.

/** Goals' terminals route for a Goal of a project (the Host's path; prefix the server's origin). */
export const goalTerminalsPath = (projectId: string, goalId: string, key?: string) =>
  `/projects/${encodeURIComponent(projectId)}/api/plugins/io.molis.work.goals/goals/${encodeURIComponent(goalId)}/terminals${key === undefined ? "" : `/${encodeURIComponent(key)}`}`;

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
