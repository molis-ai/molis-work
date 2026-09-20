import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  LingguangConversation,
  LingguangMessage,
  LingguangMessageRole,
  LingguangSpark,
  LingguangStatus,
} from "@molis-ai/molis-work-contracts/modules/lingguang";
import { LingguangError } from "./error.js";

interface SparkRow {
  id: string;
  project_id: string;
  title: string;
  body: string;
  source_kind: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ConversationRow {
  id: string;
  project_id: string;
  spark_key: string;
  spark_ids_json: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  body: string;
  created_at: string;
}

const STUB_PREFIX = "先记着：";

export class LingguangStore {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
  }

  list(projectId: string): LingguangSpark[] {
    const project_id = normalizeProjectId(projectId);
    const rows = this.db.prepare(
      "SELECT * FROM sparks WHERE project_id = ? AND status = 'inbox' ORDER BY datetime(created_at) DESC, id DESC",
    ).all(project_id) as unknown as SparkRow[];
    return rows.map(fromSparkRow);
  }

  get(id: string, projectId?: string): LingguangSpark {
    const row = this.db.prepare("SELECT * FROM sparks WHERE id = ?").get(id) as unknown as SparkRow | undefined;
    if (!row) throw new LingguangError("lingguang.not_found", "找不到这条灵光");
    if (projectId && row.project_id !== normalizeProjectId(projectId)) {
      throw new LingguangError("lingguang.not_found", "找不到这条灵光");
    }
    return fromSparkRow(row);
  }

  create(input: { title?: string; body?: string; project_id: string }): LingguangSpark {
    const now = new Date().toISOString();
    const project_id = normalizeProjectId(input.project_id);
    const body = normalizeBody(input.body ?? "");
    const title = normalizeTitle(input.title ?? "", body);
    if (!title && !body.trim()) throw new LingguangError("lingguang.invalid", "先写下标题或正文");
    const record: LingguangSpark = {
      id: crypto.randomUUID(),
      project_id,
      title: title || "未命名灵光",
      body,
      source_kind: "manual",
      status: "inbox",
      created_at: now,
      updated_at: now,
    };
    this.db.prepare(
      "INSERT INTO sparks (id, project_id, title, body, source_kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      record.id, record.project_id, record.title, record.body, record.source_kind, record.status,
      record.created_at, record.updated_at,
    );
    return record;
  }

  update(id: string, patch: { title?: string; body?: string }, projectId?: string): LingguangSpark {
    const current = this.get(id, projectId);
    if (current.status !== "inbox") throw new LingguangError("lingguang.invalid", "丢掉的灵光不能再改");
    const body = patch.body !== undefined ? normalizeBody(patch.body) : current.body;
    const title = patch.title !== undefined ? (normalizeTitle(patch.title, body) || "未命名灵光") : current.title;
    const next: LingguangSpark = {
      ...current,
      title,
      body,
      updated_at: new Date().toISOString(),
    };
    this.db.prepare(
      "UPDATE sparks SET title = ?, body = ?, updated_at = ? WHERE id = ?",
    ).run(next.title, next.body, next.updated_at, id);
    return next;
  }

