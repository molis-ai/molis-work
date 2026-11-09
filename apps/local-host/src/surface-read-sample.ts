import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceGroup, SurfaceSlot } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { AttentionSurfaceEntry } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { FormKind } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { OwnedTextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import type { startSurfaceRead, SurfaceActionDirectory, SurfaceComposePorts } from "@molis-ai/molis-work-service-surfaces";
import type { LocalProjectDatabase } from "./project-database.js";
import type { surfaceHomeDirectory } from "./surface-home-directory.js";

type SurfaceSample = {
  store: LocalProjectDatabase;
  position: SurfaceSlot["kind"];
  pending: boolean;
  catalog: ReturnType<typeof surfaceHomeDirectory>;
  catalogRetained?: true;
  formOnly: (view: ActionView) => boolean;
  deadline?: ReturnType<typeof startSurfaceRead>;
  readonly views: Set<ActionView>;
  actionsCurrent?: () => void;
  directory?: SurfaceActionDirectory;
  attention?: readonly AttentionSurfaceEntry[];
  rules?: { forms: readonly FormKind[]; pin: boolean };
  discussion?: SurfaceComposePorts["discussion"];
  request?: { signal: AbortSignal; assertCurrent(): void };
};
const reading = new AsyncLocalStorage<SurfaceSample>();

/** The protected entry receives the original sample, not a later lookup by returned action or installation ids. */
export async function withSurfaceSample<Result>(store: LocalProjectDatabase, position: SurfaceSample["position"],
  catalog: SurfaceSample["catalog"], formOnly: SurfaceSample["formOnly"], deadline: SurfaceSample["deadline"], compose: () => Promise<Result>,
  discussionViews?: NonNullable<SurfaceComposePorts["discussion"]>["views"], request?: SurfaceSample["request"]) {
  let discussionGroups: readonly SurfaceGroup[] | undefined;
  let discussionReasons: readonly (OwnedTextRef | undefined)[] | undefined;
  const sample: SurfaceSample = { store, position, catalog, formOnly, deadline, request, pending: true, views: new Set(),
    ...(discussionViews ? { discussion: { views: discussionViews, keep(groups, reasons) { discussionGroups = groups; discussionReasons = reasons; } } } : {}) };
  try {
    const description = await reading.run(sample, compose);
    const { catalog, actionsCurrent, views } = sample;
    if (!sample.catalogRetained) throw new ActionError("actions.unavailable", "没有本次呈现的插件目录");
    const assertCurrent = () => { sample.actionsCurrent?.(); catalog.assertCurrent(); };
    assertCurrent();
    return { description, catalog, assertCurrent, actionsCurrent, views, deadline, discussionGroups, attention: sample.attention,
      position: sample.rules && { kind: position, ...sample.rules, ...(discussionReasons ? { reasons: discussionReasons } : {}) },
      directory: sample.directory?.views ?? [],
      retainGuard() {
        const active = sample.actionsCurrent;
        return () => { active?.(); catalog.assertCurrent(); };
      },
      retain(selected: readonly ActionView[]) {
        if (!sample.directory) throw new ActionError("actions.unavailable", "没有本次呈现的动作目录");
        sample.actionsCurrent = sample.directory.retain(selected);
        for (const view of selected) views.add(view);
        assertCurrent();
      } };
  } finally { sample.pending = false; }
}

/** A trusted slot correction uses the same single-contribution catalog as its rendering. */
export function withSlotCorrectionCatalog<Result>(store: LocalProjectDatabase, catalog: SurfaceSample["catalog"], correct: () => Promise<Result>) {
  return reading.run({ store, position: "plugin-slot", pending: true, catalog, formOnly: () => false, views: new Set() }, correct);
}

export function surfaceSampleFor(store: LocalProjectDatabase, position: SurfaceSample["position"]) {
  const sample = reading.getStore();
  if (!sample?.pending || sample.store !== store || sample.position !== position) return undefined;
  sample.pending = false;
  return sample;
}

export function retainSurfaceDirectory(directory: SurfaceActionDirectory, sample: SurfaceSample | undefined): SurfaceActionDirectory {
  if (!sample) return directory;
  sample.directory = directory;
  return { views: directory.views, retain(views) {
    const guard = directory.retain(views);
    sample.actionsCurrent = guard;
    for (const view of views) sample.views.add(view);
    return guard;
  } };
}
