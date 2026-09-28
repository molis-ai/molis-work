import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, defineSubjectContextAction, searchText, subjectContext, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { DATASET_PROJECT_PLUGIN_ID, type DatasetRecord } from "@molis-ai/molis-work-contracts/modules/dataset";
import type { DatasetStore } from "./store.js";

/** Dataset's part in the system search: table name, description, column names and cell text. */
export const datasetSearchActions = {
  entries: defineSearchEntriesAction("dataset.search.entries", [{ kind: "dataset", title: "数据表", surface: DATASET_PROJECT_PLUGIN_ID }], "数据表", ["dataset:read"]),
  subject: defineSubjectContextAction("dataset.subject.read", "dataset", "数据表", ["dataset:read"]),
};

export function datasetSearchContent(dataset: DatasetRecord): string {
  const columns = [...dataset.columns].sort((a, b) => a.order - b.order);
  const rows = dataset.rows.map(row => columns.map(column => row.cells[column.id] ?? "").filter(Boolean).join(" | ")).filter(Boolean);
  return [dataset.description, columns.length ? "列：" + columns.map(column => column.name).join("、") : "", ...rows].filter(Boolean).join("\n");
}

export function createDatasetSearchHandlers(withStore: <T>(run: (store: DatasetStore) => T) => T): ActionHandlerBinding[] {
  const project = (caller: ActionCallContext) => { if (!caller.project_id) throw new ActionError("actions.project_required", "请选择项目"); return caller.project_id; };
  return [
    bindSearchEntriesHandler(datasetSearchActions.entries, caller => withStore(store => store.list(project(caller)).map(dataset => ({
      subject: { kind: "dataset", id: dataset.id }, revision: String(dataset.version), title: dataset.title, summary: searchText(dataset.description, 400),
      updated_at: dataset.updated_at, content: "context" as const, open: { surface: DATASET_PROJECT_PLUGIN_ID, id: dataset.id } })))),
    { ...datasetSearchActions.subject, handle: (caller, input) => withStore(store => {
      let dataset: DatasetRecord;
      try { dataset = store.get((input as { subject_id: string }).subject_id, project(caller)); }
      catch (error) {
        if ((error as { code?: string })?.code === "dataset.not_found") throw new ActionError("actions.subject_unavailable", "数据表已删除");
        throw error;
      }
      return subjectContext({ subject: { kind: "dataset", id: dataset.id }, revision: String(dataset.version), title: dataset.title, content: datasetSearchContent(dataset), goal_ids: [], session_id: null });
    }) },
  ];
}
