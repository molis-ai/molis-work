import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type {
  SettingsPageModel,
  UiContribution,
  UiContributionDeclaration,
  UiRenderRequest,
} from "@molis-ai/molis-work-contracts/platform/ui";
import type {
  ShelfAiStatus,
  ShelfCustomRuntime,
  ShelfDeviceSettings,
  ShelfHotKeyChord,
  ShelfHotKeySlot,
  ShelfItemKind,
  ShelfPanelKeySlot,
  ShelfRuntimeStatus,
  ShelfSnapshot,
} from "@molis-ai/molis-work-module-shelf/contract";
import {
  SHELF_RECIPES,
  chordLabel,
  chordsEqual,
  defaultHotKey,
  defaultPanelKey,
  panelKeyLabel,
  panelKeysEqual,
  shortcutIdFromSlot,
} from "@molis-ai/molis-work-module-shelf";
import { SHELF_GLYPH } from "./glyphs.js";
import { shelfRecipeText } from "./recipe-text.js";
import type { ShelfUiPrimitives } from "./ui.js";

export const SHELF_SETTINGS_UI_CONTRIBUTION_ID = "io.molis.work.native.shelf.settings.v1";

export interface ShelfSettingsUiModel {
  readonly settings: ShelfDeviceSettings;
  readonly runtime?: ShelfRuntimeStatus;
  readonly ai?: ShelfAiStatus;
  readonly storage_path?: string;
  readonly primitives: ShelfUiPrimitives;
}

export const shelfSettingsUiDescriptor: UiContributionDeclaration = {
  contribution_id: SHELF_SETTINGS_UI_CONTRIBUTION_ID,
  kind: "settings-page",
  navigation_id: "shelf",
  label: "Shelf",
  surfaces: [
    { surface_id: "settings", target_slot_id: "workbench.settings", format: "declarative-html" },
  ],
  slots: [],
};

/** The page is drawn from the answer of the `settings_data` action its Manifest view declares (`shelf.snapshot`). */
export const shelfSettingsUiContribution: UiContribution<SettingsPageModel<ShelfSnapshot>> = {
  descriptor: shelfSettingsUiDescriptor,
  render(request: UiRenderRequest<SettingsPageModel<ShelfSnapshot>>): string {
    if (request.surface !== "settings") {
      throw new Error(`Shelf settings surface ${request.surface} 不存在`);
    }
    const { data, primitives } = request.model;
    if (!data) throw new Error("Shelf 设置页缺少 settings_data 的结果");
    return renderShelfSettings({ settings: data.settings, runtime: data.runtime, ai: data.ai, storage_path: data.root, primitives });
  },
};

/** DropAgent's settings sections: by purpose, not by data shape. */
const SECTIONS = [
  { id: "setup", title: "shelf.settings-ui.section-setup", tone: "slate", glyph: SHELF_GLYPH.shield, detail: "shelf.settings-ui.section-setup-detail" },
  { id: "actions", title: "shelf.settings-ui.section-actions", tone: "ochre", glyph: SHELF_GLYPH.bolt, detail: "shelf.settings-ui.section-actions-detail" },
  { id: "shortcuts", title: "shelf.settings-ui.section-shortcuts", tone: "ochre", glyph: SHELF_GLYPH.keyboard, detail: "shelf.settings-ui.section-shortcuts-detail" },
  { id: "guide", title: "shelf.settings-ui.section-guide", tone: "slate", glyph: SHELF_GLYPH.book, detail: "shelf.settings-ui.section-guide-detail" },
  { id: "machine", title: "shelf.settings-ui.section-machine", tone: "blue", glyph: SHELF_GLYPH.terminal, detail: "shelf.settings-ui.section-machine-detail" },
  { id: "appearance", title: "shelf.settings-ui.section-appearance", tone: "plum", glyph: SHELF_GLYPH.sun, detail: "shelf.settings-ui.section-appearance-detail" },
] as const;

