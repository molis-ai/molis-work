import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { FORM_PROJECT_PLUGIN_ID, type FormRecord } from "@molis-ai/molis-work-contracts/modules/form";
import type { FormStore } from "./store.js";

/**
 * Form's part in the system search: the questionnaire itself (title, description, questions and options).
 * Answers belong to the people who filled them in and stay in Form's results.
 */
export const formSearchActions = {
  entries: defineSearchEntriesAction("form.search.entries", [{ kind: "form", title: "问卷", surface: FORM_PROJECT_PLUGIN_ID }], "问卷", ["form:read"]),
  subject: defineSubjectContextAction("form.subject.read", "form", "问卷", ["form:read"]),
};

export function formSearchContent(form: FormRecord): string {
  return [form.description, ...form.questions.map(question => [question.title, ...(question.options ?? []).map(option => option.label)].filter(Boolean).join("\n"))]
    .filter(Boolean).join("\n\n");
}

export function createFormSearchHandlers(withStore: <T>(run: (store: FormStore) => T) => T): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  return [
    bindSearchEntriesHandler(formSearchActions.entries, caller => withStore(store => store.list(project(caller)).map(form => ({
      subject: { kind: "form", id: form.id }, revision: String(form.version), title: form.title, summary: searchText(form.description, 400),
      updated_at: form.updated_at, content: "context" as const, open: { surface: FORM_PROJECT_PLUGIN_ID, id: form.id } })))),
    { ...formSearchActions.subject, handle: (caller, input) => withStore(store => {
      const id = (input as { subject_id: string }).subject_id;
      let form: FormRecord;
      try { form = store.get(id, project(caller)); }
      catch (error) {
        if (error && typeof error === "object" && (error as { code?: string }).code === "form.not_found") throw new ActionError("form.not_found", "问卷已删除");
        throw error;
      }
      return subjectContext({ subject: { kind: "form", id: form.id }, revision: String(form.version), title: form.title, content: formSearchContent(form), goal_ids: [], session_id: null, open: { surface: FORM_PROJECT_PLUGIN_ID, id: form.id } });
    }) },
  ];
}
