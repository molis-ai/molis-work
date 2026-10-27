import type { ActionClient, ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { publishedFunctionKey } from "@molis-ai/molis-work-module-functions";
import { createFeedSceneRuntime, type FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { withFunctionsService, type FunctionsHostOptions } from "./functions-host.js";
import { hydrateFeedItemContent } from "./feed-content.js";

/** Feed's capture scene over this Host's owners: the judgment ledger is the Functions owner's, the retained bodies are read from the Home. The judgments themselves are the plugin's (`createFeedSceneRuntime`). */
export function createLocalFeedScene(home: string, projectId: string, feed: FeedApplication,
  services: { actions: ActionClient; scenes: ActionSceneClient; functions?: FunctionsHostOptions }) {
  const read = <T>(operation: Parameters<typeof withFunctionsService<T>>[1]) => withFunctionsService(home, operation, services.functions);
  return createFeedSceneRuntime({ projectId, feed, actions: services.actions, scenes: services.scenes, host: {
    latestJudgments: sceneId => read(service => service.latestSceneJudgments(projectId, sceneId, null)),
    recordJudgment: input => read(service => service.recordSceneJudgment({
      function_key: publishedFunctionKey(input.function) ?? input.function.capability_id, function_version: input.function.version,
      subject: input.subject, scene_id: input.scene_id, scene_provenance: input.scene_provenance,
      outcome: input.outcome, suggested_behavior_ids: input.suggested_behavior_ids, error_code: input.error_code,
    })),
    item: itemId => runWithMolisWorkHome(home, () => hydrateFeedItemContent(feed.getFeedItem(projectId, itemId))),
  } });
}