const KIND_LABELS: readonly { kind: ShelfItemKind; label: string }[] = [
  { kind: "pdf", label: "shelf.settings-ui.kind-pdf" },
  { kind: "image", label: "shelf.composer.images" },
  { kind: "markdown", label: "shelf.settings-ui.kind-markdown" },
  { kind: "text", label: "shelf.composer.text" },
  { kind: "website", label: "shelf.composer.web-page" },
  { kind: "url", label: "shelf.composer.link" },
  { kind: "file", label: "shelf.composer.other-files" },
  { kind: "folder", label: "shelf.composer.folder" },
];

export function renderShelfSettings(model: ShelfSettingsUiModel): string {
  return `<section class="settings-document shelf-settings-document" data-shelf="settings" data-shelf-settings data-settings-panel="shelf" aria-labelledby="shelf-settings-title">
    <header class="settings-heading">
      <div class="settings-heading-title">
        <h1 id="shelf-settings-title">Shelf</h1>
      </div>
      <p>${uiText("shelf.settings-ui.these-settings-only-change-how-shelf-works-device")}</p>
    </header>
    <div class="shelf-settings-body">
      ${SECTIONS.map((section) => `<section class="settings-section" data-shelf-settings-pane="${section.id}" aria-labelledby="shelf-settings-${section.id}">
          <h2 id="shelf-settings-${section.id}"><span class="shelf-glyph tone-${section.tone}" aria-hidden="true">${section.glyph}</span>${uiText(section.title)}</h2>
          <p class="shelf-settings-detail">${uiText(section.detail)}</p>
          ${paneBody(section.id, model)}
        </section>`).join("")}
    </div>
  </section>`;
}

function paneBody(id: (typeof SECTIONS)[number]["id"], model: ShelfSettingsUiModel): string {
  switch (id) {
    case "setup": return setupPane(model);
    case "actions": return actionsPane(model);
    case "shortcuts": return shortcutsPane(model);
    case "guide": return guidePane();
    case "machine": return machinePane(model);
    default: return appearancePane(model);
  }
}

function setupPane(_model: ShelfSettingsUiModel): string {
  const fact = (key: string, copy: string) => `<div class="settings-setting-row shelf-settings-fact">
      <span class="setting-copy" data-shelf-permission="${key}">${uiText(copy)}</span>
    </div>`;
  return `${fact("accessibility", "shelf.settings-ui.accessibility-needed-add-files-selected-front-app")}
    ${fact("automation", "shelf.settings-ui.finder-automation-mac-os-asks-once-when-add")}
    ${fact("browsers", "shelf.settings-ui.browsers-page-capture-supports-safari-chrome-edge-best")}
    ${fact("clipboard", "shelf.settings-ui.clipboard-copying-anywhere-else-records-entry-here")}
    <p class="settings-hint">${uiText("shelf.settings-ui.grant-these-when-need-them-staging-preview-drag")}</p>`;
}

