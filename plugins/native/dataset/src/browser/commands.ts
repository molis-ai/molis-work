import { messageOf } from "./dom.js";
import * as record from "./record-commands.js";
import * as grid from "./table-commands.js";
import type { Dataset, DatasetPage, Failure } from "./types.js";

type Run = (page: DatasetPage, found: HTMLElement, open: Dataset | null, button: HTMLButtonElement) => void | Promise<void>;

/** One thing a click can mean: how to find its control from the click, and what to do. `needsOpen` ones wait for a table in the editor. */
interface Command {
  find(target: Element, button: HTMLButtonElement): HTMLElement | null;
  needsOpen: boolean;
  run: Run;
}

const at = (selector: string) => (target: Element) => target.closest<HTMLElement>(selector);
const always = (selector: string, run: Run): Command => ({ find: at(selector), needsOpen: false, run });
const withOpen = (selector: string, run: (page: DatasetPage, found: HTMLElement, open: Dataset, button: HTMLButtonElement) => void | Promise<void>): Command =>
  ({ find: at(selector), needsOpen: true, run: (page, found, open, button) => (open ? run(page, found, open, button) : undefined) });

/** In the order they are looked for: the first control the click is inside (and that can be used now) is the command. */
const COMMANDS: readonly Command[] = [
  { find: (_target, button) => button.closest<HTMLElement>("[data-dataset-reload]"), needsOpen: true, run: (page) => record.reload(page) },
  always("[data-dataset-new]", (page) => record.createTable(page)),
  always("[data-dataset-artifact]", (page, found) => record.pinFixed(page, found.dataset.datasetArtifact || "")),
  always("[data-dataset-id]", (page, found) => record.openTable(page, found.dataset.datasetId ?? "")),
  always("[data-dataset-back]", (page) => record.backToList(page)),
  withOpen("[data-dataset-add-column]", (page, _found, open) => grid.addColumn(page, open)),
  withOpen("[data-dataset-add-row]", (page, _found, open) => grid.addRow(page, open)),
  withOpen("[data-dataset-paste-open]", (page) => grid.openPaste(page)),
  withOpen("[data-column-remove]", (page, found, open) => grid.removeColumn(page, open, found)),
  withOpen("[data-row-remove]", (page, found, open) => grid.removeRow(page, open, found)),
  withOpen("[data-dataset-generate], [data-dataset-generate-ai]", (page, _found, _open, button) => record.generateColumn(page, button.matches("[data-dataset-generate-ai]"))),
  withOpen("[data-dataset-import]", (page) => record.importPasted(page)),
  withOpen("[data-dataset-import-file]", (page) => record.chooseImportFile(page)),
  withOpen("[data-dataset-export-csv]", (page) => record.exportCsv(page)),
  withOpen("[data-dataset-export-json]", (page) => record.exportJson(page)),
  withOpen("[data-dataset-snapshot]", (page) => record.saveVersion(page)),
  withOpen("[data-dataset-rollback]", (page, found) => record.rollBack(page, found.closest<HTMLElement>("[data-version-id]")?.dataset.versionId)),
  withOpen("[data-dataset-delete]", (page) => record.deleteTable(page)),
];

/** Runs the command a click means, holding the editor busy for its whole length. */
async function onClick(page: DatasetPage, event: Event): Promise<void> {
  const { L, s } = page;
  const target = event.target as Element;
  const button = target.closest("button");
  if (!button || button.closest("dialog") || button.disabled || s.busy) return;
  page.setBusy(true);
  try {
    for (const command of COMMANDS) {
      const found = command.find(target, button);
      if (!found || (command.needsOpen && !s.selected)) continue;
      await command.run(page, found, s.selected, button);
      return;
    }
  } catch (error) {
    if ((error as Failure).code === "dataset.conflict") s.saveError = error;
    page.showNote(messageOf(error) || L("dataset.error.request"), true);
  } finally {
    page.setBusy(false);
  }
}

/** The page's own controls: clicks, typing in the table and changing a column's type. */
export function installCommands(page: DatasetPage): void {
  const { el, s } = page;
  const { bench } = el;
  bench.addEventListener("click", (event) => void onClick(page, event));
  bench.addEventListener("input", (event) => {
    if (s.busy) return;
    const target = event.target as Element;
    if (target === el.filterInput && s.selected) {
      s.selected = { ...s.selected, ...page.readDraft() };
      page.renderTable(s.selected);
      return;
    }
    if (target.closest("[data-dataset-csv], [data-dataset-ai-prompt], [data-dataset-version-note], [data-dataset-filter], [data-dataset-column-name], [data-dataset-column-type]")) return;
    if (target.closest(".dataset-workspace")) page.queueSave();
  });
  bench.addEventListener("change", (event) => {
    if (s.busy || !s.selected || !(event.target as Element).closest("[data-column-type]")) return;
    s.selected = { ...s.selected, ...page.readDraft() };
    page.renderTable(s.selected);
    page.queueSave();
  });
}
