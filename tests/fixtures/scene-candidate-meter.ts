import type { TestContext } from "node:test";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext, ActionSceneSelection } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";

type ByAudience = Partial<Record<ActionCallContext["audience"], number>>;
const bump = (counts: ByAudience, { audience }: ActionCallContext) => { counts[audience] = (counts[audience] ?? 0) + 1; };
const countsOf = () => ({
  candidateDirectories: 0, candidates: 0, sceneCalls: {} as ByAudience, sceneRefs: 0, batchCalls: 0,
  discover: {} as ByAudience, scenePasses: {} as ByAudience, sceneRows: 0, ownerUsages: {} as ByAudience, kernelUsages: {} as ByAudience,
  bindingReads: { inbox: 0, feed: 0, home: 0 },
});
export type SceneCandidateCounts = ReturnType<typeof countsOf>;

/** Observe complete requests at the owner, Kernel, and native binding-read boundaries. All observed calls go through. */
export function sceneCandidateMeter(t: TestContext) {
  let active: { plugin: string; counts: SceneCandidateCounts } | undefined;
  const discover = ActionService.prototype.discover, usages = ActionService.prototype.usages;
  t.mock.method(ActionService.prototype, "discover", function (this: ActionService, caller: ActionCallContext) {
    if (active) bump(active.counts.discover, caller);
    return discover.call(this, caller);
  });
  t.mock.method(ActionService.prototype, "usages", function (this: ActionService, ...args: Parameters<typeof usages>) {
    if (active) bump(active.counts.kernelUsages, args[0]);
    return usages.apply(this, args);
  });
  // Count actual scene enumeration, including the Host's independent metadata and usage reads.
  const kernel: object = ActionService.prototype;
  const declarations = kernel as { sceneDeclarations(caller: ActionCallContext, selection?: ActionSceneSelection): readonly unknown[] };
  const enumerate = declarations.sceneDeclarations;
  t.mock.method(declarations, "sceneDeclarations", function (this: typeof declarations, ...args: Parameters<typeof enumerate>) {
    const rows = enumerate.apply(this, args);
    if (active) {
      bump(active.counts.scenePasses, args[0]);
      active.counts.sceneRows += rows.length;
    }
    return rows;
  });

  const actionClient = MolisWorkLocalHost.prototype.actionClient, sceneClient = MolisWorkLocalHost.prototype.sceneClient;
  t.mock.method(MolisWorkLocalHost.prototype, "actionClient", function (this: MolisWorkLocalHost, ...args: Parameters<typeof actionClient>) {
    const client = actionClient.apply(this, args);
    return { ...client, async discover(caller: ActionCallContext) {
      const meter = active;
      const rows = await client.discover(caller);
      if (meter && caller.audience === "workflow" && caller.delegated_by === meter.plugin) {
        meter.counts.candidateDirectories++;
        meter.counts.candidates += rows.filter(row => row.action.kind === "judgment" &&
          (!meter.plugin.endsWith(".feed") || !row.action.subject_kinds.length || row.action.subject_kinds.includes("feed_item"))).length;
      }
      return rows;
    } };
  });
  t.mock.method(MolisWorkLocalHost.prototype, "sceneClient", function (this: MolisWorkLocalHost, ...args: Parameters<typeof sceneClient>): ReturnType<typeof sceneClient> {
    const client = sceneClient.apply(this, args);
    const owned = (caller: ActionCallContext) => active && caller.delegated_by === active.plugin ? active.counts : undefined;
    return { ...client,
      discoverScenes(caller, ref) {
        const counts = owned(caller);
        if (counts && ref) { bump(counts.sceneCalls, caller); counts.sceneRefs++; }
        return client.discoverScenes(caller, ref);
      },
      discoverScenesFor(caller, refs, selection) {
        const counts = owned(caller);
        if (counts) { bump(counts.sceneCalls, caller); counts.sceneRefs += refs.length; counts.batchCalls++; }
        return client.discoverScenesFor(caller, refs, selection);
      },
      usages(caller, ref) {
        const counts = owned(caller);
        if (counts) bump(counts.ownerUsages, caller);
        return client.usages(caller, ref);
      },
    };
  });

  const db = new DatabaseSync(":memory:"), statements = Object.getPrototypeOf(db.prepare("SELECT 1")) as StatementSync;
  db.close();
  for (const method of ["get", "all"] as const) {
    const read = statements[method];
    t.mock.method(statements, method, function (this: StatementSync, ...args: Parameters<typeof read>) {
      const result = Reflect.apply(read, this, args);
      const reads = active?.counts.bindingReads;
      if (reads) {
        if (/\bFROM inbox_scene_bindings\b/iu.test(this.sourceSQL)) reads.inbox++;
        if (/\bFROM feed_out_rules\b/iu.test(this.sourceSQL)) reads.feed++;
        if (/\bFROM action_scene_bindings\b/iu.test(this.sourceSQL)) reads.home++;
      }
      return result;
    });
  }
  return async <T>(plugin: string, run: () => Promise<T>) => {
    const counts = countsOf();
    active = { plugin, counts };
    try { return { body: await run(), counts }; }
    finally { active = undefined; }
  };
}
