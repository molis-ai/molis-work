import { defineErrorCodes } from "../platform/action-errors.js";

/** Why a project directory was refused (specs/shared-sources-and-surfaces §3, §4). */
export const projectDirectoryErrors = defineErrorCodes("projects", {
  /** The folder could not be verified by realpath (it is gone or unreadable), or it has stopped being there. */
  directory_missing: "not_found",
  /** The folder is no longer granted to this project. */
  directory_revoked: "forbidden",
  /** The path is already another folder's row; two rows are never merged. */
  directory_duplicate: "conflict",
});
