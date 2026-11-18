import type { CharacterRoleContent } from "@molis-ai/molis-work-contracts/modules/characters";

/** An unsaved edit of one role in this window: what was typed, and the version it was typed over. */
export interface StoredDraft { content: CharacterRoleContent; version: number }

function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const { content, version } = value as Record<string, unknown>;
  if (typeof content !== "object" || content === null || !Number.isSafeInteger(version)) return false;
  const draft = content as Record<string, unknown>;
  return typeof draft.title === "string" && typeof draft.instructions === "string"
    && (draft.host_tools === null || Array.isArray(draft.host_tools) && draft.host_tools.every(tool => typeof tool === "string"));
}

/**
 * The unsaved edits of this window, by role (`original:<id>`, `member:<id>`), kept in session storage so a reload brings them back
 * (RAC-1607). Storage that cannot be read or holds something else is no drafts; one that cannot be written says so.
 */
export class WindowDrafts {
  constructor(private readonly key: string) {}

  private all(): Record<string, StoredDraft> {
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(this.key) || "{}");
      if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};
      return Object.fromEntries(Object.entries(stored).filter(([, value]) => isStoredDraft(value))) as Record<string, StoredDraft>;
    } catch {
      // Unreadable storage or text that is not JSON: there is nothing to bring back.
      return {};
    }
  }

  get(role: string): StoredDraft | undefined { return this.all()[role]; }

  /** Keeps (or with `null` forgets) one role's edit; false when the browser cannot keep it. */
  set(role: string, draft: StoredDraft | null): boolean {
    const all = this.all();
    if (draft) all[role] = draft; else delete all[role];
    try { sessionStorage.setItem(this.key, JSON.stringify(all)); return true; }
    catch { return false; }
  }
}
