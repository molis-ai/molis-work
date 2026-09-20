import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  FUNCTIONS_DEFAULT_MODEL,
  FUNCTIONS_MAX_SAMPLES,
  type ChoiceCriterion,
  type FunctionCriteria,
  type FunctionDraftPatch,
  type FunctionRecord,
  type FunctionSample,
  type FunctionSceneBinding,
  type FunctionsPreviewRecord,
  type FunctionsPrimitive,
  type JudgmentRecord,
  type JudgmentSubject,
  type NoulCriteria,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { hashFunctionConfig } from "./hash.js";
import { seedBuiltinFunctions } from "./builtin.js";
import { FunctionsError, assertFunctionKey, assertOptionKey, isPinnedJevModel, suggestFunctionKey } from "./keys.js";

interface FunctionRow {
  id: string;
  name: string;
  function_key: string;
  primitive: string;
  status: string;
  version: number | null;
  model: string;
  instructions: string;
  criteria_json: string;
  config_hash: string;
  last_preview_json: string | null;
  samples_json: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_CHOICE: readonly ChoiceCriterion[] = [
  { key: "yes", description: "" },
  { key: "no", description: "" },
];
const DEFAULT_NOUL: NoulCriteria = { true_description: "", false_description: "" };
const DEFAULT_SCORE: readonly string[] = ["低", "高"];

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
      this,
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

