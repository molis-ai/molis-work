import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { COSS_CONTROL_STYLES, PRIMITIVE_STYLES } from "@molis-ai/molis-work-design-system";
import { FEED_STYLES } from "@molis-ai/molis-work-plugin-feed";
import {
  renderMolisWorkArrivalStylesheet,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWorkbenchStylesheet,
} from "./workbench-renderer-fixture.js";

test("disabled primary actions keep Action fill instead of rail gray", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const settings = renderMolisWorkSettingsStylesheet();
  assert.doesNotMatch(workbench, /\.mw-btn--primary:disabled \{[^}]*background: var\(--rail\)/);
  assert.doesNotMatch(settings, /\.mw-btn--primary:disabled \{[^}]*background: var\(--rail\)/);
  assert.doesNotMatch(settings, /\.settings-record-action \.mw-btn:disabled \{[^}]*background: var\(--rail\)/);
});

test("generic focus rings do not cover mw-* primitive halos", () => {
  assert.match(COSS_CONTROL_STYLES, /body\.settings-page :focus-visible:not\(\[class\^="mw-"\]\)/);
  assert.match(COSS_CONTROL_STYLES, /button:focus-visible:not\(\[class\^="mw-"\]\)/);
});

// Soft Workbench (DESIGN.md → Focus and accessibility): controls take the shared copper stroke; fields answer
// with a copper border and a 3px copper halo instead of the retired inset ink stroke.
test("keyboard focus uses the shared copper stroke and field halo", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(PRIMITIVE_STYLES, /\.mw-input:focus-visible, \.mw-textarea:focus-visible, \.mw-select:focus-visible,\s*\.mw-input:focus, \.mw-textarea:focus \{ outline: none; border-color: var\(--accent\); box-shadow: 0 0 0 3px color-mix\(in srgb, var\(--accent\) 16%, transparent\)/);
  // The focused field's edge is full copper so it reaches 3:1 against its surface (the 55% mix read about 2.8:1).
  assert.doesNotMatch(PRIMITIVE_STYLES, /0 0 0 3\.5px/);
  assert.match(workbench, /body\.immersive-workbench :focus-visible \{[\s\S]*outline: var\(--focus-stroke\);[\s\S]*outline-offset: var\(--focus-stroke-inset\)/);
  // The Feed source setup is an inline panel now; its fields take the same inside stroke from the Feed stylesheet.
  // Feed's rewritten stylesheet (spec → 第二轮 · 信息流) keeps the shared stroke and adds its source-menu summary.
  // Controls take the stroke; `mw-input`/`mw-textarea` fields keep the shared field focus, so no field shows two rings.
  assert.match(FEED_STYLES, /\.feed-workbench :is\(button:not\(\.mw-select\), summary, select:not\(\.mw-select\), input:not\(\.mw-input\), textarea:not\(\.mw-textarea\)\):focus-visible \{ outline: var\(--focus-stroke\); outline-offset: var\(--focus-stroke-inset\); \}/);
  assert.equal(workbench.includes("inset 0 0 0 1.5px color-mix(in srgb, var(--blue)"), false);
  assert.equal(workbench.includes("outline: 2px solid var(--blue)"), false);
  assert.equal(workbench.includes("outline: 2px solid var(--focus)"), false);
});

test("production CSS does not paint indigo or blue focus strokes", () => {
  const banned = [
    /outline\s*:\s*2px\s+solid\s+var\(--(?:focus|blue)\)/,
    /outline\s*:\s*2px\s+solid\s+color-mix\(\s*in\s+srgb\s*,\s*var\(--blue/,
    /0\s+0\s+0\s+2px\s+var\(--(?:focus|blue)\)/,
    /0\s+0\s+0\s+2px\s+color-mix\(\s*in\s+srgb\s*,\s*var\(--(?:focus|blue)/,
    /0\s+0\s+0\s+3px\s+color-mix\(\s*in\s+srgb\s*,\s*var\(--blue/,
    /border-color:\s*var\(--focus\)/,
  ];
  const roots = [
    "apps/workbench/src",
    "apps/desktop/src",
    "packages/design-system/src",
    "plugins/native",
  ];
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".css")) continue;
      const text = readFileSync(path, "utf8");
      if (banned.some((pattern) => pattern.test(text))) hits.push(path.replace(`${process.cwd()}/`, ""));
    }
  };
  for (const root of roots) walk(join(process.cwd(), root));
  assert.deepEqual(hits, []);
  const assembled = [
    renderMolisWorkWorkbenchStylesheet(),
    renderMolisWorkSettingsStylesheet(),
    renderMolisWorkArrivalStylesheet(),
  ].join("\n");
  assert.equal(banned.some((pattern) => pattern.test(assembled)), false);
});

test("legacy input cosmetics leave mw-* fields to the primitive layer", () => {
  assert.match(PRIMITIVE_STYLES, /\.mw-input-group \.mw-input,[\s\S]*?background: transparent/);
  assert.match(PRIMITIVE_STYLES, /\.mw-input-group \.mw-input:is\(:hover, :focus, :focus-visible, \[aria-invalid="true"\]\)/);
  const settings = renderMolisWorkSettingsStylesheet();
  assert.match(settings, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):not\(\.mw-slider\):not\(\.mw-input\)/);
  assert.match(settings, /:not\(\[type="range"\]\):not\(\.mw-slider\):not\(\.mw-input\):not\(\.mw-textarea\):not\(\.mw-select\)/);
});

// Soft Workbench (DESIGN.md → Shapes): 8px controls, 14px surfaces, 32px controls from the shared helpers.
test("shared tokens describe control radius, height, and translucent borders", () => {
  assert.match(COSS_CONTROL_STYLES, /--radius-control: 8px;/);
  assert.match(COSS_CONTROL_STYLES, /--radius-item: 8px;/);
  assert.match(COSS_CONTROL_STYLES, /--radius-surface: 14px;/);
  assert.match(COSS_CONTROL_STYLES, /--control-h: 32px;/);
  assert.match(COSS_CONTROL_STYLES, /--control-border: color-mix\(in srgb, var\(--ink\) 9%, transparent\)/);
});

test("workbench, settings, and the way in keep the Coss control layer after later surface CSS", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const settings = renderMolisWorkSettingsStylesheet();
  const arrival = renderMolisWorkArrivalStylesheet();
  const marker = COSS_CONTROL_STYLES.trim().slice(0, 80);
  assert.ok(workbench.includes(marker));
  assert.ok(settings.includes(marker));
  assert.ok(arrival.includes(marker));
  assert.ok(workbench.lastIndexOf(".mw-btn--primary") > workbench.lastIndexOf(marker));
  assert.doesNotMatch(workbench, /feed-detail-actions \.button-primary \{ color: var\(--paper\); background: var\(--blue-dark\);/);
  assert.doesNotMatch(workbench, /feed-stage-add-actions \.button-primary \{ color: var\(--paper\); background: var\(--blue-dark\);/);
});

test("settings secondary buttons leave the 4px blue-outline contract", () => {
  const settings = renderMolisWorkSettingsStylesheet();
  assert.match(
    PRIMITIVE_STYLES,
    /\.mw-btn--secondary \{[\s\S]*?border-radius: var\(--radius-control\);[\s\S]*?background: var\(--control-fill\);[\s\S]*?color: var\(--ink\);/,
  );
  assert.ok(settings.includes(".mw-btn--secondary {"));
  assert.doesNotMatch(
    settings,
    /\.settings-record-action button, \.settings-button,[^{]*\{[^}]*border-radius: 4px;[^}]*color: var\(--blue-dark\)/,
  );
});

test("primary actions stay Action fill on mw-* without chasing business selectors", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(PRIMITIVE_STYLES, /\.mw-btn--primary[\s\S]*background: var\(--action\)/);
  assert.match(workbench, /\.mw-btn--primary[\s\S]*background: var\(--action\)/);
  assert.doesNotMatch(
    COSS_CONTROL_STYLES,
    /\.button-primary,[\s\S]*min-height: var\(--control-h\) !important;[\s\S]*background: var\(--action\) !important;/,
  );
  const coss = workbench.slice(workbench.lastIndexOf(COSS_CONTROL_STYLES.trim().slice(0, 80)));
  // Soft Workbench (DESIGN.md → Plugin stage lists): the create control is a soft wash and needs no `!important`.
  assert.match(coss, /body\.immersive-workbench \.tree-create,\s*body\.immersive-workbench \[data-tree-filter-trigger\] \{[^}]*background: var\(--control-fill\);/);
  assert.match(coss, /body\.immersive-workbench \[data-tree-filter-trigger\] \{[^}]*padding: 0;/);
  assert.doesNotMatch(coss, /body\.immersive-workbench \.tree-create,[^{]*\{[^}]*!important/);
  assert.doesNotMatch(coss, /source-mobile-add/);
  assert.doesNotMatch(workbench, /feed-source-task/);
  assert.doesNotMatch(workbench, /tree-pane \.feed-list-item/);
});

test("product stylesheets stop painting mw-btn fills through descendant button rules", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const arrival = renderMolisWorkArrivalStylesheet();
  assert.doesNotMatch(workbench, /\.feed-list-empty button \{[^}]*background: transparent;[^}]*color: var\(--blue-dark\)/);
  assert.doesNotMatch(workbench, /\.project-operation-surface-empty button\[data-open-session-add\] \{[^}]*background: var\(--ink\)/);
  assert.doesNotMatch(workbench, /\.goal-canvas-empty button,[^{]*\{[^}]*background: var\(--paper\)/);
  assert.match(arrival, /\.mw-btn--primary/);
  assert.doesNotMatch(arrival, /\.onboarding-actions button \{[^}]*background: transparent;/);
});

// Soft Workbench (DESIGN.md → Onboarding, 项目选择页): the way in (the chooser, the opening, Welcome, the new-project
// journey, the update page) is drawn on the shell's own tokens in both themes and keeps no palette of its own: the desk
// is the shell's desk and the sheet its paper, so it follows every token change.
test("the way in shares the workbench tokens in both themes", () => {
  const arrival = renderMolisWorkArrivalStylesheet();
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(workbench, /--page: #eeefef/);
  assert.match(workbench, /--page: #1c1d20/);
  assert.match(arrival, /--page: #eeefef/);
  assert.match(arrival, /data-resolved-theme="dark"[\s\S]*--page: #1c1d20/);
  assert.match(arrival, /\.arrival \{[^}]*background: var\(--desk\)/);
  assert.match(arrival, /\.stage-sheet \{[^}]*background: var\(--paper\)/);
  assert.doesNotMatch(arrival, /--ob-page|--ob-window|--onboarding-/);
});

test("product HTML no longer uses retired control class names", () => {
  // Only where a class name can appear: class attributes, classList calls and CSS selectors. A module named
  // "./document-action.js" is not a control class.
  const names = "document-action|text-button|button-primary|goal-primary-action|planning-primary-action|settings-button|guidance-primary-action";
  const banned = new RegExp(`(?:class(?:Name)?\\s*=\\s*["'\`][^"'\`]*?\\b|classList\\.\\w+\\(\\s*["'\`]|(?<![./\\w-])\\.)(?:${names})(?![\\w-])`);
  const roots = ["apps/workbench/src", "plugins/native", "packages/design-system/src"];
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "dist") continue;
        walk(path);
        continue;
      }
      if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js")) continue;
      const text = readFileSync(path, "utf8");
      if (banned.test(text)) hits.push(path);
    }
  };
  for (const root of roots) walk(join(process.cwd(), root));
  assert.deepEqual(hits, []);
});

