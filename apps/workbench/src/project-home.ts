import type { ImmersiveShellPrimitives } from "./immersive-shell.js";
import { pluginTextMessage } from "./plugin-text.js";

export function renderProjectHome(name: string, { L, escapeHtml: e, htmlLang }: ImmersiveShellPrimitives): string {
  const language = htmlLang?.() === "en" ? "en" : "zh";
  const word = (key: string, fallback = "") => {
    const message = pluginTextMessage("workbench", key, language);
    return e(typeof message === "string" ? message : fallback);
  };
  return `<section class="desktop-work-surface immersive-home" data-work-surface="home" data-work-surface-label="${L("项目首页")}" aria-label="${e(name)} · ${L("项目首页")}" hidden>
    <div class="home-scroll" data-home-scroll>
      <header class="home-heading"><h1>${L("项目首页")}</h1><p>${word("workbench.home.lead")}</p></header>
      <div class="home-read-state" data-home-status aria-live="polite"></div>
      <div class="home-groups" data-home-groups></div>
      <section class="placement-related" data-placement-related aria-label="${L("关联资料")}" hidden></section>
    </div>
    <dialog class="mw-dialog home-peek" data-home-peek aria-label="${word("workbench.home.peek-title", L("项目首页"))}">
      <div class="home-peek__bar"><button type="button" class="mw-btn mw-btn--ghost" data-home-close>${word("common.presentation.close", L("关闭"))}</button></div>
      <div data-home-peek-content></div>
      <div data-home-offers></div>
    </dialog>
  </section>`;
}
