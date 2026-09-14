import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GOALBOARD_DENSITY_STORAGE_KEY,
  GOALBOARD_TERMINAL_THEME_STORAGE_KEY,
  GOALBOARD_THEME_STORAGE_KEY,
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
} from "@adeptify/goalboard-design-system";
import {
  renderGoalBoardProjectIndexStylesheet,
  renderGoalBoardSettingsStylesheet,
  renderGoalBoardWorkbenchStylesheet,
} from "./workbench-renderer-fixture.js";

test("visual foundation keeps Light, Dark, and System as local presentation choices", () => {
  assert.equal(GOALBOARD_THEME_STORAGE_KEY, "goalboard:theme");
  assert.match(THEME_BOOTSTRAP_SCRIPT, /localStorage\.getItem/);
  assert.match(THEME_BOOTSTRAP_SCRIPT, /prefers-color-scheme: dark/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /data-theme-option/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /localStorage\.setItem/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /addEventListener\?\.\("change"/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /dataset\.navigationPending = "true"/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /a\[aria-busy="true"\]/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-navigation-pending="true"/);
});

test("dependency proposal records use semantic colors in both themes", () => {
  const stylesheet = renderGoalBoardWorkbenchStylesheet();
  assert.match(stylesheet, /\.dependency-proposal \{[^}]*background: var\(--paper\);[^}]*color: var\(--ink\);/);
  assert.match(stylesheet, /\.dependency-rationale div \{[^}]*border-top: 1px solid var\(--line\);/);
  assert.match(stylesheet, /\.dependency-evidence \{[^}]*border-top: 1px solid var\(--line\);/);
  assert.doesNotMatch(stylesheet, /\.dependency-proposal \{[^}]*background: #fff;/);
  assert.match(stylesheet, /\.contract-coverage-group > article \{[\s\S]*background: color-mix\(in srgb, var\(--ink\) 5%, var\(--paper\)\)/);
  assert.doesNotMatch(stylesheet, /\.contract-coverage-group > article \{[^}]*#fbfcfd/);
  assert.match(stylesheet, /\.goal-description-kicker \{[\s\S]*grid-template-columns: auto minmax\(0, 1fr\) auto/);
  assert.match(stylesheet, /\.relation-editor > summary:hover, \.relation-inactive-history > summary:hover \{ background: color-mix\(in srgb, var\(--ink\) 5%, transparent\)/);
  assert.match(stylesheet, /\.factor-advanced > summary:hover \{ background: color-mix\(in srgb, var\(--ink\) 5%, transparent\)/);
  assert.doesNotMatch(stylesheet, /\.relation-editor > summary:hover[^}]*#f4f7fa/);
});

test("primary and danger buttons keep semantic foregrounds across Light and Dark", () => {
  const projectIndexStyles = renderGoalBoardProjectIndexStylesheet();
  const settingsStyles = renderGoalBoardSettingsStylesheet();
  const workbenchStyles = renderGoalBoardWorkbenchStylesheet();
  assert.match(VISUAL_FOUNDATION_STYLES, /--action: #202023;[\s\S]*--action-ink: #fbfbfc;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"[\s\S]*--action: #f0f0f2;[\s\S]*--action-ink: #202023;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--danger-action: var\(--red\);[\s\S]*--danger-action-ink: var\(--page\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.human-review-jump,[\s\S]*\.guidance-primary-action,[\s\S]*\.source-now button:not\(:disabled\)[\s\S]*background: var\(--action\) !important;[\s\S]*color: var\(--action-ink\) !important;/);
  assert.match(projectIndexStyles, /\.project-index-create \{[^}]*color: var\(--action-ink\);[^}]*background: var\(--action\);/);
  assert.match(settingsStyles, /\.guidance-primary-action \{[^}]*color: var\(--action-ink\);[^}]*background: var\(--action\);/);
  assert.match(workbenchStyles, /\.button-danger \{[^}]*color: var\(--danger-action-ink\) !important;[^}]*background: var\(--danger-action\) !important;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.source-now button \{[^}]*color: #fff;[^}]*background: var\(--ink\)/);
});

test("visual foundation ships one restrained Calm Desktop world across workbench and settings", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--page: #f6f6f7;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--shadow-soft: 0 1px 2px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--paper: #ffffff;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--muted: #62626b;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--faint: #66666f;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--action: #202023;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--radius-surface: 10px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-board-view\] \.document-pane,[\s\S]*border-radius: 0;[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-node\.is-selected,[\s\S]*background: var\(--paper\);[\s\S]*inset 0 0 0 1px var\(--line\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation a\[aria-current="page"\][\s\S]*background: var\(--paper\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.project-index-panel \{[\s\S]*border-radius: 12px;/);
});

test("desktop Diagnostics cards keep content inset and actions grouped", () => {
  const stylesheet = renderGoalBoardSettingsStylesheet();
  assert.match(stylesheet, /\.diagnostics-summary > div:first-child \{[^}]*align-items: flex-start;[^}]*justify-content: space-between;/);
  assert.doesNotMatch(stylesheet, /\.diagnostics-summary > div \{/);
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /data-settings-section="diagnostics"\] \.diagnostics-summary,[\s\S]*data-settings-section="diagnostics"\] \.launcher-section \{\s*padding: 22px 24px;/,
  );
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /data-settings-section="diagnostics"\] \.diagnostics-summary \+ \.launcher-section,[\s\S]*data-settings-section="diagnostics"\] \.launcher-section \+ \.diagnostics-summary \{\s*margin-top: 12px;/,
  );
});

