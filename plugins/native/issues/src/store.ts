import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginDatabaseDeclaration, PluginDatabaseReader, PluginSqlRow, PluginSqlValue } from "@molis-ai/molis-work-contracts/platform/plugin";

export const ISSUE_TYPES = ["bug", "experience", "feature"] as const;
export type IssueType = typeof ISSUE_TYPES[number];
export interface IssueContext {
  recorded_at: string;
  page: { url: string | null; title: string | null; provenance: "host_snapshot" | "client_reported" } | null;
  supplement: { text: string; provenance: "client_reported" | "user_edited" };
  caller: { actor_id: string; audience: string };
}
export interface Issue {
  id: string; title: string; type: IssueType; description: string; context: IssueContext;
  submitter_id: string; entered_via: "manual" | "assistant" | "mcp"; created_at: string; updated_at: string; version: number;
}
export interface IssueCreate { title: string; type: IssueType; description: string; supplement?: string }
export interface IssueUpdate { id: string; expected_version: number; title?: string; type?: IssueType; description?: string; supplement?: string }
export interface IssueDelete { id: string; expected_version: number }
export interface IssueCursor { created_at: string; id: string }
export interface IssueList { type?: IssueType; limit?: number; cursor?: IssueCursor }
export interface IssueListResult { items: Issue[]; next_cursor: IssueCursor | null }

export const ISSUES_DATABASE: PluginDatabaseDeclaration = {
  store_name: "issues", version: 1, read_permission: "issues:read", write_permission: "issues:write",
  schema: `CREATE TABLE issues (
    id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200),
    type TEXT NOT NULL CHECK(type IN ('bug','experience','feature')), description TEXT NOT NULL CHECK(length(description) <= 100000),
    context_json TEXT NOT NULL, submitter_id TEXT NOT NULL,
    entered_via TEXT NOT NULL CHECK(entered_via IN ('manual','assistant','mcp')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL CHECK(version >= 1)
  ); CREATE INDEX issues_by_submitter_created ON issues(submitter_id,created_at DESC,id DESC);`,
};

function decode(row: PluginSqlRow): Issue {
  return { id: String(row.id), title: String(row.title), type: row.type as IssueType, description: String(row.description),
    context: JSON.parse(String(row.context_json)) as IssueContext, submitter_id: String(row.submitter_id), entered_via: row.entered_via as Issue["entered_via"],
    created_at: String(row.created_at), updated_at: String(row.updated_at), version: Number(row.version) };
}
function text(value: unknown, name: string, maximum: number, nonempty = false): asserts value is string {
  if (typeof value !== "string" || value.length > maximum || nonempty && !value.trim()) throw new ActionError("actions.input_invalid", `${name}格式不正确或太长`);
}
function fields(input: Partial<IssueCreate>): void {
  if (input.title !== undefined) text(input.title, "标题", 200, true);
  if (input.description !== undefined) text(input.description, "描述", 100000);
  if (input.supplement !== undefined) text(input.supplement, "补充信息", 10000);
  if (input.type !== undefined && !ISSUE_TYPES.includes(input.type)) throw new ActionError("actions.input_invalid", "请选择问题类型");
}
function expected(input: IssueDelete): void {
  text(input.id, "问题 ID", 100, true);
  if (!Number.isSafeInteger(input.expected_version) || input.expected_version < 1) throw new ActionError("actions.input_invalid", "请提供读取时的问题版本");
}

/** Business SQL stays with Issue; this object cannot select a Home or open a database. */
export class IssueStore {
  constructor(private readonly db: PluginDatabase, private readonly owner: string) {
    if (!owner) throw new Error("Issue 缺少可信的个人所有者");
  }
  read(id: string, db: PluginDatabaseReader = this.db): Issue {
    text(id, "问题 ID", 100, true);
    const row = db.get("SELECT * FROM issues WHERE id = ? AND submitter_id = ?", [id, this.owner]);
    if (!row) throw new ActionError("actions.missing", "这条问题不存在或已删除");
    return decode(row);
  }
  list(input: IssueList): IssueListResult {
    fields({ type: input.type });
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ActionError("actions.input_invalid", "每页数量必须是 1 到 100");
    const clauses = ["submitter_id = ?"], parameters: PluginSqlValue[] = [this.owner];
    if (input.type) { clauses.push("type = ?"); parameters.push(input.type); }
    if (input.cursor) {
      text(input.cursor.created_at, "分页时间", 40, true); text(input.cursor.id, "分页 ID", 100, true);
      clauses.push("(created_at < ? OR (created_at = ? AND id < ?))"); parameters.push(input.cursor.created_at, input.cursor.created_at, input.cursor.id);
    }
    const rows = this.db.all(`SELECT * FROM issues WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC,id DESC LIMIT ?`, [...parameters, limit + 1]).map(decode);
    const items = rows.slice(0, limit), last = items.at(-1);
    return { items, next_cursor: rows.length > limit && last ? { created_at: last.created_at, id: last.id } : null };
  }
  async create(input: IssueCreate, caller: ActionExecutionContext): Promise<Issue> {
    text(input.title, "标题", 200, true); text(input.description, "描述", 100000);
    if (!ISSUE_TYPES.includes(input.type)) throw new ActionError("actions.input_invalid", "请选择问题类型");
    fields(input);
    return this.db.transaction(caller.beforeEffect, db => {
      const now = new Date().toISOString(), id = crypto.randomUUID();
      const context: IssueContext = { recorded_at: now, page: caller.page_context ? { ...caller.page_context } : null,
        supplement: { text: input.supplement ?? "", provenance: "client_reported" }, caller: { actor_id: caller.actor_id, audience: caller.audience } };
      const entered = caller.audience === "mcp" ? "mcp" : caller.audience === "agent" ? "assistant" : "manual";
      db.run("INSERT INTO issues (id,title,type,description,context_json,submitter_id,entered_via,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,1)",
        [id, input.title, input.type, input.description, JSON.stringify(context), this.owner, entered, now, now]);
      return this.read(id, db);
    });
  }
  async update(input: IssueUpdate, caller: ActionExecutionContext): Promise<Issue> {
    expected(input); fields(input);
    if (![input.title, input.type, input.description, input.supplement].some(value => value !== undefined)) throw new ActionError("actions.input_invalid", "请说明要修改的内容");
    return this.db.transaction(caller.beforeEffect, db => {
      const current = this.read(input.id, db);
      const context = input.supplement === undefined ? current.context : { ...current.context,
        supplement: { text: input.supplement, provenance: "user_edited" as const } };
      const result = db.run("UPDATE issues SET title=?,type=?,description=?,context_json=?,updated_at=?,version=version+1 WHERE id=? AND submitter_id=? AND version=?",
        [input.title ?? current.title, input.type ?? current.type, input.description ?? current.description, JSON.stringify(context), new Date().toISOString(), input.id, this.owner, input.expected_version]);
      if (Number(result.changes) !== 1) throw new ActionError("actions.conflict", "这条问题已被其他窗口修改，请保留草稿并重新读取后核对");
      return this.read(input.id, db);
    });
  }
  async delete(input: IssueDelete, caller: ActionExecutionContext): Promise<{ id: string; deleted: true }> {
    expected(input);
    return this.db.transaction(caller.beforeEffect, db => {
      this.read(input.id, db);
      if (Number(db.run("DELETE FROM issues WHERE id=? AND submitter_id=? AND version=?", [input.id, this.owner, input.expected_version]).changes) !== 1) {
        throw new ActionError("actions.conflict", "这条问题已被修改，请重新读取后确认删除");
      }
      return { id: input.id, deleted: true };
    });
  }
}
