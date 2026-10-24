import type { DatabaseSync } from "node:sqlite";
import type { ActionSceneBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord, JudgmentSubject } from "@molis-ai/molis-work-contracts/modules/functions";
import { functionsErrors } from "./keys.js";

/** What a judgment record is written from; the id and time are the store's. */
export interface RecordJudgmentInput {
  function_key: string;
  function_version: number;
  subject: JudgmentSubject;
  scene_id: string | null;
  outcome: JudgmentRecord["outcome"];
  suggested_behavior_ids: readonly string[];
  error_code: string | null;
  scene_provenance?: JudgmentRecord["scene_provenance"];
  recommended_actions?: JudgmentRecord["recommended_actions"];
}

export function getActionSceneBinding(db: DatabaseSync, sceneId: string, projectId: string): ActionSceneBinding | null {
  const row = db.prepare("SELECT action_binding_json, binding_revision FROM function_scene_bindings WHERE scene_id = ? AND project_id = ?")
    .get(sceneId, projectId) as { action_binding_json: string; binding_revision: string } | undefined;
  return row ? { ...JSON.parse(row.action_binding_json) as ActionSceneBinding, revision: row.binding_revision } : null;
}

export function setActionSceneBinding(db: DatabaseSync, projectId: string, binding: ActionSceneBinding, expectedRevision?: string | null): ActionSceneBinding {
  const reference: ActionSceneBinding = { binding_id: binding.binding_id, scene_id: binding.scene_id, scene_version: binding.scene_version,
    project_id: binding.project_id, function: { capability_id: binding.function.capability_id, version: binding.function.version,
      ...(binding.function.provider_id ? { provider_id: binding.function.provider_id } : {}) },
    enabled: binding.enabled, title: binding.title, ...(binding.href ? { href: binding.href } : {}) };
  const revision = crypto.randomUUID();
  const at = new Date().toISOString();
  const json = JSON.stringify(reference);
  const written = expectedRevision === undefined ? db.prepare(`INSERT INTO function_scene_bindings (scene_id, project_id, action_binding_json, binding_revision, updated_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(scene_id, project_id) DO UPDATE SET
    action_binding_json=excluded.action_binding_json, binding_revision=excluded.binding_revision, updated_at=excluded.updated_at`)
    .run(binding.scene_id, projectId, json, revision, at)
    : expectedRevision === null ? db.prepare(`INSERT INTO function_scene_bindings (scene_id, project_id, action_binding_json, binding_revision, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(scene_id, project_id) DO NOTHING`).run(binding.scene_id, projectId, json, revision, at)
      : db.prepare(`UPDATE function_scene_bindings SET action_binding_json = ?, binding_revision = ?, updated_at = ?
        WHERE scene_id = ? AND project_id = ? AND binding_revision = ?`)
        .run(json, revision, at, binding.scene_id, projectId, expectedRevision);
  if (written.changes !== 1 && written.changes !== 1n) throw functionsErrors.conflict("配置已变化，请刷新后再试");
  return { ...reference, revision };
}

export function recordJudgment(db: DatabaseSync, input: RecordJudgmentInput): JudgmentRecord {
  const record: JudgmentRecord = {
    judgment_id: crypto.randomUUID(),
    function_key: input.function_key,
    function_version: input.function_version,
    subject: input.subject,
    scene_id: input.scene_id,
    outcome: input.outcome,
    suggested_behavior_ids: [...input.suggested_behavior_ids],
    error_code: input.error_code,
    created_at: new Date().toISOString(),
    ...(input.scene_provenance ? { scene_provenance: input.scene_provenance } : {}),
    ...(input.recommended_actions?.length ? { recommended_actions: input.recommended_actions } : {}),
  };
  db.prepare(`
    INSERT INTO function_judgments (
      judgment_id, function_key, function_version, subject_kind, subject_id, project_id,
      scene_id, outcome, suggested_json, error_code, created_at, scene_provenance_json, recommended_actions_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.judgment_id,
    record.function_key,
    record.function_version,
    record.subject.kind,
    record.subject.id,
    record.subject.project_id ?? "",
    record.scene_id,
    record.outcome,
    JSON.stringify(record.suggested_behavior_ids),
    record.error_code,
    record.created_at,
    record.scene_provenance ? JSON.stringify(record.scene_provenance) : null,
    record.recommended_actions ? JSON.stringify(record.recommended_actions) : null,
  );
  return record;
}

export function listJudgments(db: DatabaseSync): JudgmentRecord[] {
  const rows = db.prepare(
    "SELECT * FROM function_judgments ORDER BY created_at DESC, rowid DESC",
  ).all() as Record<string, unknown>[];
  return rows.map(mapJudgment);
}

export function latestSceneJudgments(db: DatabaseSync, projectId: string, sceneId: string): JudgmentRecord[] {
  const rows = db.prepare(`
    SELECT * FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY subject_kind, subject_id ORDER BY created_at DESC, rowid DESC) AS subject_rank
      FROM function_judgments WHERE project_id = ? AND scene_id = ?
    ) WHERE subject_rank = 1 ORDER BY created_at DESC
  `).all(projectId, sceneId) as Record<string, unknown>[];
  return rows.map(mapJudgment);
}

export function latestJudgment(db: DatabaseSync, kind: JudgmentSubject["kind"], id: string, projectId?: string, sceneId?: string | null): JudgmentRecord | null {
  const board = projectId ?? "";
  const row = sceneId
    ? db.prepare(`
        SELECT * FROM function_judgments
        WHERE subject_kind = ? AND subject_id = ? AND (? = '' OR project_id = ?) AND scene_id = ?
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `).get(kind, id, board, board, sceneId) as Record<string, unknown> | undefined
    : db.prepare(`
        SELECT * FROM function_judgments
        WHERE subject_kind = ? AND subject_id = ? AND (? = '' OR project_id = ?)
        ORDER BY created_at DESC, rowid DESC
        LIMIT 1
      `).get(kind, id, board, board) as Record<string, unknown> | undefined;
  return row ? mapJudgment(row) : null;
}

function mapJudgment(row: Record<string, unknown>): JudgmentRecord {
  let suggested: string[] = [];
  try {
    const parsed = JSON.parse(String(row.suggested_json ?? "[]")) as unknown;
    if (Array.isArray(parsed)) suggested = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    suggested = [];
  }
  const projectId = String(row.project_id ?? "");
  return {
    judgment_id: String(row.judgment_id ?? ""),
    function_key: String(row.function_key ?? ""),
    function_version: Number(row.function_version ?? 0),
    subject: {
      kind: String(row.subject_kind ?? "mcp_invoke") as JudgmentSubject["kind"],
      id: String(row.subject_id ?? ""),
      ...(projectId ? { project_id: projectId } : {}),
    },
    scene_id: row.scene_id == null || row.scene_id === "" ? null : String(row.scene_id),
    outcome: row.outcome === "needs_review" ? "needs_review" : "ok",
    suggested_behavior_ids: suggested,
    error_code: row.error_code == null || row.error_code === "" ? null : String(row.error_code),
    created_at: String(row.created_at ?? ""),
    ...(row.scene_provenance_json ? { scene_provenance: JSON.parse(String(row.scene_provenance_json)) as JudgmentRecord["scene_provenance"] } : {}),
    ...(row.recommended_actions_json ? { recommended_actions: JSON.parse(String(row.recommended_actions_json)) as JudgmentRecord["recommended_actions"] } : {}),
  };
}
