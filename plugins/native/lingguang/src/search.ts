import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { LINGGUANG_PROJECT_PLUGIN_ID, type LingguangSpark } from "@molis-ai/molis-work-contracts/modules/lingguang";
import type { LingguangStore } from "./store.js";

/** 灵光's part in the system search: sparks that are still kept. A discarded spark is no longer searchable or readable here. */
export const lingguangSearchActions = {
  entries: defineSearchEntriesAction("lingguang.search.entries", [{ kind: "lingguang_spark", title: "灵光", surface: LINGGUANG_PROJECT_PLUGIN_ID }], "灵光", ["lingguang:read"]),
  subject: defineSubjectContextAction("lingguang.subject.read", "lingguang_spark", "灵光", ["lingguang:read"]),
};
/** A spark's version as every reader, result and page names it: a change of text or of status is a new version. */
export const revisionOf = (spark: LingguangSpark) => `${spark.updated_at}:${spark.status}`;

export function createLingguangSearchHandlers(withStore: <T>(run: (store: LingguangStore) => T) => T): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  return [
    bindSearchEntriesHandler(lingguangSearchActions.entries, caller => withStore(store => store.list(project(caller)).map(spark => ({
      subject: { kind: "lingguang_spark", id: spark.id }, revision: revisionOf(spark), title: spark.title || searchText(spark.body, 80), summary: "",
      updated_at: spark.updated_at, content: "context" as const, open: { surface: LINGGUANG_PROJECT_PLUGIN_ID, id: spark.id } })))),
    { ...lingguangSearchActions.subject, handle: (caller, input) => withStore(store => {
      let spark: LingguangSpark;
      try { spark = store.get((input as { subject_id: string }).subject_id, project(caller)); }
      catch (error) {
        if ((error as { code?: string })?.code === "lingguang.not_found") throw new ActionError("lingguang.not_found", "灵光已不存在");
        throw error;
      }
      if (spark.status === "discarded") throw new ActionError("lingguang.not_found", "这条灵光已丢弃");
      return subjectContext({ subject: { kind: "lingguang_spark", id: spark.id }, revision: revisionOf(spark), title: spark.title || searchText(spark.body, 80),
        content: spark.body, goal_ids: [], session_id: null, open: { surface: LINGGUANG_PROJECT_PLUGIN_ID, id: spark.id } });
    }) },
  ];
}