test("visual foundation keeps Standard and Compact as local presentation choices", () => {
  assert.equal(GOALBOARD_DENSITY_STORAGE_KEY, "goalboard:density");
  assert.match(THEME_BOOTSTRAP_SCRIPT, /goalboard:density/);
  assert.match(THEME_BOOTSTRAP_SCRIPT, /dataset\.density = density/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /data-density-option/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /applyDensity/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /localStorage\.setItem\(densityKey/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(min-width: 761px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-density="compact"/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-board-view\]:not\(\[data-board-view="decisions"\]\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-row \{\s*min-height: 27px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-node \{\s*min-height: 25px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-document \{\s*width: min\(100%, 1120px\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-desktop-shell="true"[^}]+\.goal-document \{\s*padding: 10px 18px 30px;/);
  const compactSelectorHeaders = [...VISUAL_FOUNDATION_STYLES.matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1] ?? "")
    .filter((selector) => selector.includes('data-density="compact"'))
    .join("\n");
  assert.ok(compactSelectorHeaders.length > 0);
  assert.doesNotMatch(compactSelectorHeaders, /\.tui-/);
});

test("visual foundation keeps terminal appearance separate and local", () => {
  assert.equal(GOALBOARD_TERMINAL_THEME_STORAGE_KEY, "goalboard:terminal-theme");
  assert.match(THEME_BOOTSTRAP_SCRIPT, /dataset\.resolvedTerminalTheme/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /data-terminal-theme-option/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /applyTerminalTheme/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /goalboard:terminal-theme-change/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /localStorage\.setItem\(terminalThemeKey/);
});

test("embedded onboarding Runtime exposes only the real TUI work surface", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /data-onboarding-embed="true"/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.workspace > :not\(\.tui-pane\) \{ display: none !important; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.workspace > \.tui-pane \{[\s\S]*inset: 0 !important;[\s\S]*display: grid !important;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.mobile-project-bar,[\s\S]*\.mobile-switch,[\s\S]*\.tui-chrome-actions \{ display: none !important; \}/);
});

test("live xterm sessions receive the selected terminal palette", () => {
  const ptyClientSource = readFileSync(new URL("../plugins/native/work/src/terminal/screens.ts", import.meta.url), "utf8");
  assert.match(ptyClientSource, /theme: terminalPalette\(\)/);
  assert.match(ptyClientSource, /goalboard:terminal-theme-change/);
  assert.match(ptyClientSource, /term\.options\.theme = palette/);
  assert.match(ptyClientSource, /selectionBackground/);
  assert.match(ptyClientSource, /brightWhite/);
});

test("visual foundation defines one wide workbench and one narrow companion", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(max-width: 760px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.mobile-switch/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.companion-runtime/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.app \{ grid-template-rows: 44px 44px minmax\(0, 1fr\); \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.topbar \{[\s\S]*padding-left: 88px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.brand svg \{[^}]*display: block/);
  assert.match(VISUAL_FOUNDATION_STYLES, /grid-template-columns: var\(--tree-width, clamp\(360px, 30vw, 480px\)\) 5px minmax\(430px, 1fr\) 5px var\(--tui-width, clamp\(440px, 37vw, 620px\)\)/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-workspace-nav/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-primary-action,\s*\n\s*\.button-primary/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-now-body \.goal-primary-action/);
  assert.equal(VISUAL_FOUNDATION_STYLES.match(/linear-gradient/g)?.length, 2);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-map\.graph-stage \{[\s\S]*linear-gradient\(to right,[\s\S]*linear-gradient\(to bottom,/);
});

test("Light desktop work tabs stay flat, separated, and use a compact selection marker", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-resolved-theme="light"\][\s\S]*\.desktop-work-tab \{[\s\S]*background: transparent;[\s\S]*box-shadow: none/);
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-resolved-theme="light"\][^}]*\.desktop-work-tabs \{ gap: 0; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-resolved-theme="light"\][\s\S]*\.desktop-work-tab \+ \.desktop-work-tab::before \{[\s\S]*top: 8px;[\s\S]*bottom: 8px;[\s\S]*width: 1px;[\s\S]*background: color-mix\(in srgb, var\(--line-strong\) 70%, transparent\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-resolved-theme="light"\][\s\S]*\.desktop-work-tab\.is-selected \{[\s\S]*background: transparent;[\s\S]*box-shadow: none/);
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-resolved-theme="light"\][\s\S]*\.desktop-work-tab\.is-selected::after \{[\s\S]*width: 28px;[\s\S]*height: 2px;[\s\S]*background: var\(--blue\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-resolved-theme="light"\][\s\S]*\.desktop-work-tab:hover:not\(\.is-selected\) \{[\s\S]*background: color-mix\(in srgb, var\(--ink\) 4%, transparent\)/);
});

test("collapsed desktop directory becomes a titlebar overlay above a full-width work canvas", () => {
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.workspace\.is-directory-collapsed[\s\S]*grid-template-columns: 0 0 minmax\(0, 1fr\) !important;[\s\S]*position: relative;/,
  );
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.workspace\.is-directory-collapsed > \.tree-pane \{[^}]*width: max\(44px, calc\(var\(--desktop-project-safe-inline-start\) \+ 44px\)\);[^}]*height: var\(--desktop-titlebar-height\);[^}]*background: transparent;[^}]*position: absolute;[^}]*inset: 0 auto auto 0;/,
  );
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.workspace\.is-directory-collapsed > \.workbench-header \{[^}]*padding-inline-start: max\(54px, calc\(var\(--desktop-project-safe-inline-start\) \+ 50px\)\);/,
  );
});

