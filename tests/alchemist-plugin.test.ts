import { seedAlchemistLegacy } from "./fixtures/alchemist-legacy.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  ALCHEMIST_CLIENT_FACTORY_SCRIPT,
  alchemistManifest,
  openAlchemistStore,
  renderAlchemistWorkbench,
} from "@molis-ai/molis-work-plugin-alchemist";

const primitives = {
  escape: (value: unknown) => String(value ?? ""),
  text: (value: string) => value,
};

async function withHome<T>(run: (home: string) => Promise<T> | T): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "alchemist-plugin-"));
  try {
    return await run(home);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}

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


test("旧演示数据按原身份只读保留，退休的生成和写入方法已移除", async () => {
  await withHome(home => {
    seedAlchemistLegacy(home);
    const store = openAlchemistStore(home);
    try {
      const result = store.get("old-direction", "project-a");
      assert.equal(result.direction.updated_at, "2024-02-01");
      assert.equal(result.cards[0]!.id, "old-card"); assert.equal(result.cards[0]!.origin, "demo");
      assert.deepEqual(result.cards[0]!.assumptions, ["原假设"]);
      assert.equal(result.decisions[0]!.reason, "历史判断理由");
      assert.equal(store.list("project-a")[0]!.decision_count, 1);
      assert.deepEqual(store.list("project-b"), []);
      assert.throws(() => store.get("old-direction", "project-b"), /找不到这个方向/);
      for (const method of ["create", "setCardStatus", "decide", "deleteDirection"]) assert.equal(method in store, false);
    } finally { store.close(); }
  });
});
