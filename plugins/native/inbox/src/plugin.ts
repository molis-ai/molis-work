import { randomUUID } from "node:crypto";
import { ActionError, WORKFLOW_CONTENT_VERSIONS, resolveActionSubject, type ActionCallContext, type ActionClient, type ActionReference, type WorkflowItemRef, type WorkflowPayload } from "@molis-ai/molis-work-contracts/platform/actions";
import { inboxErrors, type AttentionEntryRecord, type AttentionStatus } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import { INBOX_NEXT_SCENE_ID } from "@molis-ai/molis-work-contracts/modules/functions";
import type { InboxPagesGeneration, InboxPagesInputSnapshot, InboxPagesDocument } from "./pages-shapes.js";
import type { PluginDefinition, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createInboxActionHandlers, type InboxActionEntry } from "./actions.js";
import { createInboxContentHandlers, type InboxBriefs, type InboxItemBrief } from "./content-actions.js";
import { inboxManifest } from "./manifest.js";
import { createInboxPagesHandlers } from "./pages.js";
import { createInboxRouteHandlers } from "./route-handlers.js";
import { InboxSceneBindings } from "./scene-bindings.js";
import { createInboxSceneRuntime, type InboxFeedContent } from "./scene-runtime.js";
import { inboxUiContribution } from "./ui.js";

/**
 * What Inbox asks of the other plugins, by the id and version they publish it under: Feed's facts (whether an item may come back, its text,
 * its names, admitting it) and the Pages actions that write a document. Inbox reaches them through the action directory as the caller of
 * the action it is running, so each one is judged by that caller's own authority, never by Inbox's.
 */
const FEED = {
  admission: { capability_id: "feed.items.admission", version: 1 }, material: { capability_id: "feed.items.material", version: 1 },
  content: { capability_id: "feed.items.content", version: 1 }, briefs: { capability_id: "feed.briefs.read", version: 1 },
  admit: { capability_id: "feed.items.admit", version: 1 },
  read: { capability_id: "feed.content.read", version: WORKFLOW_CONTENT_VERSIONS.read }, receive: { capability_id: "feed.content.receive", version: WORKFLOW_CONTENT_VERSIONS.receive },
} as const satisfies Record<string, ActionReference>;
const PAGES = {
  generation: { capability_id: "pages.generations.get", version: 1 }, generations: { capability_id: "pages.generations.list", version: 1 },
  get: { capability_id: "pages.get", version: 1 }, generate: { capability_id: "pages.generate", version: 1 },
} as const satisfies Record<string, ActionReference>;

/** Feed answers at most this many ids at once. */
const BRIEF_BATCH = 200;

/** Inbox's two statements over the plugin's own transaction. */
const sqlOf = (tx: { get(sql: string, parameters?: readonly never[]): unknown; run(sql: string, parameters?: readonly never[]): { changes: number | bigint } }) => ({
  get: (statement: string, ...parameters: unknown[]) => tx.get(statement, parameters as never[]) ?? undefined,
  run: (statement: string, ...parameters: unknown[]) => tx.run(statement, parameters as never[]),
});

/**
 * Inbox as a Plugin Runtime plugin, one instance per project (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md). The
 * entries are Attention's and read and changed through `services.attention`; the next-step scene is its own (`services.scenes`,
 * `services.judgments`, the binding row in its own table); what Feed keeps arrives through Feed's public actions, and what Pages writes
 * through Pages', both by the action directory (`actions:delegate`) as the person or client that called.
 */
