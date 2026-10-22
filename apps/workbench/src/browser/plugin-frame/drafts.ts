import type { UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameDown, FrameScope, FrameUp } from "./types.js";

export function childDrafts(port: MessagePort, scope: FrameScope): UiPageDrafts {
  let sequence = 0;
  const pending = new Map<number, { resolve(value: string | null): void; reject(error: Error): void }>();
  scope.own(() => { for (const entry of pending.values()) entry.reject(new Error("View closed")); pending.clear(); });
  port.addEventListener("message", (event: MessageEvent<FrameDown>) => {
    if (event.data.type !== "draft-result") return;
    const entry = pending.get(event.data.id); pending.delete(event.data.id);
    if (event.data.error) entry?.reject(new Error(event.data.error)); else entry?.resolve(event.data.value ?? null);
  });
  const call = (key: string, value?: string | null) => new Promise<string | null>((resolve, reject) => {
    if (!scope.alive) { reject(new Error("View closed")); return; }
    const id = ++sequence; pending.set(id, { resolve, reject });
    port.postMessage({ type: "draft", id, key, ...(value === undefined ? {} : { value }) } satisfies FrameUp);
  });
  return { read: key => call(key), write: async (key, value) => { await call(key, value); } };
}

/** Cache identity comes from the server's page authorization, never from a child-supplied name or URL. */
export function pageDrafts(port: MessagePort, scope: FrameScope, storagePrefix: string) {
  return async (message: Extract<FrameUp, { type: "draft" }>): Promise<void> => {
    try {
      if (typeof message.key !== "string" || !message.key || message.key.length > 256
        || message.value !== undefined && message.value !== null && (typeof message.value !== "string" || new TextEncoder().encode(message.value).byteLength > 16 * 1024 * 1024)) throw new Error("Draft refused");
      const cache = await caches.open(storagePrefix + "drafts"); scope.assertCurrent();
      const key = new URL("/.molis-draft/" + encodeURIComponent(message.key), location.origin).href;
      if (message.value === null) await cache.delete(key);
      else if (message.value !== undefined) await cache.put(key, new Response(message.value));
      const value = message.value === undefined ? await (await cache.match(key))?.text() ?? null : message.value;
      scope.assertCurrent(); port.postMessage({ type: "draft-result", id: message.id, value } satisfies FrameDown);
    } catch (error) {
      if (scope.alive) port.postMessage({ type: "draft-result", id: message.id, error: error instanceof Error ? error.message : "Draft unavailable" } satisfies FrameDown);
    }
  };
}
