import type { UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ComposerDraftAdapter } from "../page-globals.js";

/** Browser draft and an unresolved original request reference, never a message or execution ledger. */
export interface SubtaskPending { readonly requestId: string; readonly kind: "input" | "action"; readonly binding: string; readonly revision: number; readonly action?: { readonly id: string; readonly ref: string } }
interface Saved { text: string; revision: number; pending?: SubtaskPending; unresolved?: SubtaskPending[] }
export function subtaskDraft(store: UiPageDrafts, target: string) {
  const key = crypto.subtle.digest("SHA-256", new TextEncoder().encode(target)).then(bytes => "subtask:" + Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join(""));
  let serial = Promise.resolve(), latest = serial;
  const read = async (): Promise<Saved> => {
    const saved = await store.read(await key);
    return saved ? JSON.parse(saved) as Saved : { text: "", revision: 0 };
  };
  const update = (change: (saved: Saved) => Saved) => {
    const next = serial.then(async () => { const name = await key;
      while (true) {
        const expected = await store.read(name), previous: Saved = expected ? JSON.parse(expected) as Saved : { text: "", revision: 0 };
        const saved = change(previous);
        if (await store.compareAndSwap(name, expected, JSON.stringify(saved))) return;
      } });
    latest = next; serial = next.catch(() => {}); return next;
  };
  const adapter: ComposerDraftAdapter = {
    read: async () => { await serial; return (await read()).text; },
    write: text => update(saved => text === saved.text ? saved : { ...saved, text, revision: saved.revision + 1 }),
    // The original request settles only its own draft revision, including after this composer has been replaced.
    sent: async () => {},
  };
  return {
    adapter,
    flush: () => latest,
    async pendings() { await serial; const saved = await read(); return [...(saved.unresolved ?? []), ...(saved.pending ? [saved.pending] : [])]; },
    async pending() { await serial; const saved = await read(); return saved.pending ?? saved.unresolved?.at(-1); },
    async begin(requestId: string, kind: SubtaskPending["kind"], binding: string, text?: string, options?: { action?: SubtaskPending["action"]; alongside?(pending: SubtaskPending): boolean }) {
      await update(saved => {
        const held = [...(saved.unresolved ?? []), ...(saved.pending ? [saved.pending] : [])];
        if (held.some(one => one.requestId === requestId)) return saved;
        if (held.some(one => !options?.alongside?.(one))) throw Object.assign(new Error("Original request remains unconfirmed"), { name: "SubtaskPendingConflict" });
        const next = text === undefined || text === saved.text ? saved : { ...saved, text, revision: saved.revision + 1 };
        return { ...next, ...(held.length ? { unresolved: held } : {}), pending: { requestId, kind, binding, revision: next.revision, ...(options?.action ? { action: options.action } : {}) } };
      });
    },
    settle(requestId: string, accepted: boolean) {
      return update(saved => {
        const pending = saved.pending?.requestId === requestId ? saved.pending : saved.unresolved?.find(one => one.requestId === requestId);
        if (!pending) return saved;
        const rest = { ...saved, unresolved: saved.unresolved?.filter(one => one.requestId !== requestId) };
        if (saved.pending?.requestId === requestId) delete rest.pending;
        return accepted && pending.kind === "input" && pending.revision === saved.revision ? { ...rest, text: "", revision: saved.revision + 1 } : rest;
      });
    },
  };
}
