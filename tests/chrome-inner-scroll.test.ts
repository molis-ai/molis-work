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
    index.lastIndexOf("body.project-index-page > .topbar > .brand")
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
  assert.ok(workbench.includes("[data-pane-embedded] .immersive-workspace > :is(.plugin-rail, .tree-pane, .tree-resizer, .immersive-titlebar, .workspace-chrome, .mobile-tabs, .immersive-sidebar-scrim)"));
  assert.ok(workbench.includes("immersive-plugin-stage > .immersive-market { overflow: hidden; display: flex; flex-direction: column;"));
  assert.ok(workbench.includes("plugin-market-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;"));
  assert.ok(workbench.includes("plugin-market-list { display: grid;"));
  assert.doesNotMatch(workbench, /plugin-market-grid article \{ padding: 24px;/);
  assert.ok(workbench.includes(".feed-workbench { padding: 0; background: var(--canvas); overflow: auto; overscroll-behavior: contain; }"));
  assert.match(workbench, /feed-stage-list .goal-collection-fold > summary/);
  assert.ok(workbench.includes("scrollbar-width: none"));
  assert.ok(workbench.includes(".directory-content-scroll::-webkit-scrollbar { width: 0; height: 0; }"));
  assert.ok(workbench.includes(":is(.tree-scroll, .project-record-scroll, .feed-directory-list, .source-directory-list, .feed-item-scroll, .source-list) { flex: none; height: auto; min-height: 0; overflow: visible;"));
  assert.doesNotMatch(workbench, /\.directory-shortcuts/);
  assert.ok(workbench.includes(".immersive-home .home-shortcuts { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: flex-start; gap: 18px; list-style: none; margin: 0 0 16px; padding: 0; }"));
  assert.doesNotMatch(workbench, /\.directory-list-stage > \.desktop-directory-root:not\(\[hidden\]\) \{ display: block;/);
  assert.match(workbench, /--dir-row-h: 28px;/);
  assert.match(workbench, /--plugin-rail-width: 48px;/);
  assert.ok(workbench.includes("grid-template-columns: var(--plugin-rail-width) var(--tree-width, var(--immersive-sidebar-width)) minmax(0, 1fr)"));
  assert.match(workbench, /\.plugin-rail \{\n    grid-column: 1; grid-row: 2 \/ -1;/);
  assert.match(workbench, /\.immersive-titlebar > \.workspace-chrome \{/);
  assert.match(workbench, /grid-template-rows: var\(--desktop-titlebar-height\) minmax\(0, 1fr\)/);
  assert.match(workbench, /width: calc\(var\(--plugin-rail-width\) \+ var\(--tree-width, var\(--immersive-sidebar-width\)\)\);/);
  assert.match(workbench, /body\.immersive-workbench \{[\s\S]*--control-h: 28px;/);
  assert.match(workbench, /:is\(body\.project-preferences-page, \.settings-stage\), body\.settings-page \{ --control-h: 32px; \}/);
  assert.doesNotMatch(workbench, /:is\(body\.project-preferences-page, \.settings-stage\) \{ --control-h: 28px; \}/);
});
