import { RUNTIME_DISPLAY_NAMES } from "@molis-ai/molis-work-contracts/platform/app-host";
import { t as uiText, escapeHtml, renderButton, renderChoice, renderListToolbar, renderObjectRow, renderQuestionList, renderSelect, renderSettingRow, renderSettingsSection, renderSwitch } from "@molis-ai/molis-work-plugin-sdk/ui";

/**
 * The component board's 设置的行 section (specs/screen-polish/p5-settings.md): the three rows every settings page is written in
 * — 设置行, 对象行 with its 问句行, 列表行 — drawn with the SDK's own functions and the design system's `SETTINGS_DOCUMENT_STYLES`,
 * at the settings document's 760px measure. The names and states are the product's own words; nothing here is stored.
 */
const text = uiText.text;
const figure = (caption: string, body: string) =>
  `<figure class="mw-catalog__specimen"><figcaption>${escapeHtml(text(caption))}</figcaption><div class="mw-settings-board">${body}</div></figure>`;
const select = (label: string, options: readonly string[]) =>
  renderSelect({ attrs: { "aria-label": text(label) }, optionsHtml: options.map(option => `<option>${escapeHtml(text(option))}</option>`).join("") });

function settingRows(): string {
  return renderSettingsSection({ title: text("workbench.settings-assistant.attention-rules"), body:
    renderSettingRow({ name: text("workbench.settings-assistant.let-assistant-use-computer"), hint: text("workbench.settings-row-specimens.switch-hint"), label: true, control: renderSwitch({ checked: true }) })
    + renderSettingRow({ name: text("workbench.settings-assistant.pause-notices"), hint: text("workbench.settings-assistant.pause-notices-hint"),
      control: select("workbench.settings-assistant.how-long", ["workbench.settings-assistant.value-1-hour", "workbench.settings-assistant.until-end-today"]) })
    + renderSettingRow({ name: text("workbench.settings-assistant.memory-in-use"), hint: text("workbench.settings-row-specimens.button-hint"), control: renderButton({ label: text("workbench.settings-assistant.open-personal-memories"), variant: "secondary" }) }) });
}

function openRow(): string {
  const places = ["Coding", "Pages", "Inbox", "Goals", "Feed", "Shelf", "Issue"];
  return renderSettingsSection({ body: renderSettingRow({ name: text("workbench.settings-assistant.quiet-places"), hint: text("workbench.settings-assistant.quiet-places-hint"),
    fold: { label: text("workbench.settings-assistant.places-count", { count: 3 }), open: true,
      body: `<div class="mw-choice-group" role="group" aria-label="${uiText("workbench.settings-assistant.quiet-places")}">${places.map((label, index) => renderChoice({ label, selected: index < 3 })).join("")}</div>` } }) });
}

