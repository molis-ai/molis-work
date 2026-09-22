import { randomUUID } from "node:crypto";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import type {
  ArtifactJsonValue,
  ArtifactVersionRecord,
  ArtifactVersionResult,
  RegisterArtifactVersionInput,
} from "@molis-ai/molis-work-contracts/modules/artifacts";
import { FeedStoreError } from "./application-errors.js";
import type { FeedItemRecord, FeedOutRuleMatch, FeedOutRuleRecord } from "./projection.js";

export const FEED_CAPTURE_ARTIFACT_TYPE_ID = "io.molis.work.feed.capture";
export const FEED_CAPTURE_SCHEMA_VERSION = 1;
export const FEED_ARTIFACT_PRODUCER = {
  plugin_id: "io.molis.work.native.feed",
  plugin_version: "0.0.0",
  binding_signature: "native:feed",
} as const;

export interface FeedPluginSqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes: number | bigint };
  };
}

export interface FeedArtifactProducer {
  registerVersion(input: RegisterArtifactVersionInput): ArtifactVersionResult;
  latestVersion(boardId: string, artifactId: string): ArtifactVersionRecord | null;
}

export interface FeedOutRuleWrite {
  name: string;
  match: FeedOutRuleMatch;
  enabled?: boolean;
  function_key?: string | null;
  admission?: "suggest" | "inbox";
}

type Row = Record<string, unknown>;

export function migrateFeedOutRules(db: FeedPluginSqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feed_out_rules (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      rule_id TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      match_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (board_id, rule_id)
    );
    CREATE INDEX IF NOT EXISTS feed_out_rules_board_enabled_idx
      ON feed_out_rules(board_id, enabled, created_at, rule_id);
  `);
  const columns = db.prepare("PRAGMA table_info(feed_out_rules)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "function_key")) {
    db.exec("ALTER TABLE feed_out_rules ADD COLUMN function_key TEXT");
  }
  if (!columns.some((column) => column.name === "admission")) {
    db.exec("ALTER TABLE feed_out_rules ADD COLUMN admission TEXT NOT NULL DEFAULT 'suggest'");
  }
}

export function feedCaptureArtifactId(itemId: string, ruleId: string): string {
  return `feed-capture:${itemId}:${ruleId}`;
}

export class FeedOutRuleStore {
  constructor(private readonly db: FeedPluginSqliteDatabase) {
    migrateFeedOutRules(db);
  }

  list(boardId: string): FeedOutRuleRecord[] {
    return (this.db.prepare(
      "SELECT * FROM feed_out_rules WHERE board_id = ? ORDER BY created_at, rule_id",
    ).all(boardId) as Row[]).map(mapOutRule);
  }

  get(boardId: string, ruleId: string): FeedOutRuleRecord {
    const row = this.db.prepare(
      "SELECT * FROM feed_out_rules WHERE board_id = ? AND rule_id = ?",
    ).get(boardId, ruleId) as Row | undefined;
    if (!row) throw new FeedStoreError("feed_out_rule_not_found", "找不到这条捕捉规则");
    return mapOutRule(row);
  }

  create(boardId: string, input: FeedOutRuleWrite): FeedOutRuleRecord {
    const at = new Date().toISOString();
    const record: FeedOutRuleRecord = {
      board_id: boardId,
      rule_id: `feedoutrule-${randomUUID()}`,
      name: normalizeName(input.name),
      enabled: input.enabled !== false,
      match: normalizeMatch(input.match),
      function_key: normalizeFunctionKey(input.function_key),
      admission: normalizeAdmission(input.admission),
      created_at: at,
      updated_at: at,
    };
    this.db.prepare(`
      INSERT INTO feed_out_rules (
        board_id, rule_id, name, enabled, match_json, function_key, created_at, updated_at, admission
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.board_id,
      record.rule_id,
      record.name,
      record.enabled ? 1 : 0,
      JSON.stringify(record.match),
      record.function_key,
      record.created_at,
      record.updated_at,
      record.admission,
    );
    return record;
  }

  update(boardId: string, ruleId: string, patch: Partial<FeedOutRuleWrite>): FeedOutRuleRecord {
    const current = this.get(boardId, ruleId);
    const next: FeedOutRuleRecord = {
      ...current,
      name: patch.name != null ? normalizeName(patch.name) : current.name,
      enabled: patch.enabled != null ? patch.enabled : current.enabled,
      match: patch.match != null ? normalizeMatch({ ...current.match, ...patch.match }) : current.match,
      function_key: patch.function_key !== undefined ? normalizeFunctionKey(patch.function_key) : current.function_key,
      admission: patch.admission !== undefined ? normalizeAdmission(patch.admission) : current.admission,
      updated_at: new Date().toISOString(),
    };
    this.db.prepare(`
      UPDATE feed_out_rules
      SET name = ?, enabled = ?, match_json = ?, function_key = ?, updated_at = ?, admission = ?
      WHERE board_id = ? AND rule_id = ?
    `).run(
      next.name,
      next.enabled ? 1 : 0,
      JSON.stringify(next.match),
      next.function_key,
      next.updated_at,
      next.admission,
      boardId,
      ruleId,
    );
    return next;
  }

  delete(boardId: string, ruleId: string): FeedOutRuleRecord {
    const current = this.get(boardId, ruleId);
    this.db.prepare("DELETE FROM feed_out_rules WHERE board_id = ? AND rule_id = ?").run(boardId, ruleId);
    return current;
  }
}

