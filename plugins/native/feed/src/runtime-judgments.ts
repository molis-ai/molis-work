import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError, type ActionCallContext, type ActionClient, type ActionExecutionContext, type ActionSceneClient, type ActionSceneHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginActionDirectory, PluginJudgmentsClient, PluginSceneClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { FeedApplication } from "./application.js";
import type { FeedApplicationPorts } from "./application-ports.js";
import { feedHomeJudgmentTrigger } from "./home-judgment.js";
import { feedInboxJudgmentTrigger } from "./inbox-judgment.js";
import type { FeedHydrate } from "./item-hydration.js";
import type { FeedItemRecord } from "./projection.js";
import type { FeedRuleJudgmentSelection } from "./rule-actions.js";
import { createFeedSceneRuntime } from "./scene-runtime.js";
import { createFeedCaptureTrigger } from "./scenes.js";

// How a Runtime Feed judges (FI-4 step 4e-2f, specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §12). The scene is
// Feed's own (`services.scenes`, `services.judgments`); Home's and the Inbox's judgments are their public actions, reached through the action
// directory as the caller of the action that is running. Judging happens inside that action, after the commit that brought the item in:
// every callback of the scene writes through a commit of its own, and the ledger row is recorded before the rows that point at it.

export interface RuntimeJudgmentServices {
  readonly scenes: PluginSceneClient;
  readonly judgments: PluginJudgmentsClient;
  readonly directory: PluginActionDirectory;
}

/** A scene callback is handed the kernel's `beforeEffect`; one without it cannot write. */
const executing = (caller: ActionCallContext): ActionExecutionContext => {
  if (typeof (caller as Partial<ActionExecutionContext>).beforeEffect !== "function") throw new ActionError("actions.execution_failed", "场景回调缺少最终授权检查");
  return caller as ActionExecutionContext;
};

/**
 * The items a judgment reads, with their retained bodies. The bodies are read by the action that starts the judgment, where the platform
 * allows it (`evidence.read` refuses inside a scene callback), and kept for the callbacks that action starts, and for nothing else.
 */
export interface RuntimeItemStaging {
  run<T>(item: FeedItemRecord, body: () => Promise<T>): Promise<T>;
  /** The staged item when the item has not changed since it was read; the fresh one (without bodies, so the judgment sees it moved) otherwise. */
  resolve(itemId: string): FeedItemRecord;
}

export function createRuntimeItemStaging(feed: () => FeedApplication, projectId: string): RuntimeItemStaging {
  const staged = new AsyncLocalStorage<ReadonlyMap<string, FeedItemRecord>>();
  return {
    run: (item, body) => staged.run(new Map([[item.item_id, item]]), body),
    resolve: itemId => {
      const fresh = feed().getItem(projectId, itemId), item = staged.getStore()?.get(itemId);
      if (!item) throw new ActionError("actions.subject_unavailable", "这次判断没有读取过这条消息的原文");
      return item.revision === fresh.revision ? item : fresh;
    },
  };
}

/** The platform's scene client without a caller: the plugin's own running action is the caller. */
const sceneClientOf = (scenes: PluginSceneClient): ActionSceneClient => ({
  discoverScenes: (_caller, judgment) => scenes.discoverScenes(judgment),
  usages: (_caller, judgment) => scenes.usages(judgment),
  targets: (_caller, judgment, scene) => scenes.targets(judgment, scene),
  bind: (_caller, binding, options) => scenes.bind(binding, options),
  runScene: (_caller, scene, bindingId, event) => scenes.runScene(scene, bindingId, event),
});

const actionClientOf = (directory: PluginActionDirectory): ActionClient => ({
  discover: () => directory.discover(),
  invoke: (_caller, reference, input) => directory.invoke(reference, input),
});

export interface RuntimeJudgmentTriggerOptions {
  readonly projectId: string;
  readonly services: RuntimeJudgmentServices;
  readonly feed: () => FeedApplication;
  readonly hydrate: FeedHydrate;
  readonly staging: RuntimeItemStaging;
}

/** What starts the judgments of an item or an entry; the queue calls them after the commit that brought it in. */
export function createRuntimeJudgmentTriggers(options: RuntimeJudgmentTriggerOptions): Required<Pick<FeedApplicationPorts, "captureJudgment" | "homeJudgment" | "inboxJudgment">> {
  const { projectId, services, feed, hydrate, staging } = options;
  const directory = () => services.directory;
  return {
    captureJudgment: createFeedCaptureTrigger({ scenes: sceneClientOf(services.scenes), projectId,
      context: () => ({ actor_id: "feed", project_id: projectId, audience: "workflow", permissions: [] }),
      stage: async (itemId, run) => staging.run(await hydrate(feed().getItem(projectId, itemId)), run) }),
    homeJudgment: feedHomeJudgmentTrigger({ projectId, directory }),
    inboxJudgment: feedInboxJudgmentTrigger({ projectId, directory }),
  };
}

export interface RuntimeSceneOptions {
  readonly projectId: string;
  readonly services: RuntimeJudgmentServices;
  readonly feed: FeedApplication;
  readonly hydrate: FeedHydrate;
  readonly staging: RuntimeItemStaging;
  /** The Feed writer's commit, for the callback's own context. */
  commit<T>(caller: ActionExecutionContext, body: () => T): Promise<T>;
}

/** The scene handler the plugin returns from `start`, and the selection the rule actions use. */
export function createRuntimeSceneRuntime(options: RuntimeSceneOptions): { handler: ActionSceneHandlerBinding; selection: FeedRuleJudgmentSelection } {
  const { projectId, services, feed, hydrate, staging, commit } = options;
  return createFeedSceneRuntime({ projectId, feed, actions: actionClientOf(services.directory), scenes: sceneClientOf(services.scenes),
    host: {
      latestJudgments: sceneId => services.judgments.latest(sceneId),
      recordJudgment: input => services.judgments.record(input),
      // Inside a judgment the item is the one its action staged; asked by an action (the recommendations), the bodies are read here.
      item: async itemId => {
        try { return staging.resolve(itemId); }
        catch (error) { if (!(error instanceof ActionError) || error.code !== "actions.subject_unavailable") throw error; }
        return hydrate(feed.getItem(projectId, itemId));
      },
    },
    writes: { commit: (caller, body) => commit(executing(caller), body), beforeRecord: caller => executing(caller).beforeEffect() } });
}
