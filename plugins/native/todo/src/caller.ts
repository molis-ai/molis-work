import { PERSONAL_SPACE_PROJECT_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The caller's project as far as todos go. The personal space is a location, not a project here: in it, Todo shows
 * personal and unplaced todos, and never writes a todo into a project called "personal".
 */
export function todoCallerProject(caller: Pick<ActionCallContext, "project_id">): string | null {
  return caller.project_id && caller.project_id !== PERSONAL_SPACE_PROJECT_ID ? caller.project_id : null;
}
