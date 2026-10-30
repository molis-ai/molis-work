/**
 * One kind of ledger edge from a Plugin's object to an exact 成果 version, as the Plugin's Manifest declares it (`artifacts.links`).
 * `module` is the ledger module the declaring Plugin writes edges as (its edges' `source.module`); only edges from that module count
 * for the kind. The 成果库 reads links by these kinds and names none of its own (ac-artifacts A3, PG-077); 「被谁引用」 lists them
 * under the declaring Plugin (BL-646).
 */
export interface ArtifactLinkKind {
  readonly module: string;
  readonly plugin_id: string;
  readonly plugin_title: string;
  readonly role: "input" | "output";
  readonly proposal: boolean;
}

/** The kinds the Host knows, by kind name; empty where no Plugin declares any (Goals absent), which reads as no links. */
export type ArtifactLinkKinds = ReadonlyMap<string, ArtifactLinkKind>;

/** Whether an edge is a plain (not proposed) link of `role` from its declared module. */
export function linkKindOf(kinds: ArtifactLinkKinds | undefined, edge: { type: string; source: { module: string } }): ArtifactLinkKind | null {
  const kind = kinds?.get(edge.type);
  return kind && kind.module === edge.source.module ? kind : null;
}
