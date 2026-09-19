/**
 * The change-set shape is a Contract, owned by the comparison rather than by
 * any producer. Git and Coding conform to what a comparison needs, which is
 * what keeps one surface able to render all of them instead of growing a
 * branch per upstream.
 */
export {
  DIFF_CHANGESET_SCHEMA_VERSION,
  DIFF_CHANGESET_TYPE,
  parseChangeSet,
  type ChangeSet,
  type ChangeSetSource,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
