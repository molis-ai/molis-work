/**
 * Unsent text the user typed into Git: a commit message, a branch name, a
 * worktree name, a conflict resolution.
 *
 * Kept per workspace, and kept even when Git is not open. Losing a half-written
 * commit message because the user looked at something else is the kind of small
 * loss that makes people stop trusting a tool with anything longer than a line.
 */

export interface GitDraft {
  commit_message: string;
  branch_name: string;
  worktree_name: string;
  worktree_branch: string;
  remote: string;
  sync_branch: string;
}

export const EMPTY_DRAFT: GitDraft = {
  commit_message: "",
  branch_name: "",
  worktree_name: "",
  worktree_branch: "",
  remote: "",
  sync_branch: "",
};

const MAX_FIELD = 4_096;
const MAX_RECORD = 262_144;
const MAX_WORKSPACES = 64;

export interface StoredDrafts {
  /** Per workspace id. */
  drafts: Map<string, GitDraft>;
  /** Manual conflict text, keyed by `conflictKey`. */
  conflicts: Map<string, string>;
}

/** Workspace ids and paths cannot contain a newline, so this key is injective. */
export function conflictKey(workspaceId: string, path: readonly string[]): string {
  return `${workspaceId}\n${path.join("/")}`;
}

/**
 * Read stored drafts.
 *
 * Every failure degrades to "no drafts" rather than raising: drafts are a
 * convenience, and refusing to open Git because a stored value is malformed
 * would punish the user for something they never typed.
 */
export function parseStoredDrafts(raw: string | null | undefined): StoredDrafts {
  const empty: StoredDrafts = { drafts: new Map(), conflicts: new Map() };
  if (raw === null || raw === undefined || raw.trim() === "" || raw.length > MAX_RECORD) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!isRecord(parsed)) return empty;
  const drafts = new Map<string, GitDraft>();
  const conflicts = new Map<string, string>();
  const rawDrafts = isRecord(parsed.drafts) ? parsed.drafts : {};
  for (const [workspaceId, value] of Object.entries(rawDrafts)) {
    if (drafts.size >= MAX_WORKSPACES) break;
    if (!isRecord(value)) continue;
    drafts.set(workspaceId, {
      commit_message: text(value.commit_message),
      branch_name: text(value.branch_name),
      worktree_name: text(value.worktree_name),
      worktree_branch: text(value.worktree_branch),
      remote: text(value.remote),
      sync_branch: text(value.sync_branch),
    });
  }
  const rawConflicts = isRecord(parsed.conflicts) ? parsed.conflicts : {};
  for (const [workspaceId, files] of Object.entries(rawConflicts)) {
    if (!isRecord(files)) continue;
    for (const [path, value] of Object.entries(files)) {
      if (typeof value !== "string") continue;
      conflicts.set(`${workspaceId}\n${path}`, value.slice(0, MAX_FIELD));
    }
  }
  return { drafts, conflicts };
}

export function serializeStoredDrafts(stored: StoredDrafts): string {
  const conflicts: Record<string, Record<string, string>> = {};
  for (const [key, value] of stored.conflicts) {
    const split = key.indexOf("\n");
    if (split <= 0) continue;
    const workspaceId = key.slice(0, split);
    const path = key.slice(split + 1);
    const files = conflicts[workspaceId] ?? {};
    files[path] = value;
    conflicts[workspaceId] = files;
  }
  return JSON.stringify({
    version: 1,
    drafts: Object.fromEntries(stored.drafts),
    conflicts,
  });
}

/** Whether this draft holds anything worth keeping. */
export function draftIsEmpty(draft: GitDraft): boolean {
  return Object.values(draft).every((value) => value.trim() === "");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_FIELD) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
