import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { readText } from "./common.js";

export interface PromptRecordResponse {
  prompt: {
    key: string;
    title: string;
    body: string;
    default_body: string;
    effective: "default" | "user";
    user?: { revision: number } | null;
  };
  editor: {
    editable: string;
    locked_format: string | null;
    required_keys: string[];
    format_intact: boolean;
  };
}

interface PromptEditorHooks {
  onSaved: (next: PromptRecordResponse) => void;
  say: (text: string, tone?: "success" | "danger") => void;
}

const page = globalThis as typeof globalThis & { molisWorkRequest: UiRequest };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

/**
 * Inline simplified prompt editor inside Batch 09's Capability Pack detail pane (PF-A14):
 * ordinary users edit only natural-language guidance while system-owned JSON output contracts
 * stay locked; full-text editing remains reachable behind a collapsible advanced panel with
 * targeted format validation and one-click restore-to-default.
 */
export function mountKitPromptEditor(container: HTMLElement, promptKey: string, hooks: PromptEditorHooks, initialData?: PromptRecordResponse): void {
  const token = String(Date.now()) + ":" + Math.random().toString(16).slice(2);
  container.dataset.kitPromptToken = token;
  if (!initialData) container.replaceChildren(el("p", "kit-note mw-loading", readText("workbench.settings-prompts.loading")));

  const request = (path: string, body?: object): Promise<PromptRecordResponse> =>
    page.molisWorkRequest("/api/agent-definitions" + path, body ? { body } : {}) as Promise<PromptRecordResponse>;

  const render = (data: PromptRecordResponse): void => {
    if (!container.isConnected || container.dataset.kitPromptToken !== token) return;
    container.replaceChildren();
    const { prompt, editor } = data;
    const expectedRevision = prompt.user ? prompt.user.revision : null;

    const form = el("div", "kit-prompt-form");
    form.dataset.kitPromptKey = prompt.key;
    form.append(el("p", "kit-note", readText("workbench.settings-prompts.permission-unchanged-note")));

    const field = el("label", "mw-field");
    field.append(el("span", "mw-field__label", readText("workbench.settings-prompts.guidance-label")));
    const guidance = el("textarea", "mw-textarea kit-prompt-guidance");
    guidance.rows = Math.min(12, Math.max(4, editor.editable.split("\n").length + 1));
    guidance.maxLength = 16000;
    guidance.value = editor.editable;
    guidance.dataset.promptSimplified = "true";
    guidance.setAttribute("aria-label", readText("workbench.settings-prompts.guidance-label"));
    field.append(guidance);
    form.append(field);

    if (editor.locked_format) {
      const lock = el("div", "mw-facts kit-prompt-lock");
      lock.dataset.promptLockedFormat = "true";
      const heading = el("h5", "mw-facts__heading", readText("workbench.settings-prompts.locked-format-title"));
      const row = el("div", "mw-fact-row" + (editor.format_intact ? " mw-fact-row--ok" : " mw-fact-row--warn"));
      const bodySpan = el("span", "mw-fact-row__body");
      bodySpan.textContent = editor.format_intact
        ? readText("workbench.settings-prompts.locked-format-intact")
        : readText("workbench.settings-prompts.locked-format-broken");
      if (editor.required_keys.length) {
        const detail = el("small", "mw-fact-row__detail");
        detail.textContent = readText("workbench.settings-prompts.locked-format-keys", { keys: editor.required_keys.join(readText("common.list.separator")) });
        bodySpan.append(detail);
      }
      row.append(bodySpan);
      lock.append(heading, row);
      form.append(lock);
    }

    const errorEl = el("p", "settings-form-error");
    errorEl.setAttribute("role", "alert");
    errorEl.hidden = true;

    const actions = el("div", "kit-chips");
    const saveBtn = el("button", "mw-btn mw-btn--primary mw-btn--sm", readText("workbench.settings-prompts.save-guidance"));
    saveBtn.type = "button";
    saveBtn.dataset.promptSaveSimplified = "true";
    const resetBtn = el("button", "mw-btn mw-btn--ghost mw-btn--sm", readText("workbench.settings-prompts.restore-default"));
    resetBtn.type = "button";
    resetBtn.dataset.promptReset = "true";
    resetBtn.hidden = prompt.effective !== "user";
    actions.append(saveBtn, resetBtn);
    form.append(actions, errorEl);

    const runAction = async (btn: HTMLButtonElement, work: () => Promise<PromptRecordResponse>, toastKey: string): Promise<void> => {
      btn.disabled = true;
      errorEl.hidden = true;
      try {
        const next = await work();
        render(next);
        hooks.say(readText(toastKey), "success");
        hooks.onSaved(next);
      } catch (cause) {
        page.molisWorkRequest.show(errorEl, cause);
        errorEl.hidden = false;
      } finally {
        btn.disabled = false;
      }
    };

    saveBtn.addEventListener("click", () => {
      if (!guidance.value.trim()) {
        errorEl.textContent = readText("workbench.settings-prompts.prompt-cannot-be-empty-use-restore-default-go");
        errorEl.hidden = false;
        return;
      }
      void runAction(
        saveBtn,
        () => request("/prompt?key=" + encodeURIComponent(prompt.key), {
          mode: "simplified",
          guidance: guidance.value,
          expected_revision: expectedRevision,
        }),
        "workbench.settings-prompts.saved-takes-effect-next-turn",
      );
    });

    resetBtn.addEventListener("click", () => {
      void runAction(
        resetBtn,
        () => request("/prompt/reset?key=" + encodeURIComponent(prompt.key), { expected_revision: expectedRevision }),
        "workbench.settings-prompts.restored-default-toast",
      );
    });

    const adv = el("details", "mw-collapsible kit-prompt-advanced");
    adv.dataset.slot = "collapsible";
    adv.dataset.promptAdvanced = "true";
    if (!editor.format_intact) adv.open = true;
    adv.append(el("summary", "", readText("workbench.settings-prompts.advanced-full-edit")));
    const advBody = el("div", "mw-collapsible__body kit-prompt-advanced-body");
    const fullArea = el("textarea", "mw-textarea");
    fullArea.rows = Math.min(18, Math.max(6, prompt.body.split("\n").length + 1));
    fullArea.maxLength = 20000;
    fullArea.value = prompt.body;
    fullArea.dataset.promptFullText = "true";
    fullArea.setAttribute("aria-label", readText("workbench.settings-prompts.advanced-full-edit"));
    const advActions = el("div", "kit-chips");
    const saveFullBtn = el("button", "mw-btn mw-btn--secondary mw-btn--sm", readText("workbench.settings-prompts.save-full-text"));
    saveFullBtn.type = "button";
    saveFullBtn.dataset.promptSaveFull = "true";
    saveFullBtn.addEventListener("click", () => {
      if (!fullArea.value.trim()) {
        errorEl.textContent = readText("workbench.settings-prompts.prompt-cannot-be-empty-use-restore-default-go");
        errorEl.hidden = false;
        return;
      }
      void runAction(
        saveFullBtn,
        () => request("/prompt?key=" + encodeURIComponent(prompt.key), {
          mode: "full",
          body: fullArea.value,
          validate_format: true,
          expected_revision: expectedRevision,
        }),
        "workbench.settings-prompts.saved-takes-effect-next-turn",
      );
    });
    advActions.append(saveFullBtn);
    advBody.append(fullArea, advActions);
    adv.append(advBody);
    form.append(adv);

    container.append(form);
  };

  if (initialData) {
    render(initialData);
    return;
  }
  void request("/prompt?key=" + encodeURIComponent(promptKey))
    .then(render)
    .catch((cause) => {
      if (!container.isConnected || container.dataset.kitPromptToken !== token) return;
      const err = el("p", "settings-form-error");
      page.molisWorkRequest.show(err, cause);
      container.replaceChildren(err);
    });
}
