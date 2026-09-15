import { realpathSync } from "node:fs";
import path from "node:path";
import { readPersonalPlanningMethods } from "@molis-ai/molis-work-module-goals";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import { resolveConfiguredHome } from "./product-home.js";

/** Read a personal library without provisioning or upgrading a catalog. */
export function readPersonalPlanningMethodPacks(homeDirectory?: string): PlanningMethodPack[] {
  const databasePath = path.join(resolveConfiguredHome(homeDirectory), "projects", "catalog.db");
  try { realpathSync(databasePath); }
  catch { return []; }
  return readPersonalPlanningMethods(databasePath);
}
