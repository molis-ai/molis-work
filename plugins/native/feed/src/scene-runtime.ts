import { ActionError, type ActionCallContext, type ActionClient, type ActionReference, type ActionSceneClient, type ActionSceneHandlerBinding, type ActionSceneView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import type { FeedApplication } from "./application.js";
import type { FeedItemRecord } from "./projection.js";
import type { FeedRuleJudgmentSelection } from "./rule-actions.js";
import { createFeedCaptureSceneHandler, feedCaptureScene, feedCaptureSubjectRevision } from "./scenes.js";

// The judgment side of Feed's capture scene (PG-034): which judgments a rule may use, which saved judgments still hold, and how a
// judgment is recorded. The Host supplies only what other owners keep: the judgment ledger (the Functions owner) and the Feed item
// with its evidence bodies read. Nothing here knows how either is stored.

/** One judgment as the ledger takes it; the ledger derives its own key for the function from `function`. */
export interface FeedSceneJudgmentInput {
  readonly function: ActionReference;
  readonly subject: JudgmentRecord["subject"];
  readonly scene_id: string;
  readonly scene_provenance: NonNullable<JudgmentRecord["scene_provenance"]>;
  readonly outcome: JudgmentRecord["outcome"];
  readonly suggested_behavior_ids: readonly string[];
  readonly error_code: string | null;
}

/** What the Host owns for this scene: the ledger and the readable item. */
export interface FeedSceneHost {
  /** The newest judgment per subject for a scene. */
  latestJudgments(sceneId: string): readonly JudgmentRecord[];
  recordJudgment(input: FeedSceneJudgmentInput): JudgmentRecord;
  /** The item with its retained bodies read; throws `feed.item_not_found`. */
  item(itemId: string): FeedItemRecord | Promise<FeedItemRecord>;
}

/**
 * How the callbacks of a scene write when the Feed's writes are commits of the callback's own (a Runtime Feed): the recheck of the
 * original caller comes first, before the ledger row (which commits on its own, in the Home) and before the Feed's rows, which are one commit.
 */
export interface FeedSceneWrites {
  commit<T>(caller: ActionCallContext, body: () => T): Promise<T>;
  /** Asked before any write of a callback; throws when the call is no longer allowed. */
  beforeRecord(caller: ActionCallContext): Promise<void>;
}

export interface FeedSceneRuntimeOptions {
  readonly projectId: string;
  readonly feed: FeedApplication;
  readonly actions: ActionClient;
  readonly scenes: ActionSceneClient;
  readonly host: FeedSceneHost;
  /**
   * Absent for the Host, whose writes are the transaction it is already in. With it, the Inbox entry a judgment admitted stays queued for the
   * action that started the judgment: a callback reaches no action, and the action's authority is what reaches the Inbox's own judgment.
   */
  readonly writes?: FeedSceneWrites;
}

/** The scene handler the project's action provider registers, and the selection the rule handlers use to validate and preview a rule's judgment. */
export function createFeedSceneRuntime(options: FeedSceneRuntimeOptions): { handler: ActionSceneHandlerBinding; selection: FeedRuleJudgmentSelection } {
  const { projectId, feed, actions, scenes, host, writes } = options;
  const captureScenes = (found: readonly ActionSceneView[]) =>
    found.filter(scene => scene.definition.scene_id === feedCaptureScene.scene_id && scene.definition.version === feedCaptureScene.version);
  const selection: FeedRuleJudgmentSelection = {
    recommendations: async caller => {
      const usages = (await scenes.usages(caller)).filter(use => use.scene_id === feedCaptureScene.scene_id && use.enabled && use.availability.available);
      const recommendations: { item_id: string; suggested_behavior_ids: string[] }[] = [];
      for (const record of host.latestJudgments(feedCaptureScene.scene_id)) {
        const provenance = record.scene_provenance;
        if (!provenance || record.outcome !== "ok" || record.subject.kind !== "feed_item") continue;
        const binding = usages.find(use => use.binding_id === provenance.binding_id && use.revision === provenance.binding_revision
          && use.function.capability_id === provenance.function.capability_id && use.function.version === provenance.function.version && use.function.provider_id === provenance.function.provider_id);
        if (!binding) continue;
        let item;
        try { item = await host.item(record.subject.id); }
        catch (error) { if (error instanceof Error && "code" in error && error.code === "feed.item_not_found") continue; throw error; }
        if (feedCaptureSubjectRevision(item) !== provenance.subject_revision) continue;
        recommendations.push({ item_id: item.item_id, suggested_behavior_ids: [...record.suggested_behavior_ids] });
      }
      return { recommendations };
    },
    catalog: async caller => {
      const candidates = (await actions.discover(caller)).filter(action => action.action.kind === "judgment"
        && (!action.action.subject_kinds.length || action.action.subject_kinds.includes("feed_item")));
      const choices = await Promise.all(candidates.map(async action => {
        const reference = { capability_id: action.capability_id, version: action.version, provider_id: action.provider.provider_id };
        const scene = captureScenes(await scenes.discoverScenes(caller, reference))[0];
        return { reference, title: `${action.action.title} · ${action.provider.title}`, available: Boolean(scene?.compatible && scene.availability.available),
          ...(!scene?.compatible || !scene.availability.available ? { reason: scene?.reason ?? (scene && !scene.availability.available ? scene.availability.reason : undefined) ?? "当前不可用" } : {}) };
      }));
      return { choices, usages: (await scenes.usages(caller)).filter(use => use.scene_id === feedCaptureScene.scene_id) };
    },
    preview: async (reference, content, caller) => {
      await selection.validate(reference, caller);
      return await actions.invoke(caller, reference, { content }) as { status: "ok" | "needs_review"; suggested_behavior_ids: string[] };
    },
    validate: async (reference, caller) => {
      const found = captureScenes(await scenes.discoverScenes(caller, reference));
      if (found.length !== 1 || (!found[0]!.compatible || !found[0]!.availability.available)) throw new ActionError("actions.binding_invalid", found[0]?.reason ?? "判断能力与 Feed 捕捉场景不兼容或不可用");
      return reference;
    },
  };
  const handler = createFeedCaptureSceneHandler({ projectId,
    rules: () => feed.outRules.list(projectId),
    resolve: itemId => host.item(itemId),
    save: async (rule, binding, saveOptions, caller) => {
      const save = () => {
        const next = feed.outRules.prepareUpdate(projectId, rule.rule_id, { judgment: binding.function, enabled: binding.enabled });
        feed.outRules.saveUpdate(next, saveOptions?.expected_revision ?? rule.revision);
      };
      await (writes ? writes.commit(caller, save) : save());
    },
    record: async (item, rule, binding, result, caller) => {
      await writes?.beforeRecord(caller);
      const judgment = host.recordJudgment({ function: binding.function,
        subject: { kind: "feed_item", id: item.item_id, project_id: projectId }, scene_id: feedCaptureScene.scene_id,
        scene_provenance: { binding_id: binding.binding_id, binding_revision: binding.revision!, function: binding.function, subject_revision: feedCaptureSubjectRevision(item) },
        outcome: result.status, suggested_behavior_ids: result.suggested_behavior_ids, error_code: result.error_code ?? null });
      const entryId = writes ? await writes.commit(caller, () => feed.capture.recordJudgment(item, rule, judgment)) : feed.capture.recordJudgment(item, rule, judgment);
      if (entryId && !writes) await feed.flushPendingInboxJudgments(caller, [entryId]);
      return judgment;
    },
  });
  return { handler, selection };
}
