import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ImmersiveShellPrimitives } from "./immersive-shell.js";
import type { PluginHomeStart } from "./plugin-catalog.js";

/**
 * Project home, as in the Soft Workbench design: today's heading, a horizontal day strip, the Goal in progress,
 * the day's events that open in place, and a margin with the things at hand.
 * The event detail keeps one node (`data-home-detail`) that the client moves into the open row. The ways to start on an empty day are the
 * enabled plugins' declared `start` (`data-home-starts`); the client keeps no list by plugin.
 */
export function renderProjectHome(name: string, { escapeHtml: e, icon }: ImmersiveShellPrimitives, starts: readonly PluginHomeStart[]): string {
  // Each start is its plugin's own text, so it is worded in the page's language with that plugin's words before the page gets it.
  return `<section id="project-home-surface" class="desktop-work-surface immersive-home" data-work-surface="home" data-home-starts="${e(JSON.stringify(starts))}" data-work-surface-label="${uiText("workbench.project-home.project-home")}" data-event="off" data-dock="closed" aria-label="${e(name)} · ${uiText("workbench.project-home.project-home")}" hidden>
    <div class="home-scroll" data-home-scroll>
      <header class="home-heading home-hero" data-home-hero>
        <time data-home-date></time>
      </header>
      <div class="home-layout">
        <nav class="home-dates" aria-label="${uiText("workbench.project-home.date")}">
          <div class="home-dates__list" data-home-dates data-overflow-fade></div>
          <span class="home-dates__line" aria-hidden="true"></span>
          <button class="mw-btn mw-btn--ghost mw-btn--icon-only home-today" type="button" data-home-today aria-label="${uiText("workbench.project-home.back-today")}" title="${uiText("workbench.project-home.back-today")}">${icon("calendar")}</button>
        </nav>
        <section class="home-focus" data-home-focus aria-labelledby="home-focus-title" hidden></section>
        <aside class="home-margin" aria-label="${uiText("workbench.project-home.hand")}">
          <section class="home-launch" aria-labelledby="home-launch-title">
            <h2 id="home-launch-title">${uiText("workbench.project-home.back-what-s-hand")}</h2>
            <ul class="home-quick" data-home-quick></ul>
            <ul class="home-shortcuts" data-home-shortcuts aria-label="${uiText("workbench.project-home.shortcuts")}"><li class="home-shortcut home-shortcut-add"><button type="button" class="home-shortcut-main" data-home-shortcut-add><span class="home-shortcut-icon">${icon("plus")}</span><span>${uiText("workbench.project-home.add-shortcut")}</span></button></li></ul>
            <p class="home-shortcut-error" data-home-shortcut-error role="alert" hidden></p>
          </section>
          <section class="placement-related" data-placement-related aria-label="${uiText("workbench.project-home.linked-materials")}" hidden></section>
        </aside>
        <section class="home-tl" aria-label="${uiText("workbench.project-home.today-s-events")}">
          <div class="home-tl__head"><h2>${uiText("workbench.project-home.today-s-events")}<small data-home-list-count></small></h2><span data-home-list-stats></span></div>
          <div class="home-tl__rows" data-home-list></div>
        </section>
      </div>
    </div>
    <div class="home-detail-holder" data-home-detail-holder hidden>
      <aside class="home-detail" data-home-detail aria-label="${uiText("workbench.project-home.item")}">
        <div class="home-detail__head" data-home-detail-head></div>
        <div class="home-detail__body" data-home-detail-body></div>
        <div class="home-detail__act" data-home-detail-act></div>
      </aside>
    </div>
    <template data-home-shortcut-template><li class="home-shortcut"><a class="home-shortcut-main" target="_blank" rel="noopener noreferrer" data-home-shortcut-link data-home-external><span class="home-shortcut-icon">${icon("link")}</span><span data-home-shortcut-name></span></a><button type="button" class="mw-btn mw-btn--ghost mw-btn--icon-only home-shortcut-edit" data-home-shortcut-edit>${icon("more")}</button></li></template>
    <dialog class="mw-dialog home-shortcut-dialog" data-slot="dialog" data-home-shortcut-dialog aria-labelledby="home-shortcut-title">
      <form data-home-shortcut-form novalidate>
        <header><h2 id="home-shortcut-title">${uiText("workbench.project-home.add-shortcut")}</h2><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-home-shortcut-cancel aria-label="${uiText("common.control.close")}">${icon("x")}</button></header>
        <label class="mw-field"><span class="mw-field__label">${uiText("workbench.project-home.name")}</span><input class="mw-input" name="shortcut_name" maxlength="32" autocomplete="off" required placeholder="${uiText("workbench.project-home.example-project-docs")}"></label>
        <label class="mw-field"><span class="mw-field__label">${uiText("workbench.project-home.website-url")}</span><input class="mw-input" name="shortcut_url" type="url" maxlength="4096" autocomplete="off" required placeholder="https://"></label>
        <p class="home-shortcut-form-error" data-home-shortcut-form-error role="alert"></p>
        <footer><button class="mw-btn mw-btn--danger-outline home-shortcut-remove" type="button" data-home-shortcut-remove hidden>${uiText("workbench.project-home.remove")}</button><button class="mw-btn mw-btn--secondary" type="button" data-home-shortcut-cancel>${uiText("common.control.cancel")}</button><button class="mw-btn mw-btn--primary home-shortcut-save" type="submit">${uiText("common.control.save")}</button></footer>
      </form>
    </dialog>
  </section>`;
}
