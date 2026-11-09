import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { startSurfaceRead, SurfaceActionDirectory } from "@molis-ai/molis-work-service-surfaces";
import type { LocalProjectDatabase } from "./project-database.js";
import type { surfaceHomeDirectory } from "./surface-home-directory.js";

type HomeSample = {
  store: LocalProjectDatabase;
  pending: boolean;
  catalog: ReturnType<typeof surfaceHomeDirectory>;
  catalogRetained?: true;
  formOnly: (view: ActionView) => boolean;
  deadline?: ReturnType<typeof startSurfaceRead>;
  readonly views: Set<ActionView>;
  actionsCurrent?: () => void;
  directory?: SurfaceActionDirectory;
};
const reading = new AsyncLocalStorage<HomeSample>();

/** The protected entry receives the original sample, not a later lookup by returned action or installation ids. */
export async function withHomeSample<Result>(store: LocalProjectDatabase, catalog: HomeSample["catalog"], formOnly: HomeSample["formOnly"],
  deadline: HomeSample["deadline"], compose: () => Promise<Result>) {
  const sample: HomeSample = { store, catalog, formOnly, deadline, pending: true, views: new Set() };
  try {
    const description = await reading.run(sample, compose);
    const { catalog, actionsCurrent, views } = sample;
    if (!sample.catalogRetained) throw new ActionError("actions.unavailable", "没有当前首页目录");
    const assertCurrent = () => { sample.actionsCurrent?.(); catalog.assertCurrent(); };
    assertCurrent();
    return { description, catalog, assertCurrent, actionsCurrent, views, deadline, directory: sample.directory?.views ?? [],
      retain(selected: readonly ActionView[]) {
        if (!sample.directory) throw new ActionError("actions.unavailable", "没有当前首页动作目录");
        sample.actionsCurrent = sample.directory.retain(selected);
        for (const view of selected) views.add(view);
        assertCurrent();
      } };
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
  sample.directory = directory;
  return { views: directory.views, retain(views) {
    const guard = directory.retain(views);
    sample.actionsCurrent = guard;
    for (const view of views) sample.views.add(view);
    return guard;
  } };
}
