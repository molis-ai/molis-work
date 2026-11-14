/** Goal-owned confirmation receipt. A locator is not automatically an Artifact identity. */
export interface GoalInputBindingRecord {
  binding_id: string;
  project_id: string;
  goal_id: string;
  input_name: string;
  source_type: string;
  source_ref: string;
  snapshot_digest: string | null;
  state: "proposed" | "confirmed" | "inactive";
  reason: string;
  created_by: string;
  created_at: string;
}

export interface GoalInputBindingsApi {
  list(projectId: string): GoalInputBindingRecord[];
  register(input: GoalInputBindingRecord): void;
  /** Ends a binding; the receipt stays in history as `inactive`. Returns false when it was already inactive. */
  deactivate?(projectId: string, bindingId: string): boolean;
  /** The person accepts an input that was only proposed: `proposed` becomes `confirmed`. Returns false when the binding is not `proposed`. */
  accept?(projectId: string, bindingId: string): boolean;
}

/** A Plugin object bound to a Goal (source_type `plugin_object`): the owner's subject kind and id, in the Goal's project. */
export const GOAL_PLUGIN_OBJECT_SOURCE = "plugin_object";
export function goalPluginObjectRef(subject: { kind: string; id: string }): string {
  return JSON.stringify([subject.kind, subject.id]);
}
/**
 * A version the platform's materials service fixed (a snapshot or a quote of a project-folder file, source_type `material_snapshot`),
 * kept by its opaque process-item id and version only: never a path. What file it stands for is read back from that version under the
 * reader's own authority (`materials.pinned`).
 */
export const GOAL_MATERIAL_SNAPSHOT_SOURCE = "material_snapshot";
export function goalMaterialSnapshotRef(version: { artifact_id: string; version: number }): string {
  return JSON.stringify([version.artifact_id, version.version]);
}
export function parseGoalMaterialSnapshotRef(ref: string): { artifact_id: string; version: number } | null {
  try {
    const value: unknown = JSON.parse(ref);
    return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && value[0] && Number.isSafeInteger(value[1]) && value[1] > 0
      ? { artifact_id: value[0], version: value[1] } : null;
  } catch { return null; }
}
export function parseGoalPluginObjectRef(ref: string): { kind: string; id: string } | null {
  try {
    const value: unknown = JSON.parse(ref);
    return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string" && value[0] && value[1] ? { kind: value[0], id: value[1] } : null;
  } catch { return null; }
}