  updateDraft(id: string, patch: FunctionDraftPatch): FunctionRecord {
    const current = this.require(id);
    if (current.status === "published") {
      throw new FunctionsError("functions.published_immutable", "已发布的函数不能再改配置");
    }
    const name = patch.name === undefined ? current.name : normalizeName(patch.name);
    const function_key = patch.function_key === undefined
      ? current.function_key
      : assertAvailableKey(this, assertFunctionKey(patch.function_key), current.id);
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
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE functions
      SET name = ?, function_key = ?, instructions = ?, criteria_json = ?, config_hash = ?, last_preview_json = ?, updated_at = ?
      WHERE id = ?
    `).run(name, function_key, instructions, JSON.stringify(criteria), config_hash, last_preview ? JSON.stringify(last_preview) : null, now, id);
    return this.require(id);
  }

  savePreview(id: string, preview: FunctionsPreviewRecord): FunctionRecord {
    const current = this.require(id);
    if (preview.config_hash !== current.config_hash) {
      throw new FunctionsError("functions.stale_preview", "预览结果对不上当前配置，请再试一次");
    }
    const now = new Date().toISOString();
    this.db.prepare("UPDATE functions SET last_preview_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(preview), now, id);
    return this.require(id);
  }

  addSample(id: string, input: { label?: string; input: string }): FunctionRecord {
    const current = this.require(id);
    if (current.samples.length >= FUNCTIONS_MAX_SAMPLES) {
      throw new FunctionsError("functions.invalid", `每个函数最多 ${FUNCTIONS_MAX_SAMPLES} 条样例`);
    }
    const sample: FunctionSample = {
      id: crypto.randomUUID(),
      label: normalizeSampleLabel(input.label, current.samples.length),
      input: normalizeSampleInput(input.input),
    };
    return this.writeSamples(current.id, [...current.samples, sample]);
  }

  removeSample(id: string, sampleId: string): FunctionRecord {
    const current = this.require(id);
    const samples = current.samples.filter((item) => item.id !== sampleId);
    if (samples.length === current.samples.length) {
      throw new FunctionsError("functions.not_found", "样例不存在");
    }
    return this.writeSamples(current.id, samples);
  }

  publish(id: string): FunctionRecord {
    const current = this.require(id);
    if (current.status === "published") return current;
    assertReadyToPublish(current);
    const model = pinModel(current);
    const now = new Date().toISOString();
    const config_hash = hashFunctionConfig({
      primitive: current.primitive,
      instructions: current.instructions,
      criteria: current.criteria,
      model,
    });
    const last_preview = current.last_preview && current.last_preview.config_hash === current.config_hash
      ? { ...current.last_preview, config_hash, model: current.last_preview.model || model }
      : current.last_preview;
    this.db.prepare(`
      UPDATE functions
      SET status = 'published', version = 1, model = ?, config_hash = ?, last_preview_json = ?, published_at = ?, updated_at = ?
      WHERE id = ?
    `).run(model, config_hash, last_preview ? JSON.stringify(last_preview) : null, now, now, id);
    return this.require(id);
  }

  deleteDraft(id: string): void {
    const current = this.require(id);
    if (current.status === "published") {
      throw new FunctionsError("functions.published_immutable", "已发布的函数不能删除");
    }
    this.db.prepare("DELETE FROM functions WHERE id = ?").run(id);
  }

  require(id: string): FunctionRecord {
    const record = this.get(id);
    if (!record) throw new FunctionsError("functions.not_found", "函数不存在");
    return record;
  }

  requirePublishedByKey(functionKey: string): FunctionRecord {
    const record = this.getByKey(functionKey);
    if (!record || record.status !== "published" || record.version == null) {
      throw new FunctionsError("functions.not_found", "函数不存在");
    }
    return record;
  }

  bindScene(sceneId: string, functionKey: string, boardId: string | null, ref: string | null = null): FunctionSceneBinding {
    const at = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO function_scene_bindings (scene_id, board_id, ref, function_key, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(scene_id, board_id, ref) DO UPDATE SET function_key = excluded.function_key, updated_at = excluded.updated_at
    `).run(sceneId, boardId ?? "", ref ?? "", functionKey, at);
    return { scene_id: sceneId, board_id: boardId, ref, function_key: functionKey };
  }

  unbindScene(sceneId: string, boardId: string | null, ref: string | null = null): void {
    this.db.prepare(
      "DELETE FROM function_scene_bindings WHERE scene_id = ? AND board_id = ? AND ref = ?",
    ).run(sceneId, boardId ?? "", ref ?? "");
  }

  getSceneBinding(sceneId: string, boardId: string | null, ref: string | null = null): FunctionSceneBinding | null {
    const row = this.db.prepare(
      "SELECT scene_id, board_id, ref, function_key FROM function_scene_bindings WHERE scene_id = ? AND board_id = ? AND ref = ?",
    ).get(sceneId, boardId ?? "", ref ?? "") as { scene_id: string; board_id: string; ref: string; function_key: string } | undefined;
    if (!row) return null;
    return mapBinding(row);
  }

  listSceneBindings(functionKey?: string): FunctionSceneBinding[] {
    const rows = functionKey
      ? this.db.prepare(
        "SELECT scene_id, board_id, ref, function_key FROM function_scene_bindings WHERE function_key = ? ORDER BY scene_id, board_id, ref",
      ).all(functionKey) as Array<{ scene_id: string; board_id: string; ref: string; function_key: string }>
      : this.db.prepare(
        "SELECT scene_id, board_id, ref, function_key FROM function_scene_bindings ORDER BY scene_id, board_id, ref",
      ).all() as Array<{ scene_id: string; board_id: string; ref: string; function_key: string }>;
    return rows.map(mapBinding);
  }

  recordJudgment(input: {
    function_key: string;
    function_version: number;
    subject: JudgmentSubject;
    scene_id: string | null;
    outcome: JudgmentRecord["outcome"];
    suggested_behavior_ids: readonly string[];
    error_code: string | null;
  }): JudgmentRecord {
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
    };
    this.db.prepare(`
      INSERT INTO function_judgments (
        judgment_id, function_key, function_version, subject_kind, subject_id, board_id,
        scene_id, outcome, suggested_json, error_code, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.judgment_id,
      record.function_key,
      record.function_version,
      record.subject.kind,
      record.subject.id,
      record.subject.board_id ?? "",
      record.scene_id,
      record.outcome,
      JSON.stringify(record.suggested_behavior_ids),
      record.error_code,
      record.created_at,
    );
    return record;
  }

  listJudgments(): JudgmentRecord[] {
    const rows = this.db.prepare(
      "SELECT * FROM function_judgments ORDER BY datetime(created_at) DESC, judgment_id",
    ).all() as Record<string, unknown>[];
    return rows.map(mapJudgment);
  }

  latestJudgment(kind: JudgmentSubject["kind"], id: string, boardId?: string): JudgmentRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM function_judgments
      WHERE subject_kind = ? AND subject_id = ? AND (? = '' OR board_id = ?)
      ORDER BY datetime(created_at) DESC, judgment_id DESC
      LIMIT 1
    `).get(kind, id, boardId ?? "", boardId ?? "") as Record<string, unknown> | undefined;
    return row ? mapJudgment(row) : null;
  }

  private writeSamples(id: string, samples: readonly FunctionSample[]): FunctionRecord {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE functions SET samples_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(samples), now, id);
    return this.require(id);
  }
}

