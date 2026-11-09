import type { ImmersiveShellPrimitives } from "./immersive-shell.js";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

export function renderProjectHome(name: string, { L, escapeHtml: e }: ImmersiveShellPrimitives): string {
  return `<section class="desktop-work-surface immersive-home" data-work-surface="home" data-work-surface-label="${L("项目首页")}" aria-label="${e(name)} · ${L("项目首页")}" hidden>
    <div class="home-scroll" data-home-scroll>
      <header class="home-heading"><h1>${L("项目首页")}</h1><p>${t("workbench.home.lead")}</p></header>
      <div class="home-read-state" data-home-status aria-live="polite"></div>
      <div class="home-groups" data-home-groups></div>
      <section class="placement-related" data-placement-related aria-label="${L("关联资料")}" hidden></section>
    </div>
    <dialog class="mw-dialog home-peek" data-home-peek aria-label="${t("workbench.home.peek-title")}">
      <div class="home-peek__bar"><button type="button" class="mw-btn mw-btn--ghost" data-home-close>${t("common.presentation.close")}</button></div>
      <div data-home-peek-content></div>
      <div data-home-offers></div>
    </dialog>
  </section>`;
}