function actionsPane(model: ShelfSettingsUiModel): string {
  const { primitives: p, settings } = model;
  const rows = settings.action_order.map((slot) => {
    const shortcutId = shortcutIdFromSlot(slot);
    const action = shortcutId ? settings.shortcuts.find((entry) => entry.id === shortcutId) : undefined;
    const recipe = SHELF_RECIPES.find((entry) => entry.recipe === slot);
    const title = action?.name ?? (recipe && shelfRecipeText(uiText.text, recipe.recipe, "title", recipe.label));
    if (title === undefined) return "";
    const hidden = settings.hidden_actions.includes(slot);
    return `<li class="shelf-action-row" data-shelf-action-slot="${p.escape(slot)}" draggable="true">
        <span class="shelf-act-grip" aria-hidden="true"></span>
        <span class="shelf-action-name">${p.escape(title)}</span>
        ${action ? `<span class="shelf-action-tag">${uiText("shelf.settings-ui.my-actions")}</span>` : ""}
        <span class="shelf-action-ops">
          <button class="shelf-paper quiet" type="button" data-shelf-action-move="up" aria-label="${uiText("shelf.settings-ui.move-up")}">↑</button>
          <button class="shelf-paper quiet" type="button" data-shelf-action-move="down" aria-label="${uiText("shelf.settings-ui.move-down")}">↓</button>
          <button class="shelf-paper quiet" type="button" data-shelf-action-visible aria-pressed="${!hidden}">${uiText(hidden ? "shelf.settings-ui.hidden" : "shelf.settings-ui.bar")}</button>
          ${action ? `<button class="shelf-paper quiet" type="button" data-shelf-action-edit>${uiText("shelf.settings-ui.edit")}</button><button class="shelf-paper quiet is-danger" type="button" data-shelf-action-delete>${uiText("shelf.settings-ui.delete")}</button>` : ""}
        </span>
      </li>`;
  }).join("");
  return `<div class="shelf-settings-block">
      <h3>${uiText("shelf.settings-ui.action-bar")}</h3>
      <p class="settings-hint">${uiText("shelf.settings-ui.drag-use-arrows-reorder-removed-actions-can-come")}</p>
      <ul class="shelf-action-list" data-shelf-action-list>${rows}</ul>
    </div>
    <div class="shelf-settings-block">
      <h3>${uiText("shelf.settings-ui.my-actions")}</h3>
      <p class="settings-hint">${uiText("shelf.settings-ui.one-line-about-what-do-runs-job-copy")}</p>
      ${shortcutForm()}
      <p class="shelf-settings-line" data-shelf-shortcut-error hidden></p>
    </div>`;
}

function shortcutForm(): string {
  return `<form class="shelf-shortcut-form" data-shelf-shortcut-form>
      <input type="hidden" data-shelf-shortcut-id value="">
      <label class="shelf-field"><span>${uiText("shelf.settings-ui.name")}</span><input type="text" data-shelf-shortcut-name maxlength="40" placeholder="${uiText("shelf.settings-ui.example-extract-contacts")}"></label>
      <label class="shelf-field"><span>${uiText("shelf.settings-ui.instruction")}</span><textarea data-shelf-shortcut-prompt rows="3" maxlength="2000" placeholder="${uiText("shelf.settings-ui.list-every-contact-material-table")}"></textarea></label>
      <fieldset class="shelf-kinds"><legend>${uiText("shelf.settings-ui.works")}</legend>${KIND_LABELS.map((entry) => `<label class="shelf-kind"><input type="checkbox" data-shelf-shortcut-kind="${entry.kind}"${["pdf", "markdown", "text", "website"].includes(entry.kind) ? " checked" : ""}><span>${uiText(entry.label)}</span></label>`).join("")}</fieldset>
      <div class="shelf-form-actions">
        <button class="shelf-primary" type="submit" data-shelf-shortcut-save>${uiText("shelf.settings-ui.save-action")}</button>
        <button class="shelf-paper" type="button" data-shelf-shortcut-reset>${uiText("shelf.settings-ui.clear")}</button>
      </div>
    </form>`;
}

