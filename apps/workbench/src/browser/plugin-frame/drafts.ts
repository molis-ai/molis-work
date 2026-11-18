import { pageDraftStore } from "../page-drafts.js";
import type { UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameDown, FrameScope, FrameUp } from "./types.js";

export function childDrafts(port: MessagePort, scope: FrameScope): UiPageDrafts {
  let sequence = 0;
  const pending = new Map<number, { key: string; write: boolean; resolve(value: { value: string | null; swapped?: boolean }): void; reject(error: Error): void }>();
  const saved = new Set<() => void>(), failures = new Set<string>();
  let preparing = false, wasInert = false;
  scope.own(() => { for (const entry of pending.values()) entry.reject(new Error("View closed")); pending.clear(); saved.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type === "draft-resume") { if (preparing) document.body.inert = wasInert; preparing = false; return; }
    if (event.data.type === "draft-flush") {
      const id = event.data.id;
      if (!preparing) wasInert = document.body.inert;
      preparing = true; document.body.inert = true;
      const finish = () => { if (scope.alive) port.postMessage({type: "draft-flushed", id, ...(failures.size ? {error: "Draft save failed"} : {})} satisfies FrameUp); };
      if (pending.size) saved.add(finish); else finish();
      return;
    }
    if (event.data.type !== "draft-result") return;
    const entry = pending.get(event.data.id); pending.delete(event.data.id);
    if (entry?.write) { if (event.data.error) failures.add(entry.key); else failures.delete(entry.key); }
    if (event.data.error) entry?.reject(new Error(event.data.error)); else entry?.resolve({ value: event.data.value ?? null, swapped: event.data.swapped });
    if (!pending.size) { for (const finish of saved) finish(); saved.clear(); }
  });
  const call = (key: string, value?: string | null, expected?: string | null) => new Promise<{ value: string | null; swapped?: boolean }>((resolve, reject) => {
    if (!scope.alive || preparing) { reject(new Error("View closed or account is switching")); return; }
    const id = ++sequence; pending.set(id, { key, write: value !== undefined, resolve, reject });
    port.postMessage({ type: "draft", id, key, ...(value === undefined ? {} : { value }), ...(expected === undefined ? {} : { expected }) } satisfies FrameUp);
  });
  return { read: async key => (await call(key)).value, write: async (key, value) => { await call(key, value); },
    compareAndSwap: async (key, expected, value) => (await call(key, value, expected)).swapped === true };
}

/** Cache identity comes from the server's page authorization, never from a child-supplied name or URL. */
export function pageDrafts(port: MessagePort, scope: FrameScope, storagePrefix: string) {
  const store = pageDraftStore(storagePrefix + "drafts", () => scope.assertCurrent());
  return async (message: Extract<FrameUp, { type: "draft" }>): Promise<void> => {
    try {
      scope.assertCurrent();
      if (typeof message.key !== "string" || message.expected !== undefined && message.value === undefined) throw new Error("Draft refused");
      const swapped = message.expected === undefined ? undefined : await store.compareAndSwap(message.key, message.expected, message.value!);
      const value = message.value === undefined ? await store.read(message.key) : message.value;
      if (message.value !== undefined && message.expected === undefined) await store.write(message.key, message.value);
      scope.assertCurrent(); port.postMessage({ type: "draft-result", id: message.id, value, ...(swapped === undefined ? {} : { swapped }) } satisfies FrameDown);
    } catch (error) {
      if (scope.alive) port.postMessage({ type: "draft-result", id: message.id, error: error instanceof Error ? error.message : "Draft unavailable" } satisfies FrameDown);
    }
  };
}
