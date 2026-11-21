import type { ArtifactReference } from "../modules/artifact-reference.js";
import type { ActionSubject } from "./action-subject.js";

/**
 * What the materials panel, the picker, "add to task", a citation and a provenance line all call one thing
 * (specs/shared-sources-and-surfaces §2). A reference names a material and says nothing about who may read it: no owner, no project,
 * no installation. Those come from the call context and the action catalog, and what shows beside a reference is read at the moment
 * it shows (`MaterialOrigin`), so a revoked or deleted material cannot answer from an old copy.
 *
 * Kept in a file with no other imports than the ones named here: the declarations a sandboxed plugin is compiled against (`SANDBOX_SDK_CONTRACT_DECLARATIONS`) copy this file, not its owner's whole contract.
 */
export type MaterialPin =
  /** The file as it is now; `read_revision` is the revision read, for telling the person it has moved on since. For a local file that is the sha256 of its bytes or `size:<bytes>`, which `assertMaterialRef` checks. */
  | { mode: "current"; read_revision: string }
  /** A fixed version in the 成果库. */
  | { mode: "fixed"; version: ArtifactReference }
  /** A snapshot or selection: a process item, which never enters the 成果库. */
  | { mode: "snapshot"; version: ArtifactReference };

/** Where in the material a selection falls, in the terms `horizontal/knowledge` uses for its anchors and 1-based lines. */
export interface MaterialRange { anchor?: string; line?: number; length?: number; page?: number }

export interface MaterialRef {
  /** The identity its owner gives. A local file is `WORKSPACE_FILE_SUBJECT_KIND` with id `<workspace_id>:<relative path>`. */
  subject: ActionSubject;
  pin: MaterialPin;
  range?: MaterialRange;
}
