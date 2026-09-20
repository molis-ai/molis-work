import type { ContractDescriptor } from "../platform/package.js";
import type { HostCapabilityDefinition } from "../platform/app-host.js";

/** Host reads are always scoped to a currently linked workspace, never an absolute path. */
export interface WorkspaceFileQuery {
  workspace_id: string;
  path: readonly string[];
  kind: "directory" | "text";
}
export type WorkspaceFileResult =
  | { outcome: "directory"; entries: readonly { name: string; path: readonly string[]; kind: "file" | "directory" | "other" }[]; truncated: boolean }
  | { outcome: "text"; text: string; fingerprint: string }
  | { outcome: "too-large"; bytes: number; limit: number }
  | { outcome: "binary" | "unsupported" | "missing" | "denied" | "changed" };

export const readWorkspaceFileCapability = {
  capability_id: "projects.workspace.file.read.v1", version: 1, operation: "query",
} as HostCapabilityDefinition<WorkspaceFileQuery, WorkspaceFileResult>;

/**
 * What Plugins working on one workspace exchange.
 *
 * These payloads live in Contracts, not in whichever Plugin happens to produce
 * them first, because a Plugin may not import another Plugin. Files captures a
 * snapshot, Diff compares it, Git publishes a change set, Coding proposes one —
 * and none of them may depend on the others' code to agree on what those words
 * mean. The shapes are the agreement; the Plugins are interchangeable.
 *
 * Every parser here is the boundary. Content arrives from a Plugin the Host did
 * not write, so nothing is trusted: paths are refused rather than normalised,
 * handles must be opaque, and a field that contradicts another is an error, not
 * something to reconcile silently.
 */

export const workspaceArtifactsContract = {
  contractId: "io.molis.work.modules.workspace-artifacts.v1",
  kind: "module",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/SSOT-MATRIX.md",
} as const satisfies ContractDescriptor;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export class WorkspaceArtifactError extends Error {
  constructor(
    readonly code:
      | "workspace.invalid_ref"
      | "workspace.handle_not_opaque"
      | "workspace.invalid_path"
      | "workspace.invalid_payload",
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceArtifactError";
  }
}

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") throw new WorkspaceArtifactError("workspace.invalid_payload", `${field} 必须是字符串`);
  const text = value.trim();
  if (text === "") throw new WorkspaceArtifactError("workspace.invalid_payload", `${field} 不能为空`);
  if (text.length > maxLength) throw new WorkspaceArtifactError("workspace.invalid_payload", `${field} 超出上限`);
  return text;
}

/* ------------------------------------------------------------------ *
 * Workspace reference
 * ------------------------------------------------------------------ */

export const WORKSPACE_REF_TYPE = "workspace.ref.v1";
export const WORKSPACE_REF_SCHEMA_VERSION = 1;

export const WORKSPACE_NAME_MAX_LENGTH = 256;
export const WORKSPACE_HANDLE_MAX_LENGTH = 128;

export interface WorkspaceRef {
  /** Stable across renames. Equal to the Host handle. */
  workspace_id: string;
  /** What the user calls this project. Display only. */
  name: string;
  /**
   * Opaque Host token that resolves to a directory. Never a path: Artifacts
   * travel, and a real path inside one would leak the user's disk layout to
   * every consumer, including Plugins never granted filesystem access.
   */
  handle: string;
}

/** A handle may only be an opaque token, so a path can never ride in as one. */
export function isOpaqueHandle(handle: string): boolean {
  return /^[A-Za-z0-9._-]+$/u.test(handle) && !handle.includes("..");
}

export function parseWorkspaceRef(content: unknown): WorkspaceRef {
  if (!isRecord(content)) throw new WorkspaceArtifactError("workspace.invalid_ref", "Workspace 不是对象");
  const handle = requiredText(content.handle, "handle", WORKSPACE_HANDLE_MAX_LENGTH);
  if (!isOpaqueHandle(handle)) {
    throw new WorkspaceArtifactError("workspace.handle_not_opaque", "目录引用不能包含路径");
  }
  const workspace_id = requiredText(content.workspace_id, "workspace_id", WORKSPACE_HANDLE_MAX_LENGTH);
  if (workspace_id !== handle) {
    // Two identities for one directory would let a consumer key its own state
    // on the wrong one and then disagree with the Host about what it is bound to.
    throw new WorkspaceArtifactError("workspace.invalid_ref", "workspace_id 必须等于目录句柄");
  }
  return { workspace_id, name: requiredText(content.name, "name", WORKSPACE_NAME_MAX_LENGTH), handle };
}

