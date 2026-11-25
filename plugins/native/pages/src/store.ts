import { PagesComments } from "./comments-store.js";
import { extractFromPagesBody, unpublishedKnowledgePages } from "./extract.js";
import { ActionError, sameCarriedRecord, type ActionExecutionContext, type PlacementExport, type PlacementRecord } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PagesBody, PagesCommentThread, PagesFolder, PagesRecord } from "./contract.js";
import { EMPTY_PAGES_BODY, parsePagesBody } from "./document.js";
import { pagesErrors } from "./error.js";
import { PagesGenerationStore } from "./store-generations.js";
import { pagesTemplateById } from "./templates.js";
import { PAGES_DATABASE } from "./database.js";
import { PAGES_SUBJECT_KIND as PAGES_DOCUMENT_KIND, readPagesPresentation } from "./presentation.js";
import { createHash } from "node:crypto";
import type { PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
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

/**
 * The Pages library of one partition (`databases.partition`): `<partition root>/libraries/pages.db`, that partition's documents and
 * nothing else, so no row names its project. `partition` is the instance's own partition, which the Host gave it; records say it.
 */
export class PagesStore extends PagesGenerationStore {
  readonly comments: PagesComments;
  /**
   * `attempts` is the memory of the generation calls one plugin instance (or one own-connection store family) started; `atomically`
   * runs one business operation as a unit (the Runtime adapter binds the Store inside its one `database.transaction`, so it is
   * the identity there); `release` closes what the Store opened.
   */
  constructor(db: PagesSql, readonly partition: string, attempts = new Map<string, boolean>(),
    atomically: <T>(run: () => T) => T = run => run(), private readonly release: () => void = () => {}) {
    super(db, attempts, atomically);
    this.comments = new PagesComments(db, atomically, id => this.get(id));
  }

  close(): void {
    this.release();
  }

  list(): PagesRecord[] {
    return this.db.all("SELECT * FROM pages ORDER BY starred DESC, datetime(updated_at) DESC, title COLLATE NOCASE").map(row => fromPageRow(row, this.partition));
  }

  listFolders(): PagesFolder[] {
    return this.db.all("SELECT * FROM folders ORDER BY title COLLATE NOCASE").map(row => fromFolderRow(row, this.partition));
  }

  presentationValues(input: PresentationValuesInput) {
    return readPagesPresentation(this.db, input);
  }

  get(id: string): PagesRecord {
    const row = this.db.get("SELECT * FROM pages WHERE id = ?", [id]);
    if (!row) throw pagesErrors.not_found("找不到这篇文档");
    return fromPageRow(row, this.partition);
  }

  create(input: {
    title?: string;
    folder_id?: string;
    starred?: boolean;
    goal_id?: string;
    template_id?: string;
    body?: PagesBody;
  }): PagesRecord {
    const now = new Date().toISOString();
    const template = input.template_id ? pagesTemplateById(input.template_id) : undefined;
    if (input.template_id && !template) throw pagesErrors.invalid("找不到这份模板");
    const folder_id = normalizeFolderId(input.folder_id, this);
    const rawBody = input.body ?? template?.body ?? { type: "doc", content: [...(EMPTY_PAGES_BODY.content ?? [])] };
    const record: PagesRecord = {
      id: crypto.randomUUID(),
      project_id: this.partition,
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
      "INSERT INTO pages (id, title, body_json, folder_id, starred, goal_id, artifact_id, artifact_version, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [record.id, record.title, JSON.stringify(record.body),
        record.folder_id, record.starred ? 1 : 0, record.goal_id, record.artifact_id, record.artifact_version,
        record.created_at, record.updated_at, record.version],
    );
    return record;
  }

  /** Create a selected batch once; a retry returns current records without overwriting edits. */
  importDocuments(input: PagesImportDocumentsInput): PagesRecord[] {
    if (!input.documents.length || input.documents.length > 100) throw pagesErrors.invalid("请选择 1 到 100 篇文档");
    return this.atomically(() => {
      const prior = this.db.get("SELECT request_hash, document_ids_json FROM page_imports WHERE request_id = ?", [input.request_id]);
      if (prior) {
        const replay = input.replay ?? IMPORT_REPLAY;
        if (prior.request_hash !== input.request_hash) throw pagesErrors.unavailable(replay.changed);
        const ids = JSON.parse(String(prior.document_ids_json)) as string[];
        const documents = ids.map((id) => {
          try { return this.get(id); }
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
      const folder_id = normalizeFolderId(input.folder_id, this);
      const documents = input.documents.map((document) => this.create({
        folder_id,
        ...document,
      }));
      this.db.run("INSERT INTO page_imports (request_id, request_hash, document_ids_json, created_at) VALUES (?, ?, ?, ?)",
        [input.request_id, input.request_hash, JSON.stringify(documents.map((document) => document.id)), new Date().toISOString()]);
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
  }): PagesRecord {
    const current = this.get(id);
    if (patch.expected_version !== undefined && patch.expected_version !== current.version) throw pagesErrors.conflict("文档已被其他窗口修改，请重新读取后保存");
    const next: PagesRecord = {
      ...current,
      title: patch.title !== undefined ? normalizeTitle(patch.title) : current.title,
      body: patch.body !== undefined ? parsePagesBody(patch.body) : current.body,
      folder_id: patch.folder_id !== undefined
        ? normalizeFolderId(patch.folder_id, this)
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

  /**
   * One document as the record placement carries to another partition (`placement.export`): what it says and its comments. Its folder,
   * Goal and pinned versions only mean something here, so the record does not carry them.
   */
  exportRecord(id: string): PlacementExport {
    const current = this.get(id);
    const comments = this.db.all("SELECT body FROM page_comments WHERE page_id = ? ORDER BY created_at, thread_id", [id]).map(row => String(row.body));
    return { subject: { kind: PAGES_DOCUMENT_KIND, id }, revision: String(current.version),
      record: { title: current.title, body: current.body, starred: current.starred, created_at: current.created_at, updated_at: current.updated_at,
        version: current.version, comments } };
  }

  /**
   * Writes a carried document here (`placement.put`). With `targetId` (a move) it keeps its id and version, so every link and recorded
   * version still finds it; finding it already there, it accepts only the same record again (a retried move) and refuses anything else; without (a copy) it is a new document, and the same
   * request makes the same one. It arrives at the top level, with no Goal and no pinned versions: those belonged to where it came from.
   */
  putRecord(record: PlacementRecord, requestId: string, targetId?: string): PagesRecord {
    const carried = carriedDocument(record);
    if (targetId === undefined) {
      return this.importDocuments({ request_id: "copy:" + requestId, request_hash: "copy:" + createHash("sha256").update(JSON.stringify(record)).digest("hex"),
        documents: [{ title: carried.title, body: carried.body, starred: carried.starred }] })[0]!;
    }
    return this.atomically(() => {
      // An earlier attempt of the same move already put it here: only that exact record is a replay; anything written since is kept (conflict).
      if (this.db.get("SELECT 1 FROM pages WHERE id = ?", [targetId])) {
        // Compared with what this put would write (its own normalizing included), so a retry of the same move is found the same.
        if (sameCarriedRecord(this.exportRecord(targetId).record, { ...record, title: normalizeTitle(carried.title), body: carried.body })) return this.get(targetId);
        throw pagesErrors.conflict("目标位置已经有这份文档，而且内容不同；没有覆盖它");
      }
      this.db.run("DELETE FROM page_comments WHERE page_id = ?", [targetId]);
      this.db.run("INSERT INTO pages (id, title, body_json, folder_id, starred, goal_id, artifact_id, artifact_version, created_at, updated_at, version) VALUES (?, ?, ?, '', ?, '', '', 0, ?, ?, ?)",
        [targetId, normalizeTitle(carried.title), JSON.stringify(carried.body), carried.starred ? 1 : 0, carried.created_at, carried.updated_at, carried.version]);
      for (const thread of carried.comments) {
        this.db.run("INSERT INTO page_comments (page_id, thread_id, body, created_at) VALUES (?, ?, ?, ?)",
          [targetId, thread.thread_id, JSON.stringify({ ...thread, page_id: targetId }), new Date().toISOString()]);
      }
      return this.get(targetId);
    });
  }

  /** Lets a document that went to another partition go from here (`placement.remove`), only while it is still the version carried. */
  removeCarried(id: string, revision: string): boolean {
    return this.atomically(() => {
      const row = this.db.get("SELECT version, publication_pending_json FROM pages WHERE id = ?", [id]);
      if (!row) return false;
      if (row.publication_pending_json) throw pagesErrors.publication_pending("上次成果保存还没完成，请先在原位置继续保存，再移动");
      if (String(row.version) !== revision) throw pagesErrors.conflict("文档刚被修改，请重新读取后再移动");
      this.db.run("DELETE FROM page_changes WHERE page_id = ?", [id]);
      this.db.run("DELETE FROM pages_editor_versions WHERE id = ?", [id]);
      return this.db.run("DELETE FROM pages WHERE id = ? AND version = ?", [id, row.version as number]).changes === 1;
    });
  }

  delete(id: string): void {
    this.get(id);
    this.db.run("DELETE FROM pages WHERE id = ?", [id]);
  }

  /** Keep what an edit replaced, so it can be taken back while nothing changed since; returns the change's id. */
  keepChange(before: PagesRecord, after: PagesRecord): string {
    return keepPagesChange(this.db, before, after);
  }

  /** Take one kept edit back: the document returns to what it was before, only if no one changed it since. */
  revertChange(changeId: string): PagesRecord {
    const row = this.db.get("SELECT page_id, to_version, before_json FROM page_changes WHERE change_id = ?", [changeId]);
    if (!row) throw pagesErrors.not_found("这次修改已经撤销过，或记录已过期（保留 14 天）");
    const current = this.get(String(row.page_id));
    if (current.version !== Number(row.to_version)) throw pagesErrors.conflict(`《${current.title || "未命名"}》在这次修改之后又改过（现在是第 ${current.version} 版），没有撤销；需要时请在 Pages 里自己改回`);
    const before = JSON.parse(String(row.before_json)) as Pick<PagesRecord, "title" | "body" | "folder_id" | "starred" | "goal_id">;
    const restored = this.update(String(row.page_id), { ...before, expected_version: current.version });
    this.db.run("DELETE FROM page_changes WHERE change_id = ?", [changeId]);
    return restored;
  }

  /** Take back a document just created: removed only while it is still the version it was created at, so no later edit is lost. */
  discard(id: string, expectedVersion: number): void {
    const current = this.get(id);
    if (current.version !== expectedVersion) throw pagesErrors.conflict(`《${current.title || "未命名"}》在新建之后改过（现在是第 ${current.version} 版），没有撤销；需要时请在 Pages 里自己删除`);
    const result = this.db.run("DELETE FROM pages WHERE id = ? AND version = ?", [id, expectedVersion]);
    if (result.changes !== 1) throw pagesErrors.conflict("文档刚被修改，没有撤销");
  }

  extract(id: string): { document: PagesRecord; cards: number; created: PagesRecord[] } {
    return this.atomically(() => {
      const current = this.get(id);
      const extracted = extractFromPagesBody(current.title, current.body);
      const document = this.update(id, { body: extracted.body, expected_version: current.version });
      const created = unpublishedKnowledgePages(this.list().map(page => page.title), extracted.knowledge)
        .map(page => this.create({ ...page, folder_id: current.folder_id }));
      return { document, cards: extracted.cards, created };
    });
  }

  createFolder(input: { title?: string }): PagesFolder {
    const now = new Date().toISOString();
    const folder: PagesFolder = {
      id: crypto.randomUUID(),
      project_id: this.partition,
      title: normalizeFolderTitle(input.title ?? "未命名文件夹"),
      created_at: now,
      updated_at: now,
    };
    this.db.run("INSERT INTO folders (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [folder.id, folder.title, folder.created_at, folder.updated_at]);
    return folder;
  }

  getFolder(id: string): PagesFolder {
    const row = this.db.get("SELECT * FROM folders WHERE id = ?", [id]);
    if (!row) throw pagesErrors.not_found("找不到这个文件夹");
    return fromFolderRow(row, this.partition);
  }

  updateFolder(id: string, patch: { title?: string }): PagesFolder {
    const current = this.getFolder(id);
    const next: PagesFolder = {
      ...current,
      title: patch.title !== undefined ? normalizeFolderTitle(patch.title) : current.title,
      updated_at: new Date().toISOString(),
    };
    this.db.run("UPDATE folders SET title = ?, updated_at = ? WHERE id = ?", [next.title, next.updated_at, id]);
    return next;
  }

  deleteFolder(id: string): void {
    this.atomically(() => {
      this.getFolder(id);
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

export function fromPageRow(row: SqlRow, partition: string): PagesRecord {
  const pending = row.publication_pending_json ? JSON.parse(String(row.publication_pending_json)) as NonNullable<PagesRecord["publication_pending"]> : null;
  return {
    id: String(row.id),
    project_id: partition,
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

function fromFolderRow(row: SqlRow, partition: string): PagesFolder {
  return {
    id: String(row.id),
    project_id: partition,
    title: String(row.title),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名文档";
  if ([...title].length > 80) throw pagesErrors.invalid("标题须为 1 到 80 个字");
  return title;
}

function normalizeFolderTitle(value: string): string {
  const title = value.trim() || "未命名文件夹";
  if ([...title].length > 40) throw pagesErrors.invalid("文件夹名须为 1 到 40 个字");
  return title;
}

export function normalizeGoalId(value: string | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw pagesErrors.invalid("Goal 须为文字");
  const id = value.trim();
  if (id.length > 80) throw pagesErrors.invalid("Goal 标识过长");
  return id;
}

function normalizeFolderId(value: string | undefined, store: PagesStore): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw pagesErrors.invalid("文件夹须为文字");
  const id = value.trim();
  if (!id) return "";
  store.getFolder(id);
  return id;
}

/** A carried document's record, as `exportRecord` wrote it; anything else is refused before a row is written. */
function carriedDocument(record: PlacementRecord): { title: string; body: PagesBody; starred: boolean; created_at: string; updated_at: string; version: number;
  comments: Array<Omit<PagesCommentThread, "detached">> } {
  const { title, body, starred, created_at, updated_at, version, comments } = record;
  const invalid = () => pagesErrors.invalid("带来的文档内容不完整");
  if (typeof title !== "string" || typeof starred !== "boolean" || typeof created_at !== "string" || typeof updated_at !== "string"
    || !Number.isSafeInteger(version) || (version as number) < 1 || !Array.isArray(comments) || comments.some(comment => typeof comment !== "string")) throw invalid();
  const threads = (comments as string[]).map(comment => {
    let thread: unknown;
    try { thread = JSON.parse(comment); } catch { throw invalid(); }
    if (!thread || typeof thread !== "object" || typeof (thread as { thread_id?: unknown }).thread_id !== "string") throw invalid();
    return thread as Omit<PagesCommentThread, "detached">;
  });
  return { title, body: parsePagesBody(body), starred, created_at, updated_at, version: version as number, comments: threads };
}