function shortcutsPane(model: ShelfSettingsUiModel): string {
  const { primitives: p, settings } = model;
  return `<div class="shelf-settings-block">
      <h3>${uiText("shelf.settings-ui.global")}</h3>
      <p class="shelf-hotkey-lead">${uiText("shelf.settings-ui.global-shortcut-guide")}</p>
      ${hotkeyRow(p, "toggle", "shelf.settings-ui.open-close-shelf", "shelf.settings-ui.bring-main-window-forward-open-shelf-if-shelf", settings.hotkeys.toggle)}
      ${hotkeyRow(p, "capture", "shelf.settings-ui.capture-current-page", "shelf.settings-ui.bring-safari-chrome-edge-front-capture-steel-blue", settings.hotkeys.capture)}
      ${hotkeyRow(p, "files", "shelf.settings-ui.add-frontmost-selected-files", "shelf.settings-ui.reads-finder-selection-first-if-browser-frontmost-capture", settings.hotkeys.files)}
    </div>
    <div class="shelf-settings-block">
      <h3>${uiText("shelf.settings-ui.panel")}</h3>
      <p class="shelf-hotkey-lead">${uiText("shelf.settings-ui.click-key-right-then-press-new-one-panel")}</p>
      ${panelKeyRow(p, "hide", "shelf.settings-ui.leave-editing", "shelf.settings-ui.press-preview-stop-editing-copy", settings.panel_keys.hide)}
      ${panelKeyRow(p, "paste", "shelf.settings-ui.shelve-clipboard", "shelf.settings-ui.add-current-clipboard-straight-materials", settings.panel_keys.paste)}
      ${panelKeyRow(p, "copy", "shelf.settings-ui.copy-selection", "shelf.settings-ui.copy-selected-material-result", settings.panel_keys.copy)}
      ${panelKeyRow(p, "delete", "shelf.settings-ui.hide-delete-entry", "shelf.settings-ui.hide-current-material-result-clipboard-focused-delete-selected", settings.panel_keys.delete)}
      <section class="shelf-hotkey-row">
        <div class="setting-copy">
          <strong>${uiText("shelf.settings-ui.previous-next")}</strong>
          <span>${uiText("shelf.settings-ui.arrow-keys-walk-directory-one-fixed")}</span>
        </div>
        <div class="shelf-hotkey-keys"><span class="shelf-paper quiet" aria-disabled="true">↑ ↓</span></div>
      </section>
    </div>`;
}

function guidePane(): string {
  const rows: readonly [string, string][] = [
    ["shelf.settings-ui.guide-drop", "shelf.settings-ui.guide-drop-detail"],
    ["shelf.settings-ui.guide-inputs", "shelf.settings-ui.guide-inputs-detail"],
    ["shelf.settings-ui.guide-reads", "shelf.settings-ui.guide-reads-detail"],
    ["shelf.settings-ui.guide-outputs", "shelf.settings-ui.guide-outputs-detail"],
    ["shelf.settings-ui.guide-drag-out", "shelf.settings-ui.guide-drag-out-detail"],
    ["shelf.settings-ui.guide-offline", "shelf.settings-ui.guide-offline-detail"],
  ];
  return `<div class="shelf-settings-block">
      <button class="shelf-primary" type="button" data-shelf-try-sample>${uiText("shelf.settings-ui.try-sample-pdf-again")}</button>
      <p class="settings-hint">${uiText("shelf.settings-ui.puts-text-bearing-sample-pdf-materials-no-agent")}</p>
    </div>
    <div class="shelf-settings-block">
      <h3>${uiText("shelf.settings-ui.what-can-do")}</h3>
      <dl class="shelf-guide-list">${rows.map(([key, value]) => `<div class="shelf-guide-row"><dt>${uiText(key)}</dt><dd>${uiText(value)}</dd></div>`).join("")}</dl>
    </div>`;
}

