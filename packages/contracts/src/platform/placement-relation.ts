import type { TextRef } from "./ui-text.js";

/**
 * A relation between an object and a target its owner keeps (a document's Goal, the work item that holds it), which placement lists, binds and
 * releases for the person (PG-032; 「挂到…」, specs/plugin-equal-standing/contract-design.md §2.2). Each action of the owner says which part it
 * plays with `placement_relation`; placement finds them in the directory by that declaration, never by a capability id, so the relation's
 * owner is whoever declares it. `target` is on the `list` role only: the subject kind of the other end and the noun a person reads it by
 * (`noun_text` when the owner's words have it, `noun` as written otherwise).
 *
 * Kept in a file with no other imports than the ones named here: the declarations a sandboxed plugin is compiled against (`SANDBOX_SDK_CONTRACT_DECLARATIONS`) copy this file, not its owner's whole contract.
 */
export const PLACEMENT_RELATION_ROLES = ["list", "bind", "release", "candidates", "create"] as const;
export type PlacementRelationRole = (typeof PLACEMENT_RELATION_ROLES)[number];
export interface PlacementRelationTarget {
  readonly kind: string; readonly noun: string; readonly noun_text?: TextRef;
  /** The owner's view of a target that lists what is attached to it; after 「挂到…」 the shell opens the target there (M3). */
  readonly open_view?: string;
}
export interface PlacementRelationDeclaration {
  readonly relation: string;
  readonly role: PlacementRelationRole;
  readonly target?: PlacementRelationTarget;
}
