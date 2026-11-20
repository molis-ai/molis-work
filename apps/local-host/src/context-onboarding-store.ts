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

/** `sessions`: the external AI sessions filed to the round's project, read as that project's AI (batch 35 item 1, SRB-09). */
export type ContextSourceKind = "files" | "directory" | "downloads" | "documents" | "desktop" | "custom" | "browser" | "gmail" | "chat" | "sessions";
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
  /** The Pages documents adoption made from it, one per part of a long text. */
  documents?: string[];
  /** True when the file had no standard document suffix and was recognized as readable text by its content (ONB-37). */
  recognized_by_content?: boolean;
  /** True when the summary cited this material's `[S<n>]` label (ONB-38, C3). */
  used_in_summary?: boolean;
  /** True once adoption imported this material into the project (ONB-38). */
  adopted?: boolean;
  /** Path of an earlier selected material with identical content digest (ONB-35). */
  duplicate_of?: string;
  /** The external session this material was read from: adoption keeps one material per session in the project, so a re-import is not a new one. */
  session_key?: string;
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
  project_id: string; document_id: string | null; updated_at: string;
  /** The round adds to a project that already exists (batch 35 item 1): adoption makes no project and writes into this one. */
  existing?: true;
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
  adoption?: { title: string; body: string; blank: boolean; todo_selected?: string[]; take?: { plugin_id: string; project_plugin_id: string; code_root: string; output_set?: true } };
  /** What that plugin answered: where the person goes on, and how many of the round's materials went with the folder; `not_taken` when nothing was handed (the plugin gone, the output no longer the folder, or the plugin refused). */
  take_result?: { open: { item_id: string; title: string } | null; materials: number; of: number; not_taken?: "unavailable" | "moved" | "refused" };
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
export const CONTEXT_ONBOARDING_BASELINE: SqliteBaseline = { version: /* @version database.context_onboarding_baseline */ 1, schema: "CREATE TABLE journeys (id TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL);" };
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
  latestIncomplete(projectId?: string | null): Pick<ContextJourney, "id" | "phase" | "updated_at"> & { title: string | null } | null {
    const row = this.db.prepare(`SELECT body FROM journeys
      WHERE json_extract(body, '$.phase') != 'complete'
      AND (CASE WHEN ? IS NULL THEN COALESCE(json_extract(body, '$.existing'), 0) = 0
        ELSE json_extract(body, '$.existing') = 1 AND json_extract(body, '$.project_id') = ? END)
      AND (json_extract(body, '$.adoption') IS NOT NULL
        OR json_extract(body, '$.phase') != 'selecting'
        OR EXISTS (SELECT 1 FROM json_each(json_extract(body, '$.sources'))
          WHERE json_extract(value, '$.selected') = 1))
      ORDER BY updated_at DESC, rowid DESC LIMIT 1`).get(projectId ?? null, projectId ?? null) as { body: string } | undefined;
    if (!row) return null;
    const j = JSON.parse(row.body) as ContextJourney;
    return { id: j.id, phase: j.phase, updated_at: j.updated_at, title: j.adoption?.title ?? j.summary?.title ?? null };
  }
  /** A new round; with `projectId`, one that adds to that existing project (the caller checked it exists). */
  create(id: string, projectId?: string): ContextJourney {
    contextJourneyId(id);
    this.db.prepare("INSERT OR IGNORE INTO journeys VALUES (?,?,?)").run(id, JSON.stringify({
      id, phase: "selecting", sources: [], model: null, error: null, summary: null,
      project_id: projectId ?? `project-onboarding-${id}`, ...(projectId ? { existing: true as const } : {}), document_id: null, updated_at: new Date().toISOString(),
    } satisfies ContextJourney), new Date().toISOString());
    const journey = this.get(id);
    if (journey.existing !== (projectId ? true : undefined) || (projectId && journey.project_id !== projectId)) {
      throw new Error("这轮整理属于另一个项目");
    }
    return journey;
  }
  save(journey: ContextJourney): ContextJourney {
    journey.updated_at = new Date().toISOString();
    this.db.prepare("UPDATE journeys SET body=?,updated_at=? WHERE id=?").run(JSON.stringify(journey), journey.updated_at, contextJourneyId(journey.id));
    return journey;
  }
}

/** This store in the Home's store registry (W4-11). */
export const CONTEXT_ONBOARDING_HOME_STORE: HomeStoreDeclaration = { path: "context-onboarding", library: { baseline: CONTEXT_ONBOARDING_BASELINE } };
