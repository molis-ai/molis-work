import { ActionError, isSubjectReader, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantRelatedWork, AssistantWorkObject } from "@molis-ai/molis-work-contracts/services/assistant";

interface RelatedInput { readonly kind: string; readonly id: string }
type RelatedWork = AssistantRelatedWork & { readonly results: readonly AssistantWorkObject[] };

/** What reading related works needs of the Assistant service. */
export interface RelatedWorksSource {
  related(projectId: string | null, subject: RelatedInput): Promise<AssistantRelatedWork[]>;
  read(workId: string): Promise<{ readonly objects: readonly AssistantWorkObject[] }>;
}

const text = (maxLength: number) => ({ type: "string", minLength: 1, maxLength });

/**
 * The works that relate to one object, for that object's own page ("belongs to …", continue it): their states and result links,
 * never a work's conversation or materials (PG-057). A plugin page asks through the action gateway and only for an object its own
 * Manifest reads back (a subject reader it is granted); the person's own surfaces ask for any object. Both read in the call's project.
 */
export const assistantRelatedAction: ActionDefinition<RelatedInput, { works: readonly RelatedWork[] }> = {
  capability_id: "assistant.works.related", provider_id: "io.molis.work.assistant.rules", version: 1, operation: "query",
  action: { title: "相关的助理工作", description: "列出与一个对象相关的助理工作：状态与结果链接，不含对话与材料", kind: "query", effect: "read",
    scope: "project", audiences: ["user", "plugin"], permissions: [], subject_kinds: [],
    input_schema: { type: "object", properties: { kind: text(120), id: text(256) }, required: ["kind", "id"], additionalProperties: false },
    output_schema: { type: "object", required: ["works"], properties: { works: { type: "array", items: { type: "object",
      required: ["work_id", "title", "state", "relation", "updated_at", "results"], properties: {
        work_id: { type: "string" }, title: { type: "string" }, state: { type: "string" }, relation: { type: "string" },
        updated_at: { type: "string" }, results: { type: "array", items: { type: "object" } } } } } } } },
};

/** The related works with each one's results (other than the object itself); a work that cannot be read shows no results. */
export async function relatedWorks(service: RelatedWorksSource, projectId: string | null, object: RelatedInput): Promise<{ works: RelatedWork[] }> {
  const related = await service.related(projectId, object);
  const works = await Promise.all(related.map(async work => {
    try {
      const view = await service.read(work.work_id);
      const results = view.objects.filter(item => item.relation === "result" && !(item.subject.kind === object.kind && item.subject.id === object.id));
      return { ...work, results };
    } catch { return { ...work, results: [] }; }
  }));
  return { works };
}

export function assistantRelatedRegistration(service: () => RelatedWorksSource): { definitions: ActionDefinition[]; handlers: ActionHandlerBinding[] } {
  return { definitions: [assistantRelatedAction], handlers: [{ ...assistantRelatedAction, handle: async (caller, input) => {
    const object = input as RelatedInput;
    if (caller.audience !== "user") {
      // The calling plugin's own subject reader for this kind, with its permissions granted: another owner's object is refused.
      const reader = caller.host_plugin?.declaration.manifest.actions?.find(definition => isSubjectReader(definition.action) && definition.action.subject_kinds.includes(object.kind));
      if (!reader || reader.action.permissions.some(permission => !caller.permissions.includes(permission)))
        throw new ActionError("actions.forbidden", "插件只能读自己对象的相关工作");
    }
    return relatedWorks(service(), caller.project_id, object);
  } }] };
}
