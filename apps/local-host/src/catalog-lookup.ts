import { hostLog } from "./host-log.js";

/**
 * A project looked up by id where "no such project" is an answer (a title, an existence check, a brief), not a failure. Only
 * the catalog's own `catalog.project_not_found` reads as absent. Any other error (the catalog cannot be opened or read) is
 * written to the Host log here, once at its source, and goes to the caller, whose edge answers it as its usual 500: a broken
 * catalog is not shown as a project that was deleted (W5-13).
 */
export function projectOrNull<T>(catalog: { getProject(projectId: string): T }, projectId: string): T | null {
  try { return catalog.getProject(projectId); }
  catch (error) {
    if ((error as { code?: unknown } | null)?.code === "catalog.project_not_found") return null;
    hostLog.error("projects", "catalog_lookup_failed", error);
    throw error;
  }
}
