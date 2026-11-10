import { t as uiText, renderButton, renderDirectoryHeading, renderDirectoryRow, renderEmpty, renderKbd } from "@molis-ai/molis-work-plugin-sdk/ui";
import {
  ARRIVAL_MOTION_CLIENT_SCRIPT,
  COMPOSER_LOADER_CLIENT_SCRIPT,
  DROP_ZONE_CLIENT_SCRIPT,
  INPUT_RECEIPTS_CLIENT_SCRIPT,
  INTERACTION_CLIENT_SCRIPT_TYPED_DATES,
  renderBarContext,
  renderProjectMonogram,
} from "@molis-ai/molis-work-design-system";
import { renderAssistantDock } from "../assistant-dock.js";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../scripts/client/assistant-island.js";
import { ATTENTION_FACTORY_SCRIPT } from "../scripts/client/attention.js";
import { CONTROL_CLIENT_SCRIPT as UI_REQUEST_CLIENT_SCRIPT } from "../scripts/control.js";
import { createArrivalShell, type ArrivalPrimitives } from "./shell.js";
import { createBriefTime, createWorkbenchProjectBriefRenderer } from "./project-brief.js";
import { CHOOSER_CLIENT_SCRIPT } from "./chooser-client.js";
import type { WebProjectNavigation } from "../settings-navigation.js";

/** What the chooser remembers about this Home's projects. Presentation only; the Host reads it from `config/project-arrival.json`. */
export interface ChooserArrival {
  now: string;
  /** The project last opened, preselected so Enter continues where the person was. */
  last_project_id: string | null;
  /** When each project was last opened here. */
  opened: Readonly<Record<string, string>>;
  /** The project list could not be read: the chooser says so where the list would be, and the personal space still opens. */
  load_error?: boolean;
}

const PERSONAL = "personal";