export function openFunctionsStore(homeDirectory: string): FunctionsStore {
  const dir = join(homeDirectory, "functions");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dbPath = join(dir, "functions.db");
  const db = new DatabaseSync(dbPath);
  try {
    chmodSync(dbPath, 0o600);
  } catch {
    // The file exists; mode is best-effort on this volume.
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS functions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      function_key TEXT NOT NULL UNIQUE,
      primitive TEXT NOT NULL,
      status TEXT NOT NULL,
      version INTEGER,
      model TEXT NOT NULL,
      instructions TEXT NOT NULL,
      criteria_json TEXT NOT NULL,
      config_hash TEXT NOT NULL,
      last_preview_json TEXT,
      samples_json TEXT NOT NULL DEFAULT '[]',
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const columns = db.prepare("PRAGMA table_info(functions)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "samples_json")) {
    db.exec("ALTER TABLE functions ADD COLUMN samples_json TEXT NOT NULL DEFAULT '[]'");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS function_judgments (
      judgment_id TEXT PRIMARY KEY,
      function_key TEXT NOT NULL,
      function_version INTEGER NOT NULL,
      subject_kind TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      board_id TEXT NOT NULL DEFAULT '',
      scene_id TEXT,
      outcome TEXT NOT NULL,
      suggested_json TEXT NOT NULL,
      error_code TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS function_judgments_subject_idx
      ON function_judgments(subject_kind, subject_id, board_id, created_at);
    CREATE TABLE IF NOT EXISTS function_scene_bindings (
      scene_id TEXT NOT NULL,
      board_id TEXT NOT NULL DEFAULT '',
      ref TEXT NOT NULL DEFAULT '',
      function_key TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scene_id, board_id, ref)
    );
  `);
  migrateSceneBindingRef(db);
  seedBuiltinFunctions(db);
  return new FunctionsStore(db);
}

function migrateSceneBindingRef(db: DatabaseSync): void {
  const columns = db.prepare("PRAGMA table_info(function_scene_bindings)").all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === "ref")) return;
  db.exec(`
    ALTER TABLE function_scene_bindings RENAME TO function_scene_bindings_legacy;
    CREATE TABLE function_scene_bindings (
      scene_id TEXT NOT NULL,
      board_id TEXT NOT NULL DEFAULT '',
      ref TEXT NOT NULL DEFAULT '',
      function_key TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (scene_id, board_id, ref)
    );
    INSERT INTO function_scene_bindings (scene_id, board_id, ref, function_key, updated_at)
    SELECT scene_id, board_id, '', function_key, updated_at FROM function_scene_bindings_legacy;
    DROP TABLE function_scene_bindings_legacy;
  `);
}

function mapBinding(row: { scene_id: string; board_id: string; ref?: string; function_key: string }): FunctionSceneBinding {
  return {
    scene_id: row.scene_id,
    board_id: row.board_id ? row.board_id : null,
    ref: row.ref ? row.ref : null,
    function_key: row.function_key,
  };
}

export function assertReadyToPublish(record: FunctionRecord): void {
  normalizeInstructions(record.instructions);
  normalizeCriteria(record.primitive, record.criteria, true);
  if (!record.last_preview) {
    throw new FunctionsError("functions.preview_required", "发布前需要用当前配置成功试跑一次");
  }
  if (record.last_preview.config_hash !== record.config_hash) {
    throw new FunctionsError("functions.stale_preview", "配置改过了，请用当前说明再试跑一次");
  }
}

export function assertReadyToEvaluate(record: FunctionRecord): void {
  normalizeInstructions(record.instructions);
  normalizeCriteria(record.primitive, record.criteria, true);
}

function pinModel(record: FunctionRecord): string {
  const resolved = record.last_preview?.model?.trim() ?? "";
  if (isPinnedJevModel(resolved)) return resolved;
  return record.model;
}

function insert(db: DatabaseSync, record: FunctionRecord): void {
  db.prepare(`
    INSERT INTO functions (
      id, name, function_key, primitive, status, version, model, instructions, criteria_json,
      config_hash, last_preview_json, samples_json, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.name,
    record.function_key,
    record.primitive,
    record.status,
    record.version,
    record.model,
    record.instructions,
    JSON.stringify(record.criteria),
    record.config_hash,
    record.last_preview ? JSON.stringify(record.last_preview) : null,
    JSON.stringify(record.samples),
    record.published_at,
    record.created_at,
    record.updated_at,
  );
}

function fromRow(row: FunctionRow): FunctionRecord {
  const primitive = parsePrimitive(row.primitive);
  const criteria = parseCriteria(primitive, row.criteria_json);
  return buildRecord({
    id: row.id,
    name: row.name,
    function_key: row.function_key,
    primitive,
    status: row.status === "published" ? "published" : "draft",
    version: row.version,
    model: row.model,
    instructions: row.instructions,
    criteria,
    last_preview: parsePreview(row.last_preview_json, primitive),
    samples: parseSamples(row.samples_json),
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

function buildRecord(input: {
  id: string;
  name: string;
  function_key: string;
  primitive: FunctionsPrimitive;
  status: FunctionRecord["status"];
  version: number | null;
  model: string;
  instructions: string;
  criteria: FunctionCriteria;
  last_preview: FunctionsPreviewRecord | null;
  samples: readonly FunctionSample[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}): FunctionRecord {
  const base = {
    id: input.id,
    name: input.name,
    function_key: input.function_key,
    status: input.status,
    version: input.version,
    model: input.model,
    instructions: input.instructions,
    config_hash: hashFunctionConfig({
      primitive: input.primitive,
      instructions: input.instructions,
      criteria: input.criteria,
      model: input.model,
    }),
    last_preview: input.last_preview,
    samples: input.samples,
    published_at: input.published_at,
    created_at: input.created_at,
    updated_at: input.updated_at,
  };
  if (input.primitive === "noul") {
    return { ...base, primitive: "noul", criteria: input.criteria as NoulCriteria };
  }
  if (input.primitive === "score") {
    return { ...base, primitive: "score", criteria: input.criteria as readonly string[] };
  }
  return { ...base, primitive: "choice", criteria: input.criteria as readonly ChoiceCriterion[] };
}

function uniqueKey(store: FunctionsStore, key: string, exceptId?: string): string {
  let candidate = key;
  let n = 2;
  while (keyTaken(store, candidate, exceptId)) {
    const suffix = `_${n}`;
    candidate = `${key.slice(0, Math.max(2, 64 - suffix.length))}${suffix}`;
    n += 1;
    if (n > 99) throw new FunctionsError("functions.key_conflict", "函数 key 已被占用");
  }
  return candidate;
}

function assertAvailableKey(store: FunctionsStore, key: string, exceptId?: string): string {
  if (keyTaken(store, key, exceptId)) throw new FunctionsError("functions.key_conflict", "函数 key 已被占用");
  return key;
}

function keyTaken(store: FunctionsStore, key: string, exceptId?: string): boolean {
  const row = store.getByKey(key);
  return Boolean(row && row.id !== exceptId);
}

function defaultName(primitive: FunctionsPrimitive): string {
  if (primitive === "noul") return "未命名判断";
  if (primitive === "score") return "未命名评分";
  return "未命名函数";
}

function defaultCriteria(primitive: FunctionsPrimitive): FunctionCriteria {
  if (primitive === "noul") return DEFAULT_NOUL;
  if (primitive === "score") return [...DEFAULT_SCORE];
  return [...DEFAULT_CHOICE];
}

function assertPrimitive(value: string): FunctionsPrimitive {
  if (value === "noul" || value === "choice" || value === "score") return value;
  throw new FunctionsError("functions.invalid", "判断类型须为 Noul、Choice 或 Score");
}

function parsePrimitive(value: string): FunctionsPrimitive {
  if (value === "noul" || value === "score") return value;
  return "choice";
}

function parseCriteria(primitive: FunctionsPrimitive, raw: string): FunctionCriteria {
  try {
    return normalizeCriteria(primitive, JSON.parse(raw) as FunctionCriteria, false);
  } catch {
    return defaultCriteria(primitive);
  }
}

function parsePreview(raw: string | null, primitive: FunctionsPrimitive): FunctionsPreviewRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const outcome = value.outcome === "needs_review" ? "needs_review" : "ok";
    return {
      input: typeof value.input === "string" ? value.input : "",
      outcome,
      primitive: parsePrimitive(typeof value.primitive === "string" ? value.primitive : primitive),
      choice: typeof value.choice === "string" ? value.choice : null,
      noul: typeof value.noul === "number" ? value.noul : null,
      score: typeof value.score === "number" ? value.score : null,
      legend: Array.isArray(value.legend) ? value.legend.filter((item): item is string => typeof item === "string") : null,
      probabilities: isRecord(value.probabilities)
        ? Object.fromEntries(Object.entries(value.probabilities).filter((entry): entry is [string, number] => typeof entry[1] === "number"))
        : {},
      confidence: typeof value.confidence === "number" ? value.confidence : null,
      model: typeof value.model === "string" ? value.model : "",
      config_hash: typeof value.config_hash === "string" ? value.config_hash : "",
      at: typeof value.at === "string" ? value.at : "",
    };
  } catch {
    return null;
  }
}

function parseSamples(raw: string | null): FunctionSample[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.input !== "string") return [];
      return [{
        id: row.id,
        label: typeof row.label === "string" ? row.label : "",
        input: row.input,
      }];
    });
  } catch {
    return [];
  }
}

