import {
  ARRIVAL_MOTION_CLIENT_SCRIPT,
  renderBarContext,
  renderDirectoryHeading,
  renderDirectoryRow,
  renderEmpty,
  renderButton,
  renderKbd,
  renderProjectMonogram,
} from "@molis-ai/molis-work-design-system";
import { renderAssistantDock } from "../assistant-dock.js";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../scripts/client/assistant-island.js";
import { BACKGROUND_TASKS_FACTORY_SCRIPT } from "../scripts/client/background-tasks.js";
import { CONTROL_CLIENT_SCRIPT } from "../browser-assets.js";
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
  const { L, escapeHtml, icon } = p;
  const shell = createArrivalShell(p);
  const brief = createWorkbenchProjectBriefRenderer({ L, escapeHtml, dateTimeLocale: p.dateTimeLocale });

  const greeting = (now: Date) => {
    const hour = now.getHours();
    return hour < 5 ? L("夜深了") : hour < 11 ? L("早上好") : hour < 13 ? L("中午好") : hour < 18 ? L("下午好") : L("晚上好");
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
    const time = createBriefTime({ L, dateTimeLocale: p.dateTimeLocale }, arrival.now);
    const now = new Date(arrival.now);
    // The personal space is a location, not a project: it is always offered first and made when first opened.
    const personal = { project_id: PERSONAL, display_name: L("个人空间"), data_class: "user" as const };
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
      const caption = [demo ? L("演示数据") : "", opened ? time.ago(opened) : L("还没打开过")].filter(Boolean).join(" · ");
      return row(project, caption);
    }).join("");
    const failed = `<div class="mw-empty mw-empty--error chooser-error" role="alert"><span class="mw-empty__mark">${icon("circle-alert")}</span><h2>${L("项目列表暂时读不到")}</h2><p>${L("本机的项目目录没有响应。个人空间不受影响，可以先在那里工作。")}</p>${renderButton({ variant: "secondary", size: "md", icon: "refresh", label: L("重试"), attrs: { "data-act": "reload" } })}</div>`;
    const rows = `${renderDirectoryHeading(L("个人"))}${row(personal, L("不属于任何项目的资料和工作"))}${arrival.load_error ? failed : projectRows ? `${renderDirectoryHeading(L("项目 · 按最近打开"))}${projectRows}` : ""}`;

    const entry = last ?? personal;
    const subtitle = last && arrival.opened[last.project_id]
      ? L("上次在 {name} · {when}", { name: last.display_name, when: time.ago(arrival.opened[last.project_id]!) }) : L("欢迎来到 Molis Work");
    const list = `<header class="chooser-head"><p class="chooser-greeting" data-greeting><strong>${greeting(now)}</strong><span>${escapeHtml(subtitle)}</span></p></header>
      <label class="mw-input-group chooser-search">${icon("search")}<input class="mw-input" id="chooser-q" type="search" placeholder="${L("搜索项目")}" aria-label="${L("搜索项目")}" autocomplete="off" spellcheck="false" aria-controls="chooser-dir"><span class="chooser-search__key">${renderKbd("⌘K")}</span></label>
      <div class="chooser-dir" id="chooser-dir" role="listbox" aria-label="${L("个人空间与项目")}">${rows}</div>
      <p class="chooser-none" data-chooser-none hidden role="status">${L("没有匹配的项目")}</p>
      <p class="chooser-foot">${icon("folder")}<span>${L("项目和文档保存在这台电脑。")}</span></p>`;

    // The right-hand sheet starts with what is known (the name); the brief arrives from the Host a moment after.
    const detail = projects.length || selected !== PERSONAL
      ? brief.renderProjectBriefLoading(entry.display_name, entry.project_id)
      : brief.renderProjectBriefLoading(personal.display_name, PERSONAL);
    const stage = `<main class="arrival-stage" id="stage"><div class="stage-split chooser" data-view="chooser" data-selected="${escapeHtml(selected)}" data-projects="${projects.length}">
      <aside class="stage-side chooser-list" id="chooser-list">${list}</aside>
      <section class="stage-sheet chooser-detail" id="chooser-detail" role="region" aria-label="${L("项目简介")}" aria-live="polite" tabindex="0" data-scroll>${detail}</section>
    </div></main>`;

    const personalSelected = selected === PERSONAL;
    const context = renderBarContext({ mark: mark(entry), title: entry.display_name, caption: L("预览中 · 回车进入") });
    const enter = `<a class="mw-btn mw-btn--primary mw-btn--lg" data-slot="button" data-act="enter" href="${entryPath(selected)}" aria-keyshortcuts="Enter"><span data-slot="button-label">${personalSelected ? L("进入个人空间") : L("进入项目")}</span><kbd class="mw-btn__key" aria-hidden="true">↵</kbd></a>`;
    const create = `<a class="mw-btn mw-btn--secondary mw-btn--lg" data-slot="button" data-act="new" aria-label="${L("新建项目")}" href="${href("/onboarding?mode=new-project")}">${icon("plus")}<span data-slot="button-label">${L("新建项目")}</span></a>`;
    const bar = shell.bar({ kind: "chooser", start: context, center: renderAssistantDock({ L, icon }), end: `${create}${enter}` });

    // Fragments the chooser cannot make without the person's words: what to say when nothing matches, and when nothing exists yet.
    const none = renderEmpty({ icon: "search", title: L("没有叫「{q}」的项目"), body: L("换个关键词，或者就用它开始一个新项目。不属于任何项目的事，也可以先放进个人空间。"),
      action: `<div class="brief-none__actions">${renderButton({ variant: "secondary", size: "lg", icon: "x", label: L("清除搜索"), attrs: { "data-act": "clear-search" } })}${renderButton({ variant: "primary", size: "lg", icon: "plus", label: L("新建「{q}」"), attrs: { "data-act": "new-named" } })}</div>` });
    const nobody = renderEmpty({ icon: "folder", title: L("从一个真实项目开始"), body: L("带入正在做的文件、网页或聊天记录，整理成项目；也可以空白开始。个人空间随时可用。"),
      action: `<div class="brief-none__actions"><a class="mw-btn mw-btn--primary mw-btn--lg" data-slot="button" href="${href("/onboarding?mode=new-project")}">${icon("plus")}<span data-slot="button-label">${L("带入材料新建")}</span></a><a class="mw-btn mw-btn--secondary mw-btn--lg" data-slot="button" href="${href("/onboarding?mode=new-project&start=blank")}"><span data-slot="button-label">${L("空白开始")}</span></a></div>` });
    const templates = `<template data-tpl="loading">${brief.renderProjectBriefLoading("{name}", "{id}")}</template>
      <template data-tpl="error">${brief.renderProjectBriefError("{name}", "{id}", "")}</template>
      <template data-tpl="none"><article class="mw-brief brief-none">${none}</article></template>
      <template data-tpl="nobody"><article class="mw-brief brief-none">${nobody}</article></template>`;
    const data = JSON.stringify({ selected, projects: ordered.map(project => project.project_id), personalTitle: personal.display_name, firstName: last?.display_name ?? null })
      .replaceAll("<", "\\u003c");
    const scripts = `${p.clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${p.visualFoundationClientScript}${ARRIVAL_MOTION_CLIENT_SCRIPT}
(${BACKGROUND_TASKS_FACTORY_SCRIPT})({ translate: globalThis.L, projectId: null, openItem: () => {} });
globalThis.__ARRIVAL_ASSISTANT__ = (${ASSISTANT_ISLAND_FACTORY_SCRIPT})({ translate: globalThis.L, route: path => path, headers: () => molisWorkControlHeaders(), project: null,
  placeholder: project => project && project.title ? globalThis.L("问问「{name}」的进展，或交给助理一项工作…", { name: project.title }) : globalThis.L("在个人空间里，让助理做点什么…") });
${CHOOSER_CLIENT_SCRIPT}`;
    return shell.document({
      title: L("选择项目 · Molis Work"), screen: "chooser", desktopShell, controlToken,
      titlebar: shell.titlebar(desktopShell, { caption: true }), stage, bar,
      after: `${templates}<script type="application/json" id="arrival-data">${data}</script><div class="arrival-toasts" id="toasts" aria-live="polite"></div>`,
      scripts,
    });
  }

  return { renderMolisWorkProjectIndex, renderProjectBrief: brief.renderProjectBrief };
}
