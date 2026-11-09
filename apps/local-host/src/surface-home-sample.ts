import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceActionDirectory } from "@molis-ai/molis-work-service-surfaces";
import type { LocalProjectDatabase } from "./project-database.js";
import type { surfaceHomeDirectory } from "./surface-home-directory.js";

type HomeSample = {
  store: LocalProjectDatabase;
  pending: boolean;
  catalog?: ReturnType<typeof surfaceHomeDirectory>;
  readonly views: Set<ActionView>;
  actionsCurrent?: () => void;
};
const reading = new AsyncLocalStorage<HomeSample>();

/** The protected entry receives the original sample, not a later lookup by returned action or installation ids. */
export async function withHomeSample<Result>(store: LocalProjectDatabase, compose: () => Promise<Result>) {
  const sample: HomeSample = { store, pending: true, views: new Set() };
  try {
    const description = await reading.run(sample, compose);
    const { catalog, actionsCurrent, views } = sample;
    if (!catalog) throw new ActionError("actions.unavailable", "没有当前首页目录");
    const assertCurrent = () => { actionsCurrent?.(); catalog.assertCurrent(); };
    assertCurrent();
    return { description, catalog, assertCurrent, actionsCurrent, views };
  } finally { sample.pending = false; }
}

export function homeSampleFor(store: LocalProjectDatabase) {
  const sample = reading.getStore();
  if (!sample?.pending || sample.store !== store) return undefined;
  sample.pending = false;
  return sample;
}

export function retainHomeDirectory(directory: SurfaceActionDirectory, sample: HomeSample | undefined): SurfaceActionDirectory {
  if (!sample) return directory;
  return { views: directory.views, retain(views) {
    const guard = directory.retain(views);
    sample.actionsCurrent = guard;
    for (const view of views) sample.views.add(view);
    return guard;
  } };
}
