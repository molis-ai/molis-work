import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { BlueprintPartOrigin, ContentAdoptionResult } from "@molis-ai/molis-work-contracts/platform/blueprints";
import {
  HOME_PAGE_RETENTION,
  HOME_PAGE_SUBJECT_KIND,
  homeErrors,
  type HomeBasicSelection,
  type HomePageApproval,
  type HomePageApprovalOperation,
  type HomePageApprovalReceipt,
  type HomePageDiffResult,
  type HomePageDraft,
  type HomePageFile,
  type HomePageFileMetadata,
  type HomePageFilesResult,
  type HomePageOverview,
  type HomePageRef,
  type HomePageSelectResult,
  type HomePageVersion,
  type HomePageVersionSummary,
  type HomeSelection,
  type HomeSelectionState,
} from "@molis-ai/molis-work-contracts/services/home";
import { canonicalJsonText, compareCodeUnits } from "@molis-ai/molis-work-plugin-sdk";
import { openBaselineHomeSqlite, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";

// Dedicated Home-level SQLite store for generated home pages (user decision 2026-11-23, Batch 37):
// partitioned strictly by `project_id` on every table; purged atomically on project deletion.

/** Current baseline schema for `home-pages/home-pages.db` (v1). */
export const HOME_PAGES_BASELINE: SqliteBaseline = {
  version: /* @version database.home_pages_baseline */ 1,
  schema: `
CREATE TABLE home_selections (
  project_id TEXT NOT NULL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('basic', 'page')),
  page_id TEXT,
  version INTEGER,
  revision TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind = 'basic' AND page_id IS NULL AND version IS NULL)
      OR (kind = 'page' AND page_id IS NOT NULL AND version IS NOT NULL))
);
CREATE TABLE home_page_versions (
  project_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  title TEXT NOT NULL,
  entry TEXT NOT NULL,
  actions TEXT NOT NULL,
  files TEXT NOT NULL,
  author TEXT NOT NULL CHECK (author IN ('assistant', 'person')),
  based_on INTEGER,
  origin TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, page_id, version)
);
CREATE TABLE home_page_blobs (
  project_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (project_id, sha256)
);
CREATE TABLE home_page_approvals (
  project_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  approved_actions TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  PRIMARY KEY (project_id, page_id, version)
);
CREATE TABLE home_page_receipts (
  project_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('draft_adopt', 'approval', 'select')),
  operation TEXT NOT NULL,
  request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  receipt TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (project_id, actor_id, kind, operation, request_id)
);
CREATE TABLE home_page_pruned (
  project_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  pruned_at TEXT NOT NULL,
  PRIMARY KEY (project_id, page_id, version)
);
`,
};

/** Store registration in `homeStoreRegistry`: `home-pages/home-pages.db`. */
export const HOME_PAGES_HOME_STORE = {
  path: "home-pages",
  library: { baseline: HOME_PAGES_BASELINE },
} as const satisfies HomeStoreDeclaration;

export function openHomePagesDatabase(homeDirectory: string): DatabaseSync {
  return openBaselineHomeSqlite(homeDirectory, HOME_PAGES_HOME_STORE.path, HOME_PAGES_BASELINE);
}

/** Removes every generated homepage, version, blob, approval and receipt belonging to `projectId`. Runs inside caller transaction. */
export function purgeHomePagesProject(db: DatabaseSync, projectId: string): void {
  for (const table of [
    "home_page_pruned",
    "home_page_receipts",
    "home_page_approvals",
    "home_page_versions",
    "home_page_blobs",
    "home_selections",
  ]) {
    db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(projectId);
  }
}

export function sha256Utf8(text: string): { bytes: number; sha256: string } {
  const buf = Buffer.from(text, "utf8");
  return { bytes: buf.byteLength, sha256: createHash("sha256").update(buf).digest("hex") };
}

export function actionKey(ref: ExactActionReference): string {
  return `${ref.provider_id}\u0000${ref.capability_id}\u0000${ref.version}`;
}

export function canonicalActions(actions: readonly ExactActionReference[]): ExactActionReference[] {
  return [...actions]
    .map(ref => ({ capability_id: ref.capability_id, version: ref.version, provider_id: ref.provider_id }))
    .sort((a, b) => compareCodeUnits(actionKey(a), actionKey(b)));
}

function nextSelectionRevision(current: string): string {
  const match = /^home-(\d+)(?:-|$)/u.exec(current);
  const seq = match ? Number(match[1]) + 1 : 1;
  return `home-${seq}-${randomUUID().slice(0, 8)}`;
}

interface SelectionRow extends Record<string, SQLOutputValue> {
  kind: "basic" | "page";
  page_id: string | null;
  version: number | null;
  revision: string;
  updated_at: string;
}

interface VersionRow extends Record<string, SQLOutputValue> {
  page_id: string;
  version: number;
  title: string;
  entry: string;
  actions: string;
  files: string;
  author: "assistant" | "person";
  based_on: number | null;
  origin: string | null;
  created_at: string;
}

interface ApprovalRow extends Record<string, SQLOutputValue> {
  page_id: string;
  version: number;
  approved_actions: string;
  approved_at: string;
  actor_id: string;
}

interface ReceiptRow extends Record<string, SQLOutputValue> {
  fingerprint: string;
  receipt: string;
}

function versionFromRow(row: VersionRow): HomePageVersion {
  return {
    page_id: row.page_id,
    version: row.version,
    title: row.title,
    entry: row.entry,
    actions: JSON.parse(row.actions) as ExactActionReference[],
    files: JSON.parse(row.files) as HomePageFileMetadata[],
    author: row.author,
    ...(row.based_on !== null ? { based_on: row.based_on } : {}),
    created_at: row.created_at,
  };
}

function approvalFromRow(row: ApprovalRow): HomePageApproval {
  return {
    page: { page_id: row.page_id, version: row.version },
    approved_actions: JSON.parse(row.approved_actions) as ExactActionReference[],
    approved_at: row.approved_at,
  };
}

export interface StoredVersionDetail {
  readonly version: HomePageVersion;
  readonly origin: BlueprintPartOrigin | null;
  readonly approval: HomePageApproval | null;
}

/**
 * Project-scoped storage owner for `horizontal/home`. Every SQL statement filters by `project_id` so one project can never read
 * or mutate another project's generated home pages or blobs.
 */
const FIRST_PAGE_REVISION = 1;

export class HomePagesStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly projectId: string,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    if (!projectId) throw homeErrors.session_invalid("首页服务必须在项目范围内运行");
  }

  private inTx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  selectionState(): HomeSelectionState {
    const row = this.db
      .prepare("SELECT kind, page_id, version, revision, updated_at FROM home_selections WHERE project_id = ?")
      .get(this.projectId) as SelectionRow | undefined;
    if (!row) return { selection: { kind: "basic" }, revision: "home-0" };
    const selection: HomeSelection =
      row.kind === "page" && row.page_id !== null && row.version !== null
        ? { kind: "page", page_id: row.page_id, version: row.version }
        : { kind: "basic" };
    return { selection, revision: row.revision };
  }

  readOverview(): HomePageOverview {
    const state = this.selectionState();
    const versionRows = this.db
      .prepare(
        "SELECT page_id, version, title, entry, actions, files, author, based_on, origin, created_at FROM home_page_versions WHERE project_id = ? ORDER BY created_at DESC, page_id ASC, version DESC",
      )
      .all(this.projectId) as VersionRow[];
    const approvalRows = this.db
      .prepare("SELECT page_id, version, approved_actions, approved_at, actor_id FROM home_page_approvals WHERE project_id = ?")
      .all(this.projectId) as ApprovalRow[];
    const approvals = new Map<string, HomePageApproval>(
      approvalRows.map(row => [`${row.page_id}@${row.version}`, approvalFromRow(row)]),
    );
    const versions: HomePageVersionSummary[] = versionRows.map(row => ({
      ...versionFromRow(row),
      approval: approvals.get(`${row.page_id}@${row.version}`) ?? null,
    }));
    return { ...state, versions };
  }

  prunedVersions(pageId?: string): Array<{ page_id: string; version: number; pruned_at: string }> {
    const rows = pageId
      ? (this.db
          .prepare("SELECT page_id, version, pruned_at FROM home_page_pruned WHERE project_id = ? AND page_id = ? ORDER BY version ASC")
          .all(this.projectId, pageId) as Array<{ page_id: string; version: number; pruned_at: string }>)
      : (this.db
          .prepare("SELECT page_id, version, pruned_at FROM home_page_pruned WHERE project_id = ? ORDER BY page_id ASC, version ASC")
          .all(this.projectId) as Array<{ page_id: string; version: number; pruned_at: string }>);
    return rows;
  }

  readVersion(ref: HomePageRef): StoredVersionDetail | null {
    const row = this.db
      .prepare(
        "SELECT page_id, version, title, entry, actions, files, author, based_on, origin, created_at FROM home_page_versions WHERE project_id = ? AND page_id = ? AND version = ?",
      )
      .get(this.projectId, ref.page_id, ref.version) as VersionRow | undefined;
    if (!row) return null;
    const approvalRow = this.db
      .prepare("SELECT page_id, version, approved_actions, approved_at, actor_id FROM home_page_approvals WHERE project_id = ? AND page_id = ? AND version = ?")
      .get(this.projectId, ref.page_id, ref.version) as ApprovalRow | undefined;
    return {
      version: versionFromRow(row),
      origin: row.origin ? (JSON.parse(row.origin) as BlueprintPartOrigin) : null,
      approval: approvalRow ? approvalFromRow(approvalRow) : null,
    };
  }

  readLatestVersion(pageId: string): StoredVersionDetail | null {
    const row = this.db
      .prepare(
        "SELECT page_id, version, title, entry, actions, files, author, based_on, origin, created_at FROM home_page_versions WHERE project_id = ? AND page_id = ? ORDER BY version DESC LIMIT 1",
      )
      .get(this.projectId, pageId) as VersionRow | undefined;
    if (!row) return null;
    const approvalRow = this.db
      .prepare("SELECT page_id, version, approved_actions, approved_at, actor_id FROM home_page_approvals WHERE project_id = ? AND page_id = ? AND version = ?")
      .get(this.projectId, row.page_id, row.version) as ApprovalRow | undefined;
    return {
      version: versionFromRow(row),
      origin: row.origin ? (JSON.parse(row.origin) as BlueprintPartOrigin) : null,
      approval: approvalRow ? approvalFromRow(approvalRow) : null,
    };
  }

  findProposalCandidates(origin: BlueprintPartOrigin, title: string): Array<{ page_id: string; detail: StoredVersionDetail }> {
    const pageRows = this.db
      .prepare("SELECT DISTINCT page_id FROM home_page_versions WHERE project_id = ? ORDER BY page_id ASC")
      .all(this.projectId) as Array<{ page_id: string }>;
    const originJson = canonicalJsonText(origin);
    const out: Array<{ page_id: string; detail: StoredVersionDetail }> = [];
    for (const { page_id } of pageRows) {
      const latest = this.readLatestVersion(page_id);
      if (!latest) continue;
      const sameOrigin = latest.origin !== null && canonicalJsonText(latest.origin) === originJson;
      if (sameOrigin || latest.version.title === title) {
        out.push({ page_id, detail: latest });
      }
    }
    return out;
  }

  /**
   * Reads a fixed version's full file bodies, recomputing UTF-8 byte length and SHA-256 on every file before returning.
   * Any missing blob or tampered content rejects the entire version with `home.page_file_mismatch` (S-home-page-files).
   */
  readFilesVerified(ref: HomePageRef): HomePageFilesResult {
    const detail = this.readVersion(ref);
    if (!detail) throw homeErrors.version_not_found("找不到这一版生成首页");
    const files: HomePageFile[] = [];
    const blobQuery = this.db.prepare("SELECT bytes, content FROM home_page_blobs WHERE project_id = ? AND sha256 = ?");
    for (const meta of detail.version.files) {
      const blob = blobQuery.get(this.projectId, meta.sha256) as { bytes: number; content: string } | undefined;
      if (!blob) throw homeErrors.page_file_mismatch(`页面文件 ${meta.path} 正文缺失，已拒绝加载`);
      const actual = sha256Utf8(blob.content);
      if (actual.bytes !== meta.bytes || actual.bytes !== blob.bytes || actual.sha256 !== meta.sha256) {
        throw homeErrors.page_file_mismatch(`页面文件 ${meta.path} 校验摘要不符，已拒绝加载`);
      }
      files.push({ path: meta.path, media_type: meta.media_type, text: blob.content });
    }
    return { version: detail.version, files };
  }

  private countPages(): number {
    const row = this.db
      .prepare("SELECT COUNT(DISTINCT page_id) AS n FROM home_page_versions WHERE project_id = ?")
      .get(this.projectId) as { n: number };
    return row.n;
  }

  private writeVersionInTx(input: {
    page_id: string;
    version: number;
    draft: HomePageDraft;
    author: "assistant" | "person";
    based_on?: number;
    origin?: BlueprintPartOrigin;
  }): HomePageVersion {
    const createdAt = this.now();
    const metadata: HomePageFileMetadata[] = [];
    const insertBlob = this.db.prepare(
      "INSERT OR IGNORE INTO home_page_blobs (project_id, sha256, bytes, content) VALUES (?, ?, ?, ?)",
    );
    for (const file of input.draft.files) {
      const { bytes, sha256 } = sha256Utf8(file.text);
      insertBlob.run(this.projectId, sha256, bytes, file.text);
      metadata.push({ path: file.path, media_type: file.media_type, bytes, sha256 });
    }
    const actions = canonicalActions(input.draft.actions);
    this.db
      .prepare(
        "INSERT INTO home_page_versions (project_id, page_id, version, title, entry, actions, files, author, based_on, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        this.projectId,
        input.page_id,
        input.version,
        input.draft.title,
        input.draft.entry,
        JSON.stringify(actions),
        JSON.stringify(metadata),
        input.author,
        input.based_on ?? null,
        input.origin ? JSON.stringify(input.origin) : null,
        createdAt,
      );
    this.enforceVersionRetentionInTx(input.page_id, input.version, createdAt);
    return {
      page_id: input.page_id,
      version: input.version,
      title: input.draft.title,
      entry: input.draft.entry,
      actions,
      files: metadata,
      author: input.author,
      ...(input.based_on !== undefined ? { based_on: input.based_on } : {}),
      created_at: createdAt,
    };
  }

  private enforceVersionRetentionInTx(pageId: string, newestVersion: number, prunedAt: string): void {
    const rows = this.db
      .prepare("SELECT version, based_on FROM home_page_versions WHERE project_id = ? AND page_id = ? ORDER BY version ASC")
      .all(this.projectId, pageId) as Array<{ version: number; based_on: number | null }>;
    if (rows.length <= HOME_PAGE_RETENTION.maxVersionsPerPage) return;

    const protectedVersions = new Set<number>([newestVersion]);
    const newestRow = rows.find(row => row.version === newestVersion);
    if (newestRow?.based_on != null) protectedVersions.add(newestRow.based_on);
    const current = this.selectionState();
    if (current.selection.kind === "page" && current.selection.page_id === pageId) {
      const activeVersion = current.selection.version;
      protectedVersions.add(activeVersion);
      const activeRow = rows.find(row => row.version === activeVersion);
      if (activeRow?.based_on != null) protectedVersions.add(activeRow.based_on);
    }
    const lastApproved = this.db
      .prepare(
        "SELECT version FROM home_page_approvals WHERE project_id = ? AND page_id = ? ORDER BY approved_at DESC, version DESC LIMIT 1",
      )
      .get(this.projectId, pageId) as { version: number } | undefined;
    if (lastApproved) protectedVersions.add(lastApproved.version);

    const excess = rows.length - HOME_PAGE_RETENTION.maxVersionsPerPage;
    const toDelete = rows
      .filter(row => !protectedVersions.has(row.version))
      .slice(0, excess)
      .map(row => row.version);
    if (!toDelete.length) return;

    const deleteVer = this.db.prepare("DELETE FROM home_page_versions WHERE project_id = ? AND page_id = ? AND version = ?");
    const deleteAppr = this.db.prepare("DELETE FROM home_page_approvals WHERE project_id = ? AND page_id = ? AND version = ?");
    const recordPruned = this.db.prepare(
      "INSERT OR REPLACE INTO home_page_pruned (project_id, page_id, version, pruned_at) VALUES (?, ?, ?, ?)",
    );
    for (const version of toDelete) {
      deleteVer.run(this.projectId, pageId, version);
      deleteAppr.run(this.projectId, pageId, version);
      recordPruned.run(this.projectId, pageId, version, prunedAt);
    }
    this.gcUnreferencedBlobsInTx();
  }

  private gcUnreferencedBlobsInTx(): void {
    const versionRows = this.db
      .prepare("SELECT files FROM home_page_versions WHERE project_id = ?")
      .all(this.projectId) as Array<{ files: string }>;
    const referenced = new Set<string>();
    for (const row of versionRows) {
      for (const file of JSON.parse(row.files) as HomePageFileMetadata[]) referenced.add(file.sha256);
    }
    const blobRows = this.db
      .prepare("SELECT sha256 FROM home_page_blobs WHERE project_id = ?")
      .all(this.projectId) as Array<{ sha256: string }>;
    const del = this.db.prepare("DELETE FROM home_page_blobs WHERE project_id = ? AND sha256 = ?");
    for (const row of blobRows) {
      if (!referenced.has(row.sha256)) del.run(this.projectId, row.sha256);
    }
  }

  saveDirectDraft(input: {
    draft: HomePageDraft;
    author: "assistant" | "person";
    page_id?: string;
    expected_version?: number;
    based_on?: number;
  }): HomePageVersion {
    return this.inTx(() => {
      if (input.page_id === undefined) {
        if (this.countPages() >= HOME_PAGE_RETENTION.maxPagesPerProject) {
          throw homeErrors.page_limit(`一个项目最多保存 ${HOME_PAGE_RETENTION.maxPagesPerProject} 个生成首页`);
        }
        const pageId = `page-${randomUUID().slice(0, 12)}`;
        return this.writeVersionInTx({ page_id: pageId, version: FIRST_PAGE_REVISION, draft: input.draft, author: input.author });
      }
      const latest = this.readLatestVersion(input.page_id);
      if (!latest) throw homeErrors.page_not_found("找不到这个生成首页");
      if (latest.version.version !== input.expected_version) {
        throw homeErrors.version_conflict("页面已产生新版本，请先读取最新版本再保存", {
          details: { current_version: latest.version.version },
        });
      }
      if (input.based_on !== undefined && !this.readVersion({ page_id: input.page_id, version: input.based_on })) {
        throw homeErrors.version_not_found("指定的对照基准版本不存在");
      }
      return this.writeVersionInTx({
        page_id: input.page_id,
        version: latest.version.version + 1,
        draft: input.draft,
        author: input.author,
        based_on: input.based_on ?? latest.version.version,
      });
    });
  }

  saveAdoptionDraft(input: {
    actor_id: string;
    request_id: string;
    blueprint: BlueprintPartOrigin;
    selection: { kind: "create" } | { kind: "reuse" | "update"; subject: { kind: string; id: string }; expected_revision: string | number };
    draft: HomePageDraft;
    author: "assistant" | "person";
  }): ContentAdoptionResult {
    const fingerprint = createHash("sha256")
      .update(canonicalJsonText({ blueprint: input.blueprint, selection: input.selection, draft: input.draft })!)
      .digest("hex");

    return this.inTx(() => {
      const existing = this.readReceiptInTx(input.actor_id, "draft_adopt", "adopt", input.request_id);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw homeErrors.request_conflict("同一个采用请求编号不能改换页面内容或选择");
        }
        return JSON.parse(existing.receipt) as ContentAdoptionResult;
      }

      let receipt: ContentAdoptionResult;
      if (input.selection.kind === "create") {
        if (this.countPages() >= HOME_PAGE_RETENTION.maxPagesPerProject) {
          throw homeErrors.page_limit(`一个项目最多保存 ${HOME_PAGE_RETENTION.maxPagesPerProject} 个生成首页`);
        }
        const pageId = `page-${randomUUID().slice(0, 12)}`;
        const saved = this.writeVersionInTx({
          page_id: pageId,
          version: FIRST_PAGE_REVISION,
          draft: input.draft,
          author: input.author,
          origin: input.blueprint,
        });
        receipt = {
          outcome: "created",
          subject: { kind: HOME_PAGE_SUBJECT_KIND, id: saved.page_id },
          revision: saved.version,
        };
      } else {
        if (input.selection.subject.kind !== HOME_PAGE_SUBJECT_KIND) {
          throw homeErrors.draft_invalid("首页草稿采用的对象种类必须是 home-page");
        }
        if (typeof input.selection.expected_revision !== "number" || !Number.isSafeInteger(input.selection.expected_revision)) {
          throw homeErrors.version_conflict("页面版本凭据必须是正整数版本号");
        }
        const latest = this.readLatestVersion(input.selection.subject.id);
        if (!latest) throw homeErrors.page_not_found("找不到要更新或复用的生成首页");
        if (latest.version.version !== input.selection.expected_revision) {
          throw homeErrors.version_conflict("页面已产生新版本，请先读取最新版本", {
            details: { current_version: latest.version.version },
          });
        }
        // Per spec §6.5: reuse appends an immutable version with unchanged content inside the same transaction.
        const bodyForSave =
          input.selection.kind === "reuse"
            ? (() => {
                const loaded = this.readFilesVerified({ page_id: latest.version.page_id, version: latest.version.version });
                return {
                  title: latest.version.title,
                  entry: latest.version.entry,
                  actions: latest.version.actions,
                  files: loaded.files,
                };
              })()
            : input.draft;
        const saved = this.writeVersionInTx({
          page_id: latest.version.page_id,
          version: latest.version.version + 1,
          draft: bodyForSave,
          author: input.author,
          based_on: latest.version.version,
          origin: input.blueprint,
        });
        receipt = {
          outcome: input.selection.kind === "reuse" ? "reused" : "modified",
          subject: { kind: HOME_PAGE_SUBJECT_KIND, id: saved.page_id },
          revision: saved.version,
        };
      }

      this.insertReceiptInTx(input.actor_id, "draft_adopt", "adopt", input.request_id, fingerprint, receipt);
      return receipt;
    });
  }

  approveAndSelect<Op extends HomePageApprovalOperation>(input: {
    operation: Op;
    actor_id: string;
    page_id: string;
    version: number;
    approved_actions: readonly ExactActionReference[];
    request_id: string;
    expected_revision: string;
  }): { receipt: HomePageApprovalReceipt<Op>; changed: boolean } {
    const canonicalApproved = canonicalActions(input.approved_actions);
    const fingerprint = createHash("sha256")
      .update(
        canonicalJsonText({
          operation: input.operation,
          page_id: input.page_id,
          version: input.version,
          approved_actions: canonicalApproved,
        })!,
      )
      .digest("hex");

    return this.inTx(() => {
      const existing = this.readReceiptInTx(input.actor_id, "approval", input.operation, input.request_id);
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw homeErrors.request_conflict("同一个批准请求编号不能改换操作、页面版本或批准动作");
        }
        return { receipt: JSON.parse(existing.receipt) as HomePageApprovalReceipt<Op>, changed: false };
      }

      // Also refuse reusing a request_id across adopt vs restore for the same actor/project.
      const opposite: HomePageApprovalOperation = input.operation === "adopt" ? "restore" : "adopt";
      if (this.readReceiptInTx(input.actor_id, "approval", opposite, input.request_id)) {
        throw homeErrors.request_conflict("同一个批准请求编号已用于另一项首页操作");
      }

      const detail = this.readVersion({ page_id: input.page_id, version: input.version });
      if (!detail) throw homeErrors.version_not_found("找不到要采用或恢复的页面版本");

      const declared = new Set(detail.version.actions.map(actionKey));
      for (const action of canonicalApproved) {
        if (!declared.has(actionKey(action))) {
          throw homeErrors.draft_invalid(`批准的动作 ${action.capability_id}@${action.version} 不在这一版声明的清单里`);
        }
      }

      const current = this.selectionState();
      if (current.revision !== input.expected_revision) {
        throw homeErrors.revision_conflict("项目首页刚刚在别处切换过，请先查看最新状态后再试", {
          details: { current },
        });
      }

      const at = this.now();
      const nextRevision = nextSelectionRevision(current.revision);
      const approval: HomePageApproval = {
        page: { page_id: input.page_id, version: input.version },
        approved_actions: canonicalApproved,
        approved_at: at,
      };
      this.db
        .prepare(
          "INSERT INTO home_page_approvals (project_id, page_id, version, approved_actions, approved_at, actor_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (project_id, page_id, version) DO UPDATE SET approved_actions = excluded.approved_actions, approved_at = excluded.approved_at, actor_id = excluded.actor_id",
        )
        .run(this.projectId, input.page_id, input.version, JSON.stringify(canonicalApproved), at, input.actor_id);

      this.db
        .prepare(
          "INSERT INTO home_selections (project_id, kind, page_id, version, revision, updated_at) VALUES (?, 'page', ?, ?, ?, ?) ON CONFLICT (project_id) DO UPDATE SET kind = 'page', page_id = excluded.page_id, version = excluded.version, revision = excluded.revision, updated_at = excluded.updated_at",
        )
        .run(this.projectId, input.page_id, input.version, nextRevision, at);

      const receipt: HomePageApprovalReceipt<Op> = {
        operation: input.operation,
        request_id: input.request_id,
        selection: { kind: "page", page_id: input.page_id, version: input.version },
        revision: nextRevision,
        approval,
      };
      this.insertReceiptInTx(input.actor_id, "approval", input.operation, input.request_id, fingerprint, receipt);
      return { receipt, changed: true };
    });
  }

  selectBasic(input: { actor_id: string; request_id: string; expected_revision: string }): { result: HomePageSelectResult; changed: boolean; previous?: HomeSelection } {
    const fingerprint = createHash("sha256").update(canonicalJsonText({ kind: "basic" })!).digest("hex");
    return this.inTx(() => {
      const existing = this.readReceiptInTx(input.actor_id, "select", "basic", input.request_id);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw homeErrors.request_conflict("请求编号已用于其他首页切换");
        return { result: JSON.parse(existing.receipt) as HomePageSelectResult, changed: false };
      }
      const current = this.selectionState();
      if (current.revision !== input.expected_revision) {
        throw homeErrors.revision_conflict("项目首页刚刚在别处切换过，请刷新后再试", { details: { current } });
      }
      const at = this.now();
      const nextRevision = nextSelectionRevision(current.revision);
      const selection: HomeBasicSelection = { kind: "basic" };
      this.db
        .prepare(
          "INSERT INTO home_selections (project_id, kind, page_id, version, revision, updated_at) VALUES (?, 'basic', NULL, NULL, ?, ?) ON CONFLICT (project_id) DO UPDATE SET kind = 'basic', page_id = NULL, version = NULL, revision = excluded.revision, updated_at = excluded.updated_at",
        )
        .run(this.projectId, nextRevision, at);
      const result: HomePageSelectResult = { selection, revision: nextRevision, approval: null };
      this.insertReceiptInTx(input.actor_id, "select", "basic", input.request_id, fingerprint, result);
      return { result, changed: true, previous: current.selection };
    });
  }

  diffVersions(pageId: string, fromVersion: number, toVersion: number): HomePageDiffResult {
    const from = this.readVersion({ page_id: pageId, version: fromVersion });
    const to = this.readVersion({ page_id: pageId, version: toVersion });
    if (!from || !to) throw homeErrors.version_not_found("找不到要比较的页面版本");

    const fromFiles = new Map(from.version.files.map(file => [file.path, file]));
    const toFiles = new Map(to.version.files.map(file => [file.path, file]));
    const allPaths = [...new Set([...fromFiles.keys(), ...toFiles.keys()])].sort(compareCodeUnits);
    const files: HomePageDiffResult["files"] = [];
    for (const path of allPaths) {
      const before = fromFiles.get(path);
      const after = toFiles.get(path);
      if (!before && after) files.push({ path, kind: "added" });
      else if (before && !after) files.push({ path, kind: "deleted" });
      else if (before && after && (before.sha256 !== after.sha256 || before.media_type !== after.media_type)) {
        files.push({ path, kind: "modified" });
      }
    }

    const fromActionMap = new Map(from.version.actions.map(ref => [actionKey(ref), ref]));
    const toActionMap = new Map(to.version.actions.map(ref => [actionKey(ref), ref]));
    const added = canonicalActions([...toActionMap.entries()].filter(([key]) => !fromActionMap.has(key)).map(([, ref]) => ref));
    const removed = canonicalActions([...fromActionMap.entries()].filter(([key]) => !toActionMap.has(key)).map(([, ref]) => ref));

    return {
      page_id: pageId,
      from_version: fromVersion,
      to_version: toVersion,
      files,
      entry: { before: from.version.entry, after: to.version.entry },
      actions: { added, removed },
    };
  }

  readBasicReceipt(actorId: string, requestId: string): HomePageSelectResult | null {
    const row = this.readReceiptInTx(actorId, "select", "basic", requestId);
    return row ? JSON.parse(row.receipt) as HomePageSelectResult : null;
  }

  readApprovalReceipt(actorId: string, operation: HomePageApprovalOperation, requestId: string): HomePageApprovalReceipt | null {
    const row = this.readReceiptInTx(actorId, "approval", operation, requestId);
    return row ? (JSON.parse(row.receipt) as HomePageApprovalReceipt) : null;
  }

  readDraftAdoptionReceipt(actorId: string, operation: "adopt" | "revert", requestId: string): ContentAdoptionResult | null {
    if (operation !== "adopt") return null;
    const row = this.readReceiptInTx(actorId, "draft_adopt", "adopt", requestId);
    return row ? (JSON.parse(row.receipt) as ContentAdoptionResult) : null;
  }

  private readReceiptInTx(actorId: string, kind: "draft_adopt" | "approval" | "select", operation: string, requestId: string): ReceiptRow | undefined {
    return this.db
      .prepare(
        "SELECT fingerprint, receipt FROM home_page_receipts WHERE project_id = ? AND actor_id = ? AND kind = ? AND operation = ? AND request_id = ?",
      )
      .get(this.projectId, actorId, kind, operation, requestId) as ReceiptRow | undefined;
  }

  private insertReceiptInTx(
    actorId: string,
    kind: "draft_adopt" | "approval" | "select",
    operation: string,
    requestId: string,
    fingerprint: string,
    receipt: unknown,
  ): void {
    this.db
      .prepare(
        "INSERT INTO home_page_receipts (project_id, actor_id, kind, operation, request_id, fingerprint, receipt, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(this.projectId, actorId, kind, operation, requestId, fingerprint, JSON.stringify(receipt), this.now());
  }
}
