import { definePresentationValuesAction, type PresentationDeclaration, type PresentationValues, type PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { PagesSql, PagesSqlValue } from "./store.js";

export const PAGES_SUBJECT_KIND = "pages_document";
export const PAGES_FOLDER_KIND = "pages_folder";

export const pagesPresentation: PresentationDeclaration = {
  objects: [PAGES_SUBJECT_KIND, PAGES_FOLDER_KIND].map(kind => ({ kind,
    fields: [{ key: "title", role: "title" }], forms: { chip: { fields: ["title"] } }, text: { lines: ["title"] } })),
};
export const pagesPresentationValues = definePresentationValuesAction("pages.presentation.values", /* @version action.pages.presentation.values */ 1,
  [PAGES_SUBJECT_KIND, PAGES_FOLDER_KIND], "文档与文件夹名称", ["pages:read"]);

/** One bounded metadata read for both kinds. Never load document bodies just to name a permission target. */
export function readPagesPresentation(db: PagesSql, input: PresentationValuesInput): PresentationValues {
  const selects: string[] = [], parameters: PagesSqlValue[] = [];
  for (const [kind, table, revision] of [[PAGES_SUBJECT_KIND, "pages", "version"], [PAGES_FOLDER_KIND, "folders", "updated_at"]]) {
    const ids = [...new Set(input.subjects.filter(subject => subject.kind === kind).map(subject => subject.id))];
    if (!ids.length) continue;
    selects.push(`SELECT ? AS kind, id, title, ${revision} AS revision FROM ${table} WHERE id IN (${ids.map(() => "?").join(", ")})`);
    parameters.push(kind, ...ids);
  }
  const rows = new Map((selects.length ? db.all(selects.join(" UNION ALL "), parameters) : []).map(row => [JSON.stringify([row.kind, row.id]), row]));
  return { items: input.subjects.map(subject => {
    if (subject.kind !== PAGES_SUBJECT_KIND && subject.kind !== PAGES_FOLDER_KIND) return { subject, revision: "0", state: "forbidden" };
    const row = rows.get(JSON.stringify([subject.kind, subject.id]));
    if (!row) return { subject, revision: "0", state: "deleted" };
    return { subject, revision: String(row.revision), state: "ok", values: input.fields.includes("title") ? { title: row.title } : {} };
  }) };
}
