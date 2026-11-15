import type { ProjectSelection, ProjectWorkspaceDirectoryRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeContextBindingRecord } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ExternalToolEntry, ExternalToolId, ExternalToolPath } from "@molis-ai/molis-work-contracts/platform/external-tools";
import type {
  ExternalSessionActivity,
  ExternalSessionConnectionChoice,
  ExternalSessionEntry,
  ExternalSessionHistoryInput,
  ExternalSessionSourceStatus,
} from "@molis-ai/molis-work-contracts/services/sessions";
import type { SessionDirectoryIdentity } from "./git-files.js";

export interface SessionProjectSnapshot {
  directories: readonly ProjectWorkspaceDirectoryRecord[];
  projects: readonly ProjectSelection[];
  bindings: readonly RuntimeContextBindingRecord[];
}

export type SessionPortFailureKind =
  | "tool_missing"
  | "version_mismatch"
  | "timed_out"
  | "read_error"
  | "parse_error"
  | "login_expired"
  | "connection_removed"
  | "account_changed";

export class SessionSourceFailure extends Error {
  constructor(
    readonly kind: SessionPortFailureKind,
    message: string,
    readonly retryable = kind === "timed_out" || kind === "read_error",
  ) {
    super(message);
    this.name = "SessionSourceFailure";
  }
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

export interface ExternalSessionSourceAdapter {
  readonly entry_id: ExternalToolId;
  discoverPage(context: AdapterSourceContext, cursor: string | null, signal: AbortSignal): Promise<AdapterDiscoveryBatch>;
  readHistory?(
    context: AdapterSourceContext,
    nativeId: string,
    input: Omit<ExternalSessionHistoryInput, "session_key">,
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
  if (failure instanceof SessionSourceFailure) {
    switch (failure.kind) {
      case "login_expired":
      case "connection_removed":
      case "account_changed":
        return { state: "needs_login", reason: failure.kind };
      case "version_mismatch":
      case "parse_error":
        return { state: "version_unreadable", reason: failure.kind };
      case "tool_missing":
      case "timed_out":
      case "read_error":
        return { state: "failed", reason: failure.kind };
    }
  }
  return { state: "failed", reason: "read_error" };
}
