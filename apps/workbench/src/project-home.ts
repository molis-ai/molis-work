import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ImmersiveShellPrimitives } from "./immersive-shell.js";

/**
 * Project home: the composed groups (`data-home-groups`) that the home view fills from `surfaces.compose@1`, and one peek dialog
 * the view opens for a quick look. The server draws only the frame; every row comes from the owners' presentations.
 */
export function renderProjectHome(name: string, { escapeHtml: e }: ImmersiveShellPrimitives): string {
  return `<section class="desktop-work-surface immersive-home" data-work-surface="home" data-work-surface-label="${uiText("workbench.project-home.project-home")}" aria-label="${e(name)} · ${uiText("workbench.project-home.project-home")}" hidden>
    <div class="home-scroll" data-home-scroll>
      <header class="home-heading"><h1>${uiText("workbench.project-home.project-home")}</h1><p>${uiText("workbench.home.lead")}</p></header>
      <div class="home-read-state" data-home-status aria-live="polite"></div>
      <div class="home-groups" data-home-groups></div>
      <section class="placement-related" data-placement-related aria-label="${uiText("workbench.project-home.linked-materials")}" hidden></section>
    </div>
    <dialog class="mw-dialog home-peek" data-home-peek aria-label="${uiText("workbench.home.peek-title")}">
      <div class="home-peek__bar"><button type="button" class="mw-btn mw-btn--ghost" data-home-close>${uiText("common.presentation.close")}</button></div>
      <div data-home-peek-content></div>
      <div data-home-offers></div>
    </dialog>
  </section>`;
}
