import { BASELINE_FONT, BASELINE_SKIN, renderDialog, renderHint, renderLookCard, renderLookGroup, renderLookProof, renderSheet } from "@molis-ai/molis-work-design-system";
import { UI_LANGUAGES, type UiDefinitionRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { escapeHtml, icon, renderButton, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { WebLocalePreference } from "./i18n.js";
import { appearanceJson, type WorkbenchAppearance, type WorkbenchAppearanceChoices } from "./appearance-document.js";

interface AppearanceSettingsPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  currentLocale(): string;
  localeSwitchHref(locale: WebLocalePreference, nextPath: string): string;
}

export interface AppearanceSettingsModel {
  readonly current: WorkbenchAppearance;
  readonly choices: WorkbenchAppearanceChoices;
}
const scope = ({ id, revision }: UiDefinitionRef) => `${id}@${revision}`;

function renderAppearanceChoices(L: AppearanceSettingsPrimitives["L"], { current, choices }: AppearanceSettingsModel): string {
  const { snapshot, selection } = current;
  const active = choices.skins.find(skin => scope(skin.ref) === scope(snapshot.skin));
  const cards = choices.skins.map(skin => renderLookCard(L, {
    id: skin.ref.id, name: skin.name, by: "内置", previewSkin: scope(skin.ref),
  }, { inUse: skin === active, fontName: choices.fonts.find(font => scope(font.ref) === scope(skin.recommended_font))?.name })).join("");
  const option = (control: string, id: string, label: string, pressed: boolean) =>
    renderButton({ label, variant: "secondary", size: "sm", attrs: { [control]: id, "aria-pressed": String(pressed) } });
  const fonts = choices.fonts.filter(font => font.ref.id !== "system-menlo");
  const proof = renderLookProof(L, {
    look: { id: snapshot.skin.id, name: active?.name ?? "Soft Workbench", by: "内置" }, state: "idle",
    scopes: { skin: scope(snapshot.skin), font: scope(snapshot.font.scheme), mono: scope(snapshot.font.mono) },
  });
  return `<div class="appearance-choices" data-appearance-settings>
    <script type="application/json" data-appearance-choices>${appearanceJson(choices)}</script>
    <div class="appearance-controls">
      <section class="settings-section appearance-picker" aria-label="${escapeHtml(L("皮肤"))}">
        <h2>${escapeHtml(L("皮肤"))}</h2>${renderLookGroup(L, cards)}
        <div class="appearance-pick-row"><strong>${escapeHtml(L("界面字体"))}</strong>
          <div class="appearance-options" role="group" aria-label="${escapeHtml(L("界面字体"))}">
            ${option("data-appearance-font", "follow", L("跟随皮肤推荐"), selection.font.policy === "follow-skin")}
            ${fonts.map(font => option("data-appearance-font", font.ref.id, font.name, selection.font.policy === "pinned" && scope(selection.font.scheme) === scope(font.ref))).join("")}
          </div>
        </div>
        <div class="appearance-pick-row"><strong>${escapeHtml(L("等宽字体"))}</strong>
          <div class="appearance-options" role="group" aria-label="${escapeHtml(L("等宽字体"))}">
            ${option("data-appearance-mono", "", L("系统等宽"), selection.mono === null)}
            ${choices.fonts.filter(font => font.ref.id === "system-menlo").map(font => option("data-appearance-mono", font.ref.id, font.name, selection.mono?.id === font.ref.id)).join("")}
          </div>
        </div>
      </section>
      <button class="mw-btn mw-btn--link" data-appearance-restore type="button">${escapeHtml(L("恢复内置外观"))}</button>
      <button class="mw-btn mw-btn--secondary appearance-proof-open" data-appearance-preview type="button" hidden>${escapeHtml(L("看样张"))}</button>
    </div>
    <div data-appearance-proof-home>${proof}</div>
    ${renderSheet({ labelledBy: "appearance-proof-sheet-title", title: L("样张"), closeLabel: L("先回去挑"),
      className: "appearance-proof-sheet", attrs: { "data-appearance-proof-sheet": true }, body: '<div data-appearance-proof-sheet-body></div>', footer: "" })}
  </div>`;
}

/** Recovery uses Soft's own complete token scope even if the surrounding selection cannot be rendered. */
export function renderAppearanceRecovery(L: AppearanceSettingsPrimitives["L"], current: WorkbenchAppearance | undefined): string {
  if (!current) return "";
  return renderDialog({
    title: L("恢复内置外观"), labelledBy: "appearance-recovery-title", closeLabel: L("关闭"), className: "appearance-recovery",
    attrs: { "data-appearance-recovery": true, "data-ui-skin": scope(BASELINE_SKIN.ref),
      "data-ui-font": scope(BASELINE_FONT.ref), "data-ui-mono": scope(BASELINE_FONT.ref) },
    body: `<p>${escapeHtml(L("换回 Soft Workbench、系统字体和系统等宽。此 Home 的窗口会一起更新。"))}</p><p data-appearance-recovery-status role="status" hidden></p>`,
    footer: renderButton({ label: L("再试一次"), variant: "secondary", attrs: { "data-appearance-check": true, hidden: true } })
      + renderButton({ label: L("取消"), variant: "secondary", attrs: { "data-dialog-close": true } })
      + renderButton({ label: L("恢复内置外观"), variant: "primary", attrs: { "data-appearance-recover": true } }),
  }) + `<div class="mw-toast appearance-notice" data-appearance-notice hidden>
    <span data-appearance-message role="status" aria-live="polite"></span>
    <button class="mw-toast__action" type="button" data-appearance-undo hidden>${escapeHtml(L("撤销"))}</button>
    <button class="mw-toast__action" type="button" data-appearance-read hidden>${escapeHtml(L("再试一次"))}</button>
    <button class="mw-toast__action" type="button" data-appearance-continue hidden>${escapeHtml(L("继续这次操作"))}</button>
    <button class="mw-toast__action" type="button" data-appearance-dismiss aria-label="${escapeHtml(L("关闭"))}">${icon("x")}</button>
  </div>`;
}

export function renderAppearanceSettingsDocument(
  { L, currentLocale, localeSwitchHref }: AppearanceSettingsPrimitives,
  nextPath: string,
  model?: AppearanceSettingsModel,
): string {
  const locale = currentLocale();
  const language = (value: WebLocalePreference, label: string, tag?: string) =>
    `<a class="mw-toggle${locale === value ? " is-current" : ""}" href="${localeSwitchHref(value, nextPath)}" data-ui-language="${value}"${tag ? ` lang="${tag}"` : ""} aria-current="${locale === value}">${escapeHtml(label)}</a>`;
  const options = (attribute: string, values: [string, string][]) => `<div class="mw-toggle-group settings-segmented" data-slot="toggle-group" role="group">${values.map(([value, label]) => `<button class="mw-toggle" type="button" ${attribute}="${value}" aria-pressed="false">${L(label)}</button>`).join("")}</div>`;
  const row = (title: string, description: string, control: string) => `<section class="settings-setting-row"><div class="setting-copy"><strong>${L(title)}</strong><span>${L(description)}</span></div><div class="setting-value" aria-label="${L(title)}">${control}</div></section>`;
  return `<section class="settings-document appearance-document" aria-labelledby="settings-title"><header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("界面与语言")}</h1>${renderHint({ id: "settings-hint-appearance", label: L("如何生效"), text: L("主题、密度和终端配色保存在当前设备。") })}</div></header>
    ${model ? renderAppearanceChoices(L, model) : ""}
    <section class="settings-section" aria-label="${L("偏好")}">
    ${row("主题", "选择固定主题，或跟随系统外观。", options("data-theme-option", [["light", "浅色"], ["dark", "深色"], ["system", "跟随系统"]]))}
    ${row("界面语言", "只改变界面文案，保留项目内容的原始语言。", `<div class="mw-toggle-group settings-segmented" data-slot="toggle-group" data-ui-language-options>${language("system", t.text("workbench.language.follow-system"))}${UI_LANGUAGES.map(value => language(value.tag, value.name, value.html_lang)).join("")}</div>`)}
    ${row("界面密度", "调整 Goal 导航和正文的间距。", options("data-density-option", [["standard", "标准"], ["compact", "紧凑"]]))}
    ${row("终端外观", "为终端内容单独选择明暗配色。", options("data-terminal-theme-option", [["auto", "跟随界面"], ["light", "浅色"], ["dark", "深色"]]))}
    </section>
  </section>`;
}

export function renderRuntimePlanDialog(ports: {
  L(text: string): string;
  icon(name: "x", className?: string): string;
}): string {
  const { L, icon } = ports;
  return `<dialog class="runtime-plan-dialog" data-runtime-plan-dialog aria-labelledby="runtime-plan-title">
    <div class="runtime-plan-shell">
      <header><div><h2 id="runtime-plan-title" data-runtime-plan-title>${L("Runtime 接入预览")}</h2><p data-runtime-plan-message>${L("正在读取变更计划…")}</p></div><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-runtime-plan-close aria-label="${L("关闭预览")}">${icon("x")}</button></header>
      <div class="runtime-plan-body"><ul class="runtime-change-list" data-runtime-change-list></ul><dl class="runtime-plan-meta"><div><dt>${L("备份")}</dt><dd data-runtime-plan-backup>${L("无须备份")}</dd></div><div><dt>${L("完成后")}</dt><dd data-runtime-plan-restart>${L("按页面提示重启 Runtime")}</dd></div></dl><label class="runtime-plan-confirm" data-runtime-confirm-row><input type="checkbox" data-runtime-confirm><span data-runtime-confirm-label>${L("我已查看并确认这份变更")}</span></label><p class="settings-form-error" data-runtime-plan-error role="alert" hidden></p></div>
      <footer><button class="mw-btn mw-btn--secondary" type="button" data-runtime-plan-close>${L("取消")}</button><button class="mw-btn mw-btn--primary runtime-plan-apply" type="button" data-runtime-plan-apply disabled>${L("确认应用")}</button></footer>
    </div>
  </dialog>`;
}
