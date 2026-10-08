import type { ProjectDeletedOwner } from "./project-deleted-hooks.js";

/**
 * The owners whose data of a project is plain files in the Home: the personal libraries partitioned by `project_id`.
 * Any process on the Home can clear them, so every catalog starts with these; owners that need a running service
 * (runtimes, the search index, the Agent runtime) register themselves when that service exists.
 */
export function homeProjectOwners(_home: string): ProjectDeletedOwner[] {
  return [];
}
