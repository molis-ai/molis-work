import { createHash } from "node:crypto";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { hydrateFeedItemContent } from "./feed-content.js";
import { ActionError, type ActionView, type ActionClient, type ActionSceneBinding, type ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { INBOX_NEXT_SCENE_ID, type JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import { createInboxSceneHandler, inboxNextScene, inboxSceneBindingId, type InboxActionPorts, type InboxJudgmentSubject } from "@molis-ai/molis-work-plugin-inbox";
import type { FeedApplication } from "@molis-ai/molis-work-plugin-feed";
import { withFunctionsService, type FunctionsHostOptions } from "./functions-host.js";

export interface InboxSceneServices { actions: ActionClient; scenes: ActionSceneClient; functions?: FunctionsHostOptions }

/** Uses the existing binding row and history owner; no second configuration store. */
export function createLocalInboxScene(home: string, projectId: string, boardId: string, feed: FeedApplication, services: InboxSceneServices) {
  const read = <T>(operation: Parameters<typeof withFunctionsService<T>>[1]) => withFunctionsService(home, operation, services.functions);
  const published = () => read(service => service.list().filter(rule => rule.status === "published" && rule.version));
  const legacyKey = (binding: ActionSceneBinding) => binding.function.provider_id !== "system.functions" ? "" : published().find(rule => {
    const ref = publishedFunctionAction(rule);
    return ref.capability_id === binding.function.capability_id && ref.version === binding.function.version;
  })?.function_key ?? "";
  const bindingFor = (functionKey: string, version: number): ActionSceneBinding => ({
    binding_id: inboxSceneBindingId(projectId), scene_id: inboxNextScene.scene_id, scene_version: inboxNextScene.version,
    project_id: projectId, function: { capability_id: `functions.published.${functionKey}`, version, provider_id: "system.functions" }, enabled: true,
    title: "Inbox 下一步", href: `/projects/${encodeURIComponent(projectId)}/`,
  });
  const binding = (): ActionSceneBinding | null => read(service => {
    const current = service.actionSceneBinding(INBOX_NEXT_SCENE_ID, boardId);
    if (current) return current;
    const old = service.sceneBinding(INBOX_NEXT_SCENE_ID, boardId);
    if (!old) return null;
    const rule = service.list().find(rule => rule.function_key === old.function_key);
    return { ...bindingFor(old.function_key, rule?.version ?? 1), revision: service.sceneBindingRevision(INBOX_NEXT_SCENE_ID, boardId) };
  });
  const resolve = (entryId: string) => {
    const entry = feed.getInboxEntry(boardId, entryId);
    const subject = entry.subject_type === "feed_item" ? runWithMolisWorkHome(home, () => hydrateFeedItemContent(feed.getFeedItem(boardId, entry.subject_id))) : null;
    return { entry_id: entry.entry_id, revision: entry.revision, status: entry.status,
      content: [entry.reason, subject?.title, subject?.summary, subject?.body, ...(subject?.materials.map(material => material.content || material.preview) ?? []), JSON.stringify(entry.detail)].filter(Boolean).join("\n") };
  };
  const subjectRevision = (subject: InboxJudgmentSubject) => createHash("sha256").update(JSON.stringify(subject)).digest("hex");
  const handler = createInboxSceneHandler({ projectId, binding, resolve,
    save: (value, options) => { read(service => service.saveActionSceneBinding(boardId, value, legacyKey(value), options?.expected_revision)); },
    record: (subject, value, result) => {
      const judgment = read(service => service.recordSceneJudgment({
        function_key: legacyKey(value) || value.function.capability_id, function_version: value.function.version,
        subject: { kind: "inbox_entry", id: subject.entry_id, board_id: boardId }, scene_id: INBOX_NEXT_SCENE_ID,
        scene_provenance: { binding_id: value.binding_id, binding_revision: value.revision!, function: value.function, subject_revision: subjectRevision(subject) },
        outcome: result.status, suggested_behavior_ids: result.suggested_behavior_ids, error_code: result.error_code ?? null,
      }));
      feed.recordInboxJudgmentEvent(boardId, judgment);
      return judgment;
    },
  });
  const ports: Pick<InboxActionPorts, "readJudgment" | "writeJudgment" | "evaluateJudgment" | "recommendations"> = {
    readJudgment: async caller => {
      const candidates = (await services.actions.discover(caller)).filter(action => action.action.kind === "judgment");
      const capabilities: ActionView[] = [];
      for (const action of candidates) {
        if ((await services.scenes.discoverScenes(caller, { capability_id: action.capability_id, version: action.version, provider_id: action.provider.provider_id })).some(scene => scene.definition.scene_id === INBOX_NEXT_SCENE_ID && scene.compatible)) capabilities.push(action);
      }
      const current = binding();
      const usage = (await services.scenes.usages(caller)).find(usage => usage.scene_id === INBOX_NEXT_SCENE_ID && usage.binding_id === inboxSceneBindingId(projectId));
      const selected = capabilities.find(action => action.capability_id === current?.function.capability_id && action.version === current.function.version && action.provider.provider_id === current.function.provider_id);
      return { function_key: current?.enabled ? legacyKey(current) || null : null,
        functions: published().filter(rule => capabilities.some(action => action.provider.provider_id === "system.functions" && action.capability_id === publishedFunctionAction(rule).capability_id && action.version === rule.version))
          .map(rule => ({ function_key: rule.function_key, name: rule.name })),
        capabilities, binding: current,
        summary: { name: selected?.action.title ?? (current ? "已绑定判断能力" : null), enabled: Boolean(current?.enabled),
          available: Boolean(usage?.enabled && usage.availability.available),
          reason: !current ? "尚未绑定规则" : !current.enabled ? "已暂停" : usage && !usage.availability.available ? usage.availability.reason : !usage ? "当前无权使用此场景" : null },
      };
    },
    recommendations: async caller => {
      const usage = (await services.scenes.usages(caller)).find(usage => usage.scene_id === INBOX_NEXT_SCENE_ID && usage.binding_id === inboxSceneBindingId(projectId));
      if (!usage?.enabled || !usage.availability.available) return { judgments: [] };
      const judgments = read(service => service.latestSceneJudgments(boardId, INBOX_NEXT_SCENE_ID)).filter(record => {
        const provenance = record.scene_provenance;
        if (record.subject.kind !== "inbox_entry" || !provenance || provenance.binding_id !== usage.binding_id || provenance.binding_revision !== usage.revision
          || provenance.function.capability_id !== usage.function.capability_id || provenance.function.version !== usage.function.version || provenance.function.provider_id !== usage.function.provider_id) return false;
        let subject;
        try { subject = resolve(record.subject.id); }
        catch (error) { if (error instanceof Error && "code" in error && error.code === "inbox_entry_not_found") return false; throw error; }
        return (subject.status === "open" || subject.status === "in_progress") && subjectRevision(subject) === provenance.subject_revision;
      });
      return { judgments };
    },
    writeJudgment: async (key, caller) => {
      if (!key) {
        const current = binding();
        if (current) await services.scenes.bind(caller, { ...current, enabled: false });
      } else {
        const rule = published().find(rule => rule.function_key === key);
        if (!rule) throw new ActionError("actions.binding_invalid", "请选择已发布的判断规则");
        await services.scenes.bind(caller, bindingFor(key, rule.version!));
      }
      return { function_key: key };
    },
    evaluateJudgment: async (ids, caller) => {
      const entries = [...new Set(ids)].map(resolve);
      if (entries.some(entry => entry.status !== "open" && entry.status !== "in_progress")) throw new ActionError("actions.subject_unavailable", "已完成或已忽略的事项请先重新打开");
      const judgments: JudgmentRecord[] = [];
      for (const entry of entries) judgments.push(await services.scenes.runScene(caller, inboxNextScene,
        inboxSceneBindingId(projectId), { entry_id: entry.entry_id }) as JudgmentRecord);
      return { judgments };
    },
  };
  return { handler, ports };
}