  discard(ids: readonly string[], projectId?: string): void {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!unique.length) throw new LingguangError("lingguang.invalid", "先选至少一条");
    const now = new Date().toISOString();
    for (const id of unique) {
      const current = this.get(id, projectId);
      if (current.status === "discarded") continue;
      this.db.prepare("UPDATE sparks SET status = ?, updated_at = ? WHERE id = ?").run("discarded", now, id);
    }
  }

  openConversation(sparkIds: readonly string[], projectId: string): {
    conversation: LingguangConversation;
    sparks: LingguangSpark[];
    messages: LingguangMessage[];
  } {
    const project_id = normalizeProjectId(projectId);
    const sparks = uniqueSparkIds(sparkIds).map((id) => this.get(id, project_id));
    if (!sparks.length) throw new LingguangError("lingguang.invalid", "先选至少一条");
    if (sparks.some((spark) => spark.status !== "inbox")) {
      throw new LingguangError("lingguang.invalid", "丢掉的灵光不能再拿去聊");
    }
    const spark_ids = sparks.map((spark) => spark.id).sort();
    const spark_key = spark_ids.join(",");
    const existing = this.db.prepare(
      "SELECT * FROM conversations WHERE project_id = ? AND spark_key = ?",
    ).get(project_id, spark_key) as unknown as ConversationRow | undefined;
    const conversation = existing
      ? fromConversationRow(existing)
      : insertConversation(this.db, project_id, spark_key, spark_ids);
    return {
      conversation,
      sparks,
      messages: this.listMessages(conversation.id),
    };
  }

  addMessage(conversationId: string, body: string, projectId: string): {
    conversation: LingguangConversation;
    sparks: LingguangSpark[];
    messages: LingguangMessage[];
  } {
    const project_id = normalizeProjectId(projectId);
    const row = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId) as unknown as ConversationRow | undefined;
    if (!row || row.project_id !== project_id) {
      throw new LingguangError("lingguang.not_found", "找不到这场对话");
    }
    const text = normalizeChat(body);
    const now = new Date().toISOString();
    insertMessage(this.db, conversationId, "user", text, now);
    insertMessage(this.db, conversationId, "stub", `${STUB_PREFIX}${text}`, now);
    this.db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now, conversationId);
    const conversation = fromConversationRow(
      this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(conversationId) as unknown as ConversationRow,
    );
    return {
      conversation,
      sparks: conversation.spark_ids.map((id) => this.get(id, project_id)),
      messages: this.listMessages(conversationId),
    };
  }

  private listMessages(conversationId: string): LingguangMessage[] {
    const rows = this.db.prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY rowid ASC",
    ).all(conversationId) as unknown as MessageRow[];
    return rows.map((row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      role: row.role as LingguangMessageRole,
      body: row.body,
      created_at: row.created_at,
    }));
  }
}

export function openLingguangStore(homeDirectory: string): LingguangStore {
  const dir = join(homeDirectory, "lingguang");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dbPath = join(dir, "lingguang.db");
  const db = new DatabaseSync(dbPath);
  try {
    chmodSync(dbPath, 0o600);
  } catch {
    // best-effort
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS sparks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      spark_key TEXT NOT NULL,
      spark_ids_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (project_id, spark_key)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return new LingguangStore(db);
}

function insertConversation(
  db: DatabaseSync,
  project_id: string,
  spark_key: string,
  spark_ids: readonly string[],
): LingguangConversation {
  const now = new Date().toISOString();
  const record: LingguangConversation = {
    id: crypto.randomUUID(),
    project_id,
    spark_ids,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    "INSERT INTO conversations (id, project_id, spark_key, spark_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(record.id, record.project_id, spark_key, JSON.stringify(record.spark_ids), record.created_at, record.updated_at);
  return record;
}

function insertMessage(
  db: DatabaseSync,
  conversation_id: string,
  role: LingguangMessageRole,
  body: string,
  created_at: string,
): void {
  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, body, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(crypto.randomUUID(), conversation_id, role, body, created_at);
}

function fromSparkRow(row: SparkRow): LingguangSpark {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    body: row.body,
    source_kind: "manual",
    status: row.status as LingguangStatus,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function fromConversationRow(row: ConversationRow): LingguangConversation {
  return {
    id: row.id,
    project_id: row.project_id,
    spark_ids: JSON.parse(row.spark_ids_json) as string[],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function uniqueSparkIds(value: readonly string[]): string[] {
  return [...new Set(value.map((id) => id.trim()).filter(Boolean))];
}

function normalizeProjectId(value: string): string {
  const id = value.trim();
  if (!id) throw new LingguangError("lingguang.invalid", "缺少项目");
  if (id.length > 80) throw new LingguangError("lingguang.invalid", "项目标识过长");
  return id;
}

function normalizeTitle(value: string, body: string): string {
  const title = value.trim();
  if (title.length > 80) throw new LingguangError("lingguang.invalid", "标题须为 1 到 80 个字");
  if (title) return title;
  const fallback = body.trim().split(/\r?\n/u)[0]?.trim() ?? "";
  return fallback.slice(0, 80);
}

function normalizeBody(value: string): string {
  if (value.length > 8000) throw new LingguangError("lingguang.invalid", "正文须为 0 到 8000 个字");
  return value;
}

function normalizeChat(value: string): string {
  const text = value.trim();
  if (!text) throw new LingguangError("lingguang.invalid", "先写下要接着说的话");
  if (text.length > 2000) throw new LingguangError("lingguang.invalid", "这句话须为 1 到 2000 个字");
  return text;
}

export { STUB_PREFIX };
