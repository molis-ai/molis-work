import assert from "node:assert/strict";
import test from "node:test";
import {
  renderMolisWorkProjectIndexStylesheet,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWorkbenchStylesheet,
} from "./workbench-renderer-fixture.js";

test("project index, settings, and workbench keep titles pinned and scroll only the content lists", () => {
  const index = renderMolisWorkProjectIndexStylesheet();
  const settings = renderMolisWorkSettingsStylesheet();
  const workbench = renderMolisWorkWorkbenchStylesheet();

  assert.match(index, /html \{[^}]*overflow: hidden;/);
  assert.doesNotMatch(index, /body\.project-index-page \{ overflow: auto/);
  assert.match(index, /body\.project-index-page \{[^}]*overflow: hidden;/);
  assert.match(index, /\.project-index \{[^}]*overflow: hidden;/);
  assert.doesNotMatch(index, /\.project-index \{[^}]*overflow: auto;/);
  assert.match(index, /\.project-index-body \{[^}]*overflow: auto;[^}]*overscroll-behavior: contain;/);
  assert.match(index, /body\.project-index-page \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(index, /body\.project-index-page > \.topbar > \.brand \{[^}]*display: flex;/);
  assert.doesNotMatch(index, /\.project-card footer svg \{[^}]*rotate\(180deg\)/);
  assert.ok(
    index.lastIndexOf("body.project-index-page[data-desktop-shell=\"true\"]:not(.settings-page) > .topbar > .brand")
      > index.lastIndexOf("body[data-desktop-shell=\"true\"]:not(.settings-page) .topbar > .brand"),
    "project-index chrome must win over workbench topbar hiding",
  );

  assert.match(settings, /body\.settings-page \{[^}]*overflow: hidden;/);
  assert.match(settings, /\.settings-content \{[^}]*overflow: hidden;/);
  assert.match(settings, /body\.settings-page\[data-desktop-shell="true"\]:has\(\.settings-navigation\) \.settings-content \{[\s\S]*grid-column: 2;/);
  assert.match(settings, /body\.settings-page\[data-desktop-shell="true"\]:is\(\[data-settings-section="projects"\], \[data-settings-section="project"\]\) \.settings-content \{[\s\S]*grid-column: 1;/);
  assert.match(settings, /\.settings-body \{[^}]*overflow: auto;[^}]*overscroll-behavior: contain;/);
  assert.doesNotMatch(settings, /\.settings-shell \{ height: calc\(100dvh - 58px\)/);

  assert.match(workbench, /body\.immersive-workbench \{[\s\S]*overflow: hidden;[\s\S]*overscroll-behavior: none;/);
  assert.ok(workbench.includes("immersive-plugin-stage > * { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }"));
  assert.ok(workbench.includes("immersive-plugin-stage > .goal-canvas-shell"));
  assert.ok(workbench.includes("tab-pane-body > .goal-canvas-shell"));
  assert.ok(workbench.includes("tab-workspace { position: absolute; inset: 0"));
  assert.ok(workbench.includes("[data-pane-embedded] .immersive-workspace > :is(.plugin-stack, .plugin-rail, .assistant-island, .tree-pane, .tree-resizer, .immersive-titlebar, .workspace-chrome, .mobile-tabs, .immersive-sidebar-scrim)"));
  assert.ok(workbench.includes(":is(.immersive-plugin-stage > .immersive-market, .tab-workspace-exclusive > .immersive-market, .tab-pane-body > .immersive-market) { overflow: hidden; display: flex; flex-direction: column;"));
  assert.ok(workbench.includes("plugin-market-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;"));
  assert.match(workbench, /\.plugin-market-search \{[\s\S]*min-height: 40px/);
  assert.doesNotMatch(workbench, /\.plugin-market-search input \{[^}]*border: 1px solid/);
  assert.doesNotMatch(workbench, /\.plugin-market-search svg \{[^}]*position: absolute/);
  assert.match(workbench, /\.global-search-field input \{[\s\S]*appearance: none; -webkit-appearance: none;/);
  assert.match(workbench, /:not\(\.global-search-query\)/);
  assert.match(workbench, /\.global-search-field input:is\(:focus, :focus-visible\) \{[\s\S]*background: transparent;/);
  assert.ok(workbench.includes("plugin-market-list { display: grid;"));
  assert.doesNotMatch(workbench, /plugin-market-grid article \{ padding: 24px;/);
  assert.ok(workbench.includes(".feed-workbench { padding: 0; background: var(--canvas); overflow: auto; overscroll-behavior: contain; }"));
  assert.match(workbench, /feed-stage-list .goal-collection-fold > summary/);
  assert.match(workbench, /plugin-stage-list \.goal-collection-fold \.feed-stage-entry \{ padding-left: 24px; \}/);
  assert.match(workbench, /plugin-stage-list \.goal-collection-fold > :is\(\.mw-dir-row, a\.mw-dir-row\) \{ padding-left: 24px; \}/);
  assert.match(workbench, /plugin-stage-list \.goal-collection-fold \.shelf-row \{ padding-left: 24px; \}/);
  assert.doesNotMatch(workbench, /plugin-stage-shell\[data-expanded="true"\] \.shelf-stage-chrome \{ display: none; \}/);
  assert.match(workbench, /\[data-shelf-stage-shell\]\[data-expanded="true"\] \{ --tree-width: 213px/);
  assert.match(workbench, /plugin-stage-list \.artifact-empty \{ max-width: 32ch;/);
  assert.match(workbench, /feed-stage-list \.goal-collection-empty \{ margin: 0; padding: 6px 8px 10px 24px;/);
  assert.ok(workbench.includes("scrollbar-width: none"));
  assert.ok(workbench.includes(".directory-content-scroll::-webkit-scrollbar { width: 0; height: 0; }"));
  assert.ok(workbench.includes(":is(.tree-scroll, .project-record-scroll, .feed-directory-list, .source-directory-list, .feed-item-scroll, .source-list) { flex: none; height: auto; min-height: 0; overflow: visible;"));
  assert.doesNotMatch(workbench, /\.directory-shortcuts/);
  assert.ok(workbench.includes(".immersive-home .home-shortcuts { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: flex-start; gap: 18px; list-style: none; margin: 0; padding: 0; }"));
  assert.doesNotMatch(workbench, /\.directory-list-stage > \.desktop-directory-root:not\(\[hidden\]\) \{ display: block;/);
  assert.match(workbench, /--dir-row-h: 28px;/);
  assert.match(workbench, /--plugin-rail-width: 48px;/);
  assert.ok(workbench.includes("grid-template-columns: var(--plugin-rail-width) var(--tree-width, var(--immersive-sidebar-width)) minmax(0, 1fr)"));
  assert.match(workbench, /--plugin-rail-gap: 8px;/);
  assert.match(workbench, /\.plugin-stack \{[\s\S]*gap: var\(--plugin-rail-gap\);/);
  assert.doesNotMatch(workbench, /--project-island-offset/);
  assert.doesNotMatch(workbench, /padding: 8px 6px 10px/);
  assert.match(workbench, /\.plugin-stack \{\n    grid-column: 1; grid-row: 2;/);
  assert.match(workbench, /\.plugin-rail \{\n    flex: 1;/);
  assert.match(workbench, /\.plugin-rail-items,[\s\S]*\.plugin-rail \.personal-sidebar-footer,[\s\S]*\.assistant-island-card \{[\s\S]*background: var\(--nav-raised\);/);
  assert.match(workbench, /\.plugin-rail-items \{[\s\S]*flex: 1;/);
  assert.match(workbench, /\.plugin-rail-items \[data-plugin-id="market"\] \{ margin-top: auto; \}/);
  assert.match(workbench, /:is\(\.plugin-rail, \.assistant-island\) \.immersive-plugin-link svg \{ color: var\(--plugin-tint, var\(--faint\)\)/);
  assert.doesNotMatch(workbench, /\.plugin-rail \.immersive-plugin-link:hover svg \{ color: var\(--ink\)/);
  assert.doesNotMatch(workbench, /\.plugin-rail \.immersive-plugin-link\[aria-current\] svg \{ color: var\(--ink\)/);
  assert.match(workbench, /\.assistant-island \{/);
  assert.match(workbench, /\.assistant-composer \{[\s\S]*width: min\(480px, calc\(100vw - 88px\)\);[\s\S]*max-height: min\(620px, 85vh\);[\s\S]*border-radius: 16px;[\s\S]*flex-direction: row;/);
  assert.match(workbench, /:not\(\.assistant-composer-input\)/);
  assert.match(workbench, /input\.assistant-composer-input:is\(:hover, :focus, :focus-visible\) \{[\s\S]*outline: none;[\s\S]*border: 0;/);
  assert.match(workbench, /\.assistant-composer:popover-open \{ display: flex; inset: auto; margin: 0; \}/);
  assert.match(workbench, /\.workspace-chrome\.project-island \{/);
  assert.match(workbench, /\.workspace-chrome\.project-island \{[\s\S]*flex: none;/);
  assert.match(workbench, /\.plugin-stack:has\(\[data-project-menu\]\[open\]\) \{ z-index: 50; \}/);
  assert.match(workbench, /\.workspace-chrome\.project-island:has\(\[data-project-menu\]\[open\]\) \{ z-index: 50; \}/);
  assert.match(workbench, /\.workspace-chrome \.navigator-project-primary \{[\s\S]*flex-direction: column;/);
  assert.match(workbench, /\.immersive-plugin-stage \{ grid-column: 3; grid-row: 2 \/ -1; position: relative; z-index: 0;/);
  assert.match(workbench, /grid-template-rows: var\(--desktop-titlebar-height\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(workbench, /\.immersive-titlebar > \.workspace-chrome \{/);
  assert.match(workbench, /\[data-board-view="list"\]\[data-expanded="true"\] \{[\s\S]*grid-template-columns: var\(--tree-width, var\(--immersive-sidebar-width\)\) minmax\(0, 1fr\)/);
  assert.match(workbench, /\.session-stage-shell\[data-expanded="true"\] \{[\s\S]*grid-template-columns: var\(--tree-width, var\(--immersive-sidebar-width\)\) minmax\(0, 1fr\)/);
  assert.match(workbench, /\.plugin-stage-shell\[data-expanded="true"\] \{[\s\S]*grid-template-columns: var\(--tree-width, var\(--immersive-sidebar-width\)\) minmax\(0, 1fr\)/);
  assert.match(workbench, /\.plugin-stage-list \.mw-dir-row-wrap:has\(\.is-selected\)::before,[\s\S]*content: none; display: none; width: 0;/);
  assert.match(workbench, /\.plugin-stage-detail-bar \{[\s\S]*padding: 8px 16px 8px 20px;/);
  assert.match(workbench, /\.plugin-stage-detail-bar\[data-stage-back-only\] \{[\s\S]*position: absolute;/);
  assert.match(workbench, /\.plugin-stage-detail-bar > \.feed-detail-kicker \{[\s\S]*margin: 0;/);
  assert.match(workbench, /\.plugin-stage-detail-bar > h1 \{[\s\S]*font-size: 13px;/);
  assert.match(workbench, /\.plugin-stage-back \{[\s\S]*margin-left: -6px;/);
  assert.match(workbench, /\.session-stage-bar \{[\s\S]*padding: 8px 16px 8px 20px;/);
  assert.match(workbench, /\.session-stage-back \{[\s\S]*margin-left: -6px;/);
  assert.match(workbench, /body\.immersive-workbench \.goal-node-toolbar,[\s\S]*body\.immersive-workbench \.plugin-stage-detail-bar,[\s\S]*body\.immersive-workbench \.session-stage-bar \{ min-height: 32px; padding: 4px 10px; gap: 8px; \}/);
  assert.match(workbench, /plugin-stage-workspace \.artifact-detail,[\s\S]*plugin-stage-workspace \.artifact-empty \{ max-width: none; margin: 0; \}/);
  assert.doesNotMatch(workbench, /plugin-stage-workspace \.artifact-empty \{ max-width: 800px; margin: 24px auto; \}/);
  assert.match(workbench, /immersive-plugin-stage > \.session-stage-shell[\s\S]*?padding: 0;/);
  assert.match(workbench, /body\.immersive-workbench\[data-native-desktop="true"\] \[data-titlebar-tabs\] \.tab-scroll \{ flex: 0 1 auto; width: max-content; min-width: 0; \}/);
  assert.match(workbench, /body\.immersive-workbench\[data-native-desktop="true"\] \.tab-strip \.tab-strip-spacer \{ flex: 1 1 48px; min-width: 48px;/);
  assert.match(workbench, /html\[data-native-desktop="true"\] body\.immersive-workbench \.immersive-titlebar/);
  assert.match(workbench, /\[data-native-desktop="true"\] \.immersive-titlebar \{[^}]*margin-inline-start: var\(--desktop-window-safe-inline-start, 88px\)/);
  assert.doesNotMatch(workbench, /\[data-native-desktop="true"\] \.immersive-titlebar \{[^}]*padding-left: var\(--desktop-window-safe-inline-start/);
  assert.doesNotMatch(workbench, /is-plugin-directory-empty > \.workspace-chrome\.project-island/);
  assert.doesNotMatch(workbench, /\.workspace-chrome\.project-island \{[^}]*grid-column: 1 \/ 3/);
  assert.doesNotMatch(workbench, /\.immersive-titlebar > \.workspace-chrome,/);
  assert.match(workbench, /body\.immersive-workbench \{[\s\S]*--control-h: 28px;/);
  assert.match(workbench, /:is\(body\.project-preferences-page, \.settings-stage\), body\.settings-page \{ --control-h: 32px; \}/);
  assert.doesNotMatch(workbench, /:is\(body\.project-preferences-page, \.settings-stage\) \{ --control-h: 28px; \}/);
});

test("feed stage search keeps a single frame", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(workbench, /:not\(\[data-feed-search\]\)/);
  assert.match(workbench, /body\.immersive-workbench \.feed-stage-search \{[^}]*border: 1px solid var\(--line\)/);
  assert.match(workbench, /\.feed-stage-search input \{[\s\S]*appearance: none; -webkit-appearance: none;/);
  assert.match(workbench, /\.feed-stage-search input:is\(:focus, :focus-visible\) \{[\s\S]*background: transparent;/);
  assert.doesNotMatch(workbench, /\.feed-stage-search input \{[^}]*border: 1px solid/);
});

test("Functions and Form editors scroll inside the pinned plugin-stage workspace", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const functionsEditor = workbench.match(/\.functions-editor \{[^}]+\}/)?.[0] ?? "";
  const functionsCol = workbench.match(/\.functions-col \{[^}]+\}/)?.[0] ?? "";
  const formWorkspace = workbench.match(/\.form-workspace \{[^}]+\}/)?.[0] ?? "";
  assert.match(functionsEditor, /flex: 1;/);
  assert.match(functionsEditor, /overflow: hidden;/);
  assert.doesNotMatch(functionsEditor, /overflow: visible;/);
  assert.doesNotMatch(functionsEditor, /flex: none;/);
  assert.match(functionsCol, /overflow: auto;/);
  assert.match(functionsCol, /overscroll-behavior: contain;/);
  assert.match(formWorkspace, /flex: 1;/);
  assert.match(formWorkspace, /overflow: auto;/);
  assert.match(formWorkspace, /overscroll-behavior: contain;/);
  assert.doesNotMatch(formWorkspace, /overflow: visible;/);
  assert.doesNotMatch(formWorkspace, /flex: none;/);
  assert.match(workbench, /plugin-stage-workspace > \.functions-editor \{\s*flex: 1; min-height: 0;/);
  assert.match(workbench, /plugin-stage-workspace > \.form-workspace \{ flex: 1; min-height: 0; \}/);
  assert.doesNotMatch(workbench, /plugin-stage-workspace > \.functions-editor \{ flex: none;/);
  assert.doesNotMatch(workbench, /plugin-stage-workspace > \.form-workspace \{ flex: none;/);
});
