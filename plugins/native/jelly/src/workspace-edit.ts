import type { JellyItem, JellyNote, JellySeries, JellyWorkspace } from "./contract.js";
import {
  uniqueJellyIds, validateJellyCalendarIds, validateJellyCategories, validateJellyItem,
  validateJellyRelations, validateJellySeries, validateJellyTaskLinks,
} from "./calendar-validation.js";
import { validateJellyNote } from "./content-validation.js";
import { jellyAssert, jellyErrors } from "./error.js";

/** The write set of one edit on a privately owned workspace decoded and checked by the store. */
export class JellyWorkspaceEdit {
  readonly notes = new Set<JellyNote>();
  readonly items = new Set<JellyItem>();
  readonly series = new Set<JellySeries>();
  categories = false;
  relations = false;
  taskLinks = false;
}

export function validateJellyEdit(state: JellyWorkspace, edit: JellyWorkspaceEdit): void {
  if (edit.notes.size) uniqueJellyIds(state.notes, "笔记");
  if (edit.items.size || edit.series.size) validateJellyCalendarIds(state);
  const categories = new Set(state.categories.map(category => category.id));
  const changed = {
    categories: edit.categories ? state.categories : undefined,
    notes: [...edit.notes], items: [...edit.items], series: [...edit.series],
  };
  const validate = (rows: typeof changed): void => {
    if (rows.categories) validateJellyCategories(rows.categories);
    for (const item of rows.items) validateJellyItem(item, categories);
    for (const series of rows.series) validateJellySeries(series, categories);
    for (const note of rows.notes) {
      jellyAssert(categories.has(note.category_id), "笔记无效");
      validateJellyNote(note, categories);
    }
  };
  validate(changed);
  if (edit.relations) validateJellyRelations(state);
  if (edit.taskLinks) validateJellyTaskLinks(state);
  // The workspace was decoded from JSON and commands are cloned before editing it.
  // Only edited records can introduce values whose shape changes when serialized.
  const body = JSON.stringify(changed);
  try { validate(JSON.parse(body)); }
  catch (error) { throw jellyErrors.corrupt(`Jelly 数据无效，已保留原库：${error instanceof Error ? error.message : "无法读取"}`); }
}
