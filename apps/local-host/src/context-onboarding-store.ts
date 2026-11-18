import { applySqliteBaseline, openHomeSqliteDatabase, type SqliteBaseline, type SqliteBaselineDatabase, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { OnboardingDocumentsResult, OnboardingDraftBatch } from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";

/** Where one part of a material, or the summary, went: the `documents` taker's object and where it opens (contract-design §2.5). */
export type ContextDocumentPart = OnboardingDocumentsResult["parts"][number];

export type ContextSourceKind = "files" | "directory" | "downloads" | "documents" | "desktop" | "custom" | "browser" | "gmail" | "chat";
export type SecretSendDecision = "strip" | "raw" | "exclude";
export type ContextModelFailureKind = "connection" | "auth" | "rate_limit" | "timeout" | "context_limit" | "invalid_output" | "unknown";

export interface HeldSecretMaterial {
  key: string;
  kind: ContextSourceKind;
  path: string;
  filename: string;
  sha256: string;
  size_bytes: number;
  reason: string;
  preview_names: string[];
}

export interface ContextSkippedReasons {
  ignored: number;
  secret: number;
  unreadable: number;
  time?: number;
}

/**
 * One file of a source: staged in the journey by digest (an upload, a folder read), or bytes the Host itself read for this pass
 * (pasted web text, mail) that are staged before reading, or the reason it was not read. Bytes never reach the journey's row.
 */
export interface ImportFile { path: string; staged?: string; bytes?: Buffer; reason?: string }
export interface ContextFileMetadata { path: string; size: number; modified_ms: number; identity: string }
/** A read material: its text and its original are staged in the journey (context-onboarding-staging.ts), named here by digest. */
export interface ContextReference {
  source_id: string; /** @record-revision First revision of an immutable staged source. */ version: 1; label: string; title: string; path: string;
  text: { sha256: string; bytes: number; chars: number };
  original: { filename: string; mime: string; sha256: string; size_bytes: number };
  artifact?: ArtifactReference;
  /** The documents adoption made from it, one per part of a long text, as the `documents` taker answered. */
  parts?: ContextDocumentPart[];
  /** True when the file had no standard document suffix and was recognized as readable text by its content (ONB-37). */
  recognized_by_content?: boolean;
  /** True when the summary cited this material's `[S<n>]` label (ONB-38, C3). */
  used_in_summary?: boolean;
  /** True once adoption imported this material into the project (ONB-38). */
  adopted?: boolean;
  /** Path of an earlier selected material with identical content digest (ONB-35). */
  duplicate_of?: string;
  /** How a secret-like file was explicitly approved by the person (C2, S-onboarding-secret-hold). */
  secret_mode?: "strip" | "raw";
}
export interface ContextSource {
  kind: ContextSourceKind; selected: boolean; path?: string; files?: ImportFile[];
  /** Staged digests by relative path so browser uploads survive refresh and scope toggles before start (ONB-36, C6, C7). */
  staged_digests?: Record<string, string>;
  text?: string; url?: string; connection_id?: string; days?: 0 | 7 | 30 | 90;
  metadata?: {
    files: ContextFileMetadata[];
    skipped: number;
    truncated: boolean;
    cancelled?: boolean;
    total_entries?: number;
    skipped_reasons?: ContextSkippedReasons;
    ignored_rules?: string[];
  };
  excluded?: string[];
  references?: ContextReference[]; skipped?: number; issues?: { path: string; reason: string }[]; error?: string;
  /** Secret-like files held before model synthesis until the person chooses strip, raw, or exclude (C2). */
  held_secrets?: HeldSecretMaterial[];
  /** Already-read references retained for unchanged files when scope expands (ONB-40, C7). */
  reused_references?: ContextReference[];
  /** Reading in progress, one file at a time: what is read so far survives a restart, and reading resumes after it. */
  reading?: { done: number; total: number; references: ContextReference[]; issues: { path: string; reason: string }[]; held_secrets?: HeldSecretMaterial[] };
}
/** How long the model calls of a phase took so far, so the page can say how long the rest may take. */
export interface CallTiming { ms: number; calls: number }
export interface ContextScopeDelta {
  added: string[];
  added_count: number;
  removed: string[];
  removed_count: number;
  reused: number;
}
export interface ContextJourney {
  id: string; phase: "selecting" | "reading" | "review" | "failed" | "adopting" | "complete";
  sources: ContextSource[]; model: string | null; error: string | null;
  summary: { title: string; body: string; references: ContextReference[] } | null;
  project_id: string; updated_at: string;
  /** Where the work summary opens once adoption kept it (the `documents` taker's answer); none before. */
  summary_open?: ContextDocumentPart["open"] | null;
  /** Monotonic generation incremented when starting or reopening so late responses from older passes never overwrite newer scope (ONB-45, C11). */
  epoch?: number;
  /** Classified model/service failure kind for clear recovery guidance while preserving exact `error` text (ONB-41, C9). */
  failure_kind?: ContextModelFailureKind | null;
  /** Per-file decisions (`strip` | `raw` | `exclude`) keyed by `(kind, path, sha256)` digest (C2). */
  secret_decisions?: Record<string, SecretSendDecision>;
  /** Paths included in the most recent read pass, used to compute incremental scope deltas (ONB-40, C7). */
  last_read_paths?: string[];
  /** Incremental work summary when scope or model changes ("这次只做这些", ONB-40, ONB-42). */
  scope_delta?: ContextScopeDelta | null;
  /** Previous summary kept dimmed as non-adoptable reference while re-organizing after a scope/model change (ONB-40, ONB-42). */
  stale_summary?: { title: string; body: string; at: string; model: string | null } | null;
  /** Recorded when an outdated pass's model response arrived late and was discarded (ONB-45, C11). */
  late_ignored?: { at: string; model: string | null } | null;
  /**
   * `take`: the person's own code folder, made the project's output and handed to the plugin they picked among those that declare they
   * take one (ONB-44, batch12-design §7); `code_root` is the folder as this round read it, never a path from a request.
   */
  adoption?: {
    title: string; body: string; blank: boolean;
    /** The drafts the person kept. Kept as given once adoption starts, so a retry adds the same ones (a retry takes no new input). */
    keep?: string[];
    /** The plugin that keeps the materials and the summary as documents: installed in the new project. */
    documents?: { plugin_id: string; project_plugin_id: string };
    take?: { plugin_id: string; project_plugin_id: string; code_root: string; output_set?: true };
  };
  /** What that plugin answered: where the person goes on, and how many of the round's materials went with the folder; `not_taken` when nothing was handed (the plugin gone, the output no longer the folder, or the plugin refused). */
  take_result?: { open: { item_id: string; title: string } | null; materials: number; of: number; not_taken?: "unavailable" | "moved" | "refused" };
  /** The plugin the person chose to draft from the materials, when more than one can (contract-design §2.5); with one, that one. */
  drafts_taker?: string;
  /**
   * Drafts from the same materials, by the `drafts` taker (`plugin_id`, opened at `surface`): one batch per 50 materials (or parts of long
   * ones), each kept as the platform-shaped snapshot it was drafted as (null for a batch drafted before version 2, read again by id when
   * shown); `total` is how many the round needs, `key` the material set they came from (another set starts over). `none`: no plugin drafts.
   */
  drafts?: {
    plugin_id: string | null; surface: string | null; status: "pending" | "ready" | "failed" | "none"; key: string;
    batches: { batch_id: string; snapshot: OnboardingDraftBatch | null }[]; total: number; error: string | null; added?: string[]; timing: CallTiming;
  };
  auto_start?: boolean;
  previewed?: boolean;
  artifact_references?: ArtifactReference[];
  requires_reselection?: boolean;
  /** The round sat unfinished for 30 days and its staged files were removed (user 2026-10-22); its files must be chosen again. */
  staging_removed?: boolean;
  needs_model?: boolean;
  oauth_status?: "pending" | "connected" | "cancelled" | "failed";
  oauth_state?: string;
  oauth_expires_at?: number;
  /** Whether the page that started the authorization is the desktop app's, so the return goes back to it. */
  oauth_desktop?: boolean;
  /**
   * The summary's batches: the round, its batches done and in all; `notes` are the batches whose notes are staged (by digest).
   * `batches` counts every call of the summary, done and still to come (later rounds estimated from how much the notes shrink).
   */
  synthesis?: { key: string; stage: number; completed: number; total: number; notes: string[]; batches: { done: number; all: number }; timing: CallTiming };
  /** Bytes of the chosen materials read so far and in all; a source read at the start (mail, pasted text) adds its own when read. */
  reading_bytes?: { done: number; total: number };
}
const CONTEXT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export function contextJourneyId(value: unknown): string {
  if (typeof value !== "string" || !CONTEXT_ID.test(value)) throw new Error("整理标识无效，请重新开始");
  return value;
}
/** The context onboarding store's one current schema (repository-anti-corruption §4.1). */
export const CONTEXT_ONBOARDING_BASELINE: SqliteBaseline = { version: /* @version database.context_onboarding_baseline */ 2, schema: "CREATE TABLE journeys (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL);",
  upgrades: [{ from: 1, run: upgradeJourneysFrom1 }] };

const ONE = { todo: "io.molis.work.todo", todo_surface: "todo", pages_kind: "pages_document", pages_surface: "pages" } as const;
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
const refused = (id: string, what: string): never => { throw new Error(`上手记录 ${id} 的 ${what} 不是第 1 版的形状，这一库不升级`); };

/**
 * Version 1 → 2 (contract-design §2.5, D5, user 2026-11-17): the journey names its takers by what they declare, not Todo and Pages. Version 1
 * only ever had those two, so this step reads its facts as theirs. Todo's own batches cannot be read as the platform's shape: each keeps its
 * id and an empty snapshot, read again by id when shown. The drafts a person kept (`todo_selected`) are kept as given (`keep`); the summary
 * and the materials' documents become where they open. Any other shape refuses the step and the store stays as it was.
 */
function upgradeJourneysFrom1(db: SqliteBaselineDatabase): void {
  const rows = db.prepare("SELECT id, body FROM journeys").all() as { id: string; body: string }[];
  const update = db.prepare("UPDATE journeys SET body=? WHERE id=?");
  for (const row of rows) {
    const body = JSON.parse(row.body) as Record<string, unknown>;
    if (!isObject(body)) refused(row.id, "正文");
    const part = (id: string, title: string): ContextDocumentPart => ({ subject: { kind: ONE.pages_kind, id }, open: { surface: ONE.pages_surface, id, title } });
    const references = (list: unknown): void => {
      if (list === undefined) return;
      if (!Array.isArray(list)) return refused(row.id, "材料列表");
      for (const ref of list) {
        if (!isObject(ref)) refused(row.id, "材料");
        if (ref.documents === undefined) continue;
        if (!strings(ref.documents)) refused(row.id, "材料的文档");
        ref.parts = (ref.documents as string[]).map(id => part(id, typeof ref.title === "string" ? ref.title : ""));
        delete ref.documents;
      }
    };
    if (body.summary !== null && body.summary !== undefined) { if (!isObject(body.summary)) refused(row.id, "摘要"); references((body.summary as Record<string, unknown>).references); }
    if (body.sources !== undefined) {
      if (!Array.isArray(body.sources)) refused(row.id, "来源");
      for (const item of body.sources as unknown[]) {
        if (!isObject(item)) refused(row.id, "来源");
        const source = item as Record<string, unknown>;
        references(source.references); references(source.reused_references);
        if (source.reading !== undefined) { if (!isObject(source.reading)) refused(row.id, "读取进度"); references((source.reading as Record<string, unknown>).references); }
      }
    }
    if ("document_id" in body) {
      const id = body.document_id, adoption = isObject(body.adoption) ? body.adoption : undefined;
      if (id !== null && typeof id !== "string") refused(row.id, "摘要文档");
      body.summary_open = typeof id === "string" ? part(id, typeof adoption?.title === "string" ? adoption.title : "").open : null;
      delete body.document_id;
    }
    if (body.adoption !== undefined) {
      if (!isObject(body.adoption)) refused(row.id, "采用");
      const adoption = body.adoption as Record<string, unknown>;
      if (adoption.todo_selected !== undefined) {
        if (!strings(adoption.todo_selected)) refused(row.id, "勾选的待办");
        adoption.keep = adoption.todo_selected;
        delete adoption.todo_selected;
      }
    }
    if (body.todo !== undefined) {
      const todo = body.todo;
      if (!isObject(todo) || !["pending", "ready", "failed"].includes(String(todo.status)) || typeof todo.key !== "string" || !Array.isArray(todo.batches)
        || !todo.batches.every(batch => isObject(batch) && typeof batch.batch_id === "string") || typeof todo.total !== "number"
        || (todo.error !== null && typeof todo.error !== "string") || (todo.added !== undefined && !strings(todo.added)) || !isObject(todo.timing)) refused(row.id, "待办草稿");
      const t = todo as Record<string, unknown> & { batches: { batch_id: string }[] };
      body.drafts = { plugin_id: ONE.todo, surface: ONE.todo_surface, status: t.status, key: t.key, batches: t.batches.map(batch => ({ batch_id: batch.batch_id, snapshot: null })),
        total: t.total, error: t.error, ...(t.added ? { added: t.added } : {}), timing: t.timing };
      delete body.todo;
    }
    update.run(JSON.stringify(body), row.id);
  }
}
export function withContextJourneys<T>(home: string, run: (store: ContextJourneyStore) => T): T {
  const db = openHomeSqliteDatabase(home, CONTEXT_ONBOARDING_HOME_STORE.path);
  try { return run(new ContextJourneyStore(db)); } finally { db.close(); }
}
class ContextJourneyStore {
  constructor(private readonly db: ReturnType<typeof openHomeSqliteDatabase>) {
    applySqliteBaseline(db, CONTEXT_ONBOARDING_HOME_STORE.path, CONTEXT_ONBOARDING_BASELINE);
  }
  get(id: string): ContextJourney {
    const journey = this.find(id);
    if (!journey) throw new Error("这轮整理不存在，请重新开始");
    return journey;
  }
  find(id: string): ContextJourney | null {
    const row = this.db.prepare("SELECT body FROM journeys WHERE id=?").get(contextJourneyId(id)) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as ContextJourney : null;
  }
  /** The journey waiting for this authorization state, if one is. */
  waitingForOAuth(state: string): ContextJourney | null {
    const row = this.db.prepare("SELECT body FROM journeys WHERE json_extract(body, '$.oauth_status') = 'pending' AND json_extract(body, '$.oauth_state') = ?").get(state) as { body: string } | undefined;
    return row ? JSON.parse(row.body) as ContextJourney : null;
  }
  latestIncomplete(): Pick<ContextJourney, "id" | "phase" | "updated_at"> & { title: string | null } | null {
    const row = this.db.prepare(`SELECT body FROM journeys
      WHERE json_extract(body, '$.phase') != 'complete'
      AND (json_extract(body, '$.adoption') IS NOT NULL
        OR json_extract(body, '$.phase') != 'selecting'
        OR EXISTS (SELECT 1 FROM json_each(json_extract(body, '$.sources'))
          WHERE json_extract(value, '$.selected') = 1))
      ORDER BY updated_at DESC, rowid DESC LIMIT 1`).get() as { body: string } | undefined;
    if (!row) return null;
    const j = JSON.parse(row.body) as ContextJourney;
    return { id: j.id, phase: j.phase, updated_at: j.updated_at, title: j.adoption?.title ?? j.summary?.title ?? null };
  }
  create(id: string): ContextJourney {
    contextJourneyId(id);
    this.db.prepare("INSERT OR IGNORE INTO journeys VALUES (?,?,?)").run(id, JSON.stringify({
      id, phase: "selecting", sources: [], model: null, error: null, summary: null,
      project_id: `project-onboarding-${id}`, summary_open: null, updated_at: new Date().toISOString(),
    } satisfies ContextJourney), new Date().toISOString());
    return this.get(id);
  }
  save(journey: ContextJourney): ContextJourney {
    journey.updated_at = new Date().toISOString();
    this.db.prepare("UPDATE journeys SET body=?,updated_at=? WHERE id=?").run(JSON.stringify(journey), journey.updated_at, contextJourneyId(journey.id));
    return journey;
  }
}

/** This store in the Home's store registry (W4-11). */
export const CONTEXT_ONBOARDING_HOME_STORE: HomeStoreDeclaration = { path: "context-onboarding", library: { baseline: CONTEXT_ONBOARDING_BASELINE } };
