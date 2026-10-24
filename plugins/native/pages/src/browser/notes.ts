import { required, said } from "./dom.js";
import type { PagesPage } from "./page.js";

/** The line under the editor: what is wrong or pending, or nothing. */
export function showNote(page: PagesPage, text: string, isError?: boolean) {
  const { note, L } = page;
  if (!note) return;
  if (!text && page.sel?.publication_pending) text = L("pages.note.publication-pending");
  // While the open body cannot be shown, clearing other notes leaves this one: the page is read-only for that reason.
  if (!text && page.unshowable) { text = L("pages.note.unshowable"); isError = true; }
  note.hidden = !text;
  note.textContent = text || "";
  note.classList.toggle("is-error", Boolean(isError && text));
}

/** Says a failure on the note line, in its own words or the fallback. */
export function noteFailure(page: PagesPage, error: unknown, fallback: string) {
  showNote(page, said(error, fallback), true);
}

/** The shared box (host.confirmBox): with a run function the request goes out inside it and a refusal is said there. */
export function ask(page: PagesPage, message: string, okLabel: string, run?: () => Promise<unknown>): Promise<boolean> {
  const { confirmDialog } = page;
  if (!confirmDialog) return Promise.resolve(false);
  const ok = required(confirmDialog, "[data-confirm-ok]");
  required(confirmDialog, "[data-confirm-text]").textContent = message; ok.textContent = okLabel;
  return page.host.confirmBox(confirmDialog, ok, run);
}

/** Asks for a name; the answer is saved inside the dialog by `save`, whose refusal is said there. Null when it was cancelled. */
export function askName(page: PagesPage, message: string, initial: string, save: (name: string) => Promise<unknown>): Promise<string | null> {
  return new Promise((resolve) => {
    const { nameDialog } = page;
    if (!nameDialog) { resolve(null); return; }
    const input = required<HTMLInputElement>(nameDialog, "[data-name-input]"), ok = required<HTMLButtonElement>(nameDialog, "[data-name-ok]"), bad = required(nameDialog, "[data-name-error]");
    required(nameDialog, "[data-name-label]").textContent = message; input.value = initial || ""; bad.hidden = true; nameDialog.returnValue = "cancel"; let busy = false;
    nameDialog.onclose = () => { nameDialog.onclose = nameDialog.oncancel = null; resolve(nameDialog.returnValue === "ok" ? input.value : null); };
    nameDialog.oncancel = (event) => { if (busy) event.preventDefault(); };
    required(nameDialog, "[data-name-cancel]").onclick = () => { if (!busy) nameDialog.close("cancel"); };
    required<HTMLFormElement>(nameDialog, "form").onsubmit = async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true; bad.hidden = true; ok.setAttribute("data-loading", ""); ok.insertAdjacentHTML("afterbegin", '<span class="mw-spinner" aria-hidden="true"></span>');
      try { await save(input.value); nameDialog.close("ok"); } catch (error) { bad.textContent = said(error, ""); bad.hidden = false; input.focus(); }
      finally { busy = false; ok.removeAttribute("data-loading"); ok.querySelector(".mw-spinner")?.remove(); }
    };
    nameDialog.showModal(); input.focus(); input.select();
  });
}