/**
 * The scope key the Host compares when deciding whether two inputs belong
 * together. It only ever compares keys; it never reads fields back out.
 */
export function workspaceScopeKey(ref: WorkspaceRef): string {
  return `${WORKSPACE_REF_TYPE}:${ref.workspace_id}`;
}

/* ------------------------------------------------------------------ *
 * Workspace-relative paths
 * ------------------------------------------------------------------ */

/**
 * Paths travel as segments, never as one joined string.
 *
 * A joined string invites a consumer to split it again on the wrong separator,
 * and it hides `..` behind whatever escaping the writer happened to use.
 * Segments make the check exact and make an unsafe path impossible to express
 * rather than merely discouraged.
 */

export const FILE_PATH_MAX_SEGMENTS = 64;
export const FILE_SEGMENT_MAX_LENGTH = 255;

/** Any control character is refused, not just the null byte. */
function hasControlCharacter(segment: string): boolean {
  for (let index = 0; index < segment.length; index += 1) {
    if (segment.charCodeAt(index) < 32) return true;
  }
  return false;
}

export function parseFilePath(value: unknown, allowRoot = false): string[] {
  if (!Array.isArray(value)) throw new WorkspaceArtifactError("workspace.invalid_path", "path 不是数组");
  if (!allowRoot && value.length === 0) throw new WorkspaceArtifactError("workspace.invalid_path", "path 不能为空");
  if (value.length > FILE_PATH_MAX_SEGMENTS) throw new WorkspaceArtifactError("workspace.invalid_path", "path 超出上限");
  return value.map((segment, index) => {
    if (typeof segment !== "string") {
      throw new WorkspaceArtifactError("workspace.invalid_path", `path[${index}] 必须是字符串`);
    }
    // Refused rather than normalised: a payload trying to climb out of the
    // workspace is a bad payload, and quietly rewriting it would hide that from
    // whoever sent it.
    if (
      segment === ""
      || segment === "."
      || segment === ".."
      || segment.includes("/")
      || segment.includes("\\")
      || hasControlCharacter(segment)
      || segment.length > FILE_SEGMENT_MAX_LENGTH
    ) {
      throw new WorkspaceArtifactError("workspace.invalid_path", `path[${index}] 无效`);
    }
    return segment;
  });
}

/** Display only. Never feed this back into anything that resolves a path. */
export function pathLabel(path: readonly string[]): string {
  return path.join("/");
}

/**
 * Identity for map keys and comparisons.
 *
 * The separator is a newline, which `parseFilePath` refuses inside a segment,
 * so two different paths can never collide on one key.
 */
export function pathKey(path: readonly string[]): string {
  return path.join("\n");
}

export function samePath(left: readonly string[], right: readonly string[]): boolean {
  return pathKey(left) === pathKey(right);
}

/* ------------------------------------------------------------------ *
 * File snapshots and selections
 * ------------------------------------------------------------------ */

export const FILE_SNAPSHOT_TYPE = "files.snapshot.v1";
export const FILE_SNAPSHOT_SCHEMA_VERSION = 1;

/** Above this, a snapshot is a reference rather than an inline payload. */
export const FILE_SNAPSHOT_MAX_INLINE_BYTES = 1_048_576;

export interface FileSnapshotWorkspaceRef {
  workspace_id: string;
  name: string;
}

/**
 * A bounded text snapshot of one file at one moment.
 *
 * It carries text, not a way to read text again: a consumer holding a snapshot
 * compares exactly what was captured, and can never be handed different bytes
 * later because the file moved underneath it. That is what makes a comparison
 * between two snapshots mean anything.
 */
export interface FileSnapshot {
  workspace: FileSnapshotWorkspaceRef;
  /** Workspace-relative segments. Never absolute, never joined. */
  path: readonly string[];
  text: string;
}

