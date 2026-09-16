import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { renderAppearanceSettingsDocument } from "./settings-appearance.js";

export interface SettingsDirectoryPrimitives {
  L(text: string): string;
  icon(name: MolisWorkIcon): string;
  htmlLang(): string;
}

const SETTINGS_SECTIONS = [
  { id: "appearance", label: "外观" },
  { id: "runtimes", label: "AI 与执行工具" },
  { id: "planning", label: "规划方法" },
  { id: "diagnostics", label: "诊断" },
] as const;

function localeSwitchHref(locale: "zh" | "en", nextPath: string): string {
  return `/locale?lang=${locale}&next=${encodeURIComponent(nextPath)}`;
}

export function renderPluginRailAccountFooter(primitives: SettingsDirectoryPrimitives): string {
  const { L, icon } = primitives;
  return `<footer class="personal-sidebar-footer">
    <button class="immersive-plugin-link plugin-rail-item personal-settings" type="button" data-plugin-id="settings" data-directory-open="settings" aria-label="${L("打开全局设置")}" title="${L("设置")}">${icon("settings")}<span>${L("设置")}</span></button>
    <button class="personal-account" type="button" data-account-link aria-label="${L("账号管理")}" title="${L("账号管理")}">
      <span class="personal-account-avatar" aria-hidden="true">${icon("user")}</span>
      <span class="personal-account-copy"><strong>${L("一骏")}</strong><small>${L("本地空间")}</small></span>
    </button>
  </footer>`;
}

export function renderSettingsDirectorySection(primitives: SettingsDirectoryPrimitives, nextPath: string): string {
  const { L, icon, htmlLang } = primitives;
  const locale = htmlLang().toLowerCase().startsWith("en") ? "en" : "zh";
  const appearance = renderAppearanceSettingsDocument({
    L,
    currentLocale: () => locale,
    localeSwitchHref,
  }, nextPath);
  const nav = SETTINGS_SECTIONS.map((section) => `<button type="button" data-settings-section="${section.id}"${section.id === "appearance" ? ' aria-current="page"' : ""}>${L(section.label)}</button>`).join("");
  return `<section class="plugin-section is-expanded" data-plugin-section="settings" data-plugin-expanded="true" hidden>
    <div class="immersive-plugin-link" aria-hidden="true">${icon("settings")}<span>${L("设置")}</span></div>
    <div class="plugin-section-body">
      <section class="desktop-directory-panel" data-directory-panel="settings">
        <nav class="settings-directory-nav" data-settings-directory-nav aria-label="${L("系统设置")}">${nav}</nav>
        <div class="settings-directory-body" data-settings-directory-body>
          <div data-settings-panel="appearance">${appearance}</div>
        </div>
      </section>
    </div>
  </section>`;
}
