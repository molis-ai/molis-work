import { showNote } from "./page.js";
import { esc, messageOf } from "./util.js";
import type { JellyPage } from "./types.js";

/** The shared dialog: the page fills it for one view at a time; `version` tells a late answer which view it belongs to. */
export function openGeneric(page: JellyPage, title: string, html: string, ok: string, submit: (() => Promise<unknown>) | null, cleanup?: () => void): void {
  const dialog = page.$<HTMLDialogElement>("[data-jelly-dialog]");
  const hooks = page.dialog;
  hooks.version++;
  // A close event may still be queued when this shared dialog opens its next view.
  const previous = hooks.cleanup;
  hooks.cleanup = null;
  previous?.();
  hooks.submit = submit;
  hooks.cleanup = cleanup ?? null;
  page.$("[data-jelly-dialog-title]").textContent = page.L(title);
  page.$("[data-jelly-dialog-body]").innerHTML = html;
  const button = page.$<HTMLButtonElement>("[data-jelly-dialog-ok]");
  button.textContent = page.L(ok || "jelly.action.confirm");
  button.hidden = !submit;
  button.disabled = false;
  page.$("[data-jelly-dialog-error]").hidden = true;
  if (!dialog.open) dialog.showModal();
}

export const confirmDialog = (page: JellyPage, title: string, message: string, ok = "jelly.action.confirm"): Promise<boolean> => new Promise((resolve) => {
  let answered = false;
  openGeneric(page, title, `<p class="jelly-muted">${esc(message)}</p>`, ok, async () => { answered = true; resolve(true); }, () => { if (!answered) resolve(false); });
});

export function installDialog(page: JellyPage): void {
  const dialog = page.$<HTMLDialogElement>("[data-jelly-dialog]");
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    page.dialog.version++;
    const cleanup = page.dialog.cleanup;
    page.dialog.cleanup = null;
    page.dialog.submit = null;
    cleanup?.();
  });
  page.$("[data-jelly-dialog-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = page.dialog.submit;
    if (!submit) return;
    const version = page.dialog.version;
    const ok = page.$<HTMLButtonElement>("[data-jelly-dialog-ok]");
    ok.disabled = true;
    try {
      const keep = await submit();
      if (keep !== false && page.dialog.version === version) dialog.close();
    } catch (error) {
      if (page.dialog.version !== version) { showNote(page, messageOf(error), true); return; }
      const errorEl = page.$("[data-jelly-dialog-error]");
      errorEl.hidden = false;
      errorEl.textContent = messageOf(error);
    } finally {
      if (page.dialog.version === version) ok.disabled = false;
    }
  });
}
