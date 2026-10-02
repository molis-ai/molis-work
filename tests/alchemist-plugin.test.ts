import assert from "node:assert/strict";
import test from "node:test";

import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  ALCHEMIST_CLIENT_FACTORY_SCRIPT,
  alchemistManifest,
  renderAlchemistWorkbench,
} from "@molis-ai/molis-work-plugin-alchemist";

const primitives = {
  escape: (value: unknown) => String(value ?? ""),
  text: (value: string) => value,
};

test("炼金术士是个人侧栏插件，舞台挂载完整工作面", () => {
  parsePluginManifest(alchemistManifest);
  assert.equal(alchemistManifest.kind, "native");
  assert.equal(alchemistManifest.ui.views?.[0]?.slot, "navigator");
  assert.equal(alchemistManifest.ui.views?.[0]?.icon, "zap");
  assert.equal(alchemistManifest.mcp_exports, undefined);
  const html = renderAlchemistWorkbench({ primitives });
  assert.match(html, /data-alchemist="workbench"/);
  assert.doesNotMatch(html, /<iframe|Founder Lab|app-shell/);
  assert.match(html, /data-alc-rows/);
  assert.match(html, /plugin-stage-workspace/);
  assert.doesNotMatch(html, /演示炼化/);
  assert.match(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /host\.route\('\/api\/alchemist\/studio\/api\/v1'\)/);
});

