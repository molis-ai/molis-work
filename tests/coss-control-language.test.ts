import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { COSS_CONTROL_STYLES, PRIMITIVE_STYLES } from "@molis-ai/molis-work-design-system";
import {
  renderMolisWorkOnboardingStylesheet,
  renderMolisWorkProjectIndexStylesheet,
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

test("keyboard focus sits inside the control instead of an outer halo", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(PRIMITIVE_STYLES, /\.mw-input:focus-visible, \.mw-textarea:focus-visible, \.mw-select:focus-visible \{[\s\S]*outline-offset: -2px/);
  assert.doesNotMatch(PRIMITIVE_STYLES, /0 0 0 3\.5px/);
  assert.match(workbench, /body\.immersive-workbench :focus-visible \{[\s\S]*outline-offset: -2px/);
  assert.match(workbench, /dialog\[data-feed-sources-dialog\] :is\(input, select, textarea\):focus-visible \{ outline: 2px solid var\(--focus\); outline-offset: -2px/);
  assert.equal(workbench.includes("inset 0 0 0 1.5px color-mix(in srgb, var(--blue)"), false);
  assert.equal(workbench.includes("outline: 2px solid var(--blue)"), false);
});

test("legacy input cosmetics leave mw-* fields to the primitive layer", () => {
  assert.match(PRIMITIVE_STYLES, /\.mw-input-group \.mw-input,[\s\S]*?background: transparent/);
  assert.match(PRIMITIVE_STYLES, /\.mw-input-group \.mw-input:is\(:hover, :focus, :focus-visible, \[aria-invalid="true"\]\)/);
  const settings = renderMolisWorkSettingsStylesheet();
  assert.match(settings, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\):not\(\[type="range"\]\):not\(\.mw-slider\):not\(\.mw-input\)/);
  assert.match(settings, /:not\(\[type="range"\]\):not\(\.mw-slider\):not\(\.mw-input\):not\(\.mw-textarea\):not\(\.mw-select\)/);
});

test("shared tokens describe Coss control radius, height, and translucent borders", () => {
  assert.match(COSS_CONTROL_STYLES, /--radius-control: 10px;/);
  assert.match(COSS_CONTROL_STYLES, /--radius-item: 8px;/);
  assert.match(COSS_CONTROL_STYLES, /--radius-surface: 12px;/);
  assert.match(COSS_CONTROL_STYLES, /--control-h: 32px;/);
  assert.match(COSS_CONTROL_STYLES, /--control-border: color-mix\(in srgb, var\(--ink\) 8%, transparent\)/);
});

test("workbench, settings, and project-index keep the Coss control layer after later surface CSS", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const settings = renderMolisWorkSettingsStylesheet();
  const index = renderMolisWorkProjectIndexStylesheet();
  const marker = COSS_CONTROL_STYLES.trim().slice(0, 80);
  assert.ok(workbench.includes(marker));
  assert.ok(settings.includes(marker));
  assert.ok(index.includes(marker));
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
  assert.match(coss, /body\.immersive-workbench \.tree-create,[\s\S]*background: var\(--paper\) !important;/);
  assert.match(coss, /body\.immersive-workbench \[data-tree-filter-trigger\] \{[\s\S]*padding: 0 !important;/);
  assert.doesNotMatch(coss, /source-mobile-add/);
  assert.doesNotMatch(workbench, /feed-source-task/);
  assert.doesNotMatch(workbench, /tree-pane \.feed-list-item/);
});

test("product stylesheets stop painting mw-btn fills through descendant button rules", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const onboarding = renderMolisWorkOnboardingStylesheet();
  assert.doesNotMatch(workbench, /\.feed-list-empty button \{[^}]*background: transparent;[^}]*color: var\(--blue-dark\)/);
  assert.doesNotMatch(workbench, /\.project-operation-surface-empty button\[data-open-session-add\] \{[^}]*background: var\(--ink\)/);
  assert.doesNotMatch(workbench, /\.goal-canvas-empty button,[^{]*\{[^}]*background: var\(--paper\)/);
  assert.match(onboarding, /\.mw-btn--primary/);
  assert.doesNotMatch(onboarding, /\.onboarding-actions button \{[^}]*background: transparent;/);
});

test("onboarding canvas uses the workbench page field", () => {
  const onboarding = renderMolisWorkOnboardingStylesheet();
  const workbench = renderMolisWorkWorkbenchStylesheet();
  assert.match(workbench, /--page: #f3f4f5/);
  assert.match(workbench, /--page: #0f1011/);
  assert.match(onboarding, /--onboarding-canvas: #f3f4f5/);
  assert.match(onboarding, /--onboarding-canvas: #0f1011/);
  assert.match(onboarding, /--onboarding-paper: #161718/);
  assert.doesNotMatch(onboarding, /--onboarding-canvas: #f4f5f8/);
  assert.doesNotMatch(onboarding, /--onboarding-canvas: #111216/);
});

test("product HTML no longer uses retired control class names", () => {
  const banned = /\b(document-action|text-button|button-primary|goal-primary-action|planning-primary-action|settings-button|guidance-primary-action)\b/;
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

