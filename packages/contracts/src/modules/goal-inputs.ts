/** Goal-owned confirmation receipt. A locator is not automatically an Artifact identity. */
export interface GoalInputBindingRecord {
  binding_id: string;
  board_id: string;
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
  list(boardId: string): GoalInputBindingRecord[];
  register(input: GoalInputBindingRecord): void;
  /** Ends a binding; the receipt stays in history as `inactive`. Returns false when it was already inactive. */
  deactivate?(boardId: string, bindingId: string): boolean;
}

/** A Plugin object bound to a Goal (source_type `plugin_object`): the owner's subject kind and id, in the Goal's project. */
export const GOAL_PLUGIN_OBJECT_SOURCE = "plugin_object";
export function goalPluginObjectRef(subject: { kind: string; id: string }): string {
  return JSON.stringify([subject.kind, subject.id]);
}
export function parseGoalPluginObjectRef(ref: string): { kind: string; id: string } | null {
  try {
    const value: unknown = JSON.parse(ref);
    return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string" && value[0] && value[1] ? { kind: value[0], id: value[1] } : null;
  } catch { return null; }
}
