import type { UiPageDialogs } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameScope, Translate } from "./types.js";

/** Ordinary dialogs stay inside the page. Host confirmations additionally require a real submission while visible. */
export function pageDialogs(scope: FrameScope, L: Translate, trusted = false): UiPageDialogs {
  let pending: Promise<unknown> = Promise.resolve();
  const show = (message: string, initial?: string): Promise<string | boolean | null> => {
    const result = pending.then(() => new Promise<string | boolean | null>(resolve => {
      if (!scope.alive || trusted && !scope.visible) { resolve(null); return; }
      const focus = document.activeElement;
      const dialog = document.createElement("dialog"), form = document.createElement("form"), header = document.createElement("header");
      dialog.className = "mw-dialog mw-dialog--alert"; dialog.dataset.pageDialog = initial === undefined ? "confirm" : "prompt";
      form.className = "mw-form mw-dialog__shell"; header.className = "mw-form__header";
      const title = document.createElement("h2"); title.id = "page-dialog-" + crypto.randomUUID(); title.textContent = message;
      dialog.setAttribute("aria-labelledby", title.id); header.append(title);
      const body = document.createElement("div"), footer = document.createElement("footer");
      body.className = "mw-form__body"; footer.className = "mw-form__footer";
      const input = initial === undefined ? null : document.createElement("input");
      if (input) { input.className = "mw-input"; input.value = initial ?? ""; input.setAttribute("aria-labelledby", title.id); body.append(input); }
      else body.hidden = true;
      const cancel = document.createElement("button"), accept = document.createElement("button");
      cancel.type = "button"; cancel.className = "mw-btn mw-btn--ghost"; cancel.textContent = L("取消");
      accept.type = "submit"; accept.className = "mw-btn mw-btn--primary"; accept.textContent = L("确定");
      let finished = false;
      const finish = (value: string | boolean | null) => {
        if (finished) return; finished = true;
        dialog.close(); dialog.remove(); dispose(); visibility?.();
        if (focus instanceof HTMLElement && focus.isConnected) focus.focus();
        resolve(value);
      };
      const dispose = scope.own(() => finish(null));
      const visibility = trusted ? scope.whenVisible(() => () => finish(null)) : undefined;
      cancel.addEventListener("click", () => finish(null));
      dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
      let trustedClick = false;
      accept.addEventListener("click", event => { trustedClick = event.isTrusted; });
      form.addEventListener("submit", event => {
        event.preventDefault(); const accepted = !trusted || trustedClick && event.isTrusted && scope.visible; trustedClick = false;
        if (accepted) finish(input ? input.value : true);
      });
      footer.append(cancel, accept); form.append(header, body, footer); dialog.append(form); document.body.append(dialog);
      dialog.showModal(); if (input) { input.focus(); input.select(); } else cancel.focus();
    }));
    pending = result; return result;
  };
  return { confirm: async message => await show(message) === true,
    prompt: async (message, initial = "") => { const value = await show(message, initial); return typeof value === "string" ? value : null; } };
}
