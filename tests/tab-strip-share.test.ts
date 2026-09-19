import assert from "node:assert/strict";
import test from "node:test";
import { TAB_WORKSPACE_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/tab-workspace.js";
import { TAB_WORKSPACE_STYLES } from "../apps/workbench/src/styles/tab-workspace.js";
import {
  TAB_SHARE_MAX,
  TAB_SHARE_MIN,
  TAB_SHARE_MIN_TOUCH,
  tabScrollAllotment,
  tabShareMin,
  tabShareWidth,
} from "../apps/workbench/src/tab-strip-share.js";

test("tabs hug when they fit and share equally when they overflow", () => {
  assert.equal(TAB_SHARE_MAX, 172);
  assert.equal(TAB_SHARE_MIN, 72);
  assert.equal(TAB_SHARE_MIN_TOUCH, 96);
  assert.equal(tabShareMin(false), 72);
  assert.equal(tabShareMin(true), 96);
  assert.equal(tabShareWidth(400, [80, 90]), null);
  assert.equal(tabShareWidth(200, [120, 120, 120]), 72);
  assert.equal(tabShareWidth(300, [172, 172, 172]), 100);
  assert.equal(tabShareWidth(0, [80]), 72);
  assert.equal(tabShareWidth(200 - 360, [180, 180]), 72, "no leftover still shares at min instead of hugging");
  assert.equal(tabShareWidth(400, [180, 180]), null, "two 180px tabs still hug in a 400px leftover");
  assert.equal(tabShareWidth(300, [180, 180]), 150);
  assert.equal(tabScrollAllotment(400, 30 + 30, 8, 4), 316);
  assert.equal(tabScrollAllotment(0, 60, 8, 4), 0);
  assert.match(TAB_WORKSPACE_STYLES, /--tab-share-width, max-content/);
  assert.match(TAB_WORKSPACE_STYLES, /\[data-titlebar-tabs\] \.tab-scroll \{ flex: 0 1 auto; width: max-content; min-width: 0; \}/);
  assert.doesNotMatch(TAB_WORKSPACE_STYLES, /min-width: 172px/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /shareTabStrip/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /tabShareWidth/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /tabScrollAllotment/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /flexSet.has\(child\)/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /data-collapsed/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /tab-strip-spacer/);
  assert.match(TAB_WORKSPACE_FACTORY_SCRIPT, /tabShareObserver.observe\(strip\)/);
});
