/**
 * The receipt of one Git operation, as a Contract.
 *
 * Published as an Artifact rather than kept in the view, because the thing that
 * asked for the operation is usually not the thing looking at Git when it
 * finishes — a Coding Run asks for a commit and needs to learn how it went.
 */
export {
  GIT_RESULT_SCHEMA_VERSION,
  GIT_RESULT_TYPE,
  mayHaveChangedFiles,
  parseGitResult,
  type GitOperationResult,
  type GitResultOutcome,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
