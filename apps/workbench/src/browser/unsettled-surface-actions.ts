/** A result that may have been written stays unavailable on this browser tab, including when its carrier reopens. */
export function unsettledSurfaceActions(namespace: string) {
  const local = new Set<string>();
  const key = (id: string) => "molis.surface-unsettled:" + namespace + ":" + id;
  return {
    has(id: string) {
      try { return local.has(id) || sessionStorage.getItem(key(id)) !== null; }
      catch { return local.has(id); }
    },
    keep(id: string, preparation: string) {
      local.add(id);
      try { sessionStorage.setItem(key(id), preparation); } catch { /* Same-page redraws still retain it. */ }
    },
    clear(id: string) {
      local.delete(id);
      try { sessionStorage.removeItem(key(id)); } catch { /* The page had no session storage. */ }
    },
  };
}
