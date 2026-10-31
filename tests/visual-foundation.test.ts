import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  COSS_CONTROL_STYLES,
  PRIMITIVE_STYLES,
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
  renderShellTokens,
} from "@molis-ai/molis-work-design-system";
import { STYLES } from "@molis-ai/molis-work-app-workbench";
import {
  renderMolisWorkArrivalStylesheet,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWorkbenchStylesheet,
  renderMolisWorkWorkbenchWithPluginStylesheets,
} from "./workbench-renderer-fixture.js";

// Soft Workbench (specs/archive/soft-workbench-rollout): every layer takes its base tokens from one helper.
test("PAS-14 page styles apply each shared control overlay once and standalone foundation retains both", () => {
  for (const render of [renderMolisWorkArrivalStylesheet, renderMolisWorkSettingsStylesheet, renderMolisWorkWorkbenchStylesheet]) {
    const sheet = render();
    for (const overlay of [COSS_CONTROL_STYLES, PRIMITIVE_STYLES]) {
      assert.equal(sheet.split(overlay).length - 1, 1, "only the final control overlay remains");
      assert.ok(VISUAL_FOUNDATION_STYLES.includes(overlay), "standalone consumers keep controls");
    }
    assert.ok(sheet.indexOf(COSS_CONTROL_STYLES) < sheet.indexOf(PRIMITIVE_STYLES), "overlay precedence stays unchanged");
  }
});

test("Soft Workbench shell tokens come from one helper", () => {
  const light = renderShellTokens("light");
  const dark = renderShellTokens("dark");
  assert.ok(VISUAL_FOUNDATION_STYLES.includes(light));
  assert.ok(VISUAL_FOUNDATION_STYLES.includes(dark));
  assert.ok(COSS_CONTROL_STYLES.includes(light));
  assert.ok(COSS_CONTROL_STYLES.includes(dark));
  assert.ok(INTERACTION_TEXTURE_STYLES.includes(light));
  assert.ok(INTERACTION_TEXTURE_STYLES.includes(dark));
  assert.ok(STYLES.includes(light));
});

