import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { createInboxActionHandlers, createInboxContentHandlers, createInboxPagesHandlers, inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import type { ActionProviderRegistration, WorkflowPayload, WorkflowItemRef } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MolisWorkProjectRuntime } from "./project-host.js";
import { feedContentActions, type FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { createLocalInboxScene, type InboxSceneServices } from "./inbox-scene.js";
import { pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { bindActionClient, ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { hydrateFeedItemContent } from "./feed-content.js";

/** Composition supplies data owners, never copies Inbox's action definitions or business dispatch. */
export function inboxActionProvider(runtime: MolisWorkProjectRuntime, home: string | undefined, services: InboxSceneServices, feed: FeedApplication): ActionProviderRegistration {
  const scene = home ? createLocalInboxScene(home, runtime.project_id, runtime.board_id, feed, services) : undefined;
  const scoped = <T extends { board_id: string }>(entry: T) => ({ ...entry, project_id: runtime.project_id });
  return { provider: { provider_id: inboxManifest.plugin_id, plugin_id: inboxManifest.plugin_id,
    title: inboxManifest.name, kind: "plugin", project_id: runtime.project_id },
    definitions: inboxManifest.actions!,
    scenes: scene ? inboxManifest.action_scenes : [], scene_handlers: scene ? [scene.handler] : [],
    handlers: [...createInboxActionHandlers({
      ...scene?.ports,
      listEntries: () => { runtime.coordinator.goalDecisionAttention.reconcile(runtime.board_id); return feed.listInboxEntries(runtime.board_id).map(scoped); },
      setStatus: (id, status, revision) => scoped(feed.setInboxEntryStatus(runtime.board_id, id, status, revision)),
      ...(home ? {
        ...createInboxPagesHandlers({
          generation: async (request_id, caller) => (await bindActionClient(services.actions, () => caller).invoke(pagesActions.generation, { request_id })).record,
          generations: async caller => (await bindActionClient(services.actions, () => caller).invoke(pagesActions.generations, {})).records,
          readDocument: async (id, caller) => (await bindActionClient(services.actions, () => caller).invoke(pagesActions.get, { id })).document,
          generate: (input, caller) => bindActionClient(services.actions, () => caller).invoke(pagesActions.generate, { ...input, inputs: [...input.inputs] }),
          readMaterial: entryId => runWithMolisWorkHome(home, () => {
            const entry = feed.getInboxEntry(runtime.board_id, entryId);
            if (entry.subject_type !== "feed_item") throw new ActionError("pages.invalid", "只支持整理有原始内容的 Feed 材料");
            const item = hydrateFeedItemContent(feed.getFeedItem(runtime.board_id, entry.subject_id));
            const body = item.body || item.materials.map(material => material.content || material.preview).join("\n\n") || item.summary;
            if (!body.trim()) throw new ActionError("pages.invalid", "所选材料没有可读取的正文");
            return { entry_id: entryId, item_id: item.item_id, revision: item.revision, title: item.title, body, url: item.url,
              source_label: item.source_label, captured_at: new Date().toISOString(), provenance: item.materials.map(material => material.provenance) };
          }),
        }),
      } : {}),
    }), ...createInboxContentHandlers({
      entries: () => feed.listInboxEntries(runtime.board_id),
      entry: id => feed.getInboxEntry(runtime.board_id, id),
      items: () => feed.snapshot(runtime.board_id).feed_items,
      sources: () => feed.snapshot(runtime.board_id).sources,
      readFeed: async (id, caller) => await services.actions.invoke(caller, feedContentActions.read, { item_id: id }) as WorkflowPayload,
      receiveFeed: async (input, caller) => await services.actions.invoke(caller, feedContentActions.receive, input) as WorkflowItemRef,
      ensure: (id, instanceId) => feed.ensureInboxEntryForFeedItem(runtime.board_id, id, "manual", { added_by: "workflow", workflow_instance_id: instanceId }).entry,
      reopen: entry => feed.setInboxEntryStatus(runtime.board_id, entry.entry_id, "open", entry.revision),
      flush: () => feed.flushPendingJudgments(),
    })],
  };
}
