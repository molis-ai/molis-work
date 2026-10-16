/**
 * A project looked up by id where "no such project" is an answer (a title, an existence check, a brief), not a failure. Only
 * the catalog's own `catalog.project_not_found` reads as absent; any other error (the catalog cannot be opened or read) goes to
 * the caller, so a broken catalog is not shown as a project that was deleted (W5-13).
 */
export function projectOrNull<T>(catalog: { getProject(projectId: string): T }, projectId: string): T | null {
  try { return catalog.getProject(projectId); }
  catch (error) {
    if ((error as { code?: unknown } | null)?.code === "catalog.project_not_found") return null;
    throw error;
  }
}
