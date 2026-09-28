import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { PPT_PROJECT_PLUGIN_ID, type PptRecord } from "@molis-ai/molis-work-contracts/modules/ppt";
import type { PptStore } from "./store.js";

/** PPT's part in the system search: title, description and every slide's title, bullets and notes. */
export const pptSearchActions = {
  entries: defineSearchEntriesAction("ppt.search.entries", [{ kind: "presentation", title: "演示稿", surface: PPT_PROJECT_PLUGIN_ID }], "演示稿", ["ppt:read"]),
  subject: defineSubjectContextAction("ppt.subject.read", "presentation", "演示稿", ["ppt:read"]),
};

export function pptSearchContent(presentation: PptRecord): string {
  return [presentation.description, ...[...presentation.slides].sort((a, b) => a.order - b.order)
    .map(slide => [slide.title, ...slide.bullets, slide.notes].filter(Boolean).join("\n"))].filter(Boolean).join("\n\n");
}

export function createPptSearchHandlers(withStore: <T>(run: (store: PptStore) => T) => T): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  return [
    bindSearchEntriesHandler(pptSearchActions.entries, caller => withStore(store => store.list(project(caller)).map(presentation => ({
      subject: { kind: "presentation", id: presentation.id }, revision: String(presentation.version), title: presentation.title, summary: searchText(presentation.description, 400),
      updated_at: presentation.updated_at, content: "context" as const, open: { surface: PPT_PROJECT_PLUGIN_ID, id: presentation.id } })))),
    { ...pptSearchActions.subject, handle: (caller, input) => withStore(store => {
      let presentation: PptRecord;
      try { presentation = store.get((input as { subject_id: string }).subject_id, project(caller)); }
      catch (error) {
        if ((error as { code?: string })?.code === "ppt.not_found") throw new ActionError("actions.subject_unavailable", "演示稿已删除");
        throw error;
      }
      return subjectContext({ subject: { kind: "presentation", id: presentation.id }, revision: String(presentation.version), title: presentation.title,
        content: pptSearchContent(presentation), goal_ids: [], session_id: null, open: { surface: PPT_PROJECT_PLUGIN_ID, id: presentation.id } });
    }) },
  ];
}
