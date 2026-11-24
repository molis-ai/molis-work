import { projectCatalogErrors as catalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";
import { PERSONAL_SPACE_PROJECT_ID } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * S-personal-partition-reserved (specs/unified-partition-plugins §4.1, C2): `personal` is the personal space, which Home initialization makes and
 * nothing else may. Creating a project, importing or copying one, receiving one by sync, sharing one, renaming, recycling and deleting all ask
 * this one guard; the personal space's own provisioning is the single caller that passes `reserved`.
 */
export function assertOrdinaryPartition(partitionId: string | undefined, what: string): void {
  if (partitionId?.trim() === PERSONAL_SPACE_PROJECT_ID) throw catalogErrors.personal_space(`个人空间是保留的，${what}`);
}
