import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoGoals } from "@molis-ai/molis-work-app-local-host";
import { GoalProjectApplication } from "./goal-application.js";
import { buildMolisWorkWebView } from "./web-view.js";

// How `goals-page-golden/view.json` is made (RAC-2680), so it can be made again: the demo project is seeded into a temporary database, one
// Goal-tree proposal is submitted so the pages have a decision waiting, and the page view is read by the real owners. The view then
// carries the clock and the random ids of the run, which are put right: every ISO time becomes one fixed time, the relations (whose order
// follows their random ids) are put in the order of what they say, and every UUID is numbered in order of first appearance. The result is
// the same bytes on every run. Nothing here touches a real Home.
const FIXED_TIME = "2026-10-30T09:00:00.000Z";

const relationKey = (item: { from_goal_id: string; to_goal_id: string; type: string; reason?: string | null }): string =>
  `${item.from_goal_id}|${item.to_goal_id}|${item.type}|${item.reason ?? ""}`;

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([name, inner]) => [name,
      name === "relations" && Array.isArray(inner) ? [...inner].sort((a, b) => relationKey(a).localeCompare(relationKey(b))).map(ordered) : ordered(inner)]));
  }
  return value;
}

/** The view the golden pages are drawn from, as the text of `view.json`. */
export async function recordGoldenView(): Promise<string> {
  const directory = mkdtempSync(join(tmpdir(), "goals-golden-view-"));
  try {
    const databasePath = join(directory, "demo.db");
    await seedDemoGoals(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const coordinator = new GoalProjectApplication(store);
      coordinator.goalTreeSubmission.submitGoalTreeProposal({
        project_id: DEMO_PROJECT_ID, actor_id: "runtime:test:session", root_goal_id: "ONBOARDING", summary: "新增一个等你判断的 Goal",
        items: [{ item_id: "golden-item", kind: "goal", operation: "create",
          payload: { goal_id: "GOLDEN-CHILD", title: "等你判断的子 Goal", outcome: "判断后创建" },
          source_refs: ["runtime"], reason: "用户确认后创建", confidence: 1 }],
        idempotency_key: "golden-proposal",
      });
      const view = buildMolisWorkWebView(store, coordinator, { databasePath, projectId: DEMO_PROJECT_ID, demo: true });
      const ids = new Map<string, string>();
      return JSON.stringify(ordered(JSON.parse(JSON.stringify(view))), null, 1)
        .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, FIXED_TIME)
        .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, id => {
          if (!ids.has(id)) ids.set(id, `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, "0")}`);
          return ids.get(id)!;
        });
    } finally {
      store.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
