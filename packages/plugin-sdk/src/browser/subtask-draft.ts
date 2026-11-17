import type { UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ComposerDraftAdapter } from "../page-globals.js";

/** Browser draft and an unresolved original request reference, never a message or execution ledger. */
export interface SubtaskPending { readonly requestId: string; readonly kind: "input" | "action"; readonly binding: string; readonly revision: number }
interface Saved { text: string; revision: number; pending?: SubtaskPending }
export function subtaskDraft(store: UiPageDrafts, target: string) {
  const key = crypto.subtle.digest("SHA-256", new TextEncoder().encode(target)).then(bytes => "subtask:" + Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join(""));
  let serial = Promise.resolve();
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
    serial = next.catch(() => {}); return next;
  };
  const adapter: ComposerDraftAdapter = {
    read: async () => { await serial; return (await read()).text; },
    write: text => update(saved => text === saved.text ? saved : { ...saved, text, revision: saved.revision + 1 }),
    // The original request settles only its own draft revision, including after this composer has been replaced.
    sent: async () => {},
  };
  return {
    adapter,
    async pending() { await serial; return (await read()).pending; },
    async begin(requestId: string, kind: SubtaskPending["kind"], binding: string, text?: string) {
      await update(saved => {
        if (saved.pending && saved.pending.requestId !== requestId) throw new Error("Original request remains unconfirmed");
        if (saved.pending) return saved;
        const next = text === undefined || text === saved.text ? saved : { ...saved, text, revision: saved.revision + 1 };
        return { ...next, pending: { requestId, kind, binding, revision: next.revision } };
      });
    },
    settle(requestId: string, accepted: boolean) {
      return update(saved => {
        const pending = saved.pending;
        if (pending?.requestId !== requestId) return saved;
        const { pending: _pending, ...rest } = saved;
        return accepted && pending.kind === "input" && pending.revision === saved.revision ? { ...rest, text: "", revision: saved.revision + 1 } : rest;
      });
    },
  };
}
