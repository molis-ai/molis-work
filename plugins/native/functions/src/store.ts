import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  FUNCTIONS_DEFAULT_MODEL,
  type ChoiceCriterion,
  type FunctionDraftPatch,
  type FunctionRecord,
  type FunctionsPreviewRecord,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { hashChoiceConfig } from "./hash.js";
import { FunctionsError, assertFunctionKey, assertOptionKey, suggestFunctionKey } from "./keys.js";

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
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_CRITERIA: readonly ChoiceCriterion[] = [
  { key: "yes", description: "" },
  { key: "no", description: "" },
];

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

  createChoice(input: { name?: string; function_key?: string } = {}): FunctionRecord {
    const now = new Date().toISOString();
    const name = normalizeName(input.name ?? "未命名函数");
    const function_key = uniqueKey(this, input.function_key ? assertFunctionKey(input.function_key) : suggestFunctionKey(name));
    const criteria = [...DEFAULT_CRITERIA];
    const record: FunctionRecord = {
      id: crypto.randomUUID(),
      name,
      function_key,
      primitive: "choice",
      status: "draft",
      version: null,
      model: FUNCTIONS_DEFAULT_MODEL,
      instructions: "",
      criteria,
      config_hash: hashChoiceConfig({ instructions: "", criteria, model: FUNCTIONS_DEFAULT_MODEL }),
      last_preview: null,
      published_at: null,
      created_at: now,
      updated_at: now,
    };
    insert(this.db, record);
    return record;
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
    const criteria = patch.criteria === undefined ? current.criteria : normalizeCriteria(patch.criteria, false);
    const config_hash = hashChoiceConfig({ instructions, criteria, model: current.model });
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

  publish(id: string): FunctionRecord {
    const current = this.require(id);
    if (current.status === "published") return current;
    assertReadyToPublish(current);
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE functions
      SET status = 'published', version = 1, published_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, id);
    return this.require(id);
  }

  require(id: string): FunctionRecord {
    const record = this.get(id);
    if (!record) throw new FunctionsError("functions.not_found", "函数不存在");
    return record;
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
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return new FunctionsStore(db);
}

export function assertReadyToPublish(record: FunctionRecord): void {
  normalizeInstructions(record.instructions);
  normalizeCriteria(record.criteria, true);
  if (!record.last_preview) {
    throw new FunctionsError("functions.preview_required", "发布前需要用当前配置成功试跑一次");
  }
  if (record.last_preview.config_hash !== record.config_hash) {
    throw new FunctionsError("functions.stale_preview", "配置改过了，请用当前说明再试跑一次");
  }
}

function insert(db: DatabaseSync, record: FunctionRecord): void {
  db.prepare(`
    INSERT INTO functions (
      id, name, function_key, primitive, status, version, model, instructions, criteria_json,
      config_hash, last_preview_json, published_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    record.published_at,
    record.created_at,
    record.updated_at,
  );
}

function fromRow(row: FunctionRow): FunctionRecord {
  return {
    id: row.id,
    name: row.name,
    function_key: row.function_key,
    primitive: "choice",
    status: row.status === "published" ? "published" : "draft",
    version: row.version,
    model: row.model,
    instructions: row.instructions,
    criteria: JSON.parse(row.criteria_json) as ChoiceCriterion[],
    config_hash: row.config_hash,
    last_preview: row.last_preview_json ? JSON.parse(row.last_preview_json) as FunctionsPreviewRecord : null,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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

function normalizeCriteria(value: readonly ChoiceCriterion[], requireDescriptions: boolean): ChoiceCriterion[] {
  const seen = new Set<string>();
  const criteria = value.map((item) => {
    const key = assertOptionKey(item.key.trim());
    if (seen.has(key)) throw new FunctionsError("functions.invalid", `选项 key 重复：${key}`);
    seen.add(key);
    const description = item.description.trim();
    if (description.length > 500) {
      throw new FunctionsError("functions.invalid", "每个选项需要 1 到 500 字的说明");
    }
    if (requireDescriptions && !description) {
      throw new FunctionsError("functions.invalid", "每个选项需要 1 到 500 字的说明");
    }
    return { key, description };
  });
  if (criteria.length < 2) throw new FunctionsError("functions.invalid", "Choice 至少需要两个选项");
  return criteria;
}