export function feedOutRuleMatches(rule: FeedOutRuleRecord, item: FeedItemRecord): boolean {
  if (!rule.enabled) return false;
  const { contains, source_id, source_kind } = rule.match;
  if (source_id && item.source_id !== source_id) return false;
  if (source_kind && item.source_kind !== source_kind) return false;
  if (!contains) return true;
  const haystack = [item.title, item.summary, item.body ?? "", ...item.tags]
    .join("\n")
    .toLocaleLowerCase();
  return haystack.includes(contains.toLocaleLowerCase());
}

export function feedCapturePayload(item: FeedItemRecord): ArtifactJsonValue {
  return {
    title: item.title,
    summary: item.summary,
    source: {
      source_id: item.source_id,
      source_kind: item.source_kind,
      source_label: item.source_label,
    },
    url: item.url,
    occurred_at: item.source_created_at,
    tags: item.tags,
    materials: item.materials.map((material) => ({
      material_id: material.material_id,
      canonical_url: material.canonical_url,
      title: material.title,
    })),
  };
}

export function registerFeedCaptureVersion(
  artifacts: FeedArtifactProducer,
  item: FeedItemRecord,
  rule: FeedOutRuleRecord,
  actorId = "web-user",
): ArtifactVersionResult {
  const artifactId = feedCaptureArtifactId(item.item_id, rule.rule_id);
  const payload = feedCapturePayload(item);
  const latest = artifacts.latestVersion(item.board_id, artifactId);
  const input = (version: number, supersedes: number | null): RegisterArtifactVersionInput => ({
    board_id: item.board_id,
    artifact_id: artifactId,
    version,
    actor_id: actorId,
    artifact_type_id: FEED_CAPTURE_ARTIFACT_TYPE_ID,
    schema_version: FEED_CAPTURE_SCHEMA_VERSION,
    producer: { ...FEED_ARTIFACT_PRODUCER },
    content: { kind: "inline", payload },
    metadata: {
      feed_item_id: item.item_id,
      rule_id: rule.rule_id,
    },
    ...(supersedes != null ? { supersedes_version: supersedes } : {}),
  });
  try {
    return artifacts.registerVersion(input(latest?.version ?? 1, null));
  } catch (error) {
    if (!isVersionConflict(error) || latest == null) throw error;
    return artifacts.registerVersion(input(latest.version + 1, latest.version));
  }
}

export function parseFeedOutRuleWrite(body: Readonly<Record<string, unknown>>): FeedOutRuleWrite {
  return {
    ...(typeof body.name === "string" ? { name: body.name } : { name: "" }),
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    function_key: typeof body.function_key === "string" || body.function_key === null ? body.function_key : undefined,
    admission: normalizeAdmission(body.admission),
    match: {
      ...(typeof body.contains === "string" ? { contains: body.contains } : {}),
      ...(typeof body.source_id === "string" ? { source_id: body.source_id } : {}),
      ...(typeof body.source_kind === "string" ? { source_kind: body.source_kind } : {}),
    },
  };
}

export function parseFeedOutRulePatch(body: Readonly<Record<string, unknown>>): Partial<FeedOutRuleWrite> {
  const patch: Partial<FeedOutRuleWrite> = {};
  if ("admission" in body) patch.admission = normalizeAdmission(body.admission);
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.function_key === "string" || body.function_key === null) patch.function_key = body.function_key;
  const match: FeedOutRuleMatch = {};
  let hasMatch = false;
  if (typeof body.contains === "string") {
    match.contains = body.contains;
    hasMatch = true;
  }
  if (typeof body.source_id === "string") {
    match.source_id = body.source_id;
    hasMatch = true;
  }
  if (typeof body.source_kind === "string") {
    match.source_kind = body.source_kind;
    hasMatch = true;
  }
  if (hasMatch) patch.match = match;
  return patch;
}

function normalizeFunctionKey(value: string | null | undefined): string | null {
  const key = value?.trim() ?? "";
  return key || null;
}

function normalizeAdmission(value: unknown): "suggest" | "inbox" {
  if (value === undefined || value === "suggest") return "suggest";
  if (value === "inbox") return "inbox";
  throw new FeedDomainError("请选择仅建议或自动加入 Inbox", "feed_out_rule_invalid");
}

function normalizeName(value: string): string {
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    throw new FeedDomainError("规则名称需要 1–80 个字", "feed_out_rule_invalid");
  }
  return name;
}

function normalizeMatch(match: FeedOutRuleMatch): FeedOutRuleMatch {
  const contains = match.contains?.trim() ?? "";
  const sourceId = match.source_id?.trim() ?? "";
  const sourceKind = match.source_kind?.trim() ?? "";
  if (!contains && !sourceId && !sourceKind) {
    throw new FeedDomainError("请填写包含关键字，或选择来源过滤", "feed_out_rule_invalid");
  }
  if (contains.length > 200) {
    throw new FeedDomainError("包含关键字不能超过 200 个字", "feed_out_rule_invalid");
  }
  return {
    ...(contains ? { contains } : {}),
    ...(sourceId ? { source_id: sourceId } : {}),
    ...(sourceKind ? { source_kind: sourceKind } : {}),
  };
}

function mapOutRule(row: Row): FeedOutRuleRecord {
  return {
    board_id: String(row.board_id ?? ""),
    rule_id: String(row.rule_id ?? ""),
    name: String(row.name ?? ""),
    enabled: Number(row.enabled) === 1,
    match: parseMatch(row.match_json),
    function_key: typeof row.function_key === "string" && row.function_key.trim() ? row.function_key.trim() : null,
    admission: row.admission === "inbox" ? "inbox" : "suggest",
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function parseMatch(value: unknown): FeedOutRuleMatch {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value) as FeedOutRuleMatch;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isVersionConflict(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "artifact.version_conflict",
  );
}
