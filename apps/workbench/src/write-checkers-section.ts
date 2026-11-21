import { t as uiText, escapeHtml, renderButton, renderField, renderInput, renderSettingRow, renderSettingsSection } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderAlertDialog, renderDialog } from "@molis-ai/molis-work-design-system";

type Say = (text: string) => string;

/**
 * The after-write checkers below the workspaces (specs/prologue-adoption §6.0p.13): the host writes every sentence of this part of
 * the page, in the page's language, so the page program (src/browser/write-checkers.ts) carries none. What it shows more than once
 * is a `<template>` with `{name}` slots: it clones one and fills the slots with `textContent`, and a part that only applies
 * sometimes has `data-if`. The two dialogs are the catalog's own (`renderDialog`, `renderAlertDialog`); deleting asks in the
 * alert dialog, never the browser's `confirm()`.
 */
export function renderWriteCheckersSection(_L: Say): string {
  // Short sentences the program says about the whole part: reading, saved, nothing to show, stale, and the dialog titles.
  const say = JSON.stringify({
    loading: uiText.text("workbench.write-checkers-section.loading-after-write-checkers"), saved: uiText.text("workbench.write-checkers-section.after-write-checkers-saved"), none: uiText.text("workbench.write-checkers-section.link-folder-above-then-add-after-write-checks"),
    stale: uiText.text("workbench.write-checkers-section.these-checkers-were-changed-elsewhere-have-been-reloaded"), failed: uiText.text("workbench.write-checkers-section.after-write-checker-operation-failed"), gone: uiText.text("workbench.write-checkers-section.folder-no-longer-authorized"),
    add: uiText.text("workbench.write-checkers-section.add-checker"), edit: uiText.text("workbench.write-checkers-section.edit-checker"),
  });
  // A button of a group or a row: the visible word, and the name it is read out with (its checker or folder, by the slot).
  const act = (name: string, label: string, named: string, kind = "secondary", only = "") =>
    `<button class="mw-btn mw-btn--${kind}" type="button" data-act="${name}"${only} aria-label="${escapeHtml(named)}">${label}</button>`;
  const field = (label: string, hint: string | undefined, options: Parameters<typeof renderInput>[0]) => renderField({ label, hint, control: renderInput(options) });
  const cancel = (more: Record<string, boolean> = {}) => renderButton({ variant: "secondary", size: "md", label: uiText.text("common.control.cancel"), attrs: { "data-dialog-close": true, ...more } });
  const text = { autocomplete: "off", spellcheck: "false" };

  const group = `<template data-wc="group"><div>
      ${renderSettingRow({ name: "{folder}", nameAttrs: { role: "heading", "aria-level": 3 }, detail: `<span data-if="saved">${uiText("workbench.write-checkers-section.version-version")}</span><span data-if="unsaved">${uiText("workbench.write-checkers-section.not-saved-yet")}</span>`,
        control: act("add", uiText.text("workbench.write-checkers-section.add-checker"), uiText.text("workbench.write-checkers-section.add-checker-folder")) })}
      <p class="mw-field__hint" data-if="empty">${uiText("workbench.write-checkers-section.folder-has-no-after-write-checkers-configured-yet")}</p>
    </div></template>`;
  const row = `<template data-wc="row">${renderSettingRow({ name: "{name}", detail: `<code>{command}</code><span>${uiText("workbench.write-checkers-section.extensions-folder-cwd-seconds-s-limit")}</span>`,
      control: `${act("edit", uiText.text("workbench.write-checkers-section.change"), uiText.text("workbench.write-checkers-section.edit-name"))}${act("up", uiText.text("workbench.write-checkers-section.move-up"), uiText.text("workbench.write-checkers-section.move-name-up"), "secondary", ' data-if="movable"')}${act("remove", uiText.text("common.control.delete"), uiText.text("workbench.write-checkers-section.delete-name"), "danger-outline")}` })}</template>`;
  const remove = `<template data-wc="remove">${renderAlertDialog({
    labelledBy: "write-checkers-remove-title", title: uiText.text("workbench.write-checkers-section.delete-checker-name"), closeLabel: uiText.text("common.control.close"),
    body: `<p>${escapeHtml(uiText.text("workbench.write-checkers-section.after-written-files-no-longer-checked"))}</p>`,
    footer: `${cancel({ autofocus: true })}${renderButton({ variant: "danger", size: "md", type: "submit", label: uiText.text("common.control.delete"), attrs: { value: "remove" } })}`,
  })}</template>`;
  const editor = renderDialog({
    labelledBy: "write-checkers-title", title: uiText.text("workbench.write-checkers-section.add-checker"), closeLabel: uiText.text("common.control.close"), className: "mw-dialog--form", attrs: { "data-wc": "dialog" },
    body: [
      field(uiText.text("workbench.write-checkers-section.name"), undefined, { name: "display_name", required: true, attrs: { maxlength: 80, autocomplete: "off", autofocus: true } }),
      field(uiText.text("workbench.write-checkers-section.program"), uiText.text("workbench.write-checkers-section.program-name-only-without-path"), { name: "executable", required: true, placeholder: "node", attrs: { maxlength: 255, ...text } }),
      field(uiText.text("workbench.write-checkers-section.arguments"), uiText.text("workbench.write-checkers-section.separate-spaces-quote-arguments-containing-spaces-inside-quotes"), { name: "args", required: true, placeholder: "--check {file}", attrs: text }),
      field(uiText.text("workbench.write-checkers-section.file-extensions"), uiText.text("workbench.write-checkers-section.separate-spaces-commas"), { name: "applies_to", required: true, placeholder: ".js .mjs", attrs: text }),
      field(uiText.text("workbench.write-checkers-section.run-folder"), uiText.text("workbench.write-checkers-section.path-relative-workspace-root-leave-empty-root"), { name: "cwd", placeholder: ".", attrs: text }),
      field(uiText.text("workbench.write-checkers-section.time-limit-seconds"), uiText.text("workbench.write-checkers-section.value-1-60-seconds-leave-empty-30"), { name: "timeout_seconds", type: "number", placeholder: "30", attrs: { min: 1, max: 60, step: "0.001" } }),
    ].join(""),
    footer: `<p class="form-error" data-wc="error" role="alert" hidden></p>${cancel()}${renderButton({ variant: "primary", size: "md", type: "submit", label: uiText.text("common.control.save") })}`,
  });
  // The dialog and the templates come first, so the status line stays the card's last child and the card's edge closes it.
  return renderSettingsSection({
    title: uiText.text("workbench.write-checkers-section.after-write-checks"), className: "settings-section", attrs: { "data-say": say, "data-write-checkers": true },
    body: `${editor}${group}${row}${remove}<p class="mw-settings-section__note">${uiText("workbench.write-checkers-section.after-agent-writes-file-first-checker-here-that")}</p><div data-wc="list"></div><p data-wc="status" role="status" aria-live="polite"></p>`,
  });
}