export function parseFileSnapshot(content: unknown): FileSnapshot {
  if (!isRecord(content)) throw new WorkspaceArtifactError("workspace.invalid_payload", "FileSnapshot 不是对象");
  if (!isRecord(content.workspace)) throw new WorkspaceArtifactError("workspace.invalid_payload", "workspace 不是对象");
  if (typeof content.text !== "string") throw new WorkspaceArtifactError("workspace.invalid_payload", "text 必须是字符串");
  return {
    workspace: {
      workspace_id: requiredText(content.workspace.workspace_id, "workspace.workspace_id", WORKSPACE_HANDLE_MAX_LENGTH),
      name: requiredText(content.workspace.name, "workspace.name", WORKSPACE_NAME_MAX_LENGTH),
    },
    path: parseFilePath(content.path),
    text: content.text,
  };
}

export function fileSnapshotInlineBytes(content: FileSnapshot): number {
  return new TextEncoder().encode(JSON.stringify(content)).byteLength;
}

export function fileSnapshotFitsInline(content: FileSnapshot): boolean {
  return fileSnapshotInlineBytes(content) <= FILE_SNAPSHOT_MAX_INLINE_BYTES;
}

export const FILE_TEXT_SELECTION_TYPE = "files.text-selection.v1";
export const FILE_TEXT_SELECTION_SCHEMA_VERSION = 1;

export interface FileTextSelection extends FileSnapshot {
  /** UTF-16 code unit offsets into the file, half-open. */
  start: number;
  end: number;
}

export function parseTextSelectionRange(start: unknown, end: unknown): { start: number; end: number } {
  if (
    typeof start !== "number"
    || typeof end !== "number"
    || !Number.isSafeInteger(start)
    || !Number.isSafeInteger(end)
    || start < 0
    || end <= start
  ) {
    throw new WorkspaceArtifactError("workspace.invalid_payload", "选区范围无效，必须是一段非空文本");
  }
  return { start, end };
}

export function parseFileTextSelection(content: unknown): FileTextSelection {
  const snapshot = parseFileSnapshot(content);
  const raw = content as { start: unknown; end: unknown };
  const { start, end } = parseTextSelectionRange(raw.start, raw.end);
  if (end - start !== snapshot.text.length) {
    // A range that does not match the captured text would let a consumer cite a
    // quotation that never existed at those offsets.
    throw new WorkspaceArtifactError("workspace.invalid_payload", "选区范围与捕获的文本长度不一致");
  }
  return { ...snapshot, start, end };
}

/** What a citation of this selection reads as. Control characters are flattened. */
export function selectionCitationLabel(selection: FileTextSelection): string {
  const path = pathLabel(selection.path);
  let safe = "";
  for (let index = 0; index < path.length; index += 1) {
    const code = path.charCodeAt(index);
    safe += code < 32 || code === 127 ? " " : path[index];
  }
  return `${safe.slice(0, 160)} · UTF-16 ${selection.start}–${selection.end}`;
}

/* ------------------------------------------------------------------ *
 * File collection
 * ------------------------------------------------------------------ */

export const FILES_COLLECTION_TYPE = "files.collection.v1";
export const FILES_COLLECTION_SCHEMA_VERSION = 1;

export interface FilesCollectionAccess {
  /** Opaque Host handle for the workspace root. Never a path. */
  handle: string;
  display_name: string;
  /** How many entries the root listing produced. */
  entry_count: number;
  /** True when the Host stopped listing before the directory ended. */
  truncated: boolean;
}

/**
 * What is browsable and which file is in focus — not the files themselves.
 * A consumer that wants bytes binds to a snapshot port instead, which is a
 * fixed capture it can reason about.
 */
export interface FilesCollection {
  workspace: FileSnapshotWorkspaceRef;
  collection: FilesCollectionAccess;
  selection: { path: readonly string[] } | null;
}

