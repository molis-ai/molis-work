import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  COSS_CONTROL_STYLES,
  INTERACTION_TEXTURE_STYLES,
  MOLIS_WORK_DENSITY_STORAGE_KEY,
  MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY,
  MOLIS_WORK_THEME_STORAGE_KEY,
  THEME_BOOTSTRAP_SCRIPT,
  TYPEFACE_STYLES,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
  interVariableFontFilePath,
  notoSansScFontFilePath,
  renderLinearShellTokens,
} from "@molis-ai/molis-work-design-system";
import { STYLES } from "@molis-ai/molis-work-app-workbench";
import {
  renderMolisWorkProjectIndexStylesheet,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWorkbenchStylesheet,
} from "./workbench-renderer-fixture.js";

test("Linear zinc shell tokens come from one helper", () => {
  const light = renderLinearShellTokens("light");
  const dark = renderLinearShellTokens("dark");
  assert.ok(VISUAL_FOUNDATION_STYLES.includes(light));
  assert.ok(VISUAL_FOUNDATION_STYLES.includes(dark));
  assert.ok(COSS_CONTROL_STYLES.includes(light));
  assert.ok(COSS_CONTROL_STYLES.includes(dark));
  assert.ok(INTERACTION_TEXTURE_STYLES.includes(light));
  assert.ok(INTERACTION_TEXTURE_STYLES.includes(dark));
  assert.ok(STYLES.includes(light));
});

test("visual foundation keeps Light, Dark, and System as local presentation choices", () => {
  assert.equal(MOLIS_WORK_THEME_STORAGE_KEY, "molis-work:theme");
  assert.match(THEME_BOOTSTRAP_SCRIPT, /localStorage\.getItem/);
  assert.match(THEME_BOOTSTRAP_SCRIPT, /prefers-color-scheme: dark/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /data-theme-option/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /localStorage\.setItem/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /addEventListener\?\.\("change"/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /dataset\.navigationPending = "true"/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /a\[aria-busy="true"\]/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /event\.defaultPrevented/);
  assert.doesNotMatch(
    VISUAL_FOUNDATION_CLIENT_SCRIPT,
    /dataset\.navigationPending = "true";\s*anchor\.setAttribute\("aria-busy", "true"\);\s*\}, true\)/,
  );
  assert.match(VISUAL_FOUNDATION_STYLES, /data-navigation-pending="true"/);
});