export function createInboxPlugin(): PluginDefinition {
  return { manifest: inboxManifest, async start(context) {
    for (const permission of inboxManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const projectId = context.project_id, services = context.services;
    const attention = services?.attention, database = services?.project_database, scenes = services?.scenes, judgments = services?.judgments, own = services?.actions, directory = own?.directory;
    if (!projectId) throw new ActionError("actions.scope_mismatch", "Inbox 只属于一个项目");
    if (!attention || !database || !scenes || !judgments || !own || !directory) throw new ActionError("actions.unredeemed", "Inbox 需要注意力、项目库、场景、判断账与动作目录服务");
    const ask = <Output>(reference: ActionReference, input: unknown) => directory.invoke<Output>(reference, input);
    const feedMissing = (error: unknown) => error instanceof ActionError && error.code === "actions.dependency_missing";
    const recordOf = (entry: AttentionEntryRecord): InboxActionEntry => ({ ...entry, project_id: projectId });
    /** The entry as Attention has it; one that is not Inbox's to show is `inbox.entry_not_found`, the code the pages and callers know. */
    const entryOf = (entryId: string): AttentionEntryRecord => {
      try { return attention.getInbox(entryId); }
      catch (error) { if (error instanceof ActionError && error.code === "attention.entry_not_found") throw inboxErrors.entry_not_found("Inbox Entry 不存在"); throw error; }
    };
    const bindings = new InboxSceneBindings({ get: (statement, ...parameters) => database.get(statement, parameters as never[]) ?? undefined,
      run: () => { throw new ActionError("actions.execution_failed", "读取绑定不写入"); } });
    const subjects: ActionClient = { discover: () => directory.discover(), invoke: (_caller, reference, input) => directory.invoke(reference, input) };
    const sceneRuntime = createInboxSceneRuntime({ projectId, scenes, judgments,
      bindings: {
        get: () => bindings.get(projectId, INBOX_NEXT_SCENE_ID),
        save: (caller, binding, options) => database.transaction(() => caller.beforeEffect(), tx => {
          new InboxSceneBindings(sqlOf(tx)).save(projectId, binding, options?.expected_revision);
        }),
      },
      judgmentActions: () => directory.discover(),
      entry: entryId => { const { entry_id, revision, status, reason, detail, subject_type, subject_id } = entryOf(entryId); return { entry_id, revision, status, reason, detail, subject_type, subject_id }; },
      content: itemId => ask<InboxFeedContent>(FEED.content, { item_id: itemId }),
      recordEvent: (caller, judgment) => database.transaction(() => caller.beforeEffect(), tx => {
        tx.journal.appendEvent({ eventId: `event-${randomUUID()}`, actorId: caller.audit_actor_id ?? caller.actor_id, type: "judgment_completed", objectType: "judgment",
          objectId: judgment.judgment_id, reason: judgment.outcome, payload: { judgment_id: judgment.judgment_id }, at: judgment.created_at });
      }) });
    const briefs = async (_caller: ActionCallContext, ids: { item_ids: readonly string[]; source_ids: readonly string[] }): Promise<InboxBriefs> => {
      const items = new Map<string, InboxItemBrief>(), sources = new Map<string, { source_id: string; name: string }>();
      for (const [kind, all] of [["item_ids", ids.item_ids], ["source_ids", ids.source_ids]] as const) {
        for (let from = 0; from < all.length; from += BRIEF_BATCH) {
          // Without Feed installed the entries are still Inbox's to list; they just carry no names.
          const read = await ask<{ items: InboxItemBrief[]; sources: Array<{ source_id: string; name: string }> }>(FEED.briefs, { [kind]: all.slice(from, from + BRIEF_BATCH) })
            .catch(error => { if (feedMissing(error)) return { items: [], sources: [] }; throw error; });
          for (const item of read.items) items.set(item.item_id, item);
          for (const source of read.sources) sources.set(source.source_id, source);
        }
      }
      return { items, sources };
    };
    const pages = createInboxPagesHandlers({
      generation: async requestId => (await ask<{ record: InboxPagesGeneration | null }>(PAGES.generation, { request_id: requestId })).record,
      generations: async () => (await ask<{ records: InboxPagesGeneration[] }>(PAGES.generations, {})).records,
      readDocument: async id => (await ask<{ document: InboxPagesDocument }>(PAGES.get, { id })).document,
      generate: (input) => ask(PAGES.generate, { ...input, inputs: [...input.inputs] }),
      readMaterial: async (entryId, caller): Promise<InboxPagesInputSnapshot> => {
        await caller.validate_permissions?.(["inbox:read"]);
        caller.signal?.throwIfAborted();
        const entry = entryOf(entryId);
        if (entry.subject_type !== "feed_item") throw inboxErrors.invalid("只支持整理有原始内容的 Feed 材料");
        if (entry.status !== "open" && entry.status !== "in_progress") throw new ActionError("actions.subject_unavailable", "事项已不在待处理列表中");
        const material = await ask<{ item_id: string; revision: number; title: string; body: string; url: string | null; source_label: string | null; provenance: unknown[] }>(FEED.material, { item_id: entry.subject_id });
        if (entryOf(entryId).revision !== entry.revision) throw new ActionError("actions.offer_changed", "检查期间原材料或来源已变化，请重新载入");
        caller.signal?.throwIfAborted();
        return { entry_id: entryId, item_id: material.item_id, revision: material.revision, title: material.title, body: material.body, url: material.url,
          source_label: material.source_label, captured_at: new Date().toISOString(), provenance: material.provenance } as InboxPagesInputSnapshot;
      },
    });
    const actions = [...createInboxActionHandlers({ ...sceneRuntime.ports, ...pages,
      listEntries: () => attention.listInbox().map(recordOf),
      setStatus: async (entryId, status, revision, caller) => {
        const entry = entryOf(entryId);
        // Reopening is admission too: an ignored item's entries stay closed until the person restores the item, and only Feed can say so.
        if ((status === "open" || status === "in_progress") && entry.subject_type === "feed_item") {
          const admission = await ask<{ admissible: boolean }>(FEED.admission, { item_id: entry.subject_id })
            .catch(error => { if (feedMissing(error)) throw inboxErrors.invalid("Feed 未启用，无法确认这条消息能否重新打开"); throw error; });
          if (!admission.admissible) throw inboxErrors.invalid("请先恢复这条已忽略的 Feed 消息");
        }
        return recordOf(await database.transaction(() => caller.beforeEffect(), tx => attention.join(tx, writer => {
          entryOf(entryId);
          return writer.setStatus(entryId, status as AttentionStatus, revision);
        })));
      },
    }), ...createInboxContentHandlers({
      entries: () => attention.listInbox(), entry: entryOf, briefs,
      readSubject: async (subject, caller) => (await resolveActionSubject(subjects, caller, subject)).context,
      readFeed: id => ask<WorkflowPayload>(FEED.read, { item_id: id }),
      receiveFeed: input => ask<WorkflowItemRef>(FEED.receive, input),
      admit: itemId => ask<{ entry_id: string }>(FEED.admit, { item_id: itemId }),
    })];
    // The page's requests only adapt HTTP to the plugin's own actions, called as the person who made the request (their authority, not Inbox's).
    const routes = (inboxManifest.routes ?? []).map(({ route_id }) => ({ route_id, async handle(request: PluginRouteRequest) {
      const handlers = createInboxRouteHandlers({ changed() {}, actions: { discover: async () => [], invoke: (definition, input) => own.invoke(definition, input, request.execution) } });
      return handlers[route_id]!({ params: request.params, request: { method: request.method as "GET" | "POST", pathname: request.pathname,
        query: new URLSearchParams(request.query), body: request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {} } });
    } }));
    return { kind: "app", views: [inboxUiContribution], actions, routes, action_scenes: [sceneRuntime.handler] };
  } };
}
