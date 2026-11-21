import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiConfirmOptions, UiPageDialogs } from "@molis-ai/molis-work-contracts/platform/ui";
import type { FrameScope, Translate } from "./types.js";

/** Ordinary dialogs stay inside the page. Host confirmations additionally require a real submission while visible. */
export function pageDialogs(scope: FrameScope, _L: Translate, trusted = false): UiPageDialogs {
  let pending: Promise<unknown> = Promise.resolve();
  const show = (input: string | UiConfirmOptions, initial?: string): Promise<string | boolean | null> => {
    const options: UiConfirmOptions = typeof input === "string" ? { title: input } : input;
    const result = pending.then(() => new Promise<string | boolean | null>(resolve => {
      if (!scope.alive || trusted && !scope.visible) {
        resolve(null);
        return;
      }
      const focus = document.activeElement;
      const dialog = document.createElement("dialog");
      const form = document.createElement("form");
      const header = document.createElement("header");
      dialog.className = "mw-dialog mw-dialog--alert";
      dialog.dataset.pageDialog = initial === undefined ? "confirm" : "prompt";
      if (options.tone === "danger") {
        dialog.dataset.tone = "danger";
      }
      form.className = "mw-form mw-dialog__shell";
      header.className = "mw-form__header";
      const title = document.createElement("h2");
      title.id = "page-dialog-" + crypto.randomUUID();
      title.textContent = options.title;
      dialog.setAttribute("aria-labelledby", title.id);
      header.append(title);
      const body = document.createElement("div");
      const footer = document.createElement("footer");
      body.className = "mw-form__body";
      footer.className = "mw-form__footer";
      const inputEl = initial === undefined ? null : document.createElement("input");
      if (options.body) {
        const copy = document.createElement("p");
        copy.textContent = options.body;
        body.append(copy);
      }
      if (inputEl) {
        inputEl.className = "mw-input";
        inputEl.value = initial ?? "";
        inputEl.setAttribute("aria-labelledby", title.id);
        body.append(inputEl);
      }
      if (!options.body && !inputEl) {
        body.hidden = true;
      }
      const cancel = document.createElement("button");
      const accept = document.createElement("button");
      cancel.type = "button";
      cancel.className = "mw-btn mw-btn--ghost";
      cancel.textContent = options.cancelLabel ?? uiText.text("common.control.cancel");
      accept.type = "submit";
      accept.className = options.tone === "danger" ? "mw-btn mw-btn--danger" : "mw-btn mw-btn--primary";
      accept.textContent = options.confirmLabel ?? uiText.text("common.control.confirm");
      let finished = false;
      const finish = (value: string | boolean | null) => {
        if (finished) {
          return;
        }
        finished = true;
        dialog.close();
        dialog.remove();
        dispose();
        visibility?.();
        if (focus instanceof HTMLElement && focus.isConnected) {
          focus.focus();
        }
        resolve(value);
      };
      const dispose = scope.own(() => finish(null));
      const visibility = trusted ? scope.whenVisible(() => () => finish(null)) : undefined;
      cancel.addEventListener("click", () => finish(null));
      dialog.addEventListener("cancel", event => {
        event.preventDefault();
        finish(null);
      });
      let trustedClick = false;
      accept.addEventListener("click", event => {
        trustedClick = event.isTrusted;
      });
      form.addEventListener("submit", event => {
        event.preventDefault();
        const accepted = !trusted || trustedClick && event.isTrusted && scope.visible;
        trustedClick = false;
        if (accepted) {
          finish(inputEl ? inputEl.value : true);
        }
      });
      footer.append(cancel, accept);
      form.append(header, body, footer);
      dialog.append(form);
      document.body.append(dialog);
      dialog.showModal();
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      } else {
        cancel.focus();
      }
    }));
    pending = result;
    return result;
  };
  return {
    confirm: async message => await show(message) === true,
    prompt: async (message, initial = "") => {
      const value = await show(message, initial);
      return typeof value === "string" ? value : null;
    },
  };
}
