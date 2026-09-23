import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  AlchemistPluginRouteTable,
  ALCHEMIST_CLIENT_FACTORY_SCRIPT,
  alchemistManifest,
  createAlchemistRouteHandlers,
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

test("旧演示库存储兼容：三张模板卡的保留、弃牌与决定", async () => {
  await withHome((home) => {
    const store = openAlchemistStore(home);
    try {
      const created = store.create({
        title: "判断一个工具值不值得做",
        description: "给独立创始人一周时间",
        project_id: "project-a",
      });
      assert.equal(created.cards.length, 3);
      assert.ok(created.cards.every((card) => card.origin === "demo" && card.status === "candidate"));
      assert.ok(created.cards.every((card) => card.title.includes("判断一个工具值不值得做")));
      const card = created.cards[0];
      if (!card) throw new Error("missing card");
      assert.throws(() => store.decide(card.id, "build", "想做", "project-a"), /先保留/);
      store.setCardStatus(card.id, "kept", "project-a");
      const decision = store.decide(card.id, "build", "一周能验证一个人会不会回来", "project-a");
      assert.equal(decision.choice, "build");
      store.setCardStatus(card.id, "discarded", "project-a");
      const after = store.get(created.direction.id, "project-a");
      assert.equal(after.cards[0]?.status, "discarded");
      assert.equal(after.decisions.length, 0);
      store.setCardStatus(card.id, "candidate", "project-a");
      assert.equal(store.get(created.direction.id, "project-a").cards[0]?.status, "candidate");
      assert.throws(() => store.get(created.direction.id, "project-b"), /找不到这个方向/);
      const listed = store.list("project-a");
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.card_count, 3);
    } finally {
      store.close();
    }
  });
});

test("宿主已绑定项目时，请求里的另一个项目号不能换库", async () => {
  await withHome(async (home) => {
    const store = openAlchemistStore(home);
    try {
      const table = new AlchemistPluginRouteTable(createAlchemistRouteHandlers(store, "project-a"));
      const created = await table.handle({
        method: "POST",
        pathname: "/api/alchemist",
        query: new URLSearchParams("project_id=project-a"),
        body: { title: "一条方向", description: "" },
      });
      assert.equal(created?.status, 200);
      await assert.rejects(() => table.handle({
        method: "GET",
        pathname: "/api/alchemist",
        query: new URLSearchParams("project_id=project-b"),
        body: {},
      }), /当前项目不一致/);
      const listed = await table.handle({
        method: "GET",
        pathname: "/api/alchemist",
        query: new URLSearchParams(),
        body: {},
      });
      assert.equal((listed?.body as { directions: unknown[] }).directions.length, 1);
    } finally {
      store.close();
    }
  });
});

test("HTTP 删除方向后列表里没有它", async () => {
  await withHome(async (home) => {
    const store = openAlchemistStore(home);
    try {
      const table = new AlchemistPluginRouteTable(createAlchemistRouteHandlers(store));
      const created = await table.handle({
        method: "POST",
        pathname: "/api/alchemist",
        query: new URLSearchParams("project_id=project-a"),
        body: { title: "一条方向", description: "" },
      });
      const directionId = (created?.body as { direction: { id: string } }).direction.id;
      const removed = await table.handle({
        method: "POST",
        pathname: `/api/alchemist/${directionId}/delete`,
        query: new URLSearchParams("project_id=project-a"),
        body: {},
      });
      assert.equal(removed?.status, 200);
      const listed = await table.handle({
        method: "GET",
        pathname: "/api/alchemist",
        query: new URLSearchParams("project_id=project-a"),
        body: {},
      });
      assert.deepEqual((listed?.body as { directions: unknown[] }).directions, []);
    } finally {
      store.close();
    }
  });
});