function normalizeName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 80) throw new FunctionsError("functions.invalid", "名称须为 1 到 80 个字");
  return name;
}

function normalizeDraftInstructions(value: string): string {
  const instructions = value.trim();
  if (instructions.length > 8000) throw new FunctionsError("functions.invalid", "判断说明须为 1 到 8000 个字");
  return instructions;
}

function normalizeInstructions(value: string): string {
  const instructions = normalizeDraftInstructions(value);
  if (!instructions) throw new FunctionsError("functions.invalid", "判断说明须为 1 到 8000 个字");
  return instructions;
}

function normalizeSampleLabel(value: string | undefined, index: number): string {
  const label = (value ?? "").trim() || `样例 ${index + 1}`;
  if (label.length > 40) throw new FunctionsError("functions.invalid", "样例名称须为 1 到 40 个字");
  return label;
}

function normalizeSampleInput(value: string): string {
  const input = value.trim();
  if (!input || input.length > 8000) throw new FunctionsError("functions.invalid", "样例输入须为 1 到 8000 个字");
  return input;
}

function normalizeCriteria(primitive: FunctionsPrimitive, value: FunctionCriteria, requireComplete: boolean): FunctionCriteria {
  if (primitive === "noul") return normalizeNoul(value, requireComplete);
  if (primitive === "score") return normalizeScore(value, requireComplete);
  return normalizeChoice(value, requireComplete);
}

