import type { PlanningMethodPack } from "../contract/goals.js";
import type { DeclaredPageRouteMatch } from "@molis-ai/molis-work-plugin-sdk";
import { goalsPlanningRouteOf, selectGoalsPlanningPageMethod, type GoalsPlanningRoute } from "../planning-routes.js";

export interface GoalsPlanningPageOwners {
  methods: readonly PlanningMethodPack[];
  library(): string;
  method(value: PlanningMethodPack | null, mode: "detail" | "edit" | "new"): string;
}

/** The Host could not read the methods the page needs; the person is told, and the page is not drawn. */
export interface GoalsPlanningRefusal { status: 400; error: string }

/** HTTP-neutral read composition of the Host's match of a planning route; Host supplies scoped methods and mounted UI owners. */
export async function renderPlanningRequest(
  method: string | undefined, match: DeclaredPageRouteMatch | null, scope: "personal" | "project",
  load: (route: GoalsPlanningRoute) => GoalsPlanningPageOwners | GoalsPlanningRefusal | Promise<GoalsPlanningPageOwners | GoalsPlanningRefusal>,
  translate: (text: string) => string,
): Promise<{ status: 200; html: string } | GoalsPlanningRefusal | { status: 404; error: string } | null> {
  if (method !== "GET") return null;
  const route = goalsPlanningRouteOf(match);
  if (!route) return null;
  if ("rejected" in route) return { status: 404, error: translate(scope === "project" ? "找不到这个项目方法" : "找不到这套规划方法") };
  const owner = await load(route);
  if ("error" in owner) return owner;
  if (route.kind === "library") return { status: 200, html: owner.library() };
  const selected = selectGoalsPlanningPageMethod(route, owner.methods, scope, translate);
  return "error" in selected ? selected : { status: 200, html: owner.method(selected.method, route.mode) };
}
