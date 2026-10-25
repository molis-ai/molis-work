import type { ActionClient, ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { INBOX_NEXT_SCENE_ID } from "@molis-ai/molis-work-contracts/modules/functions";
import { publishedFunctionReference, publishedFunctionKey, type FunctionsActionPorts } from "@molis-ai/molis-work-module-functions";
import { createInboxSceneRuntime, InboxSceneBindings } from "@molis-ai/molis-work-plugin-inbox";
import type { FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { runWithMolisWorkHome, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { hydrateFeedItemContent } from "./feed-content.js";
import { withFunctionsService, type FunctionsHostOptions } from "./functions-host.js";

export interface InboxSceneServices {
  actions: ActionClient; scenes: ActionSceneClient; functions?: FunctionsHostOptions;
  /** A running Host owns this connection; standalone scene callers use a scoped service. */
  readFunctions?: FunctionsActionPorts["read"];
}

/** Inbox's binding of its next-step scene, in this project's library. */
export const inboxBindingsOf = (db: SqliteDatabase): InboxSceneBindings => new InboxSceneBindings({
  get: (statement, ...parameters) => db.prepare(statement).get(...parameters),
  run: (statement, ...parameters) => db.prepare(statement).run(...parameters),
});

/**
 * Inbox's next-step scene over this Host's owners: the binding row is Inbox's own (`bindings`, in the project's library), the judgment
 * history is the Functions owner's (no second ledger), the entry and its item are Feed's application. The judgments themselves are the
 * plugin's (`createInboxSceneRuntime`).
 */
export function createLocalInboxScene(home: string, projectId: string, feed: FeedApplication, bindings: InboxSceneBindings, services: InboxSceneServices) {
  const read = services.readFunctions ?? (<T>(operation: Parameters<typeof withFunctionsService<T>>[1]) => withFunctionsService(home, operation, services.functions));
  return createInboxSceneRuntime({ projectId, actions: services.actions, scenes: services.scenes, host: {
    binding: () => bindings.get(projectId, INBOX_NEXT_SCENE_ID),
    saveBinding: (value, options) => { bindings.save(projectId, value, options?.expected_revision); },
    publishedRules: () => read(service => service.list().filter(rule => rule.status === "published" && rule.version))
      .map(rule => ({ function_key: rule.function_key, name: rule.name,
        reference: publishedFunctionReference(rule) })),
    functionKey: publishedFunctionKey,
    latestJudgments: sceneId => read(service => service.latestSceneJudgments(projectId, sceneId)),
    recordJudgment: input => read(service => service.recordSceneJudgment({
      function_key: publishedFunctionKey(input.function) ?? input.function.capability_id, function_version: input.function.version,
      subject: input.subject, scene_id: input.scene_id, scene_provenance: input.scene_provenance,
      outcome: input.outcome, suggested_behavior_ids: input.suggested_behavior_ids, error_code: input.error_code,
    })),
    subject: entryId => {
      const entry = feed.getInboxEntry(projectId, entryId);
      return { entry, item: entry.subject_type === "feed_item" ? runWithMolisWorkHome(home, () => hydrateFeedItemContent(feed.getFeedItem(projectId, entry.subject_id))) : null };
    },
    recordEvent: judgment => feed.recordInboxJudgmentEvent(projectId, judgment),
  } });
}
