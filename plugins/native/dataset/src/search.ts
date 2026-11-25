import { bindFileEntriesHandler, bindSearchEntriesHandler, defineFileContentAction, defineFileEntriesAction, defineSearchEntriesAction, defineSubjectContextAction, fileContentOf, searchText, subjectContext, type ActionHandlerBinding, type FileContentInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { DATASET_PROJECT_PLUGIN_ID, type DatasetRecord } from "./contract.js";
import type { DatasetStore } from "./store.js";
import { datasetErrors } from "./error.js";

const subjectReader = defineSubjectContextAction("dataset.subject.read", /* @version action.dataset.subject.read */ 1, "dataset", "数据表", ["dataset:read"]);

/** Dataset's part in the system search: table name, description, column names and cell text. */
export const datasetSearchActions = {
  entries: defineSearchEntriesAction("dataset.search.entries", /* @version action.dataset.search.entries */ 1, [{ kind: "dataset", title: "数据表", surface: DATASET_PROJECT_PLUGIN_ID, glyph: "database" }], "数据表", ["dataset:read"]),
  subject: { ...subjectReader, action: { ...subjectReader.action, execution: { cost: "none" as const } } },
  /** The side panel's file tab (specs/archive/side-panel): each table as the CSV it would export to. */
  files: defineFileEntriesAction("dataset.files.entries", /* @version action.dataset.files.entries */ 1, [{ kind: "dataset", title: "数据表", surface: DATASET_PROJECT_PLUGIN_ID }], "数据表", ["dataset:read"]),
  fileContent: defineFileContentAction("dataset.files.content", /* @version action.dataset.files.content */ 1, [{ kind: "dataset", title: "数据表", surface: DATASET_PROJECT_PLUGIN_ID }], "数据表", ["dataset:read"]),
};

/** RFC 4180 CSV of the table, columns in their order. */
export function datasetCsv(dataset: DatasetRecord): string {
  const columns = [...dataset.columns].sort((a, b) => a.order - b.order);
  const cell = (value: unknown) => { const text = String(value ?? ""); return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  return [columns.map(column => cell(column.name)).join(","), ...dataset.rows.map(row => columns.map(column => cell(row.cells[column.id])).join(","))].join("\r\n");
}

function datasetSearchContent(dataset: DatasetRecord): string {
  const columns = [...dataset.columns].sort((a, b) => a.order - b.order);
  const rows = dataset.rows.map(row => columns.map(column => row.cells[column.id] ?? "").filter(Boolean).join(" | ")).filter(Boolean);
  return [dataset.description, columns.length ? "列：" + columns.map(column => column.name).join("、") : "", ...rows].filter(Boolean).join("\n");
}

export function createDatasetSearchHandlers(withStore: <T>(run: (store: DatasetStore) => T) => T): ActionHandlerBinding[] {
  return [
    bindSearchEntriesHandler(datasetSearchActions.entries, () => withStore(store => store.list().map(dataset => ({
      subject: { kind: "dataset", id: dataset.id }, revision: String(dataset.version), title: dataset.title, summary: searchText(dataset.description, 400),
      updated_at: dataset.updated_at, content: "context" as const, open: { surface: DATASET_PROJECT_PLUGIN_ID, id: dataset.id } })))),
    bindFileEntriesHandler(datasetSearchActions.files, () => withStore(store => store.list().map(dataset => ({
      subject: { kind: "dataset", id: dataset.id }, revision: String(dataset.version), title: `${dataset.title || "数据表"}.csv`, folder: [],
      media_type: "text/csv", size: null, updated_at: dataset.updated_at, open: { surface: DATASET_PROJECT_PLUGIN_ID, id: dataset.id } })))),
    { ...datasetSearchActions.fileContent, handle: (_caller, input) => withStore(store => {
      const subject = (input as FileContentInput).subject;
      let dataset: DatasetRecord;
      try { dataset = store.get(subject.id); }
      catch { throw datasetErrors.not_found("数据表已删除"); }
      return fileContentOf({ subject, revision: String(dataset.version), title: `${dataset.title || "数据表"}.csv`, media_type: "text/csv", text: datasetCsv(dataset) });
    }) },
    { ...datasetSearchActions.subject, handle: (_caller, input) => withStore(store => {
      let dataset: DatasetRecord;
      try { dataset = store.get((input as { subject_id: string }).subject_id); }
      catch (error) {
        if ((error as { code?: string })?.code === "dataset.not_found") throw datasetErrors.not_found("数据表已删除");
        throw error;
      }
      return subjectContext({ subject: { kind: "dataset", id: dataset.id }, revision: String(dataset.version), title: dataset.title, content: datasetSearchContent(dataset), open: { surface: DATASET_PROJECT_PLUGIN_ID, id: dataset.id } });
    }) },
  ];
}
