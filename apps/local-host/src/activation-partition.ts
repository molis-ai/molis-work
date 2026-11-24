import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * The partition an activation's platform records are kept under (specs/unified-partition-plugins §4.1): its project, or the personal space for a
 * Home-level activation (`project_id: null`). No '' stands for "every project shares this": every partition is alike, the personal space included.
 */
export function activationPartition(projectId: string | null | undefined): string {
  return projectId?.trim() ? projectId : PERSONAL_SPACE_PROJECT_ID;
}
