import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectSelection, ProjectWorkspaceDirectoryRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeContextBindingRecord } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ExternalToolEntry, ExternalToolId, ExternalToolPath } from "@molis-ai/molis-work-contracts/platform/external-tools";
import {
  sessionsErrors,
  type ExternalSessionActivity,
  type ExternalSessionConnectionChoice,
  type ExternalSessionEntry,
  type ExternalSessionHistoryInput,
  type ExternalSessionSourceStatus,
} from "@molis-ai/molis-work-contracts/services/sessions";
import type { SessionDirectoryIdentity } from "./git-files.js";

export interface SessionProjectSnapshot {
  directories: readonly ProjectWorkspaceDirectoryRecord[];
  projects: readonly ProjectSelection[];
  bindings: readonly RuntimeContextBindingRecord[];
}

export const SESSION_PORT_FAILURE_KINDS = [
  "tool_missing",
  "version_mismatch",
  "timed_out",
  "read_error",
  "parse_error",
  "login_expired",
  "connection_removed",
  "account_changed",
] as const;

export type SessionPortFailureKind = (typeof SESSION_PORT_FAILURE_KINDS)[number];

export interface SessionSourceFailureInfo {
  readonly kind: SessionPortFailureKind;
  readonly message: string;
  readonly retryable: boolean;
}

export function sessionSourceFailure(
  kind: SessionPortFailureKind,
  message: string,
  retryable = kind === "timed_out" || kind === "read_error",
): ActionError {
  const details = { failure_kind: kind, retryable };
  if (kind === "login_expired" || kind === "connection_removed" || kind === "account_changed") {
    return sessionsErrors.needs_login(message, details);
  }
  if (kind === "version_mismatch" || kind === "parse_error") {
    return sessionsErrors.version_unreadable(message, details);
  }
  return sessionsErrors.read_failed(message, details);
}

export function readSessionSourceFailure(error: unknown): SessionSourceFailureInfo | null {
  if (!(error instanceof ActionError) || !error.details) return null;
  const kind = error.details.failure_kind;
  if (typeof kind !== "string" || !(SESSION_PORT_FAILURE_KINDS as readonly string[]).includes(kind)) {
    return null;
  }
  const typedKind = kind as SessionPortFailureKind;
  const retryable = typeof error.details.retryable === "boolean"
    ? error.details.retryable
    : (typedKind === "timed_out" || typedKind === "read_error");
  return { kind: typedKind, message: error.message, retryable };
}

export interface SessionCommandResult {
  stdout: string;
  stderr: string;
  exit_code: number;
}

export interface SessionServiceRequest {
  method: "GET" | "POST";
  path: string;
  query?: Readonly<Record<string, string>>;
  body?: unknown;
}

export interface SessionServiceResponse {
  status: number;
  body: unknown;
}

export interface SessionDirectoryEntry {
  name: string;
  kind: "file" | "directory";
  size: number;
  mtime_ms: number;
}

export interface SessionSuggestGroupMaterial {
  ref: number;
  tools: string[];
  directory: string | null;
  titles: string[];
  opening: string[];
}

export interface SessionSuggestProjectMaterial {
  ref: number;
  name: string;
  directories: string[];
}

export interface SessionSuggestInput {
  groups: SessionSuggestGroupMaterial[];
  projects: SessionSuggestProjectMaterial[];
}

export interface SessionSuggestDraftItem {
  group: number;
  project: number | null;
  alternatives: number[];
  reason: string;
  evidence: Array<{ kind: "directory" | "title" | "message"; text: string }>;
}

export interface SessionSuggestDraft {
  items: SessionSuggestDraftItem[];
}

export interface SessionAttributionSuggester {
  promptVersion(): number;
  suggest(
    input: SessionSuggestInput,
    signal: AbortSignal,
    beforeDispatch?: () => void | Promise<void>,
  ): Promise<SessionSuggestDraft>;
}

export interface CodexThreadListResponse {
  threads: Array<{
    id: string;
    title: string | null;
    cwd: string | null;
    updated_at: string;
    activity: ExternalSessionActivity;
    parent_thread_id: string | null;
  }>;
  next_cursor: string | null;
}

export interface CodexThreadReadResponse {
  activity: ExternalSessionActivity;
  entries: ExternalSessionEntry[];
}

