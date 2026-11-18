import type { UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ComposerDraftAdapter } from "../page-globals.js";
import type { SubtaskActionOutcome } from "./subtask-contract.js";

/** Browser draft and an unresolved original request reference, never a message or execution ledger. */
export interface SubtaskPending {
  readonly requestId: string; readonly kind: "input" | "action"; readonly binding: string;
  /** The draft revision this request may clear. Zero means it owns no saved text. */
  readonly revision: number;
  readonly action?: { readonly id: string; readonly ref: string };
}
type SavedRequest = SubtaskPending & { readonly unsent?: true };
interface Saved { text: string; revision: number; pending?: SavedRequest; unresolved?: SavedRequest[] }
const requests = (saved: Saved) => [...(saved.unresolved ?? []), ...(saved.pending ? [saved.pending] : [])];

export function subtaskDraft(store: UiPageDrafts, target: string) {
  const key = crypto.subtle.digest("SHA-256", new TextEncoder().encode(target)).then(bytes => "subtask:" + Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join(""));
  const unsent = new Set<string>();
  let serial = Promise.resolve(), latest = serial;
  let editor: Pick<Saved, "text" | "revision"> | undefined;
  const read = async (): Promise<Saved> => {
    const saved = await store.read(await key);
    return saved ? JSON.parse(saved) as Saved : { text: "", revision: 0 };
  };
  const update = (change: (saved: Saved) => Saved, applied?: (saved: Saved) => void) => {
    const next = serial.then(async () => { const name = await key;
      while (true) {
        const expected = await store.read(name), previous: Saved = expected ? JSON.parse(expected) as Saved : { text: "", revision: 0 };
        const saved = change(previous);
        if (saved === previous || await store.compareAndSwap(name, expected, JSON.stringify(saved))) { applied?.(saved); return; }
      } });
    latest = next; serial = next.catch(() => {}); return next;
  };
  const remember = ({ text, revision }: Saved) => { editor = { text, revision }; };
  const adapter: ComposerDraftAdapter = {
    async read(signal) {
      const writing = serial;
      await writing;
      const saved = await read();
      if (!signal.aborted && writing === serial) remember(saved);
      return saved.text;
    },
    write: text => update(saved => text === saved.text ? saved : { ...saved, text, revision: saved.revision + 1 }, remember),
    // The original request settles only its own draft revision, including after this composer has been replaced.
    sent: async () => {},
  };
  const settle = (requestId: string, accepted: boolean) => update(saved => {
    const pending = saved.pending?.requestId === requestId ? saved.pending : saved.unresolved?.find(one => one.requestId === requestId);
    if (!pending) return saved;
    const rest = { ...saved, unresolved: saved.unresolved?.filter(one => one.requestId !== requestId) };
    if (saved.pending?.requestId === requestId) delete rest.pending;
    return accepted && pending.kind === "input" && pending.revision > 0 && pending.revision === saved.revision ? { ...rest, text: "", revision: saved.revision + 1 } : rest;
  });
  const markUnsent = (requestId: string) => update(saved => {
    const pending = requests(saved).find(one => one.requestId === requestId);
    if (!pending || pending.unsent) return saved;
    const cancelled: SavedRequest = { ...pending, unsent: true };
    return saved.pending === pending ? { ...saved, pending: cancelled }
      : { ...saved, unresolved: saved.unresolved?.map(one => one === pending ? cancelled : one) };
  });
  function cancelUnsent(requestId: string, reason: string): Promise<SubtaskActionOutcome> {
    unsent.add(requestId);
    const finish = async (): Promise<SubtaskActionOutcome> => {
      try { await settle(requestId, false); }
      catch {
        // A retained marker can be retired locally after the source is rebuilt.
        await markUnsent(requestId).catch(() => { /* If storage is unavailable, this source still knows it did not dispatch. */ });
        return { state: "unknown", check: finish };
      }
      unsent.delete(requestId);
      return { state: "not-applied", reason };
    };
    return finish();
  }
  return {
    adapter,
    flush: () => latest,
    async pendings(): Promise<SubtaskPending[]> { await serial; return requests(await read()); },
    async pending(): Promise<SubtaskPending | undefined> { await serial; const saved = await read(); return saved.pending ?? saved.unresolved?.at(-1); },
    async begin(requestId: string, kind: SubtaskPending["kind"], binding: string, text?: string, options?: { action?: SubtaskPending["action"]; alongside?(pending: SubtaskPending): boolean; signal?: AbortSignal }) {
      await serial;
      const frozen = text !== undefined && editor?.text === text ? editor.revision : 0;
      await update(saved => {
        options?.signal?.throwIfAborted();
        const held = requests(saved);
        if (held.some(one => one.requestId === requestId)) return saved;
        if (held.some(one => !options?.alongside?.(one))) throw Object.assign(new Error("Original request remains unconfirmed"), { name: "SubtaskPendingConflict" });
        // An older submit can carry its text to the owner without writing it over another editor's draft.
        const next = text !== undefined && saved.revision === 0 ? { ...saved, text, revision: 1 } : saved;
        const revision = next !== saved ? next.revision : frozen;
        return { ...next, ...(held.length ? { unresolved: held } : {}), pending: { requestId, kind, binding, revision, ...(options?.action ? { action: options.action } : {}) } };
      });
    },
    settle,
    cancelUnsent,
    async checkUnsent(requestId: string, reason: string) {
      if (unsent.has(requestId)) return cancelUnsent(requestId, reason);
      await serial;
      const pending = requests(await read()).find(one => one.requestId === requestId);
      return pending?.unsent ? cancelUnsent(requestId, reason) : undefined;
    },
  };
}
