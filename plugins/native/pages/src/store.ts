import { PagesComments } from "./comments-store.js";
import { extractFromPagesBody, unpublishedKnowledgePages } from "./extract.js";
import type { HomeStoreDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesBody, PagesFolder, PagesRecord } from "./contract.js";
import { EMPTY_PAGES_BODY, parsePagesBody } from "./document.js";
import { pagesErrors } from "./error.js";
import { PagesGenerationStore } from "./store-generations.js";
import { pagesTemplateById } from "./templates.js";
import type { PagesPublicationIntent, PagesPublicationSnapshot } from "./promote.js";
import { PAGES_DATABASE } from "./database.js";
export { PAGES_DATABASE };

/** The SQL the store runs: its own connection, or the library the Runtime gives the plugin, read or inside one write transaction. */
export type PagesSqlValue = string | number | null;
type SqlRow = Readonly<Record<string, unknown>>;
export interface PagesSql {
  get(sql: string, parameters?: readonly PagesSqlValue[]): SqlRow | null | undefined;
  all(sql: string, parameters?: readonly PagesSqlValue[]): readonly SqlRow[];
  run(sql: string, parameters?: readonly PagesSqlValue[]): { changes: number | bigint };
}

/** Where the actions read and write: reads run on their own; a write waits for the call's authority first. */
export interface PagesStores {
  read<T>(run: (store: PagesStore) => T): T;
  write<T>(caller: Pick<ActionExecutionContext, "beforeEffect">, run: (store: PagesStore) => T): Promise<T>;
}

/** Reads and writes on a store opened for each run, for tests and maintenance; the caller's beforeEffect is awaited, and the Store's own `atomically` still wraps each business operation. */
export function ownPagesStores(withStore: <T>(run: (store: PagesStore) => T) => T): PagesStores {
  return { read: withStore, async write(caller, run) { await caller.beforeEffect(); return withStore(run); } };
}

export interface PagesImportDocumentsInput {
  readonly project_id: string;
  readonly request_id: string;
  readonly request_hash: string;
  readonly folder_id?: string;
  readonly documents: readonly { readonly title?: string; readonly body?: PagesBody; readonly starred?: boolean; readonly goal_id?: string; readonly template_id?: string }[];
  /** How a request that was already made is told, and who learns it was: the import dialog keeps `IMPORT_REPLAY`. */
  readonly replay?: PagesReplay;
}

interface PagesReplay {
  /** Said when the same request comes with other content. */
  readonly changed: string;
  /** Said when a document the request made has since been deleted. */
  readonly removed: string;
  /** Called once the request is answered from what it made before, instead of making the documents again. */
  readonly onReplay?: () => void;
}

const IMPORT_REPLAY: PagesReplay = { changed: "这次导入的文件、选择或文件夹已改变，请重新预览后导入", removed: "这批导入已完成，但部分文档已删除；不会重新创建" };

export class PagesStore extends PagesGenerationStore {
  readonly comments: PagesComments;
  /**
   * `attempts` is the memory of the generation calls one plugin instance (or one own-connection store family) started; `atomically`
   * runs one business operation as a unit (the Runtime adapter binds the Store inside its one `database.transaction`, so it is
   * the identity there); `release` closes what the Store opened.
   */
  constructor(db: PagesSql, attempts = new Map<string, boolean>(),
    atomically: <T>(run: () => T) => T = run => run(), private readonly release: () => void = () => {}) {
    super(db, attempts, atomically);
    this.comments = new PagesComments(db, atomically, (id, project) => this.get(id, project));
  }

  close(): void {
    this.release();
  }

  list(projectId: string): PagesRecord[] {
    const project_id = normalizeProjectId(projectId);
    return this.db.all("SELECT * FROM pages WHERE project_id = ? ORDER BY starred DESC, datetime(updated_at) DESC, title COLLATE NOCASE", [project_id]).map(fromPageRow);
  }

  listFolders(projectId: string): PagesFolder[] {
    const project_id = normalizeProjectId(projectId);
    return this.db.all("SELECT * FROM folders WHERE project_id = ? ORDER BY title COLLATE NOCASE", [project_id]).map(fromFolderRow);
  }

