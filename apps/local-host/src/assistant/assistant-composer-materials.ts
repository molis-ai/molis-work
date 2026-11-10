import { findSubjectReader, isSubjectReader, type ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantMaterial, AssistantScope, AssistantSendInput } from "@molis-ai/molis-work-contracts/services/assistant";
import { assistantErrors } from "./assistant-errors.js";
import { belongsElsewhere, type AssistantCaller, type AssistantServicePorts } from "./assistant-service-shared.js";
import type { StoredWork } from "./assistant-store.js";

/** The same trusted scope for preflight and for the work it may create. */
export function sendScope(scope: AssistantScope | undefined, caller: AssistantCaller, choice: AssistantSendInput["executor"]): AssistantScope {
  const wanted = scope ?? (caller.project_ref ? { kind: "project" as const, project_id: caller.project_ref.project_id } : { kind: "personal" as const });
  if (choice?.kind === "plugin" && wanted.kind !== "project") throw assistantErrors.scope("执行方插件在项目里工作；个人工作请交给助理");
  if (wanted.kind !== "personal" && (wanted.kind !== "project" || wanted.project_id !== caller.project_ref?.project_id))
    throw assistantErrors.scope("只能在当前打开的项目里为它新建工作；个人工作不需要项目");
  return wanted;
}

/** B10-R5: picked references are read before work, draft, continuation or relation writes. Only their resolved text is stored. */
export async function readComposerMaterials(materials: AssistantMaterial[], scope: Pick<StoredWork, "project_ref">, ports: AssistantServicePorts): Promise<AssistantMaterial[]> {
  if (!materials.some(item => item.reference && "material" in item.reference)) return materials;
  const actions = await ports.scopeActions?.(scope), views = await actions?.discover() ?? [];
  const unreadable: { material_id: string; reason: string }[] = [], result: AssistantMaterial[] = [];
  for (const material of materials) {
    if (!material.reference || !("material" in material.reference)) { result.push(material); continue; }
    try {
      const ref = material.reference.material;
      if (ref.pin.mode !== "current" || ref.range) throw assistantErrors.unsupported("这里暂不支持固定版本、快照或片段，请重新选择当前正文");
      const owners = new Set(views.filter(view => isSubjectReader(view.action) && view.action.subject_kinds.includes(ref.subject.kind)).map(view => view.provider.provider_id));
      const reader = findSubjectReader(views, ref.subject.kind);
      if (!actions || owners.size !== 1 || reader.found !== "one") throw assistantErrors.invalid("来源现在不可读或没有唯一主人，请重新选择");
      const view = reader.view;
      const context = await actions.invoke({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, { subject_id: ref.subject.id }) as ActionSubjectContext;
      if (context.subject.kind !== ref.subject.kind || context.subject.id !== ref.subject.id || belongsElsewhere(scope, context)) throw assistantErrors.scope("这项工作的范围读不到所选资料");
      if (context.revision !== ref.pin.read_revision) throw assistantErrors.conflict("资料已更新，请重新选择后再发");
      const { reference: _reference, ...resolved } = material;
      result.push({ ...resolved, title: context.title, object: { ...context.subject, version: context.revision, title: context.title },
        text: `用户明确选择的资料，已向原主人读取（版本 ${context.revision}${context.truncated ? "，正文为节选" : ""}）。\n${context.content.slice(0, 12_000)}` });
    } catch (error) { unreadable.push({ material_id: material.material_id, reason: error instanceof Error ? error.message : String(error) }); }
  }
  if (unreadable.length) throw assistantErrors.invalid("所选资料现在读不到，请逐项处理后再发", { unreadable });
  return result;
}
