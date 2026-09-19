/**
 * Path handling is a Contract, not a Files-private rule.
 *
 * Diff, Git and Coding all carry workspace-relative paths, and all of them must
 * refuse the same unsafe segments. One shared parser is the only way that stays
 * true; four copies drift the moment one of them is relaxed.
 */
export {
  FILE_PATH_MAX_SEGMENTS,
  FILE_SEGMENT_MAX_LENGTH,
  WorkspaceArtifactError as FilePathError,
  parseFilePath,
  pathKey,
  pathLabel,
  samePath,
} from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
