export interface RevisionMeta {
  version: number;
  parentVersion?: number;
  actorId: string;
  reason: string;
  createdAt: string;
}

export interface VersionedRef {
  kind: "direction" | "idea" | "mvp_scope" | "pulse_report" | "lens_report";
  id: string;
  version: number;
}

export interface TargetRef {
  object: VersionedRef;
  panel?: "brief" | "market" | "cost" | "decision" | "pulse";
  blockId?: string;
  quotedSnapshot?: string;
}
