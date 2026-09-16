import assert from "node:assert/strict";
import test from "node:test";

import { COSS_CONTROL_STYLES } from "@molis-ai/molis-work-design-system";
import {
  renderMolisWorkProjectIndexStylesheet,
  renderMolisWorkSettingsStylesheet,
  renderMolisWorkWorkbenchStylesheet,
} from "./workbench-renderer-fixture.js";

test("shared tokens describe Coss control radius, height, and translucent borders", () => {
  assert.match(COSS_CONTROL_STYLES, /--radius-control: 8px;/);
  assert.match(COSS_CONTROL_STYLES, /--radius-surface: 12px;/);
  assert.match(COSS_CONTROL_STYLES, /--control-h: 32px;/);
  assert.match(COSS_CONTROL_STYLES, /--control-border: color-mix\(in srgb, var\(--ink\) 8%, transparent\)/);
});

test("workbench, settings, and project-index keep the Coss control layer after later surface CSS", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const settings = renderMolisWorkSettingsStylesheet();
  const index = renderMolisWorkProjectIndexStylesheet();
  const marker = COSS_CONTROL_STYLES.trim().slice(0, 80);
  assert.ok(workbench.lastIndexOf(marker) > workbench.lastIndexOf("feed-detail-actions .button-primary { color: var(--paper); background: var(--blue-dark);"));
  assert.ok(workbench.lastIndexOf(marker) > workbench.lastIndexOf("feed-stage-add-actions .button-primary { color: var(--paper); background: var(--blue-dark);"));
  assert.ok(index.lastIndexOf(marker) > index.lastIndexOf("project-index-search-empty"));
  assert.ok(settings.lastIndexOf(marker) > settings.indexOf(".settings-button"));
});

test("settings secondary buttons leave the 4px blue-outline contract", () => {
  const settings = renderMolisWorkSettingsStylesheet();
  assert.match(
    settings,
    /\.settings-button[^{]*\{[^}]*border-radius: var\(--radius-control\);[^}]*color: var\(--ink\);[^}]*background: var\(--control-fill\)/,
  );
  assert.doesNotMatch(
    settings,
    /\.settings-record-action button, \.settings-button,[^{]*\{[^}]*border-radius: 4px;[^}]*color: var\(--blue-dark\)/,
  );
});

test("primary actions stay Action fill with the control radius", () => {
  const workbench = renderMolisWorkWorkbenchStylesheet();
  const coss = workbench.slice(workbench.lastIndexOf(COSS_CONTROL_STYLES.trim().slice(0,80)));
  assert.match(coss, /\.button-primary,[\s\S]*border-radius: var\(--radius-control\) !important;[\s\S]*background: var\(--action\) !important;/);
  assert.match(coss, /body\.immersive-workbench \.home-shortcut-dialog \.home-shortcut-save/);
  assert.doesNotMatch(coss, /source-mobile-add/);
});
