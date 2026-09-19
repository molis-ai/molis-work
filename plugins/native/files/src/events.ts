/**
 * Event ids Files listens to.
 *
 * Both publishers' ids come from Contracts rather than from their packages: a
 * Plugin may not import another Plugin, and naming an id is not the same as
 * depending on its implementation.
 */
export {
  CODING_FILE_CHANGED_EVENT,
  CODING_WORKSPACE_INVALIDATED_EVENT,
  GIT_FILE_CHANGED_EVENT,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