function normalizeChoice(value: FunctionCriteria, requireDescriptions: boolean): ChoiceCriterion[] {
  if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object" || Array.isArray(item) || !("key" in item))) {
    throw new FunctionsError("functions.invalid", "选项须是列表");
  }
  const seen = new Set<string>();
  const criteria = (value as readonly ChoiceCriterion[]).map((item) => {
    const key = assertOptionKey(String(item.key ?? "").trim());
    if (seen.has(key)) throw new FunctionsError("functions.invalid", `选项 key 重复：${key}`);
    seen.add(key);
    const description = String(item.description ?? "").trim();
    if (description.length > 500) {
      throw new FunctionsError("functions.invalid", "每个选项需要 1 到 500 字的说明");
    }
    if (requireDescriptions && !description) {
      throw new FunctionsError("functions.invalid", "每个选项需要 1 到 500 字的说明");
    }
    return { key, description };
  });
  if (criteria.length < 2) throw new FunctionsError("functions.invalid", "Choice 至少需要两个选项");
  if (criteria.length > 32) throw new FunctionsError("functions.invalid", "Choice 最多 32 个选项");
  return criteria;
}

function normalizeNoul(value: FunctionCriteria, requireComplete: boolean): NoulCriteria {
  const row = !Array.isArray(value) && value && typeof value === "object"
    ? value as { true_description?: unknown; false_description?: unknown }
    : {};
  const true_description = String(row.true_description ?? "").trim();
  const false_description = String(row.false_description ?? "").trim();
  if (true_description.length > 500 || false_description.length > 500) {
    throw new FunctionsError("functions.invalid", "判断标准须为 1 到 500 个字");
  }
  if (requireComplete && !true_description && !false_description) {
    // Noul criteria are optional at TypeSafe; instructions already required.
  }
  return { true_description, false_description };
}