export interface SessionsPorts {
  commands: {
    run(entry: ExternalToolId, argv: readonly string[], signal: AbortSignal): Promise<SessionCommandResult>;
  };
  files: {
    resolveRoot(spec: ExternalToolPath): { root: string; exists: boolean };
    list(root: string, relative: string, signal: AbortSignal): Promise<readonly SessionDirectoryEntry[]>;
    stat(root: string, relative: string, signal: AbortSignal): Promise<{ size: number; mtime_ms: number } | null>;
    open(root: string, relative: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  };
  protocols?: {
    codexThreadList(root: string, cursor: string | null, signal: AbortSignal): Promise<CodexThreadListResponse>;
    codexThreadRead(root: string, nativeId: string, signal: AbortSignal): Promise<CodexThreadReadResponse>;
  };
  connections: {
    current(connectionId: string): { enabled: boolean; account_label?: string | null } | null;
    choices(tool: ExternalToolEntry): {
      choices: ExternalSessionConnectionChoice[];
      connect_service_id: string | null;
    };
    request(connectionId: string, request: SessionServiceRequest, signal: AbortSignal): Promise<SessionServiceResponse>;
    command(connectionId: string, entry: ExternalToolId, argv: readonly string[], signal: AbortSignal): Promise<SessionCommandResult>;
  };
  projects: {
    read<T>(operation: (snapshot: SessionProjectSnapshot) => T): Promise<T>;
  };
  directories: {
    identify(path: string): SessionDirectoryIdentity | null;
    /** The same identification without blocking the event loop, for discovery, which runs outside a catalog read. */
    identifyAsync?(path: string): Promise<SessionDirectoryIdentity | null>;
  };
  suggester: (() => SessionAttributionSuggester | null) | SessionAttributionSuggester | null;
  searchChanged(): void;
  clock?: () => Date;
}

export interface DiscoveredSessionCandidate {
  native_id: string;
  seen_via?: ExternalToolId;
  title: string | null;
  directory: string | null;
  last_activity_at: string;
  activity: ExternalSessionActivity;
  forked_from_native_id?: string | null;
  /** A subagent's trajectory beside its session (`forked_from_native_id`): recorded, left out of the list. */
  subagent?: true;
  return_target: { kind: "command" | "url"; label: string } | null;
}

export interface AdapterDiscoveryBatch {
  sessions: DiscoveredSessionCandidate[];
  skipped_count: number;
  next_cursor: string | null;
  total?: number | null;
}

export interface AdapterSourceContext {
  tool: ExternalToolEntry;
  entry_id: ExternalToolId;
  location_key: string;
  root: string | null;
  connection_id: string | null;
  ports: SessionsPorts;
}

export interface AdapterReadOutput {
  entries: ExternalSessionEntry[];
  older_cursor: string | null;
  newer_cursor: string | null;
  matches: Array<{ position: string; ranges: Array<[number, number]> }>;
  search: { scanned_all: boolean; next_cursor: string | null } | null;
  read_state: "complete" | "partial";
  stopped: { code: string; at: string | null; retryable: boolean } | null;
  activity: ExternalSessionActivity;
}

/** Attribution's opening sample is independent of the UI's newest history page. Never accepted by the public history action. */
export type AdapterHistoryInput = Omit<ExternalSessionHistoryInput, "session_key"> & { readonly opening?: true };

export interface ExternalSessionSourceAdapter {
  readonly entry_id: ExternalToolId;
  discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal, alreadyRead: number): Promise<AdapterDiscoveryBatch>;
  readHistory?(
    context: AdapterSourceContext,
    nativeId: string,
    input: AdapterHistoryInput,
    signal: AbortSignal,
  ): Promise<AdapterReadOutput>;
  searchTool?(
    context: AdapterSourceContext,
    query: string,
    limit: number,
    signal: AbortSignal,
  ): Promise<{ native_ids: string[]; skipped_count: number }>;
}

export function sourceStatusFromFailure(failure: unknown): ExternalSessionSourceStatus {
  const info = readSessionSourceFailure(failure);
  if (info) {
    switch (info.kind) {
      case "login_expired":
      case "connection_removed":
      case "account_changed":
        return { state: "needs_login", reason: info.kind };
      case "version_mismatch":
      case "parse_error":
        return { state: "version_unreadable", reason: info.kind };
      case "tool_missing":
      case "timed_out":
      case "read_error":
        return { state: "failed", reason: info.kind };
    }
  }
  return { state: "failed", reason: "read_error" };
}
