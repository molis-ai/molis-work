import type { FrameScope, Translate } from "./types.js";

/** What a plugin page gives the shared box: its own `<dialog>` with a form, and the button that confirms. */
export type ConfirmBox = (dialog: HTMLDialogElement, ok: HTMLElement, run?: () => Promise<unknown>) => Promise<boolean>;

/**
 * The one confirmation box of the plugin pages (VUX-29). The page fills its text and names the confirming button; with `run`, the
 * request goes out while the box stays open: the button is busy and a second press is swallowed, Esc and the cancel button wait
 * (they would only pretend to cancel what is on its way), a refusal is said inside the box and leaves it open for another try
 * or a cancel, and only success closes it. Without `run` it is a plain yes/no. Resolves true only after a confirmed (and, with
 * `run`, successful) press; closing the frame answers false.
 */
export function pageConfirmBox(scope: FrameScope, L: Translate): ConfirmBox {
  return (dialog, ok, run) => new Promise<boolean>(resolve => {
    const form = dialog.querySelector("form");
    if (dialog.open || !scope.alive || !form) { resolve(false); return; }
    const accepted = ok.getAttribute("value") ?? "ok", ending = new AbortController(), { signal } = ending;
    const bad = form.querySelector<HTMLElement>(".mw-field__error") ?? form.insertBefore(Object.assign(document.createElement("div"),
      { className: "mw-field__error", role: "alert" }), ok.parentElement === form ? ok : ok.parentElement);
    bad.hidden = true;
    let busy = false;
    const release = scope.own(() => resolve(false));
    const working = (on: boolean) => {
      busy = on; ok.toggleAttribute("data-loading", on); form.setAttribute("aria-busy", String(on));
      if (on) ok.insertAdjacentHTML("afterbegin", '<span class="mw-spinner" aria-hidden="true"></span>'); else ok.querySelector(".mw-spinner")?.remove();
    };
    dialog.returnValue = "cancel";
    dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); }, { signal });
    // The answer first: releasing the frame's hold on this box would answer false.
    dialog.addEventListener("close", () => { resolve(dialog.returnValue === accepted); ending.abort(); release(); working(false); }, { signal });
    // Every way of pressing a button of the form passes here: a click, Enter, Space.
    form.addEventListener("submit", async event => {
      if (busy) { event.preventDefault(); return; }
      if (!run || event.submitter !== ok) return;
      event.preventDefault(); bad.hidden = true; working(true);
      try { await run(); if (scope.alive) dialog.close(accepted); }
      catch (error) {
        if (signal.aborted) return;
        bad.textContent = error instanceof Error && error.message ? error.message : L("操作失败");
        bad.hidden = false; ok.focus();
      } finally { if (!signal.aborted) working(false); }
    }, { signal });
    dialog.showModal();
  });
}
