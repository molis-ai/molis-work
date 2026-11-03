import type { FrameScope } from "./types.js";

/**
 * Which surface opens objects of a kind, as the plugins declare it (their search sources: surface → the one kind it opens). A kind
 * that no surface or several surfaces claim is left out, so a page never gets a link that opens nothing or the wrong place.
 */
export async function subjectSurfaces(route: (path: string) => string, scope: FrameScope): Promise<Record<string, string>> {
  try {
    const declared = (await molisWorkRequest<{surfaces?: Record<string, {kind: string}>}>(route("/api/contextual/surfaces"), { scope })).surfaces ?? {};
    const by = new Map<string, string[]>();
    for (const [surface, { kind }] of Object.entries(declared)) by.set(kind, [...(by.get(kind) ?? []), surface]);
    return Object.fromEntries([...by].flatMap(([kind, surfaces]) => surfaces.length === 1 ? [[kind, surfaces[0]!]] : []));
  } catch {
    // A read the page could not make leaves its sources as text; it is asked again for the next page.
    scope.assertCurrent();
    return {};
  }
}