test("Light desktop navigation and directory selections stay flat", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /Light location states stay embedded in their rail/);
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-resolved-theme="light"\] body\[data-desktop-shell="true"\] \.desktop-goal-directory \.tree-entry\.is-selected,[\s\S]*\.feed-list-item\.is-selected,[\s\S]*\.source-list-item\.is-selected \{[\s\S]*background: color-mix\(in srgb, var\(--blue\) 8%, transparent\) !important;[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-resolved-theme="light"\] body\[data-desktop-shell="true"\] \.goal-mode-switch button\.is-active \{[\s\S]*background: color-mix\(in srgb, var\(--blue\) 10%, transparent\);[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-resolved-theme="light"\] body\.settings-page\[data-desktop-shell="true"\] \.settings-navigation \.settings-nav-group > a\[aria-current="page"\] \{[\s\S]*background: color-mix\(in srgb, var\(--ink\) 8%, transparent\);[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-settings\[aria-current="page"\],[\s\S]*\.navigator-directory-toggle \{[\s\S]*background: color-mix\(in srgb, var\(--ink\) 7%, transparent\);[\s\S]*box-shadow: none;/);
});

test("native desktop project controls clear the macOS traffic lights", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-native-project-safe-inline-start: var\(--desktop-window-safe-inline-start, 88px\)/);
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.navigator-native-row \{[\s\S]*padding: 0 8px 0 var\(--desktop-project-safe-inline-start\);/,
  );
  assert.match(VISUAL_FOUNDATION_STYLES, /data-native-desktop="true"\] \.navigator-project,[\s\S]*padding: 0 !important;/);
});

