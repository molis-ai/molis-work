import { matchGoalsPlanningRoute, selectGoalsPlanningPageMethod, type GoalsPlanningRoute } from "@molis-ai/molis-work-plugin-goals";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";

export interface WorkbenchPlanningPageOwners {
  methods: readonly PlanningMethodPack[];
  library(): string;
  method(value: PlanningMethodPack | null, mode: "detail" | "edit" | "new"): string;
}

/** HTTP-neutral read composition; Host supplies scoped methods and mounted UI owners. */
export function renderWorkbenchPlanningRequest(
  method: string | undefined, pathname: string, scope: "personal" | "project",
  load: (route: GoalsPlanningRoute) => WorkbenchPlanningPageOwners,
  translate: (text: string) => string,
): { status: 200; html: string } | { status: 404; error: string } | null {
  if (method !== "GET") return null;
  const route = matchGoalsPlanningRoute(pathname, scope);
  if (!route) return null;
  const owner = load(route);
  if (route.kind === "library") return { status: 200, html: owner.library() };
  const selected = selectGoalsPlanningPageMethod(route, owner.methods, scope, translate);
  return "error" in selected ? selected : { status: 200, html: owner.method(selected.method, route.mode) };
}