export function createWorkbenchProjectChooserRenderer(p: ArrivalPrimitives) {
  const { readText, escapeHtml, icon } = p;
  const shell = createArrivalShell(p);
  const brief = createWorkbenchProjectBriefRenderer({ readText, escapeHtml, dateTimeLocale: p.dateTimeLocale });

  const greeting = (now: Date) => {
    const hour = now.getHours();
    return hour < 5 ? uiText.text("workbench.chooser.working-late") : hour < 11 ? uiText.text("workbench.chooser.good-morning") : hour < 13 ? uiText.text("workbench.chooser.good-midday") : hour < 18 ? uiText.text("workbench.chooser.good-afternoon") : uiText.text("workbench.chooser.good-evening");
  };

  const mark = (entry: { project_id: string; display_name: string }) =>
    entry.project_id === PERSONAL ? icon("user") : renderProjectMonogram(entry.display_name, entry.project_id, escapeHtml);

  function renderMolisWorkProjectIndex(
    allProjects: readonly WebProjectNavigation[],
    controlToken = "",
    desktopShell = false,
    arrival: ChooserArrival = { now: new Date().toISOString(), last_project_id: null, opened: {} },
  ): string {
    const href = (path: string) => shell.href(desktopShell, path);
    const time = createBriefTime({ readText, dateTimeLocale: p.dateTimeLocale }, arrival.now);
    const now = new Date(arrival.now);
    // The personal space is a location, not a project: it is always offered first and made when first opened.
    const personal = { project_id: PERSONAL, display_name: uiText.text("workbench.chooser.personal-space"), data_class: "user" as const };
    const projects = allProjects.filter(project => project.project_id !== PERSONAL);
    // Most recently opened first; projects never opened here keep the catalog's order after them.
    const ordered = projects.map((project, index) => ({ project, index, at: arrival.opened[project.project_id] ?? "" }))
      .sort((a, b) => (b.at ? 1 : 0) - (a.at ? 1 : 0) || b.at.localeCompare(a.at) || a.index - b.index).map(entry => entry.project);
    const last = ordered.find(project => project.project_id === arrival.last_project_id) ?? ordered[0] ?? null;
    const selected = last ? last.project_id : PERSONAL;
    const entryPath = (id: string) => href(`/projects/${encodeURIComponent(id)}/`);

    const row = (entry: { project_id: string; display_name: string; data_class?: string }, caption: string) => {
      const on = entry.project_id === selected;
      return renderDirectoryRow({
        title: entry.display_name, caption, density: "meta", selected: on,
        attrs: {
          id: `row-${entry.project_id}`, role: "option", "aria-selected": String(on), tabindex: on ? "0" : "-1",
          "data-id": entry.project_id, "data-name": entry.display_name, "data-mark": mark(entry), "data-href": entryPath(entry.project_id), "data-opened-at": arrival.opened[entry.project_id] ?? null,
          "data-demo": entry.data_class === "regenerable_demo" ? "" : null,
        },
      });
    };
    const projectRows = ordered.map(project => {
      const opened = arrival.opened[project.project_id];
      const demo = project.data_class === "regenerable_demo";
      const caption = [demo ? uiText.text("workbench.chooser.demo-data") : "", opened ? time.ago(opened) : uiText.text("workbench.chooser.not-opened-yet")].filter(Boolean).join(" · ");
      return row(project, caption);
    }).join("");
    const failed = `<div class="mw-empty mw-empty--error chooser-error" role="alert"><span class="mw-empty__mark">${icon("circle-alert")}</span><h2>${uiText("workbench.chooser.can-t-read-project-list-right-now")}</h2><p>${uiText("workbench.chooser.project-directory-computer-didn-t-answer-personal-space")}</p>${renderButton({ variant: "secondary", size: "md", icon: "refresh", label: uiText.text("common.control.retry"), attrs: { "data-act": "reload" } })}</div>`;
    const rows = `${renderDirectoryHeading(uiText.text("workbench.chooser.personal"))}${row(personal, uiText.text("workbench.chooser.materials-work-that-belong-no-project"))}${arrival.load_error ? failed : projectRows ? `${renderDirectoryHeading(uiText.text("workbench.chooser.projects-most-recently-opened-first"))}${projectRows}` : ""}`;

    const entry = last ?? personal;
    const subtitle = last && arrival.opened[last.project_id]
      ? uiText.text("workbench.chooser.last-name-when", { name: last.display_name, when: time.ago(arrival.opened[last.project_id]!) }) : uiText.text("workbench.chooser.welcome-molis-work");
    const list = `<header class="chooser-head"><p class="chooser-greeting" data-greeting><strong>${greeting(now)}</strong><span>${escapeHtml(subtitle)}</span></p></header>
      <label class="mw-input-group chooser-search">${icon("search")}<input class="mw-input" id="chooser-q" type="search" placeholder="${uiText("workbench.chooser.search-projects")}" aria-label="${uiText("workbench.chooser.search-projects")}" autocomplete="off" spellcheck="false" aria-controls="chooser-dir"><span class="chooser-search__key">${renderKbd("⌘K")}</span></label>
      <div class="chooser-dir" id="chooser-dir" role="listbox" aria-label="${uiText("workbench.chooser.personal-space-projects")}">${rows}</div>
      <p class="chooser-none" data-chooser-none hidden role="status">${uiText("workbench.chooser.no-matching-projects")}</p>
      <p class="chooser-foot">${icon("folder")}<span>${uiText("workbench.chooser.projects-documents-saved-computer")}</span></p>`;

    // The right-hand sheet starts with what is known (the name); the brief arrives from the Host a moment after.
    const detail = projects.length || selected !== PERSONAL
      ? brief.renderProjectBriefLoading(entry.display_name, entry.project_id)
      : brief.renderProjectBriefLoading(personal.display_name, PERSONAL);
    const stage = `<main class="arrival-stage" id="stage"><div class="stage-split chooser" data-view="chooser" data-selected="${escapeHtml(selected)}" data-projects="${projects.length}">
      <aside class="stage-side chooser-list" id="chooser-list">${list}</aside>
      <section class="stage-sheet chooser-detail" id="chooser-detail" role="region" aria-label="${uiText("workbench.chooser.project-brief")}" aria-live="polite" tabindex="0" data-scroll>${detail}</section>
    </div></main>`;

    const personalSelected = selected === PERSONAL;
    const context = renderBarContext({ mark: mark(entry), title: entry.display_name, caption: uiText.text("workbench.chooser.previewing-enter-open") });
    const enter = `<a class="mw-btn mw-btn--primary mw-btn--lg" data-slot="button" data-act="enter" href="${entryPath(selected)}" aria-keyshortcuts="Enter"><span data-slot="button-label">${personalSelected ? uiText("workbench.chooser.open-personal-space") : uiText("workbench.chooser.open-project")}</span><kbd class="mw-btn__key" aria-hidden="true">↵</kbd></a>`;
    const create = `<a class="mw-btn mw-btn--secondary mw-btn--lg" data-slot="button" data-act="new" aria-label="${uiText("workbench.chooser.new-project")}" href="${href("/onboarding?mode=new-project")}">${icon("plus")}<span data-slot="button-label">${uiText("workbench.chooser.new-project")}</span></a>`;
    const bar = shell.bar({ kind: "chooser", start: context, center: renderAssistantDock({ readText, icon }), end: `${create}${enter}` });

    // Fragments the chooser cannot make without the person's words: what to say when nothing matches, and when nothing exists yet.
    const none = renderEmpty({ icon: "search", title: uiText.text("workbench.chooser.no-project-called-q"), body: uiText.text("workbench.chooser.try-another-word-start-new-project-anything-that"),
      action: `<div class="brief-none__actions">${renderButton({ variant: "secondary", size: "lg", icon: "x", label: uiText.text("workbench.chooser.clear-search"), attrs: { "data-act": "clear-search" } })}${renderButton({ variant: "primary", size: "lg", icon: "plus", label: uiText.text("workbench.chooser.new-q"), attrs: { "data-act": "new-named" } })}</div>` });
    const nobody = renderEmpty({ icon: "folder", title: uiText.text("workbench.chooser.start-real-project"), body: uiText.text("workbench.chooser.bring-files-pages-chats-working-sort-them-into"),
      action: `<div class="brief-none__actions"><a class="mw-btn mw-btn--primary mw-btn--lg" data-slot="button" href="${href("/onboarding?mode=new-project")}">${icon("plus")}<span data-slot="button-label">${uiText("workbench.chooser.new-materials")}</span></a><a class="mw-btn mw-btn--secondary mw-btn--lg" data-slot="button" href="${href("/onboarding?mode=new-project&start=blank")}"><span data-slot="button-label">${uiText("workbench.chooser.start-blank")}</span></a></div>` });
    const templates = `<template data-tpl="loading">${brief.renderProjectBriefLoading("{name}", "{id}")}</template>
      <template data-tpl="error">${brief.renderProjectBriefError("{name}", "{id}", "")}</template>
      <template data-tpl="none"><article class="mw-brief brief-none">${none}</article></template>
      <template data-tpl="nobody"><article class="mw-brief brief-none">${nobody}</article></template>`;
    const data = JSON.stringify({ selected, projects: ordered.map(project => project.project_id), personalTitle: personal.display_name, firstName: last?.display_name ?? null, loadError: Boolean(arrival.load_error) })
      .replaceAll("<", "\\u003c");
    const scripts = `${UI_REQUEST_CLIENT_SCRIPT}${p.visualFoundationClientScript}${ARRIVAL_MOTION_CLIENT_SCRIPT}${DROP_ZONE_CLIENT_SCRIPT}${COMPOSER_LOADER_CLIENT_SCRIPT}
// The Assistant and what waits on the person speak for the project chosen here, or for the person outside any project.
const chosenRoute = path => { const id = document.querySelector('.chooser')?.dataset.selected; return id && id !== 'personal' ? '/projects/' + encodeURIComponent(id) + path : path; };
(${ATTENTION_FACTORY_SCRIPT})({ translate: globalThis.t.text, route: chosenRoute, projectId: null, openItem: () => {} });
globalThis.__ARRIVAL_ASSISTANT__ = (${ASSISTANT_ISLAND_FACTORY_SCRIPT})({ translate: globalThis.t.text, route: chosenRoute, headers: () => molisWorkControlHeaders(), project: null, interaction: (client => (root, host) => client(root, { references: (source, query) => molisWorkRequest(chosenRoute("/api/search/references"), { body: { kinds: source.split(","), query, limit: 8 }, fallback: globalThis.t.text("workbench.chooser.search-not-available-right-now-try-again-later") }).then(found => ({ items: found.candidates.map(item => ({ value: item.kind + " " + item.id, label: item.label, meta: item.plugin_title })) })), ...host }))((${INTERACTION_CLIENT_SCRIPT_TYPED_DATES})), receipts: (${INPUT_RECEIPTS_CLIENT_SCRIPT})(globalThis.t.text),
  placeholder: project => project && project.title ? globalThis.t.text("workbench.chooser.ask-about-name-give-assistant-task", { name: project.title }) : globalThis.t.text("workbench.chooser.ask-assistant-do-something-personal-space") });
${CHOOSER_CLIENT_SCRIPT}`;
    return shell.document({
      title: uiText.text("workbench.chooser.choose-project-molis-work"), screen: "chooser", desktopShell, controlToken,
      titlebar: shell.titlebar(desktopShell, { caption: true, tasks: true, account: true }), stage, bar,
      after: `${templates}<script type="application/json" id="arrival-data">${data}</script>`,
      scripts,
    });
  }

  return { renderMolisWorkProjectIndex, renderProjectBrief: brief.renderProjectBrief };
}