test("all desktop shells share one Codex-style two-row titlebar contract", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /One Codex-style desktop titlebar contract/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-titlebar-height: 48px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-titlebar-control-height: 34px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-project-header-height: calc\(var\(--desktop-titlebar-height\) \* 2\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*padding-top: 0 !important;[\s\S]*box-sizing: border-box;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project \{[\s\S]*height: var\(--desktop-project-header-height\);[\s\S]*grid-template-rows: var\(--desktop-titlebar-height\) var\(--desktop-titlebar-height\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-native-row \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*grid-template-columns: auto minmax\(0, 1fr\);[\s\S]*align-items: center;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-primary \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*grid-template-columns: minmax\(0, 1fr\) var\(--desktop-titlebar-control-height\) var\(--desktop-titlebar-control-height\);[\s\S]*align-items: center;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-selector,[\s\S]*\.navigator-project-notifications,[\s\S]*\.navigator-directory-toggle \{[\s\S]*height: var\(--desktop-titlebar-control-height\);[\s\S]*align-self: center;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.workspace > \.workbench-header,[\s\S]*display: flex;[\s\S]*align-items: center;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-workbench-bar \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*align-items: center;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-desktop-project \{[\s\S]*height: var\(--desktop-project-header-height\);[\s\S]*grid-template-rows: var\(--desktop-titlebar-height\) var\(--desktop-titlebar-height\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation \{[\s\S]*grid-template-rows: var\(--desktop-project-header-height\) 50px minmax\(0, 1fr\) auto;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.workspace\.is-directory-collapsed \.navigator-project-primary \{[\s\S]*display: none !important;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /> \.topbar \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*align-items: center;/);
});

test("narrow settings keep one compact readable navigation layer", () => {
  const stylesheet = renderGoalBoardSettingsStylesheet();
  assert.match(
    stylesheet,
    /@media \(max-width: 760px\)[\s\S]*\.settings-desktop-project,[\s\S]*\.settings-desktop-heading,[\s\S]*\.settings-navigation > \.personal-sidebar-footer \{ display: none !important; \}/,
  );
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /@media \(max-width: 760px\)[\s\S]*\.settings-navigation \{[^}]*padding: 6px 8px;[^}]*\}[\s\S]*\.settings-navigation a \{ min-height: 44px; \}/,
  );
  assert.match(
    stylesheet,
    /@media \(max-width: 520px\) \{\s*\.preference-options--density \{ grid-template-columns: 1fr; \}/,
  );
});

test("desktop shell uses one project directory, project tabs, and soft work surfaces", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /Personal workbench v3: one directory, project-scoped tabs, and soft work surfaces/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-titlebar-height: 48px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-project-control-center-y: calc\(var\(--desktop-titlebar-height\) \/ 2\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-native-control-row-height: var\(--desktop-titlebar-height\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-project-safe-inline-start: var\(--desktop-native-project-safe-inline-start, 2px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-native-desktop="true"\] body\[data-desktop-shell="true"\][\s\S]*--desktop-native-project-safe-inline-start: var\(--desktop-window-safe-inline-start, 88px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-native-row \{[\s\S]*padding: 0 8px 0 var\(--desktop-project-safe-inline-start\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\]\[data-native-desktop="true"\] \.navigator-native-row,[\s\S]*\.desktop-workbench-bar \{[\s\S]*transform: translateY\(-2px\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\.settings-page\[data-desktop-shell="true"\]\[data-native-desktop="true"\] > \.topbar,/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\.project-index-page\[data-desktop-shell="true"\]\[data-native-desktop="true"\] > \.topbar,[\s\S]*height: var\(--desktop-titlebar-height\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\.project-index-page\[data-desktop-shell="true"\]\[data-native-desktop="true"\] > \.project-index,[\s\S]*min-height: 0;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\.settings-page\[data-desktop-shell="true"\]\[data-native-desktop="true"\] > \.topbar > \*,[\s\S]*body\.project-index-page\[data-desktop-shell="true"\]\[data-native-desktop="true"\] > \.topbar > \*/);
  assert.match(VISUAL_FOUNDATION_STYLES, /grid-template-columns: var\(--tree-width, clamp\(286px, 26vw, 334px\)\) 8px minmax\(0, 1fr\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto !important/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*padding: 0 8px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*background: color-mix\(in srgb, var\(--rail\) 78%, var\(--page\)\);[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*overflow: visible;[\s\S]*z-index: 2;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation \{[\s\S]*background: color-mix\(in srgb, var\(--rail\) 78%, var\(--page\)\);[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-resizer \{[\s\S]*grid-row: 2 \/ -1;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project \{[\s\S]*height: var\(--desktop-project-header-height\);[\s\S]*padding: 0 !important;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-primary \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*grid-template-columns: minmax\(0, 1fr\) var\(--desktop-titlebar-control-height\) var\(--desktop-titlebar-control-height\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-menu-popover \{[\s\S]*position: absolute;[\s\S]*width: min\(310px, calc\(100vw - 24px\)\);[\s\S]*box-shadow: 0 14px 34px[\s\S]*z-index: 80;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-directory-panel\[hidden\] \{ display: none !important; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-module-item \{[\s\S]*min-height: 40px;[\s\S]*border-radius: 8px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-module-item\.is-current \{[\s\S]*background: color-mix\(in srgb, var\(--ink\) 8%, transparent\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.inbox-item \{[\s\S]*min-height: 46px;[\s\S]*grid-template-columns: 22px minmax\(0, 1fr\) auto 22px 14px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-goal-directory \.tree-search \{ display: flex; flex: 1 0 100%; order: -1; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.personal-sidebar-footer \{[\s\S]*grid-row: 3;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-tab\.is-selected \{[\s\S]*background: var\(--paper\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-tab\.is-utility \{[\s\S]*min-width: max-content;[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-tab\.is-utility > \[role="tab"\] \{[\s\S]*white-space: nowrap;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-workbench-bar \{[\s\S]*height: var\(--desktop-native-control-row-height\);[\s\S]*grid-template-columns: minmax\(0, max-content\) minmax\(72px, 1fr\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-titlebar-drag \{[\s\S]*min-width: 72px;[\s\S]*-webkit-app-region: drag;[\s\S]*user-select: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-surface\[hidden\] \{ display: none !important; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-utility-surface:not\(\[hidden\]\) \{ display: grid; gap: 34px; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\[data-desktop-surface\]:not\(\[data-desktop-surface="goal"\]\)[\s\S]*\.tui-pane \{ display: none !important; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-brief-item,[\s\S]*box-shadow:/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-workspace-panels \{[\s\S]*min-height: max\(420px, calc\(100dvh - 340px\)\);[\s\S]*display: grid;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-title-kicker \.goal-status \{[\s\S]*min-height: 26px;[\s\S]*padding: 2px 9px;[\s\S]*gap: 6px;[\s\S]*border-radius: 8px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-title-status--narrow \.goal-status \{[\s\S]*min-height: 0;[\s\S]*padding: 0;[\s\S]*border: 0;[\s\S]*background: transparent;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-title-status--narrow \.goal-status::before \{[^}]*width: 5px;[^}]*background: var\(--goal-status-tone\)/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-workspace-panel(?:[^\w-]|$)/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\[data-goal-panel\]/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-pane\[data-tui-read-only\] \.tui-tabs,[\s\S]*\.tui-menu \{[\s\S]*display: none !important;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\.settings-page\[data-desktop-shell="true"\]:has\(\.settings-navigation\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /> \.topbar \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*min-height: var\(--desktop-titlebar-height\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation \{[\s\S]*grid-template-rows: var\(--desktop-project-header-height\) 50px minmax\(0, 1fr\) auto;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-desktop-project \{[\s\S]*height: var\(--desktop-project-header-height\);[\s\S]*grid-template-rows: var\(--desktop-titlebar-height\) var\(--desktop-titlebar-height\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-settings \{[\s\S]*height: 28px;[\s\S]*min-height: 28px;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /:not\(\[data-native-desktop="true"\]\) \.navigator-project/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.settings-navigation > \.desktop-titlebar-safe/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-heading \{ margin-bottom: 18px; padding: 0 2px; border: 0; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.preference-section \{ padding: 18px 0; border: 0; \}/);
});

test("project settings trigger resets inherited navigation-link layout", () => {
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.navigator-project-settings \{[\s\S]*?height: 28px;[\s\S]*?min-height: 28px;[\s\S]*?padding: 0;[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?gap: 0;/,
  );
});

test("runtime workbench becomes a two-column layout with a dock at standard widths", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(min-width: 761px\) and \(max-width: 1180px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui\.is-tui-collapsed[\s\S]*grid-template-columns: var\(--tree-width,[\s\S]*minmax\(0, 1fr\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui \.tui-pane \{[\s\S]*position: absolute;[\s\S]*width: min\(430px, 48vw\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui \.tui-expand/);
});

test("visual foundation keeps the Goal navigator dense and relationships progressive", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-progress/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-relations > summary/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-relations\[open\]/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-dep-copy small \{[^}]*text-overflow: ellipsis/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--goal-status-tone: var\(--ink-soft\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /border: 1px solid color-mix\(in srgb, var\(--goal-status-tone\) 28%, var\(--line\)\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-status--execution_blocked,[\s\S]*--goal-status-tone: var\(--red\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.navigator-project-primary \{[\s\S]*grid-template-columns: minmax\(0, 178px\) 28px minmax\(12px, 1fr\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.navigator-project-selector \{[\s\S]*height: 30px;[\s\S]*grid-template-columns: 16px minmax\(0, 1fr\) 12px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.navigator-project-settings \{[\s\S]*width: 28px;[\s\S]*place-items: center/);
  assert.match(VISUAL_FOUNDATION_STYLES, /grid-template-rows: auto auto minmax\(0, 1fr\) 42px/);
});

test("expanded desktop Goal Tree parents compact without hiding dependency metadata", () => {
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.tree-item:not\(\.is-collapsed\):has\(> \.tree-children\)[^{]*\.tree-title-line strong \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/,
  );
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.tree-item:not\(\.is-collapsed\):has\(> \.tree-children\)[^{]*\.tree-meta-line > \.tree-progress \{\s*display: none;/,
  );
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.tree-entry:not\(:has\(> \.tree-meta-line \.tree-relations\)\) > \.tree-meta-line \{\s*display: none;/,
  );
  assert.doesNotMatch(
    VISUAL_FOUNDATION_STYLES,
    /\.tree-item:not\(\.is-collapsed\):has\(> \.tree-children\)[^{]*\.tree-relations \{\s*display: none;/,
  );
});

test("Goal Tree keeps each stable Goal id visible beside its title", () => {
  const goalIdRule = VISUAL_FOUNDATION_STYLES.match(/\.tree-copy > small \{([^}]*)\}/)?.[1] ?? "";
  assert.match(goalIdRule, /display:\s*block/);
  assert.doesNotMatch(goalIdRule, /display:\s*none/);
  assert.match(goalIdRule, /min-width:\s*max-content/);
  assert.match(goalIdRule, /max-width:\s*none/);
  assert.match(goalIdRule, /overflow:\s*visible/);
  assert.match(goalIdRule, /text-overflow:\s*clip/);
});

test("Goal Momentum keeps each stable Goal id available with its node title", () => {
  const goalIdRule = VISUAL_FOUNDATION_STYLES.match(/\.momentum-node > small \{([^}]*)\}/)?.[1] ?? "";
  assert.match(goalIdRule, /display:\s*block/);
  assert.doesNotMatch(goalIdRule, /display:\s*none/);
  assert.match(goalIdRule, /text-overflow:\s*ellipsis/);
});

test("runtime separates app chrome from a configurable terminal canvas", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--terminal-muted: #b5b5bd;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--terminal-faint: #92929b;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-terminal-theme="light"[\s\S]*--terminal: #fbfbfc;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-terminal-theme="dark"[\s\S]*--terminal: #101012;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-pane,[\s\S]*background: var\(--paper\);[\s\S]*color: var\(--ink\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-parent-guard-copy p,[\s\S]*color: var\(--muted\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-chrome \.tui-advance:disabled[\s\S]*background: var\(--rail\);[\s\S]*color: var\(--faint\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-terminal \{[\s\S]*background: var\(--terminal\);[\s\S]*color: var\(--terminal-ink\);/);
});

test("visual foundation makes the default Goal view an action-led Focus", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-outcome/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-criteria/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-now-blockers--clear/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"\] \.goal-factor-nav/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"\] \.risk-state-preview/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-layout \{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@container \(min-width: 720px\)[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(220px, 250px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(min-width: 761px\) \{[\s\S]*data-density="compact"[\s\S]*\.goal-now,[\s\S]*\.goal-focus-criteria,[\s\S]*\.goal-focus-context \{[\s\S]*padding: 14px 18px 16px;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-now-mark/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-aside \{[\s\S]*border-top: 1px solid var\(--line\)/);
});

test("visual foundation gives every Focus detail one responsive section deck", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--focus-canvas-inset: clamp\(12px, 1\.4vw, 20px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-document \{[\s\S]*background: transparent;[\s\S]*display: grid;[\s\S]*gap: 14px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-hero,[\s\S]*\.goal-workspace-panels \{[\s\S]*border-radius: 14px;[\s\S]*background: var\(--paper\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-row \{[\s\S]*display: grid;[\s\S]*repeat\(auto-fit, minmax\(136px, 1fr\)\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-copy > small \{[\s\S]*max-height: none;[\s\S]*overflow: visible;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-trigger \{[\s\S]*height: 100%;[\s\S]*align-items: start;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES.slice(VISUAL_FOUNDATION_STYLES.lastIndexOf("/* Focus is an inset reading surface")), /\.focus-section-card\.is-active \{[^}]*flex:/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-stage \{[\s\S]*margin-top: 12px;[\s\S]*display: grid;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-reveal \{[\s\S]*clip-path: inset\(0 0 10% 0 round 12px\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@container \(max-width: 700px\)[\s\S]*\.focus-section-card-row \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-deck\.goal-factor-nav \.focus-section-card-row \{[\s\S]*display: flex;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-deck\.goal-factor-nav \.focus-section-card-trigger \{[\s\S]*min-height: 36px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.focus-section-card[\s\S]*transition: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /Relations read as records, not a pile of pills/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-reveal \.relation-row \{[\s\S]*grid-template-columns: 54px minmax\(0, 1fr\) auto 16px;[\s\S]*justify-content: stretch;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.relation-goal-id, \.relation-path, \.relation-reason[\s\S]*background: transparent !important;/);
});

test("desktop Goal tabs preserve readable titles instead of shrinking to status dots", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-tabs \{[\s\S]*overflow-x: auto;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-tab \{[\s\S]*flex: 0 0 clamp\(136px, 12vw, 190px\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-work-tab\.is-utility \{[\s\S]*flex-basis: auto;/);
});

test("visual foundation gives Goal momentum a left-to-right topology and action workbench", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui\.is-graph-view/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.workspace\.is-desktop-tui\.is-graph-view/);
  assert.match(VISUAL_FOUNDATION_STYLES, /:has\(> \.tree-pane\[data-navigator-view="graph"\]\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.workspace\.is-desktop-tui\[data-navigator-view="graph"\]/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-momentum/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-map\.graph-stage/);
  assert.match(VISUAL_FOUNDATION_STYLES, /grid-template-columns: repeat\(var\(--momentum-level-count\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /grid-column: var\(--momentum-column\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-group/);
  assert.match(VISUAL_FOUNDATION_STYLES, /tree-pane > \.tree-scroll \{ grid-row: 4; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-zoom/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-edge\.is-selected-path path/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-edge path \{[^}]*opacity: \.2;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /#momentum-arrow-selected path \{ fill: var\(--blue\); \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\[data-workspace-mode="graph"\] > \.workbench-header \{[\s\S]*display: block;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\[data-workspace-mode="graph"\] > \.goal-momentum \{[^}]*grid-column: 3;[^}]*grid-row: 2;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-node\.is-bottleneck/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-cadence-panel:not\(\[hidden\]\) \{ display: grid; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-cadence \{[\s\S]*container-type: inline-size;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@container \(max-width: 780px\)[\s\S]*\.momentum-cadence-copy \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-group header button, \.momentum-group header > span \{[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-node\.is-group-first-row \{ align-self: start; margin-top: 26px; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-map-scroll::\-webkit-scrollbar \{ display: none; width: 0; height: 0; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-queue-panel/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-node\.is-selected/);
});
