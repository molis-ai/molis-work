import { createHash } from "node:crypto";
import { ActionError, type ActionClient, type ActionReference, type ActionSceneBinding, type ActionSceneClient, type ActionSceneConfigureOptions, type ActionSceneHandlerBinding, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { INBOX_NEXT_SCENE_ID, type JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import type { InboxActionPorts } from "./actions.js";
import { createInboxSceneHandler, inboxNextScene, inboxSceneBindingId, type InboxJudgmentSubject } from "./scenes.js";

// The judgment side of Inbox's next-step scene (PG-034): which published rules may be bound, which saved judgments still hold, and how
// a judgment is recorded. The Host supplies only what other owners keep: the binding and judgment ledger and the published rules (the
// Functions owner), and the entry with the Feed item it points at. Nothing here knows how those are stored.

/** One judgment as the ledger takes it; the ledger derives its own key for the function from `function`. */
export interface InboxSceneJudgmentInput {
  readonly function: ActionReference;
  readonly subject: JudgmentRecord["subject"];
  readonly scene_id: string;
  readonly scene_provenance: NonNullable<JudgmentRecord["scene_provenance"]>;
  readonly outcome: JudgmentRecord["outcome"];
  readonly suggested_behavior_ids: readonly string[];
  readonly error_code: string | null;
}

/** A rule the Functions owner has published, with the reference an action call or a binding names it by. */
export interface InboxSceneRule { readonly function_key: string; readonly name: string; readonly reference: ActionReference }

/** The entry as the judgment reads it, and the Feed item it points at (null when it points at something else). */
export interface InboxSceneSubject {
  readonly entry: { readonly entry_id: string; readonly revision: number; readonly status: string; readonly reason: string; readonly detail: unknown };
  readonly item: { readonly title?: string | null; readonly summary?: string | null; readonly body?: string | null;
    readonly materials: ReadonlyArray<{ readonly content?: string | null; readonly preview?: string | null }> } | null;
}

/** What the Host owns for this scene. */
export interface InboxSceneHost {
  binding(): ActionSceneBinding | null;
  saveBinding(binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): void;
  publishedRules(): readonly InboxSceneRule[];
  /** The key the Functions owner publishes a function under, or null when the reference is not one of its rules. */
  functionKey(reference: ActionReference): string | null;
  latestJudgments(sceneId: string): readonly JudgmentRecord[];
  recordJudgment(input: InboxSceneJudgmentInput): JudgmentRecord;
  /** Throws `inbox.entry_not_found`. */
  subject(entryId: string): InboxSceneSubject;
  /** The judgment becomes an event of the entry's history. */
  recordEvent(judgment: JudgmentRecord): void;
}

export interface InboxSceneRuntimeOptions {
  readonly projectId: string;
  readonly actions: ActionClient;
  readonly scenes: ActionSceneClient;
  readonly host: InboxSceneHost;
}

/** The scene handler the project's action provider registers, and the judgment ports the Inbox action handlers take. */
export function createInboxSceneRuntime(options: InboxSceneRuntimeOptions): {
  handler: ActionSceneHandlerBinding;
  ports: Pick<InboxActionPorts, "readJudgment" | "writeJudgment" | "evaluateJudgment" | "recommendations">;
} {
  const { projectId, actions, scenes, host } = options;
  const bindingFor = (rule: InboxSceneRule): ActionSceneBinding => ({
    binding_id: inboxSceneBindingId(projectId), scene_id: inboxNextScene.scene_id, scene_version: inboxNextScene.version,
    project_id: projectId, function: rule.reference, enabled: true,
    title: "Inbox 下一步", href: `/projects/${encodeURIComponent(projectId)}/`,
  });
  const resolve = (entryId: string): InboxJudgmentSubject => {
    const { entry, item } = host.subject(entryId);
    return { entry_id: entry.entry_id, revision: entry.revision, status: entry.status,
      content: [entry.reason, item?.title, item?.summary, item?.body, ...(item?.materials.map(material => material.content || material.preview) ?? []), JSON.stringify(entry.detail)].filter(Boolean).join("\n") };
  };
  const subjectRevision = (subject: InboxJudgmentSubject) => createHash("sha256").update(JSON.stringify(subject)).digest("hex");
  const handler = createInboxSceneHandler({ projectId, binding: () => host.binding(), resolve,
    save: (value, saveOptions) => host.saveBinding(value, saveOptions),
    record: (subject, value, result) => {
      const judgment = host.recordJudgment({ function: value.function,
        subject: { kind: "inbox_entry", id: subject.entry_id, project_id: projectId }, scene_id: INBOX_NEXT_SCENE_ID,
        scene_provenance: { binding_id: value.binding_id, binding_revision: value.revision!, function: value.function, subject_revision: subjectRevision(subject) },
        outcome: result.status, suggested_behavior_ids: result.suggested_behavior_ids, error_code: result.error_code ?? null });
      host.recordEvent(judgment);
      return judgment;
    },
  });
  const ports: Pick<InboxActionPorts, "readJudgment" | "writeJudgment" | "evaluateJudgment" | "recommendations"> = {
    readJudgment: async caller => {
      const candidates = (await actions.discover(caller)).filter(action => action.action.kind === "judgment");
      const capabilities: ActionView[] = [];
      for (const action of candidates) {
        if ((await scenes.discoverScenes(caller, { capability_id: action.capability_id, version: action.version, provider_id: action.provider.provider_id })).some(scene => scene.definition.scene_id === INBOX_NEXT_SCENE_ID && scene.compatible)) capabilities.push(action);
      }
      const current = host.binding();
      const usage = (await scenes.usages(caller)).find(usage => usage.scene_id === INBOX_NEXT_SCENE_ID && usage.binding_id === inboxSceneBindingId(projectId));
      const selected = capabilities.find(action => action.capability_id === current?.function.capability_id && action.version === current.function.version && action.provider.provider_id === current.function.provider_id);
      return { function_key: current?.enabled ? host.functionKey(current.function) : null,
        functions: host.publishedRules().filter(rule => capabilities.some(action => action.provider.provider_id === rule.reference.provider_id && action.capability_id === rule.reference.capability_id && action.version === rule.reference.version))
          .map(rule => ({ function_key: rule.function_key, name: rule.name })),
        capabilities, binding: current,
        summary: { name: selected?.action.title ?? (current ? "已绑定判断能力" : null), enabled: Boolean(current?.enabled),
          available: Boolean(usage?.enabled && usage.availability.available),
          reason: !current ? "尚未绑定规则" : !current.enabled ? "已暂停" : usage && !usage.availability.available ? usage.availability.reason : !usage ? "当前无权使用此场景" : null },
      };
    },
    recommendations: async caller => {
      const usage = (await scenes.usages(caller)).find(usage => usage.scene_id === INBOX_NEXT_SCENE_ID && usage.binding_id === inboxSceneBindingId(projectId));
      if (!usage?.enabled || !usage.availability.available) return { judgments: [] };
      const judgments = host.latestJudgments(INBOX_NEXT_SCENE_ID).filter(record => {
        const provenance = record.scene_provenance;
        if (record.subject.kind !== "inbox_entry" || !provenance || provenance.binding_id !== usage.binding_id || provenance.binding_revision !== usage.revision
          || provenance.function.capability_id !== usage.function.capability_id || provenance.function.version !== usage.function.version || provenance.function.provider_id !== usage.function.provider_id) return false;
        let subject;
        try { subject = resolve(record.subject.id); }
        catch (error) { if (error instanceof Error && "code" in error && error.code === "inbox.entry_not_found") return false; throw error; }
        return (subject.status === "open" || subject.status === "in_progress") && subjectRevision(subject) === provenance.subject_revision;
      });
      return { judgments };
    },
    writeJudgment: async (key, caller) => {
      if (!key) {
        const current = host.binding();
        if (current) await scenes.bind(caller, { ...current, enabled: false });
      } else {
        const rule = host.publishedRules().find(rule => rule.function_key === key);
        if (!rule) throw new ActionError("actions.binding_invalid", "请选择已发布的判断规则");
        await scenes.bind(caller, bindingFor(rule));
      }
      return { function_key: key };
    },
    evaluateJudgment: async (ids, caller) => {
      const entries = [...new Set(ids)].map(resolve);
      if (entries.some(entry => entry.status !== "open" && entry.status !== "in_progress")) throw new ActionError("actions.subject_unavailable", "已完成或已忽略的事项请先重新打开");
      const judgments: JudgmentRecord[] = [];
      for (const entry of entries) judgments.push(await scenes.runScene(caller, inboxNextScene,
        inboxSceneBindingId(projectId), { entry_id: entry.entry_id }) as JudgmentRecord);
      return { judgments };
    },
  };
  return { handler, ports };
}
