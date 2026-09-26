import { createLocalFeedScene } from "./feed-scene.js";
import type { FunctionsHostOptions } from "./functions-host.js";
import { inboxContentActions } from "@molis-ai/molis-work-plugin-inbox";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { resolveActionSubject, type ActionClient, type ActionSceneClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { feedManifest, createFeedContentHandlers, createFeedItemHandlers, createFeedRuleHandlers, type FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { createLocalFeedGoalPromotion } from "./feed-goal-promotion.js";
import { pagesContentActions } from "@molis-ai/molis-work-plugin-pages";
import { lingguangContentActions } from "@molis-ai/molis-work-plugin-lingguang";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { hydrateFeedItemContent } from "./feed-content.js";

/** Native composition only supplies stores; protocol behavior and definitions belong to each plugin. */
export function nativeContentProviders(runtime: MolisWorkProjectRuntime, feed: FeedApplication, home?: string, client?: ActionClient, scenes?: ActionSceneClient, functions?: FunctionsHostOptions): ActionProviderRegistration[] {
  const provider = (manifest: PluginManifest, handlers: ActionProviderRegistration["handlers"]): ActionProviderRegistration => ({
    provider: { provider_id: manifest.plugin_id, plugin_id: manifest.plugin_id, title: manifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: manifest.actions!, handlers,
  });
  const hydrate = (item: Parameters<typeof hydrateFeedItemContent>[0]) => home ? runWithMolisWorkHome(home, () => hydrateFeedItemContent(item)) : hydrateFeedItemContent(item);
  const scene = home && client && scenes ? createLocalFeedScene(home, runtime.project_id, runtime.board_id, feed, { actions: client, scenes, functions }) : undefined;
  const providers = [provider(feedManifest, [...createFeedContentHandlers(feed, runtime.board_id,
    hydrate, client ? async (subject, caller) => (await resolveActionSubject(client, caller, subject)).context : undefined),
    ...createFeedRuleHandlers(feed, runtime.board_id, hydrate, scene?.selection),
    ...createFeedItemHandlers(feed, runtime.board_id, {
      inboxActive: itemId => feed.listInboxEntries(runtime.board_id).some(entry => entry.subject_type === "feed_item" && entry.subject_id === itemId
        && (entry.status === "open" || entry.status === "in_progress")),
      promote: input => createLocalFeedGoalPromotion(runtime.store.db, runtime.coordinator.goalEvents.createIntent.bind(runtime.coordinator.goalEvents),
        runtime.coordinator.goalInputs, feed)(input),
    })])];
  if (scene) Object.assign(providers[0]!, { scenes: feedManifest.action_scenes, scene_handlers: [scene.handler] });
  return providers;
}

/** The local Web owner already has access to these native content stores. This is not a plugin-grant mechanism. */
export const NATIVE_CONTENT_PERMISSIONS = [...new Set([
  ...feedManifest.actions!, ...Object.values(pagesContentActions), ...Object.values(lingguangContentActions), ...Object.values(inboxContentActions),
].flatMap(definition => definition.action.permissions))];