function machinePane(model: ShelfSettingsUiModel): string {
  const { primitives: p, settings } = model;
  const runtime = model.runtime;
  const line = runtime?.runtime_key ? p.escape(runtime.title) : uiText.text("shelf.settings-ui.no-terminal-agent-found-staging-preview-drag-out");
  const selection = settings.model_selection;
  const encode = (value: { provider_id: string; model_id: string }) => JSON.stringify([value.provider_id, value.model_id]);
  const modelOptions = (model.ai?.choices ?? []).map(choice => `<option value="${p.escape(encode(choice))}"${selection && encode(selection) === encode(choice) ? " selected" : ""}>${p.escape(choice.label)}${choice.vision ? ` · ${uiText.text("shelf.settings-ui.supports-images")}` : ""}</option>`).join("");
  const missingModel = selection && !(model.ai?.choices ?? []).some(choice => encode(selection) === encode(choice))
    ? `<option value="${p.escape(encode(selection))}" selected>${uiText("shelf.settings-ui.selected-model-unavailable")}</option>` : "";
  const catalog = runtime?.catalog ?? [];
  const options = [{ runtime_key: "auto", title: "自动", executable: "auto", can_run_job: true, capability_pending: false, install_url: "" }, ...catalog];
  const rows = options.map((entry) => {
    const on = settings.engine === entry.runtime_key;
    const missing = entry.runtime_key !== "auto" && !entry.executable;
    const state = entry.runtime_key === "auto" ? uiText.text("shelf.settings-ui.picks-first-one-installed") : missing ? uiText.text("shelf.settings-ui.not-installed") : uiText.text("shelf.settings-ui.manual-terminal");
    const install = entry.install_url
      ? `<a class="shelf-paper quiet" href="${p.escape(entry.install_url)}" target="_blank" rel="noreferrer">${uiText("shelf.settings-ui.how-install")}</a>`
      : "";
    return `<div class="shelf-runtime-pick${missing ? " is-missing" : ""}">
        <label>
          <input type="radio" name="shelf-engine" value="${p.escape(entry.runtime_key)}" data-shelf-engine${on ? " checked" : ""}${missing ? " disabled" : ""}>
          <span class="shelf-runtime-name">${entry.runtime_key === "auto" ? uiText("shelf.settings-ui.automatic") : p.escape(entry.title)}</span>
          <span class="shelf-runtime-state${entry.executable && entry.can_run_job && entry.runtime_key !== "auto" ? " is-on" : ""}">${state}</span>
        </label>
        ${install}
      </div>`;
  }).join("");
  return `<div class="shelf-settings-block">
      <h3>${uiText("shelf.settings-ui.ai-model-automatic-actions")}</h3>
      <label>${uiText("shelf.settings-ui.model")} <select data-shelf-model><option value=""${!selection ? " selected" : ""}>${uiText("shelf.settings-ui.choose-available-model-automatically")}</option>${missingModel}${modelOptions}</select></label>
      <p class="settings-hint">${uiText("shelf.settings-ui.summaries-translations-shortcuts-use-selected-model-through-prol")}</p>
      ${model.ai?.reason ? `<p class="settings-hint">${p.escape(model.ai.reason)}</p>` : ""}
      <a class="shelf-paper quiet" href="/settings/models">${uiText("shelf.settings-ui.configure-ai-models")}</a>
    </div><div class="shelf-settings-block">
      <h3>${uiText("shelf.settings-ui.manual-terminal")}</h3>
      <p class="shelf-settings-line" data-shelf-agent-line>${line}</p>
      <div class="shelf-runtime-picks">${rows}</div>
      <p class="settings-hint">${uiText("shelf.settings-ui.used-when-open-send-terminal-automatic-actions-use")}</p>
    </div>
    <div class="shelf-settings-block">
      <h3>${uiText("shelf.settings-ui.custom-runtime")}</h3>
      <ul class="shelf-runtime-custom" data-shelf-runtime-list>${settings.custom_runtimes.map((runtime) => customRuntimeRow(p, runtime)).join("")}</ul>
      <form class="shelf-shortcut-form" data-shelf-runtime-form>
        <label class="shelf-field"><span>${uiText("shelf.settings-ui.name")}</span><input type="text" data-shelf-runtime-title maxlength="60" placeholder="${uiText("shelf.settings-ui.example-our-internal-cli")}"></label>
        <label class="shelf-field"><span>${uiText("shelf.settings-ui.executable")}</span><input type="text" data-shelf-runtime-path placeholder="/usr/local/bin/my-agent"></label>
        <label class="shelf-field"><span>${uiText("shelf.settings-ui.kind")}</span><select data-shelf-runtime-kind><option value="tui">${uiText("shelf.settings-ui.terminal-session-tui")}</option><option value="cli">${uiText("shelf.settings-ui.headless-cli")}</option></select></label>
        <div class="shelf-form-actions">
          <button class="shelf-primary" type="submit">${uiText("shelf.settings-ui.add")}</button>
        </div>
      </form>
      <p class="shelf-settings-line" data-shelf-runtime-error hidden></p>
    </div>
    <div class="shelf-settings-block">
      <h3>${uiText("shelf.settings-ui.where-lives")}</h3>
      <p class="shelf-settings-line">${p.escape(model.storage_path ?? "~/.molis-work/shelf")}</p>
      <p class="settings-hint">${uiText("shelf.settings-ui.copies-job-folders-results-live-here-deleting-copy")}</p>
    </div>`;
}

