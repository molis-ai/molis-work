import type { FrameScope } from "./types.js";

/** The read in flight per address, shared by the frames a page mounts at the same time (N53). It is dropped once it settles, so a later mount sees plugins installed since. */
const reads = new Map<string, Promise<Record<string, string>>>();

/**
 * Which surface opens objects of a kind, as the plugins declare it (their search sources: surface → the one kind it opens). A kind
 * that no surface or several surfaces claim is left out, so a page never gets a link that opens nothing or the wrong place.
 * The declarations are a project's: a page with no project open asks nothing (the read could only fail there).
 */
export async function subjectSurfaces(route: (path: string) => string, scope: FrameScope): Promise<Record<string, string>> {
  if (!document.body.dataset.projectId) return {};
  const address = route("/api/contextual/surfaces");
  let read = reads.get(address);
  if (!read) {
    // Not tied to this frame's scope: another frame may be waiting on the same read when this one closes.
    read = molisWorkRequest<{surfaces?: Record<string, {kind: string}>}>(address).then(answer => {
      const by = new Map<string, string[]>();
      for (const [surface, { kind }] of Object.entries(answer.surfaces ?? {})) by.set(kind, [...(by.get(kind) ?? []), surface]);
      return Object.fromEntries([...by].flatMap(([kind, surfaces]) => surfaces.length === 1 ? [[kind, surfaces[0]!]] : []));
    });
    reads.set(address, read);
    const settled = read;
    void settled.then(() => undefined, () => undefined).finally(() => { if (reads.get(address) === settled) reads.delete(address); });
  }
  try { return await read; }
  catch {
    // A read the page could not make leaves its sources as text; it is asked again for the next page.
    return {};
  }
  finally { scope.assertCurrent(); }
}