test("visual foundation enhances visible selects onto mw-menu", () => {
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /data-mw-select-picker/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /className = "mw-menu mw-select-picker__menu"/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /dataset\.mwSelectSkip === "true"/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.mw-select-picker__menu/);
  const workbench = renderMolisWorkWorkbenchWithPluginStylesheets();
  assert.match(workbench, /\.mw-select-picker \{/);
  assert.match(workbench, /\.dataset-toolbar \.mw-select, \.dataset-toolbar \.mw-select-picker/);
  // RAC-705 (PG-075): every work surface gets the one neutral tint; no selector is written for a plugin.
  assert.match(workbench, /\[data-work-surface\][^{}]*\{ --plugin-tint: var\(--ink-soft\); \}/);
  assert.match(workbench, /@keyframes craft-rise \{/);
  assert.match(VISUAL_FOUNDATION_CLIENT_SCRIPT, /--seg-tint/);
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

// Soft Workbench (DESIGN.md → Primary): graphite action in both themes, and no `!important` skin that
// would stop a disabled or hovered primary from showing its own state.
test("primary and danger buttons keep semantic foregrounds across Light and Dark", () => {
  const arrivalStyles = renderMolisWorkArrivalStylesheet();
  const settingsStyles = renderMolisWorkSettingsStylesheet();
  const workbenchStyles = renderMolisWorkWorkbenchStylesheet();
  assert.match(VISUAL_FOUNDATION_STYLES, /--action: #292a2c;[\s\S]*--action-ink: #ffffff;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"[\s\S]*--action: #ecebe8;[\s\S]*--action-ink: #252628;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--danger-action: var\(--red\);[\s\S]*--danger-action-ink: var\(--page\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.mw-btn--primary[\s\S]*background: var\(--action\);[\s\S]*color: var\(--action-ink\);/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.mw-btn--primary[^{}]*\{[^}]*background: var\(--action\) !important/);
  assert.match(arrivalStyles, /\.mw-btn--primary[\s\S]*background: var\(--action\)/);
  assert.match(settingsStyles, /\.mw-btn--primary[\s\S]*background: var\(--action\)/);
  assert.match(workbenchStyles, /\.mw-btn--danger \{[^}]*background: var\(--danger-action, var\(--red\)\);/);
  assert.doesNotMatch(workbenchStyles, /\.mw-btn--danger \{[^}]*!important/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.source-now button \{[^}]*color: #fff;[^}]*background: var\(--ink\)/);
});

// Soft Workbench (DESIGN.md → Colors, Shapes): pearl desk, white surface, 14px surface corner.
test("visual foundation ships one Soft Workbench world across workbench and settings", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--page: #eeefef;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--shadow-soft: 0 1px 2px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--paper: #ffffff;/);
  // spec → 第三轮 · 视觉精修: muted and faint darkened a step so captions reach 4.5:1 on paper.
  assert.match(VISUAL_FOUNDATION_STYLES, /--muted: #636569;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--faint: #6a6c70;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--action: #292a2c;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--radius-surface: 14px;/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /body\[data-board-view\] \.document-pane,[\s\S]*border-radius: 0;[\s\S]*box-shadow: none;/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.tree-node\.is-selected \{[^}]*background: var\(--nav-active\);[^}]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation a\[aria-current="page"\][\s\S]*background: var\(--nav-active\);/);
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
  // The standalone settings page renders data-desktop-shell="false", so the foundation's body.settings-page[data-desktop-shell="true"] Diagnostics spacing never applied; it went with personal-workbench-v3 (W5-05).
  assert.match(readFileSync(new URL("../apps/workbench/src/project-settings-pages.ts", import.meta.url), "utf8"), /<body class="settings-page project-preferences-page"[^>]*data-desktop-shell="false"/);
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
  // The compact rules are scoped to the Goals page body; the Goal-era decision page (`data-board-view="decisions"`) is gone, so no guard names it.
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-density="compact"\] body\[data-board-view\] \.tree-row \{/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /data-board-view="decisions"/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-row \{\s*min-height: 27px;/);
  // BL-121 3 (T-337): the compact child indent stays, as an intentional behaviour. `:not(:empty)` is the explicit
  // specificity that still beats goal-canvas.ts's flat stage list (0,4,2 against 0,4,1); if the indent is dropped on purpose, change both.
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-density="compact"\] body\[data-board-view\] \.tree-children:not\(:empty\) \{\s*margin-left: 8px;\s*padding-left: 4px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-node \{\s*min-height: 25px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-document \{\s*width: min\(100%, 1120px\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-desktop-shell="true"[^}]+\.goal-document \{\s*padding: 12px 16px 32px;/); // spec → 第三轮 · 视觉精修: spacing scale
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

test("live xterm sessions receive the selected terminal palette", () => {
  // The screens take the palette the Character terminal also uses (apps/workbench/src/terminal-theme.ts).
  const ptyClientSource = ["../apps/workbench/src/terminal/screens.ts", "../apps/workbench/src/terminal-theme.ts"]
    .map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");
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
  // The narrow surface switch has no markup since bc79f8a49; its last styles went with W3-A3b and #662.
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.mobile-switch/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.companion-runtime/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.app \{ grid-template-rows: 44px 44px minmax\(0, 1fr\); \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.topbar \{[\s\S]*padding-left: 88px/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.brand svg \{[^}]*display: block/);
  assert.match(VISUAL_FOUNDATION_STYLES, /grid-template-columns: var\(--tree-width, clamp\(360px, 30vw, 480px\)\) 5px minmax\(430px, 1fr\) 5px var\(--tui-width, clamp\(440px, 37vw, 620px\)\)/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-workspace-nav/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.mw-btn--primary[\s\S]*background: var\(--action\)/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-now-body \.goal-primary-action/);
  // The one gradient left is the primitives' own; the momentum grid's two went with its retired skin (A1+H2).
  assert.equal(VISUAL_FOUNDATION_STYLES.match(/linear-gradient/g)?.length, 1);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.mw-dir-row__copy strong \{[\s\S]*text-overflow: ellipsis/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.mw-dir-row__copy strong \{[\s\S]*mask-image:/);
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
  // body.settings-page[data-desktop-shell="true"] never matches: every settings body renders data-desktop-shell="false". Its rules and the lines that asserted them went in W5-05 (desktop-shell dead selectors).
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-settings\[aria-current="page"\],[\s\S]*\.navigator-directory-toggle \{[\s\S]*background: color-mix\(in srgb, var\(--ink\) 7%, transparent\);[\s\S]*box-shadow: none;/);
});

test("native desktop project controls clear the macOS traffic lights", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-native-project-safe-inline-start: var\(--desktop-window-safe-inline-start, 88px\)/);
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.navigator-native-row \{[\s\S]*padding: 0 8px 0 var\(--desktop-project-safe-inline-start\);/,
  );
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.navigator-project \{[^}]*padding: 0 !important;/);
});

test("all desktop shells share one Codex-style two-row titlebar contract", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /One Codex-style desktop titlebar contract/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-project-header-height: calc\(var\(--desktop-titlebar-height\) \* 2\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*padding-top: 0 !important;[\s\S]*box-sizing: border-box;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project \{[\s\S]*height: var\(--desktop-project-header-height\);[\s\S]*grid-template-rows: var\(--desktop-titlebar-height\) var\(--desktop-titlebar-height\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-native-row \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*grid-template-columns: auto minmax\(0, 1fr\);[\s\S]*align-items: center;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-primary \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*grid-template-columns: minmax\(0, 1fr\) var\(--desktop-titlebar-control-height\) var\(--desktop-titlebar-control-height\);[\s\S]*align-items: center;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-selector,[\s\S]*\.navigator-project-notifications,[\s\S]*\.navigator-directory-toggle \{[\s\S]*height: var\(--desktop-titlebar-control-height\);[\s\S]*align-self: center;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.workspace > \.workbench-header,[\s\S]*display: flex;[\s\S]*align-items: center;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.desktop-workbench-bar \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*align-items: center;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.workspace\.is-directory-collapsed \.navigator-project-primary \{[\s\S]*display: none !important;/);
});

test("narrow settings keep one compact readable navigation layer", () => {
  const stylesheet = renderMolisWorkSettingsStylesheet();
  assert.match(
    stylesheet,
    /@media \(max-width: 760px\)[\s\S]*\.settings-desktop-project,[\s\S]*\.settings-desktop-heading,[\s\S]*\.settings-navigation > \.personal-sidebar-footer \{ display: none !important; \}/,
  );
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /@media \(max-width: 760px\)[\s\S]*\.settings-navigation \{[^}]*padding: 8px 8px;[^}]*\}[\s\S]*\.settings-navigation a \{ min-height: 44px; \}/,
  );
  assert.match(
    stylesheet,
    /@media \(max-width: 520px\) \{\s*\.preference-options--density \{ grid-template-columns: 1fr; \}/,
  );
});

test("desktop shell uses one project directory, project tabs, and soft work surfaces", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-project-control-center-y: calc\(var\(--desktop-titlebar-height\) \/ 2\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-native-control-row-height: var\(--desktop-titlebar-height\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--desktop-project-safe-inline-start: var\(--desktop-native-project-safe-inline-start, 2px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /html\[data-native-desktop="true"\] body\[data-desktop-shell="true"\][\s\S]*--desktop-native-project-safe-inline-start: var\(--desktop-window-safe-inline-start, 88px\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-native-row \{[\s\S]*padding: 0 8px 0 var\(--desktop-project-safe-inline-start\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\]\[data-native-desktop="true"\] \.navigator-native-row,[\s\S]*\.desktop-workbench-bar \{[\s\S]*transform: translateY\(-2px\);/);
  // body.settings-page[data-desktop-shell="true"] never matches: every settings body renders data-desktop-shell="false". Its rules and the lines that asserted them went in W5-05 (desktop-shell dead selectors).
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /project-index-page|\.project-index-panel|\.project-card\b/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*grid-template-rows: auto minmax\(0, 1fr\) auto !important/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*padding: 0 8px;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*background: color-mix\(in srgb, var\(--rail\) 78%, var\(--page\)\);[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tree-pane,[\s\S]*overflow: visible;[\s\S]*z-index: 2;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.settings-navigation \{[\s\S]*background: color-mix\(in srgb, var\(--rail\) 78%, var\(--page\)\);[\s\S]*box-shadow: none;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project \{[\s\S]*height: var\(--desktop-project-header-height\);[\s\S]*padding: 0 !important;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-primary \{[\s\S]*height: var\(--desktop-titlebar-height\);[\s\S]*grid-template-columns: minmax\(0, 1fr\) var\(--desktop-titlebar-control-height\) var\(--desktop-titlebar-control-height\)/);
  // The Goal-era Inbox/decision page has no producer any more; its skin rules are gone with it.
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.inbox-workspace|\.inbox-item\b|\.decision-(?:empty|summary|groups|owner|stack)\b|\.feed-decision-work\b/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.desktop-titlebar-drag \{ -webkit-app-region: drag; user-select: none; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\[data-desktop-surface\]:not\(\[data-desktop-surface="goals"\]\) :is\(\.tui-resizer, \.tui-pane\) \{ display: none !important; \}/);
  // The Goal document left the old skin; the trash page keeps its desktop workspace height in its own sheet.
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.trash-goal-document \.trash-goal-workspace \{ min-height: max\(420px, calc\(100dvh - 340px\)\); \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-title-kicker \.goal-status \{[\s\S]*min-height: 26px;[\s\S]*padding: 4px 8px;[\s\S]*gap: 8px;[\s\S]*border-radius: 8px;/); // padding and glyph gap on the 4/8 scale
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-title-status--narrow \.goal-status \{[\s\S]*min-height: 0;[\s\S]*padding: 0;[\s\S]*border: 0;[\s\S]*background: transparent;/);
  // RING-05: narrow titles keep the shared ring; no second dot or rule hides its SVG.
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-title-status--narrow \.goal-status::before/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-title-status--narrow \.goal-status svg \{[^}]*display: none/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-workspace-panel(?:[^\w-]|$)/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\[data-goal-panel\]/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-pane\[data-tui-read-only\] \.tui-tabs,[\s\S]*\.tui-menu \{[\s\S]*display: none !important;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /body\.settings-page\[data-desktop-shell="true"\] \.settings-content \{[\s\S]*grid-column: 2;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.navigator-project-settings \{[\s\S]*height: 28px;[\s\S]*min-height: 28px;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /:not\(\[data-native-desktop="true"\]\) \.navigator-project/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.settings-navigation > \.desktop-titlebar-safe/);
  // 18px / 2px → 16px / 4px on the spacing scale (spec → 第三轮 · 间距与形状); still borderless.
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
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.goal-status \{[^}]*--goal-status-tone: var\(--tone-idle\)/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /border: 1px solid color-mix\(in srgb, var\(--goal-status-tone\) 28%, var\(--line\)\)/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.goal-status--execution_blocked,[^{]*\{[^}]*--goal-status-tone: var\(--tone-blocked\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.navigator-project-settings \{[\s\S]*width: 28px;[\s\S]*place-items: center/);
  assert.match(VISUAL_FOUNDATION_STYLES, /grid-template-rows: auto auto minmax\(0, 1fr\) 42px/);
});

test("expanded desktop Goal Tree parents compact without hiding dependency metadata", () => {
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.tree-item:not\(\.is-collapsed\):has\(> \.tree-children\)[^{]*\.tree-title-line \{[^}]*--tree-title-overflow: ellipsis;[^}]*--tree-title-space: nowrap;/,
  );
  // Passed to the title rather than named after the :has() (VUX-36: a rule ending in a bare tag there makes every node put in
  // the page check every <strong>).
  assert.match(
    VISUAL_FOUNDATION_STYLES,
    /\.desktop-goal-directory \.tree-title-line strong \{[^}]*text-overflow: var\(--tree-title-overflow, clip\);[^}]*white-space: var\(--tree-title-space, normal\);/,
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

test("runtime separates app chrome from a configurable terminal canvas", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /--terminal-muted: #b5b5bd;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /--terminal-faint: #92929b;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-terminal-theme="light"[\s\S]*--terminal: #fbfbfc;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-terminal-theme="dark"[\s\S]*--terminal: #101012;/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-pane,[\s\S]*background: var\(--paper\);[\s\S]*color: var\(--ink\);/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.tui-parent-guard-copy p,[\s\S]*color: var\(--muted\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.tui-chrome \.tui-advance:disabled[\s\S]*background: var\(--rail\);[\s\S]*color: var\(--faint\)/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.tui-terminal \{[\s\S]*background: var\(--terminal\);[\s\S]*color: var\(--terminal-ink\);/);
});

test("visual foundation makes the default Goal view an action-led Focus", () => {
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-outcome/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-focus-criteria/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-now-blockers--clear/);
  assert.match(VISUAL_FOUNDATION_STYLES, /data-resolved-theme="dark"\] \.goal-factor-nav/);
  // calm-desktop's .goal-focus-layout, .goal-focus-aside and compact .goal-now padding went with it in W5-05 slice 5: no template draws those elements.
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.goal-now-mark/);
});

test("visual foundation gives every Focus detail one responsive section deck", () => {
  // calm-desktop's --focus-canvas-inset clamp went in W5-05 slice 5: later layers set the inset (0px, 8px), so it decided no value; so did its 700px two-column row and the relations comment.
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-document \{[\s\S]*background: transparent;[\s\S]*display: grid;[\s\S]*gap: 16px;/); // spacing scale
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.goal-hero,[\s\S]*\.goal-workspace-panels \{[\s\S]*border-radius: 14px;[\s\S]*background: var\(--paper\)/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.focus-section-card-row \{[\s\S]*display: grid;[\s\S]*repeat\(auto-fit, minmax\(136px, 1fr\)\)/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.focus-section-card-copy > small \{[\s\S]*max-height: none;[\s\S]*overflow: visible;/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.focus-section-card-trigger,[\s\S]*height: 100%;[\s\S]*align-items: start;/);
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES.slice(VISUAL_FOUNDATION_STYLES.lastIndexOf("/* Focus is an inset reading surface")), /\.focus-section-card\.is-active \{[^}]*flex:/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.focus-section-stage \{[\s\S]*margin-top: 12px;[\s\S]*display: grid;/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.focus-section-card-reveal \{[\s\S]*clip-path: inset\(0 0 10% 0 round 12px\);/);
  assert.match(VISUAL_FOUNDATION_STYLES, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.focus-section-card[\s\S]*transition: none;/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.focus-section-card-reveal \.relation-row \{[\s\S]*grid-template-columns: 54px minmax\(0, 1fr\) auto 16px;[\s\S]*justify-content: stretch;/);
  assert.match(renderMolisWorkWorkbenchStylesheet(), /\.relation-goal-id, \.relation-path, \.relation-reason[\s\S]*background: transparent !important;/);
});

// Soft Workbench (DESIGN.md → Colors, Focus): copper focus replaces the inset ink stroke, `--blue` now
// resolves to copper, and the reading surface aliases the shell family (graphite primary).
test("final interaction texture keeps Light and Dark type readable on distinct surfaces", () => {
  assert.match(INTERACTION_TEXTURE_STYLES, /--page: #eeefef;[\s\S]*--paper: #ffffff;[\s\S]*--ink: #292a2c;[\s\S]*--muted: #636569;[\s\S]*--faint: #6a6c70;/); // 4.5:1 captions
  assert.match(INTERACTION_TEXTURE_STYLES, /--hue-indigo: #5e6ad2;/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--blue: var\(--accent\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--focus-stroke: 2px solid var\(--focus-ring\);/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--focus-stroke-inset: 1px;/);
  assert.doesNotMatch(INTERACTION_TEXTURE_STYLES, /--focus-stroke: 1px solid var\(--ink\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--content-accent: var\(--action\)/);
  assert.match(INTERACTION_TEXTURE_STYLES, /--mark-slate: #647DB5;/);
  assert.match(INTERACTION_TEXTURE_STYLES, /\n  \.goal-status \{ --goal-status-tone: var\(--tone-idle\); \}\n  \.goal-status,\n  body\[data-desktop-shell="true"\] \.goal-status \{/);
  assert.match(
    INTERACTION_TEXTURE_STYLES,
    /data-resolved-theme="dark"[\s\S]*--page: #1c1d20;[\s\S]*--paper: #242528;[\s\S]*--ink: #f0efed;[\s\S]*--muted: #a2a19e;[\s\S]*--faint: #979693;/, // Dark faint lifted a step for 4.5:1 (spec → 第三轮 · 对比度)
  );
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const arrival = renderMolisWorkArrivalStylesheet();
  assert.match(TYPEFACE_STYLES, /font-family: "Inter Variable"/);
  assert.match(TYPEFACE_STYLES, /font-family: "Noto Sans SC"/);
  // Soft Workbench (DESIGN.md → Typography): weights are roles (400/500/600), never forced globally.
  assert.doesNotMatch(TYPEFACE_STYLES, /font-weight: 400 !important/);
  assert.match(TYPEFACE_STYLES, /--weight-body: 400; --weight-control: 500; --weight-title: 600;/);
  assert.match(TYPEFACE_STYLES, /font-synthesis-weight: none/);
  assert.doesNotMatch(TYPEFACE_STYLES, /--font-quote|QUOTE_FONT|immersive-home blockquote/);
  assert.equal(existsSync(interVariableFontFilePath()), true);
  assert.equal(existsSync(notoSansScFontFilePath()), true);
  assert.match(workbench, /font: 13px\/1\.5 /);
  assert.match(workbench, /font-family: "Inter Variable"/);
  assert.match(workbench, /font-family: "Noto Sans SC"/);
  assert.doesNotMatch(workbench, /font-weight: 400 !important/);
  assert.doesNotMatch(workbench, /\.immersive-home blockquote/);
  assert.doesNotMatch(workbench, /--font-quote/);
  assert.doesNotMatch(workbench, /\.home-calendar td\.home-calendar-outside \{[^}]*opacity:/);
  assert.doesNotMatch(workbench, /\.home-composer input \{[^}]*opacity: \.7/);
  assert.match(workbench, /\.frame-empty\.mw-empty \{[\s\S]*justify-content: center;[\s\S]*gap: 12px/);
  // The chooser's directory scrolls inside its column, and the brief's prose stays one step above the captions.
  assert.match(arrival, /\.chooser-dir \{ flex: 1; min-height: 0; overflow: auto;/);
  assert.match(arrival, /\.mw-brief__desc \{[^}]*color: var\(--ink-soft\)/);
});

test("plugin list titles yield at the squeeze edge", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(workbench, /\.mw-dir-row \{[\s\S]*background-color 130ms var\(--ease-quint/); // four durations, two curves
  // Within the title rule itself; an unrelated later rule must not decide these.
  assert.match(workbench, /\.mw-dir-row__copy strong \{[^}]*text-overflow: ellipsis/);
  assert.doesNotMatch(workbench, /\.mw-dir-row__copy strong \{[^}]*mask-image:/);
  assert.doesNotMatch(workbench, /\.feed-stage-leading strong[^{}]*\{[^}]*mask-image:/);
  assert.match(workbench, /\.mw-dir-row-wrap\.is-yield:is\(:hover, :focus-within, :has\(\.is-selected\), :has\(\[aria-current="page"\]\)\) \.mw-dir-row \{[\s\S]*padding-right: var\(--dir-yield, 72px\)/);
  assert.match(workbench, /\.feed-stage-entry \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) minmax\(7rem, 12rem\) max-content max-content/);
  assert.match(workbench, /grid-template-columns: minmax\(12rem, 1\.2fr\) 4.75rem 7.5rem minmax\(10rem, 1fr\) 4.5rem/);
  assert.doesNotMatch(workbench, /\.plugin-stage-meta \{ max-width: 18rem/);
  assert.match(workbench, /\.feed-stage-entry:has\(\.plugin-stage-kind\) \.feed-entry-status \{[\s\S]*background: transparent/);
  assert.match(workbench, /\.plugin-stage-list[\s\S]*\.feed-stage-entry:is\(\.is-selected[\s\S]*--plugin-tint/);
  // Soft Workbench home (DESIGN.md → Home): one centred column with the day column and a 252px margin.
  assert.match(workbench, /\.immersive-home \.home-scroll \{[^}]*max-width: 1280px/);
  assert.match(workbench, /\.immersive-home \.home-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\) 252px/);
  // A kind is not a state, so kind labels are neutral (spec → 第三轮 · 颜色: status colours only for status).
  assert.match(workbench, /\.plugin-stage-kind\[data-kind\] \{ --status-tone: var\(--ink-soft\); \}/);
  assert.doesNotMatch(workbench, /\.plugin-stage-kind\[data-kind="(?:choice|score|noul)"\] \{ --status-tone: var\(--hue-/);
  // RAC-700: the stage's kind chip has no row per plugin (they all resolved to --ink-soft); one neutral rule covers every kind.
  assert.deepEqual(workbench.match(/\.plugin-stage-kind\[data-kind[^\]]*\]/gu), [".plugin-stage-kind[data-kind]"]);
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

test("visual foundation gives Goal momentum a left-to-right topology and action workbench", () => {
  // The momentum-* rules of the retired skin went with A1+H2: no markup draws those classes (the view is goal-canvas-*).
  assert.doesNotMatch(VISUAL_FOUNDATION_STYLES, /\.momentum-[a-z]/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\.is-desktop-tui\.is-graph-view/);
  assert.match(VISUAL_FOUNDATION_STYLES, /body\[data-desktop-shell="true"\] \.workspace\.is-desktop-tui\.is-graph-view/);
  assert.match(VISUAL_FOUNDATION_STYLES, /:has\(> \.tree-pane\[data-navigator-view="graph"\]\)/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.workspace\.is-desktop-tui\[data-navigator-view="graph"\]/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.goal-momentum/);
  assert.match(VISUAL_FOUNDATION_STYLES, /tree-pane > \.tree-scroll \{ grid-row: 4; \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /\.graph-zoom/);
  assert.match(VISUAL_FOUNDATION_STYLES, /#momentum-arrow-selected path \{ fill: var\(--blue\); \}/);
  assert.match(VISUAL_FOUNDATION_STYLES, /workspace\[data-workspace-mode="graph"\] > \.workbench-header \{[\s\S]*display: block;/);
});
