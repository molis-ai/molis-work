import { applySqliteBaseline, openHomeSqliteDatabase, type SqliteBaseline, type HomeStoreDeclaration } from "@molis-ai/molis-work-storage";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";

/**
 * A Todo organizing result as the journey keeps it. Only the fields the journey reads are named; Todo's `todo.organize.*` output
 * schema is the source of the shape, and the rest of the result rides along untouched to the page (PG-111: the journey calls Todo
 * by action id and does not import its contract).
 */
export interface OnboardingTodoBatch {
  readonly batch_id: string;
  readonly revision: number;
  readonly candidates: readonly OnboardingTodoCandidate[];
}
export interface OnboardingTodoCandidate {
  readonly candidate_id: string;
  readonly existing: null | { readonly relation: "same" | "update" | "conflict" | "maybe_done" | "reopen" };
  readonly decision: null | { readonly item_id: string | null };
}

export type ContextSourceKind = "files" | "directory" | "downloads" | "documents" | "desktop" | "custom" | "browser" | "gmail" | "chat";
/**
 * One file of a source: staged in the journey by digest (an upload, a folder read), or bytes the Host itself read for this pass
 * (pasted web text, mail) that are staged before reading, or the reason it was not read. Bytes never reach the journey's row.
 */
export interface ImportFile { path: string; staged?: string; bytes?: Buffer; reason?: string }
export interface ContextFileMetadata { path: string; size: number; modified_ms: number; identity: string }
/** A read material: its text and its original are staged in the journey (context-onboarding-staging.ts), named here by digest. */
export interface ContextReference {
  source_id: string; version: 1; label: string; title: string; path: string;
  text: { sha256: string; bytes: number; chars: number };
  original: { filename: string; mime: string; sha256: string; size_bytes: number };
  artifact?: ArtifactReference;
  /** The Pages documents adoption made from it, one per part of a long text. */
  documents?: string[];
}
export interface ContextSource {
  kind: ContextSourceKind; selected: boolean; path?: string; files?: ImportFile[];
  text?: string; url?: string; connection_id?: string; days?: 0 | 7 | 30 | 90;
  metadata?: { files: ContextFileMetadata[]; skipped: number; truncated: boolean };
  excluded?: string[];
  references?: ContextReference[]; skipped?: number; issues?: { path: string; reason: string }[]; error?: string;
  /** Reading in progress, one file at a time: what is read so far survives a restart, and reading resumes after it. */
  reading?: { done: number; total: number; references: ContextReference[]; issues: { path: string; reason: string }[] };
}
/** How long the model calls of a phase took so far, so the page can say how long the rest may take. */
export interface CallTiming { ms: number; calls: number }
export interface ContextJourney {
  id: string; phase: "selecting" | "reading" | "review" | "failed" | "adopting" | "complete";
  sources: ContextSource[]; model: string | null; error: string | null;
  summary: { title: string; body: string; references: ContextReference[] } | null;
  project_id: string; document_id: string | null; updated_at: string;
  adoption?: { title: string; body: string; blank: boolean; todo_selected?: string[] };
  /** Todo drafts organized from the same materials; applied into the new project's todos on adoption. */
  /** Todo drafts, one organizer batch per 50 materials (or parts of long ones); `total` is how many the round needs. */
  /** `key` names the material set the batches came from: another set (the person went back and chose again) starts over. */
  todo?: { status: "pending" | "ready" | "failed"; key: string; batches: OnboardingTodoBatch[]; total: number; error: string | null; added?: string[]; timing: CallTiming };
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
export const CONTEXT_ONBOARDING_BASELINE: SqliteBaseline = { version: 1, schema: "CREATE TABLE journeys (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL);" };
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
  latestIncomplete(): Pick<ContextJourney, "id" | "phase" | "updated_at"> & { title: string } | null {
    const row = this.db.prepare(`SELECT body FROM journeys
      WHERE json_extract(body, '$.phase') != 'complete'
      AND (json_extract(body, '$.adoption') IS NOT NULL
        OR json_extract(body, '$.phase') != 'selecting'
        OR EXISTS (SELECT 1 FROM json_each(json_extract(body, '$.sources'))
          WHERE json_extract(value, '$.selected') = 1))
      ORDER BY updated_at DESC, rowid DESC LIMIT 1`).get() as { body: string } | undefined;
    if (!row) return null;
    const j = JSON.parse(row.body) as ContextJourney;
    return { id: j.id, phase: j.phase, updated_at: j.updated_at, title: j.adoption?.title ?? j.summary?.title ?? "未完成的整理" };
  }
  create(id: string): ContextJourney {
    contextJourneyId(id);
    this.db.prepare("INSERT OR IGNORE INTO journeys VALUES (?,?,?)").run(id, JSON.stringify({
      id, phase: "selecting", sources: [], model: null, error: null, summary: null,
      project_id: `project-onboarding-${id}`, document_id: null, updated_at: new Date().toISOString(),
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
