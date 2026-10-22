import type { StoredDraft } from "./common.js";

/** A stored entry is a draft this page wrote: text, a revision it was made on, and a tool set or `null`. */
function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const draft: Record<string, unknown> = { ...value };
  const revision = draft.expected_revision;
  return typeof draft.title === "string" && typeof draft.instructions === "string"
    && typeof revision === "number" && Number.isSafeInteger(revision) && revision > 0
    && (draft.host_tools === null || Array.isArray(draft.host_tools) && draft.host_tools.every(tool => typeof tool === "string"));
}

/** The unsaved edits of this window, by Character. Session storage that cannot be read or holds something else is no stored drafts. */
export function readStoredDrafts(storageKey: string): Record<string, StoredDraft> {
  let stored: unknown;
  try {
    stored = JSON.parse(sessionStorage.getItem(storageKey) || "{}");
  } catch {
    // Unreadable storage or text that is not JSON: there are no drafts to restore.
    return {};
  }
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
  const drafts: Record<string, StoredDraft> = {};
  for (const [id, value] of Object.entries(stored)) if (isStoredDraft(value)) drafts[id] = value;
  return drafts;
}

/** Whether the browser took the drafts; false when it cannot keep them. */
export function writeStoredDrafts(storageKey: string, drafts: Record<string, StoredDraft>): boolean {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(drafts));
    return true;
  } catch {
    // Storage is full or blocked: the caller tells the person.
    return false;
  }
}
