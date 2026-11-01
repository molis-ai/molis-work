import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { ActionError, type ActionReference, type ActionSceneBinding, type ActionSceneConfigureOptions, type ActionSceneExecutionContext, type ActionSceneHandlerBinding, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { INBOX_NEXT_SCENE_ID, publishedFunctionKey, type JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import type { PluginJudgmentsClient, PluginSceneClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { inboxActions, type InboxActionPorts } from "./actions.js";
import { createInboxSceneHandler, inboxNextScene, inboxSceneBindingId, type InboxJudgmentSubject } from "./scenes.js";

// The judgment side of Inbox's next-step scene (PG-034): which published rules may be bound, which saved judgments still hold, and how
// a judgment is recorded. The plugin runs it over the platform's services: the scene client and the judgment ledger of its own scene,
// its own binding row, and the entry; what Feed keeps (the text of the item an entry points at) arrives through Feed's action.

/** The text of the Feed item an entry points at, as Feed's `feed.items.content` gives it. */
export interface InboxFeedContent {
  readonly item_id: string;
  readonly revision: number;
  readonly title: string;
  readonly summary: string | null;
  readonly body: string | null;
  readonly materials: ReadonlyArray<{ readonly content: string | null; readonly preview: string | null }>;
}

/** The entry as the judgment reads it. */
export interface InboxSceneEntry { readonly entry_id: string; readonly revision: number; readonly status: string; readonly reason: string; readonly detail: unknown;
  readonly subject_type: string; readonly subject_id: string }

/** A rule the Functions owner has published, with the reference an action call or a binding names it by. */
export interface InboxSceneRule { readonly function_key: string; readonly name: string; readonly reference: ActionReference }

/** One judgment as the ledger takes it; the ledger derives its own key for the function from `function`. */
export type InboxSceneJudgmentInput = Parameters<PluginJudgmentsClient["record"]>[0];

/**
 * The text Feed gave for the entries one `inbox.judgment.evaluate` call is judging, kept for the callbacks of that call only: the scene's
 * `prepare` and `consume` run where no action can call Feed, so the action reads the text first and the callbacks find it here. Nothing is
 * stored, and a callback that no action started (so with nothing staged) judges nothing (`actions.subject_unavailable`).
 */
const stagedContent = new AsyncLocalStorage<{ readonly content: ReadonlyMap<string, InboxFeedContent>; readonly effect: () => Promise<void> }>();

/**
 * Runs `body` with this Feed content visible to the scene callbacks it starts, and to nothing else. `effect` is the initiating action's own
 * last check before an effect: the callback that writes the ledger runs it first, so an action revoked while the model answered writes nothing.
 */
export function withStagedFeedContent<T>(content: ReadonlyMap<string, InboxFeedContent>, body: () => T, effect: () => Promise<void> = async () => {}): T {
  return stagedContent.run({ content, effect }, body);
}

/** What a judgment of an entry reads: the reason, the item's text and the entry's detail; one string, so a change anywhere changes it. */
export function judgmentContent(entry: InboxSceneEntry, item: InboxFeedContent | null): string {
  return [entry.reason, item?.title, item?.summary, item?.body, ...(item?.materials.map(material => material.content || material.preview) ?? []), JSON.stringify(entry.detail)]
    .filter(Boolean).join("\n");
}

/** What the plugin supplies for this scene; every member is the plugin's own data or a platform service it holds. */
export interface InboxSceneRuntimeOptions {
  readonly projectId: string;
  readonly scenes: PluginSceneClient;
  readonly judgments: PluginJudgmentsClient;
  /** Inbox's own row for the scene (`inbox_scene_bindings`). */
  readonly bindings: {
    get(): ActionSceneBinding | null;
    save(context: ActionSceneExecutionContext, binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): void | Promise<void>;
  };
  /** The judgment actions the running action's caller can see: the choices for a rule and the title each is shown under. */
  judgmentActions(): Promise<readonly ActionView[]>;
  /** Reads the entry from Attention; throws `inbox.entry_not_found`. */
  entry(entryId: string): InboxSceneEntry;
  /** Reads the text of one Feed item through Feed's action, for the running action's caller. */
  content(itemId: string): Promise<InboxFeedContent>;
  /** The judgment becomes an event of the entry's history, in the same transaction as the plugin's own rows. */
  recordEvent(context: ActionSceneExecutionContext, judgment: JudgmentRecord): void | Promise<void>;
}

const OPEN = (status: string) => status === "open" || status === "in_progress";
const subjectRevision = (subject: InboxJudgmentSubject) => createHash("sha256").update(JSON.stringify(subject)).digest("hex");

/** The scene handler the plugin registers, and the judgment ports the Inbox action handlers take. */
export function createInboxSceneRuntime(options: InboxSceneRuntimeOptions): {
  handler: ActionSceneHandlerBinding;
  ports: Pick<InboxActionPorts, "readJudgment" | "writeJudgment" | "evaluateJudgment" | "recommendations">;
} {
  const { projectId, scenes, judgments, bindings } = options;
  const subjectOf = (entry: InboxSceneEntry, item: InboxFeedContent | null): InboxJudgmentSubject =>
    ({ entry_id: entry.entry_id, revision: entry.revision, status: entry.status, content: judgmentContent(entry, item) });
  /** In a scene callback: the entry as Attention has it now, and the item's text as the running action read it. */
  const fromStaged = (entryId: string): InboxJudgmentSubject => {
    const entry = options.entry(entryId);
    if (entry.subject_type !== "feed_item") return subjectOf(entry, null);
    const item = stagedContent.getStore()?.content.get(entry.subject_id);
    if (!item) throw new ActionError("actions.subject_unavailable", "请通过 Inbox 的“判断下一步”运行这个场景");
    return subjectOf(entry, item);
  };
  /** In an action: the entry and a fresh read of the item's text. */
  const fetched = async (entryId: string): Promise<{ subject: InboxJudgmentSubject; item: InboxFeedContent | null }> => {
    const entry = options.entry(entryId);
    const item = entry.subject_type === "feed_item" ? await options.content(entry.subject_id) : null;
    return { subject: subjectOf(entry, item), item };
  };
  const bindingFor = (rule: InboxSceneRule): ActionSceneBinding => ({
    binding_id: inboxSceneBindingId(projectId), scene_id: inboxNextScene.scene_id, scene_version: inboxNextScene.version,
    project_id: projectId, function: rule.reference, enabled: true,
    title: "Inbox 下一步", href: `/projects/${encodeURIComponent(projectId)}/`,
  });
  const publishedRules = (actions: readonly ActionView[]): InboxSceneRule[] => actions.flatMap(view => {
    const reference = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
    const function_key = publishedFunctionKey(reference);
    return function_key ? [{ function_key, name: view.action.title, reference }] : [];
  });
  const handler = createInboxSceneHandler({ projectId, binding: () => bindings.get(), resolve: fromStaged, save: (context, value, saveOptions) => bindings.save(context, value, saveOptions),
    record: async (context, subject, value, result) => {
      // The ledger lives in the Home's library and commits by itself: recorded first, so a judgment whose event did not follow is the harmless half.
      // The ledger writes only once the initiating action's and this callback's own checks before an effect have returned.
      await stagedContent.getStore()?.effect();
      await context.beforeEffect();
      const judgment = judgments.record({ function: value.function,
        subject: { kind: "inbox_entry", id: subject.entry_id, project_id: projectId }, scene_id: INBOX_NEXT_SCENE_ID,
        scene_provenance: { binding_id: value.binding_id, binding_revision: value.revision!, function: value.function, subject_revision: subjectRevision(subject) },
        outcome: result.status, suggested_behavior_ids: result.suggested_behavior_ids, error_code: result.error_code ?? null });
      await options.recordEvent(context, judgment);
      return judgment;
    },
  });
  const ports: Pick<InboxActionPorts, "readJudgment" | "writeJudgment" | "evaluateJudgment" | "recommendations"> = {
    readJudgment: async () => {
      const candidates = (await options.judgmentActions()).filter(action => action.action.kind === "judgment");
      const capabilities: ActionView[] = [];
      for (const action of candidates) {
        if ((await scenes.discoverScenes({ capability_id: action.capability_id, version: action.version, provider_id: action.provider.provider_id }))
          .some(scene => scene.definition.scene_id === INBOX_NEXT_SCENE_ID && scene.compatible)) capabilities.push(action);
      }
      const current = bindings.get();
      const usage = (await scenes.usages()).find(usage => usage.scene_id === INBOX_NEXT_SCENE_ID && usage.binding_id === inboxSceneBindingId(projectId));
      const selected = capabilities.find(action => action.capability_id === current?.function.capability_id && action.version === current.function.version && action.provider.provider_id === current.function.provider_id);
      return { function_key: current?.enabled ? publishedFunctionKey(current.function) : null,
        functions: publishedRules(capabilities).map(rule => ({ function_key: rule.function_key, name: rule.name })),
        capabilities, binding: current,
        summary: { name: selected?.action.title ?? (current ? "已绑定判断能力" : null), enabled: Boolean(current?.enabled),
          available: Boolean(usage?.enabled && usage.availability.available),
          reason: !current ? "尚未绑定规则" : !current.enabled ? "已暂停" : usage && !usage.availability.available ? usage.availability.reason : !usage ? "当前无权使用此场景" : null },
      };
    },
    recommendations: async (_caller, entryIds) => {
      const usage = (await scenes.usages()).find(usage => usage.scene_id === INBOX_NEXT_SCENE_ID && usage.binding_id === inboxSceneBindingId(projectId));
      if (!usage?.enabled || !usage.availability.available) return { judgments: [] };
      const held: JudgmentRecord[] = [];
      for (const record of judgments.latest(INBOX_NEXT_SCENE_ID)) {
        if (entryIds && !entryIds.has(record.subject.id)) continue;
        const provenance = record.scene_provenance;
        if (record.subject.kind !== "inbox_entry" || !provenance || provenance.binding_id !== usage.binding_id || provenance.binding_revision !== usage.revision
          || provenance.function.capability_id !== usage.function.capability_id || provenance.function.version !== usage.function.version || provenance.function.provider_id !== usage.function.provider_id) continue;
        let subject: InboxJudgmentSubject;
        try { subject = (await fetched(record.subject.id)).subject; }
        catch (error) { if (error instanceof Error && "code" in error && (error.code === "inbox.entry_not_found" || error.code === "feed.item_not_found")) continue; throw error; }
        if (OPEN(subject.status) && subjectRevision(subject) === provenance.subject_revision) held.push(record);
      }
      return { judgments: held };
    },
    writeJudgment: async key => {
      if (!key) {
        const current = bindings.get();
        if (current) await scenes.bind({ ...current, enabled: false });
      } else {
        const rule = publishedRules(await options.judgmentActions()).find(rule => rule.function_key === key);
        if (!rule) throw new ActionError("actions.binding_invalid", "请选择已发布的判断规则");
        await scenes.bind(bindingFor(rule));
      }
      return { function_key: key };
    },
    evaluateJudgment: async (ids, caller) => {
      // The running action as the dispatcher resolved it, provider included: a client's grant names the provider, so a bare reference would read as revoked.
      const effect = async () => { await caller.validate_authority?.(caller.current_action ?? inboxActions.evaluateJudgment); };
      const reads = await Promise.all([...new Set(ids)].map(fetched));
      if (reads.some(({ subject }) => !OPEN(subject.status))) throw new ActionError("actions.subject_unavailable", "已完成或已忽略的事项请先重新打开");
      const content = new Map<string, InboxFeedContent>();
      for (const { item } of reads) if (item) content.set(item.item_id, item);
      const results: JudgmentRecord[] = [];
      for (const { subject } of reads) {
        results.push(await withStagedFeedContent(content, () => scenes.runScene(inboxNextScene, inboxSceneBindingId(projectId), { entry_id: subject.entry_id }), effect) as JudgmentRecord);
        // The model took time: the item's text is read again, and a judgment on text that has since changed is reported as one. It stays in
        // the ledger but no longer matches the entry (`recommendations` compares its text), so it is never adopted.
        const after = await fetched(subject.entry_id);
        if (after.subject.revision !== subject.revision || after.subject.status !== subject.status || after.subject.content !== subject.content) {
          throw new ActionError("actions.subject_changed", "判断期间事项或原始内容已变化，请重新判断");
        }
      }
      return { judgments: results };
    },
  };
  return { handler, ports };
}
