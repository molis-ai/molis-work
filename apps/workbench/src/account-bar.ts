import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ImmersiveShellPrimitives } from "./immersive-shell.js";

/**
 * The account bar, the foot's left block (specs/screen-polish §4「底栏第十三版」第 5 条, POLISH-71): the avatar with sync as one
 * dot on it, the name over its small line, then 通知, 插件 and 设置 as round keys, all on the control fill (the screen's one
 * ink-blue solid stays the send key). The avatar and the name are the account menu's trigger (browser/account-menu.ts fills
 * `[data-personal-name]` and `[data-personal-status]` and opens the menu upwards); the sync dot is painted by the sync script
 * (sync-indicator.ts); 通知 opens the Assistant's notices (browser/work-bar.ts); 插件 is the capabilities page.
 */
export function renderAccountBar({ icon }: Pick<ImmersiveShellPrimitives, "icon">): string {
  return `<div class="bar-account" data-bar-account role="group" aria-label="${uiText("workbench.account-bar.label")}">`
    + `<button class="bar-account-me" type="button" data-account-link aria-haspopup="menu" aria-expanded="false" aria-label="${uiText("workbench.settings-directory.account")}">`
    + `<span class="bar-account-avatar" aria-hidden="true">${icon("user")}<span class="bar-account-sync" data-sync-indicator hidden><span data-sync-indicator-label hidden></span></span></span>`
    + `<span class="bar-account-copy"><strong data-personal-name>${uiText("workbench.settings-directory.not-signed")}</strong><small data-personal-status>${uiText("workbench.settings-directory.local-space")}</small></span></button>`
    + `<button class="bar-account-key" type="button" data-bar-notices aria-haspopup="true" aria-expanded="false" aria-label="${uiText("workbench.account-bar.notices")}" title="${uiText("workbench.account-bar.notices")}">${icon("bell")}<b data-bar-notices-count hidden></b></button>`
    + `<a class="bar-account-key" href="__SYSTEM_CAPABILITIES__" data-capabilities-open aria-label="${uiText("workbench.account-bar.plugins")}" title="${uiText("workbench.account-bar.plugins")}">${icon("grid")}</a>`
    + `<button class="bar-account-key" type="button" data-plugin-id="settings" data-directory-open="settings" aria-label="${uiText("workbench.account-bar.settings")}" title="${uiText("workbench.account-bar.settings")}">${icon("settings")}</button></div>`;
}
