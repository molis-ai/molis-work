import { createHash } from "node:crypto";
import { sameCarriedRecord, type ActionExecutionContext, type PlacementExport, type PlacementRecord } from "@molis-ai/molis-work-contracts/platform/actions";
import { LINGGUANG_BODY_LIMIT } from "./contract.js";
import type {
  LingguangConversation,
  LingguangMessage,
  LingguangMessageRole,
  LingguangSpark,
  LingguangStatus,
} from "./contract.js";
import { lingguangErrors } from "./error.js";
import { LINGGUANG_DATABASE } from "./database.js";
export { LINGGUANG_DATABASE };

interface SparkRow {
  id: string;
  title: string;
  body: string;
  source_kind: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ConversationRow {
  id: string;
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

export interface LingguangConversationState {
  readonly conversation: LingguangConversation;
  readonly sparks: LingguangSpark[];
  readonly messages: LingguangMessage[];
}

/** The same SQL on the Runtime's read/transaction port, or a connection owned by a test or maintenance operation. */
interface LingguangSql {
  get(sql: string, parameters?: readonly LingguangSqlValue[]): Readonly<Record<string, unknown>> | null | undefined;
  all(sql: string, parameters?: readonly LingguangSqlValue[]): readonly Readonly<Record<string, unknown>>[];
  run(sql: string, parameters?: readonly LingguangSqlValue[]): { changes: number | bigint };
}
type LingguangSqlValue = string | number | null;

export interface LingguangStores {
  read<T>(run: (store: LingguangStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: LingguangStore) => T): Promise<T>;
}

export function ownLingguangStores(withStore: <T>(run: (store: LingguangStore) => T) => T): LingguangStores {
  return { read: withStore, async write(caller, run) { await caller.beforeEffect(); return withStore(run); } };
}

/** One partition's sparks: the library is that partition's own, so a record's `project_id` is the partition this store was opened for. */
export class LingguangStore {
  constructor(private readonly db: LingguangSql, readonly partition: string, private readonly transaction: <T>(run: () => T) => T = run => run(), private readonly release: () => void = () => {}) {}

  close(): void {
    this.release();
  }

  list(): LingguangSpark[] {
    const rows = this.db.all("SELECT * FROM sparks WHERE status = 'inbox' ORDER BY created_at DESC, rowid DESC") as unknown as SparkRow[];
    return rows.map(row => fromSparkRow(row, this.partition));
  }

  get(id: string): LingguangSpark {
    const row = this.db.get("SELECT * FROM sparks WHERE id = ?", [id]) as unknown as SparkRow | undefined;
    if (!row) throw lingguangErrors.not_found("找不到这条灵光");
    return fromSparkRow(row, this.partition);
  }

  /**
   * A request id names one save. Repeating it with the same input (a retried workflow delivery) returns the spark it
   * created the first time, wherever that spark lives now; another input under the same id is refused, so a save is
   * never silently dropped in favour of someone else's spark.
   */
  create(input: { title?: string; body?: string; request_id?: string }): LingguangSpark {
    const body = normalizeBody(input.body ?? "");
    const title = normalizeTitle(input.title ?? "", body) || "未命名灵光";
    if (!input.request_id) return this.insertSpark(title, body);
    return this.once(input.request_id, fingerprint("create", title, body), () => this.insertSpark(title, body));
  }

  private insertSpark(title: string, body: string): LingguangSpark {
    const now = new Date().toISOString();
    const record: LingguangSpark = {
      id: crypto.randomUUID(),
      project_id: this.partition,
      title,
      body,
      source_kind: "manual",
      status: "inbox",
      created_at: now,
      updated_at: now,
    };
    this.db.run("INSERT INTO sparks (id, title, body, source_kind, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [record.id, record.title, record.body, record.source_kind, record.status, record.created_at, record.updated_at]);
    return record;
  }

  /**
   * Run `make` once for a request id in this partition. The stored key is the id plus a fingerprint of the input: the table
   * has no column for one, and its schema version is not raised for it (an existing store would be refused). A repeat with
   * the same fingerprint returns the earlier spark by its id alone, because the person may have moved it since.
   */
  private once(requestId: string, inputFingerprint: string, make: () => LingguangSpark): LingguangSpark {
    return this.transaction(() => {
      const sameId = (this.db.all("SELECT request_id, spark_id FROM spark_requests WHERE request_id >= ? AND request_id < ?", [requestId + "#", requestId + "$"]) as { request_id: string; spark_id: string }[])
        .filter(row => row.request_id.length === requestId.length + 1 + FINGERPRINT_LENGTH);
      const key = requestId + "#" + inputFingerprint;
      const prior = sameId.find(row => row.request_id === key);
      if (prior) return this.get(prior.spark_id);
      if (sameId.length) throw lingguangErrors.request_conflict("这个请求 ID 已用于保存另一条灵光，请换一个新的请求 ID");
      const created = make();
      this.db.run("INSERT INTO spark_requests (request_id, spark_id) VALUES (?, ?)", [key, created.id]);
      return created;
    });
  }

  update(id: string, patch: { title?: string; body?: string; expected_updated_at?: string }): LingguangSpark {
    return this.transaction(() => {
      const current = this.get(id);
      if (patch.expected_updated_at !== undefined && current.updated_at !== patch.expected_updated_at) {
        throw lingguangErrors.conflict("这条灵光已在别处修改，请重新打开后再编辑");
      }
      if (current.status !== "inbox") throw lingguangErrors.invalid("丢掉的灵光不能再改");
      const body = patch.body !== undefined ? normalizeBody(patch.body) : current.body;
      const title = patch.title !== undefined ? (normalizeTitle(patch.title, body) || "未命名灵光") : current.title;
      const next: LingguangSpark = {
        ...current,
        title,
        body,
        updated_at: new Date(Math.max(Date.now(), Date.parse(current.updated_at) + 1)).toISOString(),
      };
      this.db.run("UPDATE sparks SET title = ?, body = ?, updated_at = ? WHERE id = ?", [next.title, next.body, next.updated_at, id]);
      return next;
    });
  }

  /**
   * One spark as the record placement carries to another partition (`placement.export`), with a brainstorm that only discussed it. One
   * shared with other sparks would lose part of its context, so such a spark can be copied but not moved.
   */
  exportRecord(id: string): PlacementExport {
    const current = this.get(id);
    const talks = this.db.all("SELECT id, spark_ids_json, created_at, updated_at FROM conversations", [])
      .map(row => ({ id: String(row.id), spark_ids_json: String(row.spark_ids_json), created_at: String(row.created_at), updated_at: String(row.updated_at) }))
      .filter(row => (JSON.parse(row.spark_ids_json) as string[]).includes(id));
    const shared = talks.some(row => (JSON.parse(row.spark_ids_json) as string[]).length > 1);
    const conversations = talks.map(row => JSON.stringify({ id: row.id, created_at: row.created_at, updated_at: row.updated_at,
      messages: this.listMessages(row.id).map(({ id: message, role, body, created_at }) => ({ id: message, role, body, created_at })) }));
    const { title, body, status, created_at, updated_at } = current;
    return { subject: { kind: "lingguang_spark", id }, revision: `${updated_at}:${status}`,
      record: { title, body, status, created_at, updated_at, shared, conversations } };
  }

  /**
   * Writes a carried spark here (`placement.put`). With `targetId` (a move) it keeps its id, time and its own brainstorm, replacing what an
   * earlier attempt of the same move put; without (a copy) it is an independent spark of the same words (without its brainstorms), and the
   * same request makes the same one.
   */
  putRecord(record: PlacementRecord, requestId: string, targetId?: string): LingguangSpark {
    const carried = carriedSpark(record);
    if (targetId === undefined) {
      return this.once("copy:" + requestId, fingerprint("copy", carried.title, carried.body), () => this.insertSpark(carried.title, carried.body));
    }
    if (carried.shared) throw lingguangErrors.invalid("这条灵光和其他灵光在同一场头脑风暴里，移走会让那场对话缺了它；可以复制到别处");
    return this.transaction(() => {
      // An earlier attempt of the same move already put it here: only that exact record is a replay; anything written since is kept (conflict).
      if (this.db.get("SELECT 1 FROM sparks WHERE id = ?", [targetId])) {
        // Compared with what this put would write (its own normalizing included), so a retry of the same move is found the same.
        if (sameCarriedRecord(this.exportRecord(targetId).record, { ...record, title: carried.title, body: carried.body })) return this.get(targetId);
        throw lingguangErrors.conflict("目标位置已经有这条灵光，而且内容或对话不同；没有覆盖它");
      }
      // Only a conversation an earlier attempt left for this spark goes; one of another spark's is never touched (its insert below refuses).
      for (const talk of carried.conversations) {
        if (!this.db.get("SELECT 1 FROM conversations WHERE id = ? AND spark_key = ?", [talk.id, targetId])) continue;
        this.db.run("DELETE FROM messages WHERE conversation_id = ?", [talk.id]);
        this.db.run("DELETE FROM conversations WHERE id = ?", [talk.id]);
      }
      this.db.run("INSERT INTO sparks (id, title, body, source_kind, status, created_at, updated_at) VALUES (?, ?, ?, 'manual', ?, ?, ?)",
        [targetId, carried.title, carried.body, carried.status, carried.created_at, carried.updated_at]);
      for (const talk of carried.conversations) {
        this.db.run("INSERT INTO conversations (id, spark_key, spark_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
          [talk.id, targetId, JSON.stringify([targetId]), talk.created_at, talk.updated_at]);
        for (const message of talk.messages) this.db.run("INSERT INTO messages (id, conversation_id, role, body, created_at) VALUES (?, ?, ?, ?, ?)",
          [message.id, talk.id, message.role, message.body, message.created_at]);
      }
      return this.get(targetId);
    });
  }

  /** Lets a spark that went to another partition go from here (`placement.remove`) with its own brainstorm, only while it is still the one carried. */
  removeCarried(id: string, revision: string): boolean {
    return this.transaction(() => {
      const row = this.db.get("SELECT updated_at, status FROM sparks WHERE id = ?", [id]);
      if (!row) return false;
      if (`${String(row.updated_at)}:${String(row.status)}` !== revision) throw lingguangErrors.conflict("这条灵光刚被修改，请重新打开后再移动");
      const talks = (this.db.all("SELECT id, spark_ids_json FROM conversations", []) as { id: string; spark_ids_json: string }[])
        .filter(talk => (JSON.parse(talk.spark_ids_json) as string[]).includes(id));
      if (talks.some(talk => (JSON.parse(talk.spark_ids_json) as string[]).length > 1)) throw lingguangErrors.invalid("这条灵光和其他灵光在同一场头脑风暴里，移走会让那场对话缺了它；可以复制到别处");
      for (const talk of talks) {
        this.db.run("DELETE FROM messages WHERE conversation_id = ?", [talk.id]);
        this.db.run("DELETE FROM conversations WHERE id = ?", [talk.id]);
      }
      return this.db.run("DELETE FROM sparks WHERE id = ? AND updated_at = ?", [id, String(row.updated_at)]).changes === 1;
    });
  }

  /**
   * Move sparks out of the list, keeping their data. `expected_updated_at` is the same guard `update` has, per spark: the copy
   * the caller decided on. A spark that has changed since (words written elsewhere) is not discarded, and nothing in the batch is.
   */
  discard(ids: readonly string[], expected?: Readonly<Record<string, string>>): void {
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    if (!unique.length) throw lingguangErrors.invalid("先选至少一条");
    if (Object.keys(expected ?? {}).some(id => !unique.includes(id))) throw lingguangErrors.invalid("expected_updated_at 只能写所选灵光的 id");
    this.transaction(() => {
      const records = unique.map(id => this.get(id));
      const changed = records.find(current => current.status !== "discarded" && expected?.[current.id] !== undefined && expected[current.id] !== current.updated_at);
      if (changed) throw lingguangErrors.conflict("这条灵光已在别处修改，没有丢掉；重新打开后再决定");
      for (const current of records) {
        if (current.status === "discarded") continue;
        const now = new Date(Math.max(Date.now(), Date.parse(current.updated_at) + 1)).toISOString();
        this.db.run("UPDATE sparks SET status = ?, updated_at = ? WHERE id = ?", ["discarded", now, current.id]);
      }
    });
  }

  openConversation(sparkIds: readonly string[]): {
    conversation: LingguangConversation;
    sparks: LingguangSpark[];
    messages: LingguangMessage[];
  } {
    return this.transaction(() => {
      const sparks = uniqueSparkIds(sparkIds).map((id) => this.get(id));
      if (!sparks.length) throw lingguangErrors.invalid("先选至少一条");
      if (sparks.some((spark) => spark.status !== "inbox")) {
        throw lingguangErrors.invalid("丢掉的灵光不能再拿去聊");
      }
      const spark_ids = sparks.map((spark) => spark.id).sort();
      const spark_key = spark_ids.join(",");
      const existing = this.db.get("SELECT * FROM conversations WHERE spark_key = ?", [spark_key]) as unknown as ConversationRow | undefined;
      const conversation = existing
        ? fromConversationRow(existing, this.partition)
        : insertConversation(this.db, this.partition, spark_key, spark_ids);
      return {
        conversation,
        sparks,
        messages: this.listMessages(conversation.id),
      };
    });
  }

  conversation(conversationId: string): LingguangConversationState {
    const row = this.db.get("SELECT * FROM conversations WHERE id = ?", [conversationId]) as unknown as ConversationRow | undefined;
    if (!row) throw lingguangErrors.not_found("找不到这场对话");
    const conversation = fromConversationRow(row, this.partition);
    return { conversation, sparks: conversation.spark_ids.map(id => this.get(id)), messages: this.listMessages(conversationId) };
  }

  /** Commit a completed turn atomically, against exactly the material the model saw. */
  addReply(conversationId: string, body: string, reply: string, expected: LingguangConversationState): LingguangConversationState {
    const text = normalizeChat(body);
    if (!reply.trim()) throw lingguangErrors.invalid("回复正文不能为空");
    return this.transaction(() => {
      const current = this.conversation(conversationId);
      if (JSON.stringify(current) !== JSON.stringify(expected)) {
        throw lingguangErrors.conflict("生成回复期间灵光或对话已变化，请重新打开后再发送");
      }
      if (current.sparks.some(spark => spark.status !== "inbox")) throw lingguangErrors.invalid("关联灵光已丢弃");
      const now = new Date(Math.max(Date.now(), Date.parse(current.conversation.updated_at) + 1)).toISOString();
      insertMessage(this.db, conversationId, "user", text, now);
      insertMessage(this.db, conversationId, "assistant", reply.trim(), now);
      this.db.run("UPDATE conversations SET updated_at = ? WHERE id = ?", [now, conversationId]);
      return this.conversation(conversationId);
    });
  }

  private listMessages(conversationId: string): LingguangMessage[] {
    const rows = this.db.all("SELECT * FROM messages WHERE conversation_id = ? ORDER BY rowid ASC", [conversationId]) as unknown as MessageRow[];
    return rows.map((row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      role: row.role as LingguangMessageRole,
      body: row.body,
      created_at: row.created_at,
    }));
  }
}


function insertConversation(
  db: LingguangSql,
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
  db.run("INSERT INTO conversations (id, spark_key, spark_ids_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [record.id, spark_key, JSON.stringify(record.spark_ids), record.created_at, record.updated_at]);
  return record;
}

function insertMessage(
  db: LingguangSql,
  conversation_id: string,
  role: LingguangMessageRole,
  body: string,
  created_at: string,
): void {
  db.run("INSERT INTO messages (id, conversation_id, role, body, created_at) VALUES (?, ?, ?, ?, ?)", [crypto.randomUUID(), conversation_id, role, body, created_at]);
}

function fromSparkRow(row: SparkRow, partition: string): LingguangSpark {
  return {
    id: row.id,
    project_id: partition,
    title: row.title,
    body: row.body,
    source_kind: "manual",
    status: row.status as LingguangStatus,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function fromConversationRow(row: ConversationRow, partition: string): LingguangConversation {
  return {
    id: row.id,
    project_id: partition,
    spark_ids: JSON.parse(row.spark_ids_json) as string[],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function uniqueSparkIds(value: readonly string[]): string[] {
  return [...new Set(value.map((id) => id.trim()).filter(Boolean))];
}

/** Two hex digits per byte of SHA-256. */
const FINGERPRINT_LENGTH = 64;
function fingerprint(...parts: string[]): string {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function normalizeTitle(value: string, body: string): string {
  const title = value.trim();
  if ([...title].length > 80) throw lingguangErrors.invalid("标题须为 1 到 80 个字");
  if (title) return title;
  const fallback = body.trim().split(/\r?\n/u)[0]?.trim() ?? "";
  return [...fallback].slice(0, 80).join("");
}

function normalizeBody(value: string): string {
  if ([...value].length > LINGGUANG_BODY_LIMIT) throw lingguangErrors.invalid(`正文须为 0 到 ${LINGGUANG_BODY_LIMIT} 个字`);
  return value;
}

function normalizeChat(value: string): string {
  const text = value.trim();
  if (!text) throw lingguangErrors.invalid("先写下要接着说的话");
  if ([...text].length > 2000) throw lingguangErrors.invalid("这句话须为 1 到 2000 个字");
  return text;
}

/** A carried spark's record, as `exportRecord` wrote it; anything else is refused before a row is written. */
function carriedSpark(record: PlacementRecord): { title: string; body: string; status: LingguangStatus; created_at: string; updated_at: string; shared: boolean;
  conversations: Array<{ id: string; created_at: string; updated_at: string; messages: Array<{ id: string; role: LingguangMessageRole; body: string; created_at: string }> }> } {
  const { title, body, status, created_at, updated_at, shared, conversations } = record;
  const invalid = () => lingguangErrors.invalid("带来的灵光内容不完整");
  if (typeof title !== "string" || typeof body !== "string" || status !== "inbox" && status !== "discarded" || typeof created_at !== "string"
    || typeof updated_at !== "string" || typeof shared !== "boolean" || !Array.isArray(conversations) || conversations.some(row => typeof row !== "string")) throw invalid();
  const talks = (conversations as string[]).map(text => {
    let talk: { id?: unknown; created_at?: unknown; updated_at?: unknown; messages?: unknown };
    try { talk = JSON.parse(text) as typeof talk; } catch { throw invalid(); }
    if (!talk || typeof talk.id !== "string" || !talk.id || typeof talk.created_at !== "string" || typeof talk.updated_at !== "string" || !Array.isArray(talk.messages)) throw invalid();
    const messages = (talk.messages as Array<Record<string, unknown>>).map(message => {
      if (!message || typeof message.id !== "string" || !["user", "assistant", "stub"].includes(message.role as string) || typeof message.body !== "string"
        || typeof message.created_at !== "string") throw invalid();
      return { id: message.id, role: message.role as LingguangMessageRole, body: message.body, created_at: message.created_at };
    });
    return { id: talk.id, created_at: talk.created_at, updated_at: talk.updated_at, messages };
  });
  const text = normalizeBody(body);
  return { title: normalizeTitle(title, text) || "未命名灵光", body: text, status, created_at, updated_at, shared, conversations: talks };
}
