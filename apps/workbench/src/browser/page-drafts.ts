import type { UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";

/** The browser draft owner. The caller supplies its trusted namespace and lifetime; pages supply only bounded local keys. */
export function pageDraftStore(namespace: string, assertCurrent: () => void): UiPageDrafts {
  const keyOf = (key: string) => {
    if (!key || key.length > 256) throw new Error("Draft refused");
    return new URL("/.molis-draft/" + encodeURIComponent(key), location.origin).href;
  };
  const valueOf = (value: string | null) => { if (value !== null && (typeof value !== "string" || new TextEncoder().encode(value).byteLength > 16 * 1024 * 1024)) throw new Error("Draft refused"); };
  const change = async (key: string, value: string | null, expected?: string | null) => {
    assertCurrent(); const path = keyOf(key); valueOf(value); if (expected !== undefined) valueOf(expected);
    // A named lock covers all owner documents on this origin, including sibling source pages and tabs.
    return navigator.locks.request(namespace + ":" + path, async () => {
      assertCurrent(); const cache = await caches.open(namespace); assertCurrent();
      if (expected !== undefined && (await (await cache.match(path))?.text() ?? null) !== expected) return false;
      assertCurrent();
      if (value === null) await cache.delete(path); else await cache.put(path, new Response(value));
      assertCurrent(); return true;
    });
  };
  return {
    async read(key) { assertCurrent(); const path = keyOf(key), cache = await caches.open(namespace); const value = await (await cache.match(path))?.text() ?? null; assertCurrent(); return value; },
    async write(key, value) { await change(key, value); },
    compareAndSwap: (key, expected, value) => change(key, value, expected),
  };
}