  get(id: string, projectId?: string): PagesRecord {
    const row = this.db.get("SELECT * FROM pages WHERE id = ?", [id]);
    if (!row) throw pagesErrors.not_found("找不到这篇文档");
    if (projectId && row.project_id !== normalizeProjectId(projectId)) {
      throw pagesErrors.not_found("找不到这篇文档");
    }
    return fromPageRow(row);
  }

  create(input: {
    title?: string;
    project_id: string;
    folder_id?: string;
    starred?: boolean;
    goal_id?: string;
    template_id?: string;
    body?: PagesBody;
  }): PagesRecord {
    const now = new Date().toISOString();
    const template = input.template_id ? pagesTemplateById(input.template_id) : undefined;
    if (input.template_id && !template) throw pagesErrors.invalid("找不到这份模板");
    const project_id = normalizeProjectId(input.project_id);
    const folder_id = normalizeFolderId(input.folder_id, this, project_id);
    const rawBody = input.body ?? template?.body ?? { type: "doc", content: [...(EMPTY_PAGES_BODY.content ?? [])] };
    const record: PagesRecord = {
      id: crypto.randomUUID(),
      project_id,
      title: normalizeTitle(input.title ?? template?.title ?? "未命名文档"),
      body: parsePagesBody(JSON.parse(JSON.stringify(rawBody))),
      folder_id,
      starred: Boolean(input.starred),
      goal_id: normalizeGoalId(input.goal_id),
      artifact_id: "",
      artifact_version: 0,
      created_at: now,
      updated_at: now,
      version: 1,
    };
    this.db.run(
      "INSERT INTO pages (id, project_id, title, body_json, folder_id, starred, goal_id, artifact_id, artifact_version, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [record.id, record.project_id, record.title, JSON.stringify(record.body),
        record.folder_id, record.starred ? 1 : 0, record.goal_id, record.artifact_id, record.artifact_version,
        record.created_at, record.updated_at, record.version],
    );
    return record;
  }

  /** Create a selected batch once; a retry returns current records without overwriting edits. */
  importDocuments(input: PagesImportDocumentsInput): PagesRecord[] {
    const project_id = normalizeProjectId(input.project_id);
    if (!input.documents.length || input.documents.length > 100) throw pagesErrors.invalid("请选择 1 到 100 篇文档");
    return this.atomically(() => {
      const prior = this.db.get("SELECT request_hash, document_ids_json FROM page_imports WHERE project_id = ? AND request_id = ?", [project_id, input.request_id]);
      if (prior) {
        const replay = input.replay ?? IMPORT_REPLAY;
        if (prior.request_hash !== input.request_hash) throw pagesErrors.unavailable(replay.changed);
        const ids = JSON.parse(String(prior.document_ids_json)) as string[];
        const documents = ids.map((id) => {
          try { return this.get(id, project_id); }
          catch (error) {
            if (error instanceof ActionError && error.code === "pages.not_found") {
              throw pagesErrors.unavailable(replay.removed);
            }
            throw error;
          }
        });
        replay.onReplay?.();
        return documents;
      }
      const folder_id = normalizeFolderId(input.folder_id, this, project_id);
      const documents = input.documents.map((document) => this.create({
        project_id,
        folder_id,
        ...document,
      }));
      this.db.run("INSERT INTO page_imports (project_id, request_id, request_hash, document_ids_json, created_at) VALUES (?, ?, ?, ?, ?)",
        [project_id, input.request_id, input.request_hash, JSON.stringify(documents.map((document) => document.id)), new Date().toISOString()]);
      return documents;
    });
  }

  update(id: string, patch: {
    title?: string;
    body?: PagesBody;
    folder_id?: string;
    starred?: boolean;
    goal_id?: string;
    artifact_id?: string;
    artifact_version?: number;
    expected_version?: number;
  }, projectId?: string): PagesRecord {
    const current = this.get(id, projectId);
    if (patch.expected_version !== undefined && patch.expected_version !== current.version) throw pagesErrors.conflict("文档已被其他窗口修改，请重新读取后保存");
    const next: PagesRecord = {
      ...current,
      title: patch.title !== undefined ? normalizeTitle(patch.title) : current.title,
      body: patch.body !== undefined ? parsePagesBody(patch.body) : current.body,
      folder_id: patch.folder_id !== undefined
        ? normalizeFolderId(patch.folder_id, this, current.project_id)
        : current.folder_id,
      starred: patch.starred !== undefined ? Boolean(patch.starred) : current.starred,
      goal_id: patch.goal_id !== undefined ? normalizeGoalId(patch.goal_id) : current.goal_id,
      artifact_id: patch.artifact_id !== undefined ? String(patch.artifact_id) : current.artifact_id,
      artifact_version: patch.artifact_version !== undefined ? Number(patch.artifact_version) || 0 : current.artifact_version,
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
    const result = this.db.run(
      "UPDATE pages SET title = ?, body_json = ?, folder_id = ?, starred = ?, goal_id = ?, artifact_id = ?, artifact_version = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
      [next.title, JSON.stringify(next.body), next.folder_id, next.starred ? 1 : 0,
        next.goal_id, next.artifact_id, next.artifact_version,
        next.updated_at, next.version, id, current.version],
    );
    if (result.changes !== 1) throw pagesErrors.conflict("文档已被其他窗口修改，请重新读取后保存");
    return next;
  }

  beginPublication(id: string, projectId: string, actorId: string, goalId?: string, expectedVersion?: number, existing?: PagesPublicationSnapshot, version?: number): PagesPublicationIntent {
    return this.atomically(() => {
      const current = this.get(id, projectId);
      const pending = this.publicationIntent(id);
      if (expectedVersion !== undefined && current.version !== expectedVersion) throw pagesErrors.conflict("文档已改变，请重新读取后保存成果");
      if (pending) {
        if (pending.actor_id !== actorId) throw pagesErrors.publication_owner("请由上次保存的发起者恢复发布，原快照已保留");
        if (goalId !== undefined && goalId !== pending.goal_id) throw pagesErrors.publication_pending("请先恢复上次保存的成果，再关联新的 Goal");
        return pending;
      }
      const intent: PagesPublicationIntent = { title: existing?.title ?? current.title, body: existing?.body ?? current.body,
        goal_id: existing?.goal_id ?? normalizeGoalId(goalId ?? current.goal_id), original_goal_id: existing?.goal_id ?? current.goal_id,
        version: version ?? current.artifact_version + 1, source_version: current.version, actor_id: actorId };
      this.db.run("UPDATE pages SET publication_pending_json = ? WHERE id = ?", [JSON.stringify(intent), id]);
      return intent;
    });
  }

  completePublication(id: string, projectId: string, intent: PagesPublicationIntent, artifact: { artifact_id: string; version: number }): PagesRecord {
    return this.atomically(() => {
      const current = this.get(id, projectId);
      if (current.artifact_id === artifact.artifact_id && current.artifact_version >= intent.version) return current;
      const pending = this.publicationIntent(id);
      if (!pending || JSON.stringify(pending) !== JSON.stringify(intent)) throw pagesErrors.publication_conflict("保存记录已改变，请重新读取文稿");
      this.update(id, { artifact_id: artifact.artifact_id, artifact_version: artifact.version,
        ...(current.goal_id === intent.original_goal_id ? { goal_id: intent.goal_id } : {}), expected_version: current.version }, projectId);
      this.db.run("UPDATE pages SET publication_pending_json = NULL WHERE id = ?", [id]);
      return this.get(id, projectId);
    });
  }

  private publicationIntent(id: string): PagesPublicationIntent | null {
    const pending = this.db.get("SELECT publication_pending_json FROM pages WHERE id = ?", [id])?.publication_pending_json;
    return typeof pending === "string" && pending ? JSON.parse(pending) as PagesPublicationIntent : null;
  }

  /**
   * Move one document to another partition (the personal space or a project). Its id stays, so every link and
   * reference still finds it. What only meant something in the old project is let go: its folder, its Goal (Goals
   * belong to one project) and the numbering of fixed versions (those versions stay in the old project's results).
   */
  relocate(id: string, from: string, to: string): PagesRecord {
    const target = normalizeProjectId(to);
    return this.atomically(() => {
      const current = this.get(id, from);
      if (current.publication_pending) throw pagesErrors.publication_pending("上次成果保存还没完成，请先在原位置继续保存，再移动");
      // A move is not an edit: the content and its version stay as they were, so work that recorded this version still matches.
      const result = this.db.run("UPDATE pages SET project_id = ?, folder_id = '', goal_id = '', artifact_id = '', artifact_version = 0 WHERE id = ? AND version = ?",
        [target, id, current.version]);
      if (result.changes !== 1) throw pagesErrors.conflict("文档刚被修改，请重新读取后再移动");
      return this.get(id, target);
    });
  }

  /** An independent copy in another partition; the same request always returns the same copy. */
  duplicate(id: string, from: string, to: string, requestId: string): PagesRecord {
    const source = this.get(id, from);
    const documents = [{ title: source.title, body: source.body }];
    return this.importDocuments({ project_id: to, request_id: "copy:" + requestId, request_hash: "copy:" + id + ":" + source.version, documents })[0]!;
  }

  delete(id: string, projectId?: string): void {
    this.get(id, projectId);
    this.db.run("DELETE FROM pages WHERE id = ?", [id]);
  }

  /** Keep what an edit replaced, so it can be taken back while nothing changed since; returns the change's id. */
  keepChange(before: PagesRecord, after: PagesRecord): string {
    return keepPagesChange(this.db, before, after);
  }

  /** Take one kept edit back: the document returns to what it was before, only if no one changed it since. */
  revertChange(changeId: string, projectId?: string): PagesRecord {
    const row = this.db.get("SELECT page_id, to_version, before_json FROM page_changes WHERE change_id = ?", [changeId]);
    if (!row) throw pagesErrors.not_found("这次修改已经撤销过，或记录已过期（保留 14 天）");
    const current = this.get(String(row.page_id), projectId);
    if (current.version !== Number(row.to_version)) throw pagesErrors.conflict(`《${current.title || "未命名"}》在这次修改之后又改过（现在是第 ${current.version} 版），没有撤销；需要时请在 Pages 里自己改回`);
    const before = JSON.parse(String(row.before_json)) as Pick<PagesRecord, "title" | "body" | "folder_id" | "starred" | "goal_id">;
    const restored = this.update(String(row.page_id), { ...before, expected_version: current.version }, projectId);
    this.db.run("DELETE FROM page_changes WHERE change_id = ?", [changeId]);
    return restored;
  }

  /** Take back a document just created: removed only while it is still the version it was created at, so no later edit is lost. */
  discard(id: string, expectedVersion: number, projectId?: string): void {
    const current = this.get(id, projectId);
    if (current.version !== expectedVersion) throw pagesErrors.conflict(`《${current.title || "未命名"}》在新建之后改过（现在是第 ${current.version} 版），没有撤销；需要时请在 Pages 里自己删除`);
    const result = this.db.run("DELETE FROM pages WHERE id = ? AND version = ?", [id, expectedVersion]);
    if (result.changes !== 1) throw pagesErrors.conflict("文档刚被修改，没有撤销");
  }

  extract(id: string, projectId: string): { document: PagesRecord; cards: number; created: PagesRecord[] } {
    return this.atomically(() => {
      const current = this.get(id, projectId);
      const extracted = extractFromPagesBody(current.title, current.body);
      const document = this.update(id, { body: extracted.body, expected_version: current.version }, projectId);
      const created = unpublishedKnowledgePages(this.list(projectId).map(page => page.title), extracted.knowledge)
        .map(page => this.create({ ...page, project_id: projectId, folder_id: current.folder_id }));
      return { document, cards: extracted.cards, created };
    });
  }

  createFolder(input: { title?: string; project_id: string }): PagesFolder {
    const now = new Date().toISOString();
    const folder: PagesFolder = {
      id: crypto.randomUUID(),
      project_id: normalizeProjectId(input.project_id),
      title: normalizeFolderTitle(input.title ?? "未命名文件夹"),
      created_at: now,
      updated_at: now,
    };
    this.db.run("INSERT INTO folders (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [folder.id, folder.project_id, folder.title, folder.created_at, folder.updated_at]);
    return folder;
  }

  getFolder(id: string, projectId?: string): PagesFolder {
    const row = this.db.get("SELECT * FROM folders WHERE id = ?", [id]);
    if (!row) throw pagesErrors.not_found("找不到这个文件夹");
    if (projectId && row.project_id !== normalizeProjectId(projectId)) {
      throw pagesErrors.not_found("找不到这个文件夹");
    }
    return fromFolderRow(row);
  }

  updateFolder(id: string, patch: { title?: string }, projectId?: string): PagesFolder {
    const current = this.getFolder(id, projectId);
    const next: PagesFolder = {
      ...current,
      title: patch.title !== undefined ? normalizeFolderTitle(patch.title) : current.title,
      updated_at: new Date().toISOString(),
    };
    this.db.run("UPDATE folders SET title = ?, updated_at = ? WHERE id = ?", [next.title, next.updated_at, id]);
    return next;
  }

  deleteFolder(id: string, projectId?: string): void {
    this.atomically(() => {
      this.getFolder(id, projectId);
      this.db.run("UPDATE pages SET folder_id = '', version = version + 1, updated_at = ? WHERE folder_id = ?", [new Date().toISOString(), id]);
      this.db.run("DELETE FROM folders WHERE id = ?", [id]);
    });
  }
}

function keepPagesChange(db: PagesSql, before: PagesRecord, after: PagesRecord): string {
  const changeId = crypto.randomUUID();
  const now = new Date();
  db.run("DELETE FROM page_changes WHERE created_at < ?", [new Date(now.getTime() - 14 * 24 * 3600_000).toISOString()]);
  db.run("INSERT INTO page_changes(change_id, page_id, to_version, before_json, created_at) VALUES (?, ?, ?, ?, ?)",
    [changeId, after.id, after.version, JSON.stringify({ title: before.title, body: before.body, folder_id: before.folder_id, starred: before.starred, goal_id: before.goal_id }), now.toISOString()]);
  return changeId;
}

function fromPageRow(row: SqlRow): PagesRecord {
  const pending = row.publication_pending_json ? JSON.parse(String(row.publication_pending_json)) as PagesPublicationIntent : null;
  return {
    id: String(row.id),
    project_id: String(row.project_id ?? ""),
    title: String(row.title),
    body: parsePagesBody(JSON.parse(String(row.body_json))),
    folder_id: String(row.folder_id ?? ""),
    starred: Boolean(row.starred),
    goal_id: String(row.goal_id ?? ""),
    artifact_id: String(row.artifact_id ?? ""),
    artifact_version: Number(row.artifact_version) || 0,
    ...(pending ? { publication_pending: { version: pending.version, source_version: pending.source_version, goal_id: pending.goal_id } } : {}),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    version: Number(row.version),
  };
}

function fromFolderRow(row: SqlRow): PagesFolder {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    title: String(row.title),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeProjectId(value: string): string {
  const id = value.trim();
  if (!id) throw pagesErrors.invalid("缺少项目");
  if (id.length > 80) throw pagesErrors.invalid("项目标识过长");
  return id;
}

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名文档";
  if (title.length > 80) throw pagesErrors.invalid("标题须为 1 到 80 个字");
  return title;
}

function normalizeFolderTitle(value: string): string {
  const title = value.trim() || "未命名文件夹";
  if (title.length > 40) throw pagesErrors.invalid("文件夹名须为 1 到 40 个字");
  return title;
}

function normalizeGoalId(value: string | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw pagesErrors.invalid("Goal 须为文字");
  const id = value.trim();
  if (id.length > 80) throw pagesErrors.invalid("Goal 标识过长");
  return id;
}

function normalizeFolderId(value: string | undefined, store: PagesStore, projectId: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw pagesErrors.invalid("文件夹须为文字");
  const id = value.trim();
  if (!id) return "";
  store.getFolder(id, projectId);
  return id;
}

/** This plugin's store in the Home's store registry (W4-11): `pages/pages.db` at its one baseline. */
export const PAGES_HOME_STORE: HomeStoreDeclaration = { path: "pages", library: { baseline: PAGES_DATABASE } };
