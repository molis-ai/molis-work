import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { createContextLedger, createContextMaterializer } from "@molis-ai/molis-work-module-context-ledger";
import { createLocalFeedScene } from "./feed-scene.js";
import type { FunctionsHostOptions } from "./functions-host.js";
import { inboxContentActions } from "@molis-ai/molis-work-plugin-inbox";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ActionError, retainActionAuthority, resolveActionSubject, type ActionCallContext, type ActionClient, type ActionSceneClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { feedManifest, feedQueryActions, readLinkedFeedContext, feedItemContext, FeedStoreError, createFeedQueryHandlers, createFeedCaptureTrigger, createFeedContentHandlers, createFeedItemHandlers, createFeedRuleHandlers, createFeedSourceHandlers, type FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { createInboxJudgmentTrigger } from "@molis-ai/molis-work-plugin-inbox";
import { createHomeJudgmentTrigger } from "./home-actions.js";
import { createLocalFeedSourceService } from "./feed-source-service.js";
import { createLocalFeedConnectorService } from "./feed-connector-service.js";
import type { LocalFeedApplicationOptions } from "./feed-application.js";
import { createLocalFeedGoalPromotion } from "./feed-goal-promotion.js";
import { pagesContentActions } from "@molis-ai/molis-work-plugin-pages";
import { lingguangContentActions } from "@molis-ai/molis-work-plugin-lingguang";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { hydrateFeedItemContent } from "./feed-content.js";

/** New messages a source call brings in are judged with that caller's authority, as the Web route does for the local user. */
function judgedAs(caller: ActionCallContext, scenes: ActionSceneClient, boardId: string): LocalFeedApplicationOptions {
  const context = () => caller;
  return { captureJudgment: createFeedCaptureTrigger({ scenes, boardId, context }), homeJudgment: createHomeJudgmentTrigger({ scenes, boardId, context }),
    inboxJudgment: createInboxJudgmentTrigger({ scenes, boardId, context }) };
}

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
    ...createFeedQueryHandlers(feed, runtime.board_id, { hydrate,
      authStatus: () => createLocalFeedConnectorService(runtime.store.db, runtime.board_id, undefined, home).authStatus(),
      linkedContext: async (input, caller) => {
        if (!client) throw new ActionError("actions.connection_required", "尚未接通 Goal 服务");
        const nested = retainActionAuthority(caller, { ...feedQueryActions.linkedContext, provider_id: feedManifest.plugin_id });
        const { goal } = await client.invoke(nested, goalsActions.contract, { goal_id: input.goal_id }) as import("@molis-ai/molis-work-plugin-goals").GoalContractView;
        await caller.beforeEffect();
        return readLinkedFeedContext({ project_id: runtime.board_id, goal_id: input.goal_id, item_id: input.item_id,
          materializer: createContextMaterializer(createContextLedger(runtime.store.db, {
            authorize: access => access.scope.kind === "personal" && access.scope.id === runtime.board_id,
          })),
          readGoal: () => goal,
          readItem: id => {
            try { return feed.getItem(runtime.board_id, id); }
            catch (error) { if (error instanceof FeedStoreError && error.code === "feed_item_not_found") return null; throw error; }
          },
          renderItem: item => feedItemContext(hydrate(item)),
        });
      },
    }),
    ...createFeedRuleHandlers(feed, runtime.board_id, hydrate, scene?.selection),
    ...createFeedItemHandlers(feed, runtime.board_id, {
      inboxActive: itemId => feed.listInboxEntries(runtime.board_id).some(entry => entry.subject_type === "feed_item" && entry.subject_id === itemId
        && (entry.status === "open" || entry.status === "in_progress")),
      promote: input => createLocalFeedGoalPromotion(runtime.store.db, runtime.coordinator.goalEvents.createIntent.bind(runtime.coordinator.goalEvents),
        runtime.coordinator.goalInputs, feed)(input),
    }),
    ...(scenes ? createFeedSourceHandlers(runtime.board_id, {
      feed: () => feed,
      sources: caller => createLocalFeedSourceService(runtime.store.db, runtime.board_id, undefined, undefined, home, judgedAs(caller, scenes, runtime.board_id)),
      connectors: caller => createLocalFeedConnectorService(runtime.store.db, runtime.board_id, undefined, home, judgedAs(caller, scenes, runtime.board_id)),
    }) : [])])];
  if (scene) Object.assign(providers[0]!, { scenes: feedManifest.action_scenes, scene_handlers: [scene.handler] });
  return providers;
}

/** The local Web owner already has access to these native content stores. This is not a plugin-grant mechanism. */
export const NATIVE_CONTENT_PERMISSIONS = [...new Set([
  ...feedManifest.actions!, ...Object.values(pagesContentActions), ...Object.values(lingguangContentActions), ...Object.values(inboxContentActions),
].flatMap(definition => definition.action.permissions))];
