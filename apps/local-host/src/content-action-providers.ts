import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import type { GoalContractView } from "@molis-ai/molis-work-contracts/modules/goals";
import { createContextLedger, createContextMaterializer } from "@molis-ai/molis-work-module-context-ledger";
import { createLocalFeedScene } from "./feed-scene.js";
import type { FunctionsHostOptions } from "./functions-host.js";
import { inboxContentActions } from "@molis-ai/molis-work-plugin-inbox";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { ActionError, retainActionAuthority, resolveActionSubject, type ActionCallContext, type ActionClient, type ActionSceneClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { feedManifest, feedQueryActions, promoteOffered, readLinkedFeedContext, feedItemContext, createFeedQueryHandlers, createFeedCaptureTrigger, createFeedContentHandlers, createFeedItemHandlers, createFeedRuleHandlers, createFeedSourceHandlers, type FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { createInboxJudgmentTrigger } from "@molis-ai/molis-work-plugin-inbox";
import { createHomeJudgmentTrigger } from "./home-actions.js";
import { createLocalFeedSourceService } from "./feed-source-service.js";
import { createLocalFeedConnectorSync } from "./feed-connector-sync.js";
import { createLocalFeedApplication } from "./feed-application.js";
import { feedConnectorAuthStatus } from "./feed-connector-auth.js";
import type { LocalFeedApplicationOptions } from "./feed-application.js";
import { createLocalFeedGoalPromotion } from "./feed-goal-promotion.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { hydrateFeedItemContent } from "./feed-content.js";

/** New messages a source call brings in are judged with that caller's authority, as the Web route does for the local user. */
function judgedAs(caller: ActionCallContext, scenes: ActionSceneClient, projectId: string): LocalFeedApplicationOptions {
  const context = () => caller;
  return { captureJudgment: createFeedCaptureTrigger({ scenes, projectId, context }), homeJudgment: createHomeJudgmentTrigger({ scenes, projectId, context }),
    inboxJudgment: createInboxJudgmentTrigger({ scenes, projectId, context }) };
}

/** Native composition only supplies stores; protocol behavior and definitions belong to each plugin. */
export function nativeContentProviders(runtime: MolisWorkProjectRuntime, feed: FeedApplication, home?: string, client?: ActionClient, scenes?: ActionSceneClient, functions?: FunctionsHostOptions): ActionProviderRegistration[] {
  const provider = (manifest: PluginManifest, handlers: ActionProviderRegistration["handlers"]): ActionProviderRegistration => ({
    provider: { provider_id: manifest.plugin_id, plugin_id: manifest.plugin_id, title: manifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: manifest.actions!, handlers,
  });
  const hydrate = (item: Parameters<typeof hydrateFeedItemContent>[0]) => home ? runWithMolisWorkHome(home, () => hydrateFeedItemContent(item)) : hydrateFeedItemContent(item);
  const scene = home && client && scenes ? createLocalFeedScene(home, runtime.project_id, feed, { actions: client, scenes, functions }) : undefined;
  const providers = [provider(feedManifest, [...createFeedContentHandlers(feed, runtime.project_id,
    hydrate, client ? async (subject, caller) => (await resolveActionSubject(client, caller, subject)).context : undefined),
    ...createFeedQueryHandlers(feed, runtime.project_id, { hydrate,
      authStatus: () => feedConnectorAuthStatus(home),
      linkedContext: async (input, caller) => {
        if (!client) throw new ActionError("actions.connection_required", "尚未接通 Goal 服务");
        const nested = retainActionAuthority(caller, { ...feedQueryActions.linkedContext, provider_id: feedManifest.plugin_id });
        const { goal } = await client.invoke(nested, goalPluginActions.contract, { goal_id: input.goal_id }) as GoalContractView;
        await caller.beforeEffect();
        return readLinkedFeedContext({ project_id: runtime.project_id, goal_id: input.goal_id, item_id: input.item_id,
          materializer: createContextMaterializer(createContextLedger(runtime.store.db, {
            authorize: access => access.scope.kind === "personal" && access.scope.id === runtime.project_id,
          })),
          readGoal: () => goal,
          readItem: id => {
            try { return feed.getItem(runtime.project_id, id); }
            catch (error) { if (error instanceof ActionError && error.code === "feed.item_not_found") return null; throw error; }
          },
          renderItem: item => feedItemContext(hydrate(item)),
        });
      },
    }),
    ...createFeedRuleHandlers(feed, runtime.project_id, hydrate, scene?.selection),
    ...createFeedItemHandlers(feed, runtime.project_id, {
      inboxActive: itemId => feed.listInboxEntries(runtime.project_id).some(entry => entry.subject_type === "feed_item" && entry.subject_id === itemId
        && (entry.status === "open" || entry.status === "in_progress")),
      // Without the action service there is no Goal service to ask: the promotion stays unavailable ("actions.connection_required").
      promote: client ? (input, caller) => createLocalFeedGoalPromotion(runtime.store.db, client, feed)(input, caller) : undefined,
      // The offer follows the action: the directory says whether Goals can be written through for this caller (project enabled, granted).
      promoteAvailable: client ? async caller => promoteOffered(await client.discover(caller)) : undefined,
    }),
    ...(scenes ? createFeedSourceHandlers(runtime.project_id, {
      feed: () => feed,
      sources: caller => createLocalFeedSourceService(runtime.store.db, runtime.project_id, undefined, undefined, home, judgedAs(caller, scenes, runtime.project_id)),
      connectorSync: caller => createLocalFeedConnectorSync(runtime.store.db, runtime.project_id, undefined,
        createLocalFeedApplication(runtime.store.db, judgedAs(caller, scenes, runtime.project_id)), home),
    }) : [])])];
  if (scene) Object.assign(providers[0]!, { scenes: feedManifest.action_scenes, scene_handlers: [scene.handler] });
  return providers;
}

/** Pages and Lingguang by plugin id: their contracts are theirs (PG-111), and the Host names no plugin package for them. */
const PAGES_PLUGIN_ID = "io.molis.work.pages", LINGGUANG_PLUGIN_ID = "io.molis.work.lingguang";

/** The handoff stations (workflow content roles) a shipped plugin declares in its own Manifest, read from the build's registrations (PG-031). */
const contentStations = (pluginId: string) => (PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.manifest.plugin_id === pluginId)?.manifest.actions ?? [])
  .filter(definition => definition.action.workflow_content);

/** The local Web owner already has access to these native content stores. This is not a plugin-grant mechanism. */
export const NATIVE_CONTENT_PERMISSIONS = [...new Set([
  ...feedManifest.actions!, ...contentStations(PAGES_PLUGIN_ID), ...contentStations(LINGGUANG_PLUGIN_ID), ...Object.values(inboxContentActions),
].flatMap(definition => definition.action.permissions))];
