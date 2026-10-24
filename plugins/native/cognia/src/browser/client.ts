import { installActions } from "./actions.js";
import { closeDialog } from "./dialog.js";
import { messageOf } from "./dom.js";
import { reload } from "./list.js";
import { cogniaPage, fail, q } from "./page.js";
import { installSubmit } from "./submit.js";
import type { CogniaClientHost } from "./types.js";

const SEARCH_DELAY_MS = 220;

/**
 * Cognia's page in the workbench: the library list with its filters and selection, the reader for one material, and the dialog
 * that imports a folder, adds or edits a material, and asks the model. The Host answers every request through the plugin's
 * library routes; the page keeps only what it shows. Built with esbuild into the plugin's client pack (src/client.ts reads
 * the bundle); type-checked by tsconfig.browser.json.
 */
export function cogniaClient(host: CogniaClientHost): void {
  const root = document.querySelector<HTMLElement>("[data-cognia=workbench]");
  if (!root) return;
  const page = cogniaPage(host, root);
  installSubmit(page);
  installActions(page);

  const modelReady = () => void reload(page);
  document.addEventListener("molis-work:model-ready", modelReady);
  host.scope.own(() => { document.removeEventListener("molis-work:model-ready", modelReady); clearTimeout(page.timer); });

  q<HTMLInputElement>(page, "[data-cognia-search]").addEventListener("input", () => {
    clearTimeout(page.timer);
    page.timer = window.setTimeout(() => void reload(page), SEARCH_DELAY_MS);
  });
  page.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    void closeDialog(page).catch((error: unknown) => fail(page, messageOf(error)));
  });
  void reload(page);
}