export function parseFilesCollection(content: unknown): FilesCollection {
  if (!isRecord(content)) throw new WorkspaceArtifactError("workspace.invalid_payload", "FilesCollection 不是对象");
  if (!isRecord(content.workspace)) throw new WorkspaceArtifactError("workspace.invalid_payload", "workspace 不是对象");
  if (!isRecord(content.collection)) throw new WorkspaceArtifactError("workspace.invalid_payload", "collection 不是对象");
  const workspace_id = requiredText(content.workspace.workspace_id, "workspace.workspace_id", WORKSPACE_HANDLE_MAX_LENGTH);
  const handle = requiredText(content.collection.handle, "collection.handle", WORKSPACE_HANDLE_MAX_LENGTH);
  if (!isOpaqueHandle(handle)) {
    throw new WorkspaceArtifactError("workspace.handle_not_opaque", "collection.handle 不能包含路径");
  }
  if (workspace_id !== handle) {
    throw new WorkspaceArtifactError("workspace.invalid_payload", "文件集合的工作目录身份与句柄不一致");
  }
  const collection = content.collection;
  if (typeof collection.entry_count !== "number" || !Number.isSafeInteger(collection.entry_count) || collection.entry_count < 0) {
    throw new WorkspaceArtifactError("workspace.invalid_payload", "collection.entry_count 必须是非负整数");
  }
  if (typeof collection.truncated !== "boolean") {
    throw new WorkspaceArtifactError("workspace.invalid_payload", "collection.truncated 必须是布尔值");
  }
  return {
    workspace: {
      workspace_id,
      name: requiredText(content.workspace.name, "workspace.name", WORKSPACE_NAME_MAX_LENGTH),
    },
    collection: {
      handle,
      display_name: requiredText(collection.display_name, "collection.display_name", WORKSPACE_NAME_MAX_LENGTH),
      entry_count: collection.entry_count,
      truncated: collection.truncated,
    },
    selection: content.selection === null || content.selection === undefined
      ? null
      : { path: parseFilePath((content.selection as Record<string, unknown>).path) },
  };
}

/* ------------------------------------------------------------------ *
 * Change sets
 * ------------------------------------------------------------------ */

export const DIFF_CHANGESET_TYPE = "diff.changeset.v1";
export const DIFF_CHANGESET_SCHEMA_VERSION = 1;

export type ChangeSetSource =
  | { kind: "run"; run_id: string }
  | { kind: "comparison"; comparison_id: string }
  | { kind: "operation"; operation_id: string };

/**
 * A prepared change to one file: both ends of the text, frozen.
 *
 * It carries no root path, no approval and nothing executable. Applying a
 * change is the Host's business, and a change set that could authorise its own
 * application would make every surface that merely *displays* one a place where
 * work can be committed.
 */
export interface ChangeSet {
  workspace: FileSnapshotWorkspaceRef;
  path: readonly string[];
  /** False when the file is being created. */
  before_exists: boolean;
  /** False when the file is being deleted. */
  after_exists: boolean;
  before: string;
  after: string;
  source: ChangeSetSource;
}

export function parseChangeSet(content: unknown): ChangeSet {
  if (!isRecord(content)) throw new WorkspaceArtifactError("workspace.invalid_payload", "ChangeSet 不是对象");
  if (!isRecord(content.workspace)) throw new WorkspaceArtifactError("workspace.invalid_payload", "workspace 不是对象");
  if (typeof content.before_exists !== "boolean") {
    throw new WorkspaceArtifactError("workspace.invalid_payload", "before_exists 必须是布尔值");
  }
  if (typeof content.after_exists !== "boolean") {
    throw new WorkspaceArtifactError("workspace.invalid_payload", "after_exists 必须是布尔值");
  }
  if (typeof content.before !== "string") throw new WorkspaceArtifactError("workspace.invalid_payload", "before 必须是字符串");
  if (typeof content.after !== "string") throw new WorkspaceArtifactError("workspace.invalid_payload", "after 必须是字符串");
  if (!content.before_exists && !content.after_exists) {
    // A change from nothing to nothing is not a change; rendering one would
    // show an empty comparison that reads as "no difference".
    throw new WorkspaceArtifactError("workspace.invalid_payload", "before_exists 与 after_exists 不能同时为假");
  }
  return {
    workspace: {
      workspace_id: requiredText(content.workspace.workspace_id, "workspace.workspace_id", WORKSPACE_HANDLE_MAX_LENGTH),
      name: requiredText(content.workspace.name, "workspace.name", WORKSPACE_NAME_MAX_LENGTH),
    },
    path: parseFilePath(content.path),
    before_exists: content.before_exists,
    after_exists: content.after_exists,
    // A side that does not exist has no text, whatever the producer sent.
    before: content.before_exists ? content.before : "",
    after: content.after_exists ? content.after : "",
    source: parseChangeSetSource(content.source),
  };
}

function parseChangeSetSource(value: unknown): ChangeSetSource {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new WorkspaceArtifactError("workspace.invalid_payload", "source 无效");
  }
  if (value.kind === "run") return { kind: "run", run_id: requiredText(value.run_id, "source.run_id", 256) };
  if (value.kind === "comparison") {
    return { kind: "comparison", comparison_id: requiredText(value.comparison_id, "source.comparison_id", 256) };
  }
  if (value.kind === "operation") {
    return { kind: "operation", operation_id: requiredText(value.operation_id, "source.operation_id", 256) };
  }
  throw new WorkspaceArtifactError("workspace.invalid_payload", "source.kind 无效");
}

