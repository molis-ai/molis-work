import type { UiPageDrafts } from "@molis-ai/molis-work-contracts/platform/ui";

/** The browser draft owner. The caller supplies its trusted namespace and lifetime; pages supply only bounded local keys. */
export function pageDraftStore(namespace: string, assertCurrent: () => void): UiPageDrafts {
  const keyOf = (key: string) => {
    if (!key || key.length > 256) throw new Error("Draft refused");
    return new URL("/.molis-draft/" + encodeURIComponent(key), location.origin).href;
  };
  const valueOf = (value: string | null) => { if (value !== null && (typeof value !== "string" || new TextEncoder().encode(value).byteLength > 16 * 1024 * 1024)) throw new Error("Draft refused"); };
  const withDraft = async <T>(key: string, use: (cache: Cache, path: string) => Promise<T>): Promise<T> => {
    assertCurrent();
    const path = keyOf(key);
    // Read and write in submission order across all documents with this owner and key.
    return await navigator.locks.request(namespace + ":" + path, async () => {
      assertCurrent(); const cache = await caches.open(namespace); assertCurrent();
      const result = await use(cache, path);
      assertCurrent();
      return result;
    });
  };
  const read = async (cache: Cache, path: string) => (await (await cache.match(path))?.text()) ?? null;
  const change = async (key: string, value: string | null, expected?: string | null) => {
    valueOf(value);
    if (expected !== undefined) valueOf(expected);
    return withDraft(key, async (cache, path) => {
      if (expected !== undefined && await read(cache, path) !== expected) return false;
      assertCurrent();
      if (value === null) await cache.delete(path); else await cache.put(path, new Response(value));
      return true;
    });
  };
  return {
    async read(key) { return withDraft(key, read); },
    async write(key, value) { await change(key, value); },
    compareAndSwap: (key, expected, value) => change(key, value, expected),
  };
}
