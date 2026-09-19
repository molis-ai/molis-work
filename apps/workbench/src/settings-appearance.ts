import { renderHint } from "@molis-ai/molis-work-design-system";

export interface AppearanceSettingsPrimitives {
  L(text: string): string;
  currentLocale(): string;
  localeSwitchHref(locale: "zh" | "en", nextPath: string): string;
}

export function renderAppearanceSettingsDocument(
  { L, currentLocale, localeSwitchHref }: AppearanceSettingsPrimitives,
  nextPath: string,
): string {
  const locale = currentLocale();
  const options = (attribute: string, values: [string, string][]) => `<div class="mw-toggle-group settings-segmented" data-slot="toggle-group" role="group">${values.map(([value, label]) => `<button class="mw-toggle" type="button" ${attribute}="${value}" aria-pressed="false">${L(label)}</button>`).join("")}</div>`;
  const row = (title: string, description: string, control: string) => `<section class="settings-setting-row"><div class="setting-copy"><strong>${L(title)}</strong><span>${L(description)}</span></div><div class="setting-value" aria-label="${L(title)}">${control}</div></section>`;
  return `<section class="settings-document appearance-document" aria-labelledby="settings-title"><header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${L("界面与语言")}</h1>${renderHint({ id: "settings-hint-appearance", label: L("如何生效"), text: L("更改即时生效，保存在当前设备。") })}</div><p>${L("设置这台设备上的阅读和工作习惯。")}</p></header>
    <section class="settings-section" aria-label="${L("偏好")}">
    ${row("主题", "选择固定主题，或跟随系统外观。", options("data-theme-option", [["light", "浅色"], ["dark", "深色"], ["system", "跟随系统"]]))}
    ${row("界面语言", "只改变界面文案，保留项目内容的原始语言。", `<div class="mw-toggle-group settings-segmented" data-slot="toggle-group">${(["zh", "en"] as const).map((value) => `<a class="mw-toggle${locale === value ? " is-current" : ""}" href="${localeSwitchHref(value, nextPath)}" lang="${value}" aria-current="${locale === value}">${value === "zh" ? "中文" : "English"}</a>`).join("")}</div>`)}
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
