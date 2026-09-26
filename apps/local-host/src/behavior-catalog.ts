import { createHash } from "node:crypto";
import { AGENT_MCP_DESTINATION_ID, FUNCTION_AUTHORING_SUBJECTS,
  type FunctionAuthoringCatalog, type FunctionAuthoringBehavior } from "@molis-ai/molis-work-contracts/modules/functions";
import { subjectOfferChoices } from "@molis-ai/molis-work-kernel";
import type { ActionView, ActionSceneView } from "@molis-ai/molis-work-contracts/platform/actions";

export function liveHostFunctionAuthoringCatalog(directory: readonly ActionView[] = [], scenes: readonly ActionSceneView[] = []): FunctionAuthoringCatalog {
  const agentActions: FunctionAuthoringBehavior[] = directory.filter(view => view.action.audiences.some(audience => audience === "agent" || audience === "mcp")).map(view => {
    const action_ref = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
    return { behavior_id: "action." + createHash("sha256").update(JSON.stringify(action_ref)).digest("hex").slice(0, 56),
      action_ref, destination_id: AGENT_MCP_DESTINATION_ID, title: view.action.title, hint: view.action.description,
      effect: view.operation === "query" ? "read" : "write", source: view.provider.kind === "system" ? "system" : "plugin",
      plugin_id: view.provider.provider_id, plugin_title: view.provider.title, subject_kinds: view.action.subject_kinds,
      clickable: true, availability: view.availability };
  });
  const choices = subjectOfferChoices(directory);
  const kinds = [...new Set([...choices.flatMap(choice => choice.subject_kinds), ...scenes.flatMap(scene => scene.definition.subject_kinds), ...agentActions.flatMap(action => action.subject_kinds)])];
  const behaviors: FunctionAuthoringBehavior[] = [];
  const destinations = scenes.map(({ definition, provider, availability }) => {
    const properties = definition.result_schema.properties as Record<string, { items?: { enum?: unknown } }> | undefined;
    const values = properties?.suggested_behavior_ids?.items?.enum;
    const supported = definition.result_type === "molis.behavior-recommendation.v1"
      && (definition.recommendation_source === "subject-offers" || Array.isArray(values) && values.every(value => typeof value === "string"));
    const available = !supported ? { available: false as const, code: "actions.scene_incompatible", reason: "此场景需要不同的结果合同，当前规则编辑器不能直接映射" } : availability;
    const offered = definition.recommendation_source === "subject-offers"
      ? choices.filter(choice => !definition.subject_kinds.length || choice.subject_kinds.some(kind => definition.subject_kinds.includes(kind))) : [];
    const ids = definition.recommendation_source === "subject-offers" ? offered.map(choice => choice.key) : supported ? values as string[] : [];
    for (const choice of offered) behaviors.push({ behavior_id: choice.key, title: choice.title, destination_id: definition.scene_id, scene_version: definition.version, provider_id: provider.provider_id,
      hint: choice.availability.available ? choice.provider_title : choice.availability.reason,
      effect: directory.find(action => action.capability_id === choice.action.capability_id && action.version === choice.action.version
        && action.provider.provider_id === choice.action.provider_id)?.operation === "query" ? "read" : "write",
      source: "plugin", plugin_id: choice.source.provider_id!, plugin_title: choice.provider_title,
      subject_kinds: choice.subject_kinds, clickable: true, availability: choice.availability });
    if (!offered.length && definition.recommendation_source !== "subject-offers") for (const key of ids) {
      behaviors.push({ behavior_id: key, title: definition.recommendation_labels?.[key] ?? key, destination_id: definition.scene_id, scene_version: definition.version, provider_id: provider.provider_id,
        hint: definition.description, effect: "read", source: provider.kind === "system" ? "system" : "plugin", plugin_id: provider.provider_id,
        plugin_title: provider.title, subject_kinds: definition.subject_kinds, clickable: true, availability: available });
    }
    return { destination_id: definition.scene_id, scene_version: definition.version, provider_id: provider.provider_id,
      kind: "event" as const, title: definition.title, when: definition.trigger, effect: definition.description,
      configure_at: "发布后在原消费场景启用", subject_kinds: definition.subject_kinds.length ? definition.subject_kinds : [...new Set(offered.flatMap(choice => choice.subject_kinds))],
      behavior_ids: ids, availability: available };
  });
  return {
    subjects: [...FUNCTION_AUTHORING_SUBJECTS, ...kinds.filter(kind => !FUNCTION_AUTHORING_SUBJECTS.some(subject => subject.subject_kind === kind))
      .map(subject_kind => ({ subject_kind, title: subject_kind }))],
    destinations: [...destinations, { destination_id: AGENT_MCP_DESTINATION_ID, kind: "mcp", title: "Agent", when: "返回判断和推荐能力，由 Agent 按授权调用",
      configure_at: "发布后可供已授权 Agent 调用", effect: "推荐不自动执行，也不授予权限", subject_kinds: [], behavior_ids: agentActions.map(action => action.behavior_id) }],
    behaviors: [...behaviors, ...agentActions],
  };
}
