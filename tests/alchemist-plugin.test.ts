import assert from "node:assert/strict";
import test from "node:test";

import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import {
  ALCHEMIST_CLIENT_FACTORY_SCRIPT,
  alchemistManifest,
  renderAlchemistWorkbench,
} from "@molis-ai/molis-work-plugin-alchemist";
import { chinesePagePacks, pageTextForPacks, withPagePacks } from "./fixtures/page-text-packs.js";

const packs = chinesePagePacks("alchemist");
const primitives = {
  escape: (value: unknown) => String(value ?? ""),
  text: pageTextForPacks("zh", packs),
};

test("VG-21 the served client finds a pulse job by the same string it always did, now that the table holds its version", () => {
  assert.equal(ALCHEMIST_CLIENT_FACTORY_SCRIPT.split("j.kind==='discovery.pulse.v1'").length, 2);
});

test("炼金术士是个人侧栏插件，舞台挂载完整工作面", () => {
  parsePluginManifest(alchemistManifest);
  assert.equal(alchemistManifest.kind, "native");
  assert.equal(alchemistManifest.ui.views?.[0]?.slot, "navigator");
  assert.equal(alchemistManifest.ui.views?.[0]?.icon, "zap");
  const html = withPagePacks("zh", packs, () => renderAlchemistWorkbench({ primitives }));
  assert.match(html, /data-alchemist="workbench"/);
  assert.doesNotMatch(html, /<iframe|Founder Lab|app-shell/);
  assert.match(html, /data-alc-rows/);
  assert.match(html, /plugin-stage-workspace/);
  assert.doesNotMatch(html, /演示炼化/);
  assert.match(ALCHEMIST_CLIENT_FACTORY_SCRIPT, /host\.route\('\/api\/alchemist\/studio\/api\/v1'\)/);
});