function objectRows(): string {
  const [first, second, third, fourth] = Object.values(RUNTIME_DISPLAY_NAMES) as string[];
  const code = (value: string) => `<code>${escapeHtml(value)}</code>`;
  // What stops every row at once is said once, in a card of its own above them, with the one thing to do about it.
  return renderSettingsSection({ body: renderObjectRow({ name: text("workbench.settings-runtimes.install-incomplete"), hint: text("workbench.settings-runtimes.check-diagnostics-repair-molis-work-install-first"),
    icon: "circle-alert", className: "mw-object-row--alert", action: renderButton({ label: text("workbench.settings-runtimes.open-diagnostics"), variant: "secondary", size: "sm" }) }) })
  + renderSettingsSection({ title: text("workbench.settings-runtimes.connected"), body:
    renderObjectRow({ name: first ?? "", hint: text("workbench.settings-runtimes.mcp-points-at-install"), icon: "terminal", open: true,
      state: { label: text("workbench.settings-runtimes.connected"), tone: "success" },
      body: renderQuestionList({ rows: [
        { question: text("workbench.settings-runtimes.where-installed"), answer: code("~/.local/bin/codex") },
        { question: text("workbench.settings-runtimes.where-config"), answer: code("~/.codex/config.toml") },
        { question: text("workbench.settings-runtimes.does-it-connect"), answer: escapeHtml(text("workbench.settings-runtimes.mcp-points-at-install")),
          action: renderButton({ label: text("workbench.settings-runtimes.preview-removal"), variant: "secondary", size: "sm" }) },
      ] }) })
    + renderObjectRow({ name: second ?? "", hint: text("workbench.settings-runtimes.older-incomplete-molis-work-connection-was-found"), icon: "terminal",
      state: { label: text("workbench.settings-runtimes.needs-repair"), tone: "warning" }, action: renderButton({ label: text("workbench.settings-runtimes.preview-repair"), variant: "secondary" }),
      body: renderQuestionList({ rows: [{ question: text("workbench.settings-runtimes.where-config"), answer: code("~/.claude.json") },
        { question: text("workbench.settings-runtimes.does-it-connect"), answer: escapeHtml(text("workbench.settings-runtimes.older-incomplete-molis-work-connection-was-found")) }] }) })
    + renderObjectRow({ name: third ?? "", hint: text("workbench.settings-runtimes.check-diagnostics-repair-molis-work-install-first"), icon: "terminal",
      state: { label: text("workbench.settings-runtimes.install-incomplete"), tone: "danger" }, action: renderButton({ label: text("workbench.settings-runtimes.open-diagnostics"), variant: "secondary" }) })
    + renderObjectRow({ name: fourth ?? "", hint: text("workbench.settings-runtimes.that-runtime-was-not-found-machine"), icon: "terminal", state: { label: text("workbench.settings-runtimes.not-found") } }) });
}

function listRows(): string {
  const row = (name: string, meta: string) => `<li class="mw-list-row"><span class="mw-setting-row__copy"><strong>${escapeHtml(text(name))}</strong><span>${escapeHtml(text(meta))}</span></span>${renderButton({ label: text("common.control.delete"), variant: "ghost" })}</li>`;
  return renderSettingsSection({ title: text("workbench.settings-memory.my-memories"), lead: renderListToolbar({ label: text("workbench.settings-memory.filter-memories"),
    search: `<input class="mw-input" type="search" placeholder="${uiText("workbench.settings-memory.search-memories")}" aria-label="${uiText("workbench.settings-memory.search-memories")}">`,
    filters: select("workbench.settings-memory.scene", ["workbench.settings-memory.all-scenes", "workbench.settings-memory.coding"]) + select("workbench.settings-memory.state", ["workbench.settings-memory.all-states", "workbench.settings-memory.active"]),
    more: { label: text("workbench.settings-memory.more-filters"), body: select("workbench.settings-memory.kind", ["workbench.settings-memory.all-kinds"]) + select("workbench.settings-memory.source", ["workbench.settings-memory.all-sources"]) },
    end: renderButton({ label: text("workbench.settings-memory.add"), variant: "secondary", size: "sm" }) }),
    body: `<ul class="mw-setting-list">${row("workbench.settings-row-specimens.sample-memory-a", "workbench.settings-memory.preference")}${row("workbench.settings-row-specimens.sample-memory-b", "workbench.settings-memory.convention")}</ul>` });
}

/** The section the board places after 回到原处. */
export function renderSettingsRowsSection(): string {
  return `<section class="mw-catalog__section" id="settings-rows" data-primitive="settings-rows"><h2>${uiText("workbench.settings-row-specimens.title")}</h2>
    <div class="mw-catalog__specimens">
      ${figure("workbench.settings-row-specimens.setting-row", settingRows())}
      ${figure("workbench.settings-row-specimens.setting-open", openRow())}
      ${figure("workbench.settings-row-specimens.object-row", objectRows())}
      ${figure("workbench.settings-row-specimens.list-row", listRows())}
    </div>
  </section>`;
}

/** The board's own layout for the section: the settings document's measure on paper. The rows' look is the design system's. */
export const SETTINGS_ROWS_SECTION_STYLES = ".mw-settings-board{box-sizing:border-box;width:760px;max-width:100%}"
  + ".mw-settings-board>.mw-settings-section:first-child{margin-top:0}.mw-settings-board .mw-list-row{align-items:center}";
