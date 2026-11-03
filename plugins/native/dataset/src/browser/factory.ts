import { messageOf } from "./dom.js";
import { installCommands } from "./commands.js";
import { installEditor } from "./editor.js";
import { installEvents } from "./events.js";
import { installFileImport } from "./file-import.js";
import { installList } from "./list.js";
import { createPage } from "./page.js";
import { installStatus } from "./status.js";
import { installTable } from "./table.js";
import type { DatasetHost } from "./types.js";

/** The workbench calls this bundle as `(host) => …`: the build wraps the entry in that function. */
declare const host: DatasetHost;

/** Dataset's page: tables, their columns and rows, CSV, versions. The tables themselves belong to the local host. */
function mountDataset(): void {
  const bench = document.querySelector<HTMLElement>("[data-dataset=workbench]");
  if (!bench) return;
  const page = createPage(host, bench);
  installStatus(page);
  installTable(page);
  installList(page);
  installEditor(page);
  installCommands(page);
  installFileImport(page);
  installEvents(page);
  void page.loadList().catch((error: unknown) => { page.showNote(messageOf(error), true); page.listFailed(error); });
}

mountDataset();
