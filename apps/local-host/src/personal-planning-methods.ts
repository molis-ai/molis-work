import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { realpathSync } from "node:fs";
import path from "node:path";
import { PersonalPlanningMethods } from "@molis-ai/molis-work-plugin-goals/module";
import type { PlanningMethodPack } from "@molis-ai/molis-work-contracts/modules/goals";
import { resolveConfiguredHome } from "./product-home.js";

/** Read a personal library without provisioning or upgrading a catalog. */
export function readPersonalPlanningMethodPacks(homeDirectory?: string): PlanningMethodPack[] {
  const databasePath = path.join(resolveConfiguredHome(homeDirectory), "projects", "catalog.db");
  // No catalog yet means no personal library yet; this read never creates one.
  try { realpathSync(databasePath); }
  catch { return []; }
  const storage = new LocalSqliteStorage(databasePath, { readonly: true });
  try { return new PersonalPlanningMethods(storage.db).list(); }
  finally { storage.close(); }
}
