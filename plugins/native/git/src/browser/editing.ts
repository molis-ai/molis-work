import { messageOf } from "@molis-ai/molis-work-plugin-sdk/browser";
import type { UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";

export interface ConflictDraft { readonly base: string; readonly text: string }
export interface PreparedEdit {
  readonly operation_id: string;
  readonly action: string;
  readonly fields: Readonly<Partial<Pick<FormDraft, "message" | "branchName" | "prTitle" | "prBody">>>;
  readonly conflict?: { readonly path: string; readonly key: string; readonly snapshot: ConflictDraft };
}
export interface FormDraft {
  message: string;
  branchName: string;
  checkout: boolean;
  prTitle: string;
  prBody: string;
  prBase: string;
  prDraft: boolean;
  suggestion: string;
  prepared: PreparedEdit[];
}
export const emptyForm = (): FormDraft => ({ message: "", branchName: "", checkout: true, prTitle: "", prBody: "", prBase: "", prDraft: false, suggestion: "", prepared: [] });
export interface DraftEntry<T> { readonly key: string; value: T | null; saved: Promise<void> | null }
export const formKey = (workspace: string): string => `git.edit.v1:${workspace}`;
export async function conflictKey(workspace: string, path: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([workspace, path])));
  return "git.conflict.v1:" + [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Git owns the editable values; the platform owns storage, ordering and account preparation. No private write queue. */
export class EditorDrafts {
  readonly #entries = new Map<string, Promise<DraftEntry<unknown>>>();
  readonly #writing = new Set<Promise<void>>();
  readonly #failures = new Map<string, { reason: string; retry(): Promise<unknown> }>();
  constructor(readonly storage: UiPageDrafts, readonly changed: (state: "ready" | "saving" | "failed", reason: string) => void, readonly reload: () => Promise<void>) {}
  #draw(): void {
    this.changed(this.#failures.size ? "failed" : this.#writing.size ? "saving" : "ready", this.#failures.values().next().value?.reason ?? "");
  }
  read<T>(key: string, restored = this.reload): Promise<DraftEntry<T>> {
    const existing = this.#entries.get(key);
    if (existing) return existing as Promise<DraftEntry<T>>;
    const reading = this.storage.read(key).then(raw => {
      const value: T | null = raw === null ? null : JSON.parse(raw);
      this.#failures.delete(key); this.#draw();
      return { key, value, saved: null };
    }).catch(error => {
      this.#entries.delete(key);
      this.#failures.set(key, { reason: messageOf(error), retry: async () => { await this.read(key, restored); await restored(); } }); this.#draw();
      throw error;
    });
    this.#entries.set(key, reading);
    return reading;
  }
  write<T>(entry: DraftEntry<T>, value: T | null): Promise<void> {
    entry.value = value;
    // Register synchronously with UiPageDrafts: its flush must see every edit, including edits made while another save waits.
    const writing = this.storage.write(entry.key, value === null ? null : JSON.stringify(value));
    entry.saved = writing; this.#writing.add(writing); this.#draw();
    void writing.then(() => {
      if (entry.saved === writing) this.#failures.delete(entry.key);
      this.#writing.delete(writing); this.#draw();
    }, error => {
      if (entry.saved === writing) this.#failures.set(entry.key, { reason: messageOf(error), retry: () => this.write(entry, entry.value) });
      this.#writing.delete(writing); this.#draw();
    });
    return writing;
  }
  /** Input handlers already have an inline failure/retry surface; callers preparing an operation await write instead. */
  edit<T>(entry: DraftEntry<T>, value: T | null): void { void this.write(entry, value).catch(() => {}); }
  async retry(): Promise<void> { await Promise.all([...this.#failures.values()].map(failure => failure.retry())); }
}