test("dependency proposal records use semantic colors in both themes", () => {
  const stylesheet = renderMolisWorkWorkbenchStylesheet();
  assert.match(stylesheet, /\.dependency-proposal \{[^}]*background: var\(--paper\);[^}]*color: var\(--ink\);/);
  assert.match(stylesheet, /\.dependency-rationale div \{[^}]*border-top: 1px solid var\(--line\);/);
  assert.match(stylesheet, /\.dependency-evidence \{[^}]*border-top: 1px solid var\(--line\);/);
  assert.doesNotMatch(stylesheet, /\.dependency-proposal \{[^}]*background: #fff;/);
});

  test("primary and danger buttons keep semantic foregrounds across Light and Dark", () => {
  const projectIndexStyles = renderMolisWorkProjectIndexStylesheet();
  const settingsStyles = renderMolisWorkSettingsStylesheet();
  const workbenchStyles = renderMolisWorkWorkbenchStylesheet();
  assert.match(VISUAL_FOUNDATION_STYLES, /--action: #222326;[\s\S]*--action-ink: #ffffff;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"[\s\S]*--action: #f7f8f8;[\s\S]*--action-ink: #0f1011;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--danger-action: var\(--red\);[\s\S]*--danger-action-ink: var\(--page\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.mw-btn--primary[\s\S]*background: var\(--action\) !important;[\s\S]*color: var\(--action-ink\) !important;/);
  assert.match(projectIndexStyles, /\.mw-btn--primary[\s\S]*background: var\(--action\)/);
  assert.match(settingsStyles, /\.mw-btn--primary[\s\S]*background: var\(--action\)/);
  assert.match(workbenchStyles, /\.mw-btn--danger[\s\S]*background: var\(--danger-action\)/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.source-now button \{[^}]*color: #fff;[^}]*background: var\(--ink\)/);
});

test("visual foundation ships one restrained Calm Desktop world across workbench and settings", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--page: #f3f4f5;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--shadow-soft: 0 1px 2px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--paper: #ffffff;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--muted: #6b6f76;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--faint: #737882;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--action: #222326;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--radius-surface: 12px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-board-view\] \.document-pane,[\s\S]*border-radius: 0;[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-node\.is-selected,[\s\S]*background: var\(--nav-active\);[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation a\[aria-current="page"\][\s\S]*background: var\(--nav-active\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.project-index-panel \{[\s\S]*border-radius: 12px;/);
});

test("workbench chrome no longer ships Ant Design selected blues", () => {
  const workbenchStyles = renderMolisWorkWorkbenchStylesheet();
  assert.doesNotMatch(workbenchStyles, /#1677ff|#1677ed|#328bff/);
  assert.doesNotMatch(workbenchStyles, /linear-gradient\(180deg,\s*#328bff/);
  assert.doesNotMatch(workbenchStyles, /rgba\(22,\s*119,\s*255/);
  assert.match(workbenchStyles, /\.tree-node\.is-selected \{ color: var\(--ink\); background: var\(--nav-active\)/);
  assert.match(workbenchStyles, /\.top-action:hover, a\.top-action:hover \{ color: var\(--ink\); background: var\(--nav-hover\)/);
});

test("desktop Diagnostics cards keep content inset and actions grouped", () => {
  const stylesheet = renderMolisWorkSettingsStylesheet();
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
  assert.equal(MOLIS_WORK_DENSITY_STORAGE_KEY, "molis-work:density");
  assert.match(THEME_BOOTSTRAP_SCRIPT, /molis-work:density/);
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
  assert.equal(MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY, "molis-work:terminal-theme");
  assert.match(THEME_BOOTSTRAP_SCRIPT, /dataset\.resolvedTerminalTheme/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /data-terminal-theme-option/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /applyTerminalTheme/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /molis-work:terminal-theme-change/);
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
  assert.match(ptyClientSource, /molis-work:terminal-theme-change/);
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
  assert.match(VISUAL_FOUNDATION_STYLES, /\.mw-btn--primary[\s\S]*background: var\(--action\)/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-now-body \.goal-primary-action/);
  assert.equal(VISUAL_FOUNDATION_STYLES.match(/linear-gradient/g)?.length, 3);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.momentum-map\.graph-stage \{[\s\S]*linear-gradient\(to right,[\s\S]*linear-gradient\(to bottom,/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.mw-dir-row__copy strong \{[\s\S]*text-overflow: ellipsis/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.mw-dir-row__copy strong \{[\s\S]*mask-image:/);
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
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-resolved-theme="light"\] body\[data-desktop-shell="true"\] \.desktop-goal-directory \.tree-entry\.is-selected,[\s\S]*\.feed-list-item\.is-selected \{[\s\S]*background: color-mix\(in srgb, var\(--blue\) 8%, transparent\) !important;[\s\S]*box-shadow: none;/);
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
  const stylesheet = renderMolisWorkSettingsStylesheet();
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
  assert.match(VISUAL_FOUNDATION_STYLES, /body\.settings-page\[data-desktop-shell="true"\]:has\(\.settings-navigation\) \.settings-content \{[\s\S]*grid-column: 2;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /body\.settings-page\[data-desktop-shell="true"\] \.settings-content \{[\s\S]*grid-column: 2;/);
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
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-status--execution_blocked,[\s\S]*--goal-status-tone: var\(--tone-blocked, var\(--red\)\)/);
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
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-trigger,[\s\S]*height: 100%;[\s\S]*align-items: start;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES.slice(VISUAL_FOUNDATION_STYLES.lastIndexOf("/* Focus is an inset reading surface")), /\.focus-section-card\.is-active \{[^}]*flex:/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-stage \{[\s\S]*margin-top: 12px;[\s\S]*display: grid;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-reveal \{[\s\S]*clip-path: inset\(0 0 10% 0 round 12px\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@container \(max-width: 700px\)[\s\S]*\.focus-section-card-row \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.focus-section-card[\s\S]*transition: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /Relations read as records, not a pile of pills/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.focus-section-card-reveal \.relation-row \{[\s\S]*grid-template-columns: 54px minmax\(0, 1fr\) auto 16px;[\s\S]*justify-content: stretch;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.relation-goal-id, \.relation-path, \.relation-reason[\s\S]*background: transparent !important;/);
});

test("final interaction texture keeps Light and Dark type readable on distinct surfaces", () => {
  assert.match(INTERACTION_TEXTURE_STYLES, /--page: #f3f4f5;[\s\S]*--paper: #ffffff;[\s\S]*--ink: #222326;[\s\S]*--muted: #6b6f76;[\s\S]*--faint: #737882;/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--hue-indigo: #5e6ad2;/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--blue: var\(--hue-indigo\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--content-accent: var\(--hue-slate\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--mark-slate: #647DB5;/);
  assert.match(INTERACTION_TEXTURE_STYLES, /\n  \.goal-status \{ --goal-status-tone: var\(--tone-idle\); \}\n  \.goal-status,\n  body\[data-desktop-shell="true"\] \.goal-status \{/);
  assert.match(
    INTERACTION_TEXTURE_STYLES,
    /data-resolved-theme="dark"[\s\S]*--page: #0f1011;[\s\S]*--paper: #161718;[\s\S]*--ink: #f7f8f8;[\s\S]*--muted: #8a8f98;[\s\S]*--faint: #737880;/,
  );
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const index = renderMolisWorkProjectIndexStylesheet();
  assert.match(TYPEFACE_STYLES, /font-family: "Inter Variable"/);
  assert.match(TYPEFACE_STYLES, /font-family: "Noto Sans SC"/);
  assert.match(TYPEFACE_STYLES, /html body \* \{[\s\S]*font-weight: 400 !important/);
  assert.match(TYPEFACE_STYLES, /font-feature-settings: "cv01" 1, "ss03" 1, "calt" 1/);
  assert.doesNotMatch(TYPEFACE_STYLES, /--font-quote|QUOTE_FONT|immersive-home blockquote/);
  assert.equal(existsSync(interVariableFontFilePath()), true);
  assert.equal(existsSync(notoSansScFontFilePath()), true);
  assert.match(workbench, /font: 13px\/1\.5 /);
  assert.match(workbench, /font-family: "Inter Variable"/);
  assert.match(workbench, /font-family: "Noto Sans SC"/);
  assert.match(workbench, /font-weight: 400 !important/);
  assert.doesNotMatch(workbench, /\.immersive-home blockquote/);
  assert.doesNotMatch(workbench, /--font-quote/);
  assert.doesNotMatch(workbench, /\.home-calendar td\.home-calendar-outside \{[^}]*opacity:/);
  assert.doesNotMatch(workbench, /\.home-composer input \{[^}]*opacity: \.7/);
  assert.match(workbench, /\.frame-empty\.mw-empty \{[\s\S]*justify-content: center;[\s\S]*gap: 12px/);
  assert.match(index, /\.project-index-panel \{[\s\S]*height: auto;[\s\S]*max-height: 100%;/);
  assert.match(index, /\.project-card p \{[\s\S]*color: var\(--ink-soft\)/);
});

test("plugin list titles yield at the squeeze edge", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(workbench, /\.mw-dir-row \{[\s\S]*background-color 180ms var\(--ease-out/);
  assert.match(workbench, /\.mw-dir-row__copy strong \{[\s\S]*text-overflow: ellipsis/);
  assert.doesNotMatch(workbench, /\.mw-dir-row__copy strong \{[\s\S]*mask-image:/);
  assert.doesNotMatch(workbench, /\.feed-stage-leading strong[\s\S]*mask-image:/);
  assert.match(workbench, /\.mw-dir-row-wrap\.is-yield:is\(:hover, :has\(\.is-selected\), :has\(\[aria-current="page"\]\)\) \.mw-dir-row \{[\s\S]*padding-right: var\(--dir-yield, 72px\)/);
  assert.match(workbench, /\.feed-stage-entry \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(7rem, 12rem\) max-content max-content/);
  assert.match(workbench, /\.feed-stage-entry \.feed-entry-status \{[\s\S]*overflow: visible/);
  assert.match(workbench, /\.feed-stage-leading strong \{ flex: 1;/);
  assert.match(workbench, /goal-board-switch, \.settings-segmented, \.locale-switch, \.mw-toggle-group/);
  assert.match(
    workbench,
    /body\.immersive-workbench :is\(\.tree-entry, \.feed-stage-entry, \.source-list-item, \.goal-collection-fold > summary, \.mw-dir-row, \.mw-dir-row-wrap\) \{ transition: none; \}/,
  );
});

test("global search glide is a single pill aligned to the selected hit", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(workbench, /\[data-search-glide\] \.global-search-hit \{ position: relative; z-index: 1; \}/);
  assert.doesNotMatch(workbench, /\[data-search-glide\] > \* \{ position: relative/);
  assert.match(
    workbench,
    /\[data-search-glide\] \.global-search-hit\[aria-selected="true"\]:hover \{ background: transparent; \}/,
  );
  assert.match(workbench, /\[data-search-glide\]::before \{[\s\S]*border-radius: 8px;/);
  assert.match(
    VISUAL_FOUNDATION_CLIENT_SCRIPT,
    /"--hit-x": slot\.left - box\.left - parseFloat\(style\.borderLeftWidth\) \+ list\.scrollLeft/,
  );
  assert.doesNotMatch(VISUAL_FOUNDATION_CLIENT_SCRIPT, /"--hit-y": current\.offsetTop/);
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