/* ------------------------------------------------------------------ *
 * Git operation receipts
 * ------------------------------------------------------------------ */

export const GIT_RESULT_TYPE = "git.result.v1";
export const GIT_RESULT_SCHEMA_VERSION = 1;

export type GitResultOutcome =
  | "succeeded"
  | "failed"
  /** A required approval was refused. */
  | "denied"
  | "cancelled"
  /** The approval was granted but expired before the operation ran. */
  | "expired"
  /**
   * Git and the Host disagree about what happened and a person must settle it.
   * Folding this into `failed` would hide that the work may have partly landed.
   */
  | "reconcile"
  | "conflict";

export interface GitOperationResult {
  workspace_id: string;
  operation_id: string;
  outcome: GitResultOutcome;
  /** One user-safe sentence. Never a raw git stderr dump. */
  summary: string;
}

const GIT_RESULT_OUTCOMES: readonly GitResultOutcome[] = [
  "succeeded", "failed", "denied", "cancelled", "expired", "reconcile", "conflict",
];

export function parseGitResult(content: unknown): GitOperationResult {
  if (!isRecord(content)) throw new WorkspaceArtifactError("workspace.invalid_payload", "Git 结果不是对象");
  const outcome = content.outcome;
  if (typeof outcome !== "string" || !GIT_RESULT_OUTCOMES.includes(outcome as GitResultOutcome)) {
    throw new WorkspaceArtifactError("workspace.invalid_payload", "outcome 无效");
  }
  return {
    workspace_id: requiredText(content.workspace_id, "workspace_id", 512),
    operation_id: requiredText(content.operation_id, "operation_id", 512),
    outcome: outcome as GitResultOutcome,
    summary: requiredText(content.summary, "summary", 512),
  };
}

/** Whether this outcome leaves the working tree possibly changed. */
export function mayHaveChangedFiles(outcome: GitResultOutcome): boolean {
  // `reconcile` and `conflict` count: both mean something may have landed.
  return outcome === "succeeded" || outcome === "reconcile" || outcome === "conflict";
}

/* ------------------------------------------------------------------ *
 * Event ids exchanged between workspace Plugins
 * ------------------------------------------------------------------ */

/**
 * Subscribers must name the exact event they listen to, which means naming a
 * publisher's id. Those ids live here so a subscriber does not have to import
 * the publisher's package to spell one, and so the two cannot drift apart.
 * Validators stay with the publisher: only it knows what its payload means.
 */
export const WORKSPACE_SELECTED_EVENT = "io.molis.work.workspace.selected";
export const GIT_FILE_CHANGED_EVENT = "io.molis.work.git.file-changed";
export const CODING_FILE_CHANGED_EVENT = "io.molis.work.coding.file-changed";
export const CODING_WORKSPACE_INVALIDATED_EVENT = "io.molis.work.coding.workspace-invalidated";
export const CODING_PREFERENCE_EVENT = "io.molis.work.coding.preference";

/* ------------------------------------------------------------------ *
 * A Run's change set
 * ------------------------------------------------------------------ */

export const CODING_CHANGESET_TYPE = "coding.changeset.v1";

/**
 * Which facts a Run's change set describes.
 *
 * These are different things and a surface must never merge them: one is what
 * this run proposed and is frozen, the other is what the working tree looks
 * like now and moves under your feet.
 */
export type CodingChangeScope = "run-frozen" | "workspace-current";

export type CodingFileChangeKind = "added" | "modified" | "deleted";

export interface CodingFileChange {
  /** Workspace-relative. Never absolute: the path outside the root is a Host fact. */
  path: string;
  kind: CodingFileChangeKind;
  added_lines: number;
  removed_lines: number;
  /** Unified diff for this file alone. */
  diff: string;
}

export interface CodingChangeSet {
  scope: CodingChangeScope;
  run_id: string;
  files: CodingFileChange[];
  /**
   * Whether these changes are on disk.
   *
   * False until a Host-approved write actually happened. A run that finished,
   * or an approval that was granted, does not make this true on its own —
   * approval is not the same event as the write.
   */
  applied: boolean;
}
