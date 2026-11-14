import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ImmersiveShellPrimitives } from "./immersive-shell.js";

/**
 * Project home: the composed groups (`data-home-groups`) that the home view fills from `surfaces.compose@1`, and one peek dialog
 * the view opens for a quick look. The server draws only the frame; every row comes from the owners' presentations.
 * The heading is the project's own name under a quiet line that says which page this is: the name answers "where am I",
 * and the rows below answer what to do, so the page carries no sentence about itself.
 */
export function renderProjectHome(name: string, { escapeHtml: e }: ImmersiveShellPrimitives): string {
  return `<section class="desktop-work-surface immersive-home" data-work-surface="home" data-work-surface-label="${uiText("workbench.project-home.project-home")}" aria-label="${e(name)} · ${uiText("workbench.project-home.project-home")}" hidden>
    <div class="home-scroll" data-home-scroll>
      <header class="home-heading"><p class="home-heading__place">${uiText("workbench.project-home.project-home")}</p><h1>${e(name)}</h1></header>
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