function normalizeScore(value: FunctionCriteria, requireComplete: boolean): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new FunctionsError("functions.invalid", "Score 档位须是文字列表");
  }
  const levels = (value as readonly string[]).map((item) => item.trim());
  if (levels.some((item) => item.length > 500)) {
    throw new FunctionsError("functions.invalid", "每个档位需要 1 到 500 字的说明");
  }
  if (requireComplete && (levels.length < 2 || levels.some((item) => !item))) {
    throw new FunctionsError("functions.invalid", "Score 至少需要两个写了说明的档位");
  }
  if (!requireComplete && levels.length < 2) {
    throw new FunctionsError("functions.invalid", "Score 至少需要两个档位");
  }
  if (levels.length > 32) throw new FunctionsError("functions.invalid", "Score 最多 32 个档位");
  return levels;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapJudgment(row: Record<string, unknown>): JudgmentRecord {
  let suggested: string[] = [];
  try {
    const parsed = JSON.parse(String(row.suggested_json ?? "[]")) as unknown;
    if (Array.isArray(parsed)) suggested = parsed.filter((item): item is string => typeof item === "string");
  } catch {
    suggested = [];
  }
  const boardId = String(row.board_id ?? "");
  return {
    judgment_id: String(row.judgment_id ?? ""),
    function_key: String(row.function_key ?? ""),
    function_version: Number(row.function_version ?? 0),
    subject: {
      kind: String(row.subject_kind ?? "mcp_invoke") as JudgmentSubject["kind"],
      id: String(row.subject_id ?? ""),
      ...(boardId ? { board_id: boardId } : {}),
    },
    scene_id: row.scene_id == null || row.scene_id === "" ? null : String(row.scene_id),
    outcome: row.outcome === "needs_review" ? "needs_review" : "ok",
    suggested_behavior_ids: suggested,
    error_code: row.error_code == null || row.error_code === "" ? null : String(row.error_code),
    created_at: String(row.created_at ?? ""),
  };
}
