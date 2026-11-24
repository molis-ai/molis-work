import type { SecretStore } from "@molis-ai/molis-work-storage";

/** An in-memory secret store for search tests: the real search secret wrapper runs over it unchanged. */
export function searchMemorySecrets(): SecretStore {
  const keys = new Map<string, string>();
  return {
    get: ref => keys.get(ref) ?? null, put: (ref, value) => { keys.set(ref, value); }, delete: ref => { keys.delete(ref); },
    createIfAbsent(ref, value) { if (keys.has(ref)) return false; keys.set(ref, value); return true; },
    deleteIfPresent: ref => keys.delete(ref),
    backend: () => ({ kind: "aes-gcm-file", label: "test memory", masterKeyExternal: false, formatVersion: 1 }),
  };
}
