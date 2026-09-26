import { ActionError, type ActionClient, type ActionSceneClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { createFeedCaptureSceneHandler, feedCaptureScene, feedCaptureSubjectRevision, type FeedApplication, type FeedRuleJudgmentSelection } from "@molis-ai/molis-work-plugin-feed";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withFunctionsService, type FunctionsHostOptions } from "./functions-host.js";
import { hydrateFeedItemContent } from "./feed-content.js";

export function createLocalFeedScene(home: string, projectId: string, boardId: string, feed: FeedApplication,
  services: { actions: ActionClient; scenes: ActionSceneClient; functions?: FunctionsHostOptions }) {
  const read = <T>(operation: Parameters<typeof withFunctionsService<T>>[1]) => withFunctionsService(home, operation, services.functions);
  const legacyReference = (key: string): ActionReference | null => read(service => {
    const rule = service.list().find(rule => rule.function_key === key && rule.status === "published" && rule.version);
    return rule ? { capability_id: `functions.published.${key}`, version: rule.version!, provider_id: "system.functions" } : null;
  });
  // Persist in the original project owner before deleting the old global binding. Reopening finishes interrupted cleanup.
  for (const rule of feed.listOutRules(boardId)) {
    if (rule.judgment === undefined) {
      const previous = read(service => service.actionSceneBinding(feedCaptureScene.scene_id, boardId, rule.rule_id));
      const reference = rule.function_key ? previous?.function.provider_id === "system.functions" && previous.function.capability_id === `functions.published.${rule.function_key}`
        ? previous.function : legacyReference(rule.function_key) : null;
      feed.saveOutRuleUpdate({ ...feed.prepareOutRuleUpdate(boardId, rule.rule_id, {}), judgment: reference }, rule.revision);
    }
    read(service => service.unbindScene(feedCaptureScene.scene_id, boardId, rule.rule_id));
  }
  const selection: FeedRuleJudgmentSelection = {
    legacyReference,
    recommendations: async caller => {
      const usages = (await services.scenes.usages(caller)).filter(use => use.scene_id === feedCaptureScene.scene_id && use.enabled && use.availability.available);
      const records = read(service => service.latestSceneJudgments(boardId, feedCaptureScene.scene_id));
      const recommendations: { item_id: string; suggested_behavior_ids: string[] }[] = [];
      for (const record of records) {
        const provenance = record.scene_provenance;
        if (!provenance || record.outcome !== "ok" || record.subject.kind !== "feed_item") continue;
        const binding = usages.find(use => use.binding_id === provenance.binding_id && use.revision === provenance.binding_revision
          && use.function.capability_id === provenance.function.capability_id && use.function.version === provenance.function.version && use.function.provider_id === provenance.function.provider_id);
        if (!binding) continue;
        let item;
        try { item = runWithMolisWorkHome(home, () => hydrateFeedItemContent(feed.getFeedItem(boardId, record.subject.id))); }
        catch (error) { if (error instanceof Error && "code" in error && error.code === "feed_item_not_found") continue; throw error; }
        if (feedCaptureSubjectRevision(item) !== provenance.subject_revision) continue;
        recommendations.push({ item_id: item.item_id, suggested_behavior_ids: [...record.suggested_behavior_ids] });
      }
      return { recommendations };
    },
    catalog: async caller => {
      const candidates = (await services.actions.discover(caller)).filter(action => action.action.kind === "judgment"
        && (!action.action.subject_kinds.length || action.action.subject_kinds.includes("feed_item")));
      const choices = await Promise.all(candidates.map(async action => {
        const reference = { capability_id: action.capability_id, version: action.version, provider_id: action.provider.provider_id };
        const scene = (await services.scenes.discoverScenes(caller, reference)).find(scene => scene.definition.scene_id === feedCaptureScene.scene_id && scene.definition.version === feedCaptureScene.version);
        return { reference, title: `${action.action.title} · ${action.provider.title}`, available: Boolean(scene?.compatible && scene.availability.available),
          ...(!scene?.compatible || !scene.availability.available ? { reason: scene?.reason ?? (scene && !scene.availability.available ? scene.availability.reason : undefined) ?? "当前不可用" } : {}) };
      }));
      return { choices, usages: (await services.scenes.usages(caller)).filter(use => use.scene_id === feedCaptureScene.scene_id) };
    },
    preview: async (reference, content, caller) => {
      await selection.validate(reference, caller);
      return await services.actions.invoke(caller, reference, { content }) as { status: "ok" | "needs_review"; suggested_behavior_ids: string[] };
    },
    validate: async (reference, caller) => {
      const scenes = (await services.scenes.discoverScenes(caller, reference)).filter(scene => scene.definition.scene_id === feedCaptureScene.scene_id && scene.definition.version === feedCaptureScene.version);
      if (scenes.length !== 1 || (!scenes[0]!.compatible || !scenes[0]!.availability.available)) throw new ActionError("actions.binding_invalid", scenes[0]?.reason ?? "判断能力与 Feed 捕捉场景不兼容或不可用");
      return reference;
    },
  };
  const handler = createFeedCaptureSceneHandler({ projectId,
    rules: () => feed.listOutRules(boardId),
    resolve: itemId => runWithMolisWorkHome(home, () => hydrateFeedItemContent(feed.getFeedItem(boardId, itemId))),
    save: (rule, binding, options) => {
      const key = binding.function.provider_id === "system.functions" ? binding.function.capability_id.replace(/^functions\.published\./, "") : null;
      const next = feed.prepareOutRuleUpdate(boardId, rule.rule_id, { judgment: binding.function, function_key: key, enabled: binding.enabled });
      feed.saveOutRuleUpdate(next, options?.expected_revision ?? rule.revision);
    },
    record: async (item, rule, binding, result, caller) => {
      const judgment = read(service => service.recordSceneJudgment({
        function_key: rule.function_key || binding.function.capability_id, function_version: binding.function.version,
        subject: { kind: "feed_item", id: item.item_id, board_id: boardId }, scene_id: feedCaptureScene.scene_id,
        scene_provenance: { binding_id: binding.binding_id, binding_revision: binding.revision!, function: binding.function, subject_revision: feedCaptureSubjectRevision(item) },
        outcome: result.status, suggested_behavior_ids: result.suggested_behavior_ids, error_code: result.error_code ?? null,
      }));
      feed.recordCaptureJudgment(item, rule, judgment);
      await feed.flushPendingInboxJudgments(caller);
      return judgment;
    },
  });
  return { handler, selection };
}
