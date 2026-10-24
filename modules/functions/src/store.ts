import type { ActionSceneBinding, ActionSceneReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import type { DatabaseSync } from "node:sqlite";
import {
  FUNCTIONS_DEFAULT_MODEL,
  FUNCTIONS_MAX_SAMPLES,
  type FunctionDraftPatch,
  type FunctionRecord,
  type FunctionSample,
  type FunctionSceneMap,
  type FunctionsPreviewRecord,
  type FunctionsPrimitive,
  type JudgmentRecord,
  type JudgmentSubject,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { hashFunctionConfig } from "./hash.js";
import { seedBuiltinFunctions, type BuiltinRuleSubject } from "./builtin.js";
import {
  getActionSceneBinding, latestJudgment, latestSceneJudgments, listJudgments, recordJudgment, setActionSceneBinding,
  type RecordJudgmentInput,
} from "./judgments.js";
import { functionsErrors, assertFunctionKey, suggestFunctionKey } from "./keys.js";
import {
  assertAvailableKey, uniqueKey, assertPrimitive, assertReadyToPublish, assertSceneReference, defaultCriteria, defaultName, normalizeActionMap,
  normalizeCriteria, normalizeDraftInstructions, normalizeName, normalizeSampleInput, normalizeSampleLabel, normalizeSceneId,
  normalizeSceneMap, normalizeSubjectKinds, pinModel, pruneSceneMap,
} from "./record-rules.js";
import { buildRecord, fromRow, insert, type FunctionRow } from "./record-rows.js";
import { FUNCTIONS_HOME_STORE, FUNCTIONS_STORE_BASELINE } from "./store-schema.js";

/** The next `updated_at` (also the version writes are checked against): always later, even within one millisecond. */
const laterThan = (previous: string) => new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString();

export class FunctionsStore {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
  }

  list(): FunctionRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM functions ORDER BY datetime(updated_at) DESC, name COLLATE NOCASE",
    ).all() as unknown as FunctionRow[];
    return rows.map(fromRow);
  }

  get(id: string): FunctionRecord | null {
    const row = this.db.prepare("SELECT * FROM functions WHERE id = ?").get(id) as FunctionRow | undefined;
    return row ? fromRow(row) : null;
  }

  getByKey(functionKey: string): FunctionRecord | null {
    const row = this.db.prepare("SELECT * FROM functions WHERE function_key = ?").get(functionKey) as FunctionRow | undefined;
    return row ? fromRow(row) : null;
  }

  create(input: { primitive?: FunctionsPrimitive; name?: string; function_key?: string } = {}): FunctionRecord {
    const primitive = assertPrimitive(input.primitive ?? "choice");
    const now = new Date().toISOString();
    const name = normalizeName(input.name ?? defaultName(primitive));
    const function_key = uniqueKey(
      key => this.getByKey(key),
      input.function_key ? assertFunctionKey(input.function_key) : suggestFunctionKey(name, primitive),
    );
    const criteria = defaultCriteria(primitive);
    const record = buildRecord({
      id: crypto.randomUUID(),
      name,
      function_key,
      primitive,
      status: "draft",
      version: null,
      model: FUNCTIONS_DEFAULT_MODEL,
      instructions: "",
      criteria,
      scene_id: null,
      subject_kinds: [],
      scene_map: {},
      last_preview: null,
      samples: [],
      published_at: null,
      created_at: now,
      updated_at: now,
    });
    insert(this.db, record);
    return record;
  }

  createChoice(input: { name?: string; function_key?: string } = {}): FunctionRecord {
    return this.create({ ...input, primitive: "choice" });
  }

  updateDraft(id: string, patch: FunctionDraftPatch, expectedUpdatedAt?: string): FunctionRecord {
    const current = this.require(id);
    if (current.status === "published") {
      throw functionsErrors.published_immutable("已发布的函数不能再改配置");
    }
    const name = patch.name === undefined ? current.name : normalizeName(patch.name);
    const function_key = patch.function_key === undefined
      ? current.function_key
      : assertAvailableKey(key => this.getByKey(key), assertFunctionKey(patch.function_key), current.id);
    const instructions = patch.instructions === undefined ? current.instructions : normalizeDraftInstructions(patch.instructions);
    const criteria = patch.criteria === undefined
      ? current.criteria
      : normalizeCriteria(current.primitive, patch.criteria, false);
    const config_hash = hashFunctionConfig({
      primitive: current.primitive,
      instructions,
      criteria,
      model: current.model,
    });
    const last_preview = current.last_preview?.config_hash === config_hash ? current.last_preview : null;
    const scene_id = patch.scene_id === undefined ? current.scene_id : normalizeSceneId(patch.scene_id, current.primitive);
    const changedScene = scene_id !== current.scene_id;
    const scene_version = patch.scene_version === undefined ? changedScene ? null : current.scene_version ?? null : patch.scene_version;
    const scene_provider_id = patch.scene_provider_id === undefined ? changedScene ? null : current.scene_provider_id ?? null : patch.scene_provider_id;
    assertSceneReference(scene_id, scene_version, scene_provider_id);
    const subject_kinds = patch.subject_kinds === undefined ? current.subject_kinds : normalizeSubjectKinds(patch.subject_kinds);
    const scene_map = patch.scene_map === undefined
      ? pruneSceneMap(current.scene_map, current.primitive, criteria, scene_id)
      : normalizeSceneMap(patch.scene_map, current.primitive, criteria, scene_id);
    const action_map = normalizeActionMap(patch.action_map === undefined ? current.action_map ?? {} : patch.action_map, scene_id, current.primitive, criteria);
    const now = laterThan(current.updated_at);
    const written = this.db.prepare(`
      UPDATE functions
      SET name = ?, function_key = ?, instructions = ?, criteria_json = ?, scene_id = ?, scene_version = ?, scene_provider_id = ?, subject_kinds_json = ?,
          scene_map_json = ?, action_map_json = ?, config_hash = ?, last_preview_json = ?, updated_at = ?
      WHERE id = ? AND status = 'draft' AND updated_at = ?
    `).run(
      name,
      function_key,
      instructions,
      JSON.stringify(criteria),
      scene_id,
      scene_version,
      scene_provider_id,
      JSON.stringify(subject_kinds),
      JSON.stringify(scene_map),
      JSON.stringify(action_map),
      config_hash,
      last_preview ? JSON.stringify(last_preview) : null,
      now,
      id,
      expectedUpdatedAt ?? current.updated_at,
    );
    return this.requireCas(id, written.changes);
  }

  savePreview(id: string, preview: FunctionsPreviewRecord, expectedUpdatedAt?: string): FunctionRecord {
    const current = this.require(id);
    if (preview.config_hash !== current.config_hash) {
      throw functionsErrors.stale_preview("预览结果对不上当前配置，请再试一次");
    }
    const now = laterThan(current.updated_at);
    const written = this.db.prepare(
      "UPDATE functions SET last_preview_json = ?, updated_at = ? WHERE id = ? AND updated_at = ?",
    ).run(JSON.stringify(preview), now, id, expectedUpdatedAt ?? current.updated_at);
    return this.requireCas(id, written.changes);
  }

  addSample(id: string, input: { label?: string; input: string }, expectedUpdatedAt?: string): FunctionRecord {
    const current = this.require(id);
    if (current.samples.length >= FUNCTIONS_MAX_SAMPLES) {
      throw functionsErrors.invalid(`每个函数最多 ${FUNCTIONS_MAX_SAMPLES} 条样例`);
    }
    const sample: FunctionSample = {
      id: crypto.randomUUID(),
      label: normalizeSampleLabel(input.label, current.samples.length),
      input: normalizeSampleInput(input.input),
    };
    return this.writeSamples(current, [...current.samples, sample], expectedUpdatedAt ?? current.updated_at);
  }

  removeSample(id: string, sampleId: string, expectedUpdatedAt?: string): FunctionRecord {
    const current = this.require(id);
    const samples = current.samples.filter((item) => item.id !== sampleId);
    if (samples.length === current.samples.length) {
      throw functionsErrors.not_found("样例不存在");
    }
    return this.writeSamples(current, samples, expectedUpdatedAt ?? current.updated_at);
  }

  publish(id: string, expectedUpdatedAt?: string, scene?: ActionSceneReference): FunctionRecord {
    const current = this.require(id);
    if (current.status === "published") return current;
    assertReadyToPublish(current);
    if (scene && (scene.scene_id !== current.scene_id || current.scene_version && scene.version !== current.scene_version
      || current.scene_provider_id && scene.provider_id !== current.scene_provider_id)) throw functionsErrors.conflict("草稿用途已变化，请重新检查");
    const model = pinModel(current);
    const now = laterThan(current.updated_at);
    const config_hash = hashFunctionConfig({
      primitive: current.primitive,
      instructions: current.instructions,
      criteria: current.criteria,
      model,
    });
    const last_preview = current.last_preview && current.last_preview.config_hash === current.config_hash
      ? { ...current.last_preview, config_hash, model: current.last_preview.model || model }
      : current.last_preview;
    const written = this.db.prepare(`
      UPDATE functions
      SET status = 'published', version = 1, model = ?, config_hash = ?, last_preview_json = ?, published_at = ?, updated_at = ?, scene_version = ?, scene_provider_id = ?
      WHERE id = ? AND status = 'draft' AND updated_at = ?
    `).run(model, config_hash, last_preview ? JSON.stringify(last_preview) : null, now, now, scene?.version ?? current.scene_version ?? null,
      scene?.provider_id ?? current.scene_provider_id ?? null, id, expectedUpdatedAt ?? current.updated_at);
    if (written.changes !== 1) {
      const latest = this.require(id);
      if (latest.status === "published") return latest;
      throw functionsErrors.conflict("草稿已被更新，请刷新后再试");
    }
    return this.require(id);
  }

  deleteDraft(id: string, expectedUpdatedAt?: string): void {
    const current = this.require(id);
    if (current.status === "published") {
      throw functionsErrors.published_immutable("已发布的函数不能删除");
    }
    const written = this.db.prepare(
      "DELETE FROM functions WHERE id = ? AND status = 'draft' AND updated_at = ?",
    ).run(id, expectedUpdatedAt ?? current.updated_at);
    if (written.changes !== 1) {
      throw functionsErrors.conflict("草稿已被更新，请刷新后再试");
    }
  }

  require(id: string): FunctionRecord {
    const record = this.get(id);
    if (!record) throw functionsErrors.not_found("函数不存在");
    return record;
  }

  private requireCas(id: string, changes: number | bigint): FunctionRecord {
    if (changes !== 1 && changes !== 1n) {
      throw functionsErrors.conflict("草稿已被更新，请刷新后再试");
    }
    return this.require(id);
  }

  requirePublishedByKey(functionKey: string): FunctionRecord {
    const record = this.getByKey(functionKey);
    if (!record || record.status !== "published" || record.version == null) {
      throw functionsErrors.not_found("函数不存在");
    }
    return record;
  }


  getActionSceneBinding(sceneId: string, projectId: string): ActionSceneBinding | null {
    return getActionSceneBinding(this.db, sceneId, projectId);
  }

  setActionSceneBinding(projectId: string, binding: ActionSceneBinding, expectedRevision?: string | null): ActionSceneBinding {
    return setActionSceneBinding(this.db, projectId, binding, expectedRevision);
  }

  recordJudgment(input: RecordJudgmentInput): JudgmentRecord {
    return recordJudgment(this.db, input);
  }

  listJudgments(): JudgmentRecord[] {
    return listJudgments(this.db);
  }

  latestSceneJudgments(projectId: string, sceneId: string): JudgmentRecord[] {
    return latestSceneJudgments(this.db, projectId, sceneId);
  }

  latestJudgment(kind: JudgmentSubject["kind"], id: string, projectId?: string, sceneId?: string | null): JudgmentRecord | null {
    return latestJudgment(this.db, kind, id, projectId, sceneId);
  }

  private writeSamples(current: FunctionRecord, samples: readonly FunctionSample[], expectedUpdatedAt: string): FunctionRecord {
    const written = this.db.prepare(
      "UPDATE functions SET samples_json = ?, updated_at = ? WHERE id = ? AND updated_at = ?",
    ).run(JSON.stringify(samples), laterThan(current.updated_at), current.id, expectedUpdatedAt);
    return this.requireCas(current.id, written.changes);
  }
}

/** `builtinSceneMap`: option targets of a built-in rule that only the composition root can name, asked when the rule is first seeded. */
export function openFunctionsStore(homeDirectory: string, options: { builtinSceneMap?: (rule: BuiltinRuleSubject) => FunctionSceneMap } = {}): FunctionsStore {
  const db = openBaselineHomeSqlite(homeDirectory, FUNCTIONS_HOME_STORE.path, FUNCTIONS_STORE_BASELINE);
  seedBuiltinFunctions(db, options.builtinSceneMap);
  return new FunctionsStore(db);
}