function customRuntimeRow(p: ShelfUiPrimitives, runtime: ShelfCustomRuntime): string {
  return `<li class="shelf-runtime-row" data-shelf-runtime-id="${p.escape(runtime.id)}">
      <span class="shelf-runtime-name">${p.escape(runtime.title)}</span>
      <span class="shelf-runtime-state">${p.escape(runtime.executable)}</span>
      <span class="shelf-runtime-state">${runtime.kind === "cli" ? uiText("shelf.settings-ui.headless-cli") : uiText("shelf.settings-ui.terminal-session-tui")}</span>
      <button class="shelf-paper quiet is-danger" type="button" data-shelf-runtime-delete>${uiText("shelf.settings-ui.delete")}</button>
    </li>`;
}

function appearancePane(model: ShelfSettingsUiModel): string {
  const { settings } = model;
  const checked = settings.drop_wheel_enabled ? " checked" : "";
  return `<label class="settings-setting-row settings-toggle-row">
      <span class="setting-copy">
        <strong>${uiText("shelf.settings-ui.drop-wheel")}</strong>
        <span>${uiText("shelf.settings-ui.shows-action-wheel-when-dragging-finder-onto-menu")}</span>
      </span>
      <input class="settings-switch" type="checkbox" role="switch" name="drop_wheel_enabled" data-shelf-drop-wheel${checked}>
    </label>
    <p class="settings-hint">${uiText("shelf.settings-ui.theme-language-follow-molis-appearance-settings")}</p>`;
}

function hotkeyRow(
  p: ShelfUiPrimitives,
  slot: ShelfHotKeySlot,
  title: string,
  caption: string,
  chord: ShelfHotKeyChord,
): string {
  const label = chordLabel(chord);
  const resetHidden = chordsEqual(chord, defaultHotKey(slot)) ? " hidden" : "";
  return `<section class="shelf-hotkey-row" data-shelf-hotkey-slot="${slot}">
        <div class="setting-copy">
          <strong>${uiText(title)}</strong>
          <span data-shelf-hotkey-caption data-caption="${p.escape(uiText(caption))}">${uiText(caption)}</span>
        </div>
        <div class="shelf-hotkey-keys">
          <span class="shelf-paper shelf-hotkey-record" role="button" tabindex="0" data-shelf-hotkey-record data-key-code="${chord.key_code}" data-carbon-modifiers="${chord.carbon_modifiers}" aria-pressed="false">${p.escape(label)}</span>
          <span class="shelf-paper quiet" role="button" tabindex="0" data-shelf-hotkey-reset${resetHidden}>${uiText("shelf.settings-ui.restore-default-shortcut")}</span>
        </div>
      </section>`;
}

function panelKeyRow(
  p: ShelfUiPrimitives,
  slot: ShelfPanelKeySlot,
  title: string,
  caption: string,
  chord: ShelfDeviceSettings["panel_keys"][ShelfPanelKeySlot],
): string {
  const resetHidden = panelKeysEqual(chord, defaultPanelKey(slot)) ? " hidden" : "";
  return `<section class="shelf-hotkey-row" data-shelf-panel-slot="${slot}">
        <div class="setting-copy">
          <strong>${uiText(title)}</strong>
          <span data-shelf-panel-caption>${uiText(caption)}</span>
        </div>
        <div class="shelf-hotkey-keys">
          <span class="shelf-paper shelf-hotkey-record" role="button" tabindex="0" data-shelf-panel-record data-code="${p.escape(chord.code)}" data-meta="${chord.meta}" data-ctrl="${chord.ctrl}" data-alt="${chord.alt}" data-shift="${chord.shift}" aria-pressed="false">${p.escape(panelKeyLabel(chord))}</span>
          <span class="shelf-paper quiet" role="button" tabindex="0" data-shelf-panel-reset${resetHidden}>${uiText("shelf.settings-ui.restore-default-shortcut")}</span>
        </div>
      </section>`;
}
