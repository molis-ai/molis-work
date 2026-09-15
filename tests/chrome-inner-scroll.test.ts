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

  assert.match(settings, /body\.settings-page \{[^}]*overflow: hidden;/);
  assert.match(settings, /\.settings-content \{[^}]*overflow: hidden;/);
  assert.match(settings, /\.settings-body \{[^}]*overflow: auto;[^}]*overscroll-behavior: contain;/);
  assert.doesNotMatch(settings, /\.settings-shell \{ height: calc\(100dvh - 58px\)/);

  assert.match(workbench, /body\.immersive-workbench \{[\s\S]*overflow: hidden;[\s\S]*overscroll-behavior: none;/);
  assert.ok(workbench.includes("immersive-plugin-stage > * { position: absolute; inset: 0; min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; }"));
  assert.ok(workbench.includes("immersive-plugin-stage > .goal-canvas-shell { overflow: hidden;"));
  assert.ok(workbench.includes("immersive-plugin-stage > .immersive-market { overflow: hidden; display: flex; flex-direction: column;"));
  assert.ok(workbench.includes("plugin-market-body { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;"));
  assert.ok(workbench.includes(":is(.tree-scroll, .project-record-scroll, .feed-directory-list, .source-directory-list, .feed-item-scroll, .source-list) { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain;"));
  assert.ok(workbench.includes(".desktop-directory-panel:not([hidden]) { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; padding: 6px 8px 0; overflow: auto; overscroll-behavior: contain;"));
});
