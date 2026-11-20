/**
 * One kind of ledger edge from a Plugin's object to an exact 成果 version, as the Plugin's Manifest declares it (`artifacts.links`).
 * Only edges from the declaring Plugin's own objects count for the kind (`source.module` is `plugins`, `source.plugin_id` is the Plugin). The 成果库 reads links by these kinds and names none of its own (ac-artifacts A3, PG-077); 「被谁引用」 lists them
 * under the declaring Plugin (BL-646).
 */
export interface ArtifactLinkKind {
  /** The declaring Plugin's surface, where its object opens. */
  readonly surface: string;
  readonly plugin_id: string;
  readonly plugin_title: string;
  readonly role: "input" | "output";
  readonly proposal: boolean;
}

/** The kinds the Host knows, by kind name; empty where no Plugin declares any (Goals absent), which reads as no links. */
export type ArtifactLinkKinds = ReadonlyMap<string, ArtifactLinkKind>;

/** The declared kind of an edge, when it comes from an object of the Plugin that declared it. */
export function linkKindOf(kinds: ArtifactLinkKinds | undefined, edge: { type: string; source: { module: string; plugin_id?: string } }): ArtifactLinkKind | null {
  const kind = kinds?.get(edge.type);
  return kind && edge.source.module === "plugins" && kind.plugin_id === edge.source.plugin_id ? kind : null;
}
