import { defineErrorCodes } from "../platform/action-errors.js";

/** Why a project directory was refused (specs/shared-sources-and-surfaces §3, §4). */
export const projectDirectoryErrors = defineErrorCodes("projects", {
  /** The folder could not be verified by realpath (it is gone or unreadable), or it has stopped being there. */
  directory_missing: "not_found",
  /** The folder is no longer granted to this project. */
  directory_revoked: "forbidden",
  /** The path is already another folder's row; two rows are never merged. */
  directory_duplicate: "conflict",
  /** The id is not a directory of this project, and no folder has been named for it here (specs/shared-sources-and-surfaces §3). details: source_workspace_id, path. */
  directory_unmapped: "not_found",
  /**
   * The folder is only an input: nothing writes in it and nothing runs in it — no terminal, no Character, no Agent write (SSC-15;
   * user 2026-11-08). details: workspace_id. Message: 这个目录只作输入，设为输出目录后才能写入或在里面运行.
   */
  directory_input_only: "forbidden",
});

/** `directory_input_only` with the same words and details wherever a write or a run in an input folder is refused. */
export const directoryInputOnly = (workspaceId: string) =>
  projectDirectoryErrors.directory_input_only("这个目录只作输入，设为输出目录后才能写入或在里面运行", { workspace_id: workspaceId });
