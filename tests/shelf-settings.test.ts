import assert from "node:assert/strict";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ShelfError,
  clearShelfRuntimeCache,
  defaultPanelKeys,
  defaultShelfDeviceSettings,
  openShelfStore,
  parseSettingsWriteBody,
  shortcutOutputName,
  shortcutSlotId,
} from "@molis-ai/molis-work-module-shelf";

const HELP_WITH_PRINT = [
  "Usage: claude [options] [prompt]",
  "  --print                 Print response and exit",
].join("\\n");

async function fakeAgent(bin: string, name: string, help: string, body: string): Promise<string> {
  await mkdir(bin, { recursive: true });
  const file = join(bin, name);
  await writeFile(file, `#!/bin/sh
if [ "$1" = "--help" ]; then
  printf '%b\\n' "${help}"
  exit 0
fi
${body}
`);
  chmodSync(file, 0o755);
  return file;
}

async function withHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "molis-work-shelf-settings-"));
  clearShelfRuntimeCache();
  try {
    return await run(home);
  } finally {
    clearShelfRuntimeCache();
    await rm(home, { recursive: true, force: true });
  }
}

test("a fresh device carries DropAgent's defaults: wheel on, panel keys, recipe bar", () => {
  const settings = defaultShelfDeviceSettings();
  assert.equal(settings.drop_wheel_enabled, true);
  assert.equal(settings.engine, "auto");
  assert.deepEqual(settings.panel_keys.hide, { code: "Escape", meta: false, ctrl: false, alt: false, shift: false });
  assert.deepEqual(settings.panel_keys.paste, { code: "KeyV", meta: true, ctrl: false, alt: false, shift: false });
  assert.deepEqual(settings.action_order, [
    "summarize", "extract_structure", "extract_text", "translate", "redact", "to_markdown", "combine",
  ]);
  assert.deepEqual(settings.hidden_actions, []);
});

test("the settings route refuses a half-written action or runtime and takes a good one", () => {
  assert.deepEqual(parseSettingsWriteBody({ shortcuts: [{ name: "", prompt: "写点什么" }] }), { error: "给这个动作起个名字" });
  assert.deepEqual(parseSettingsWriteBody({ shortcuts: [{ name: "摘要", prompt: "" }] }), { error: "写一句话说明要做什么" });
  assert.deepEqual(parseSettingsWriteBody({ custom_runtimes: [{ title: "内部 CLI", executable: "my-agent" }] }), { error: "填可执行文件的完整路径" });
  assert.deepEqual(parseSettingsWriteBody({ engine: "not-an-engine" }), { error: "这个 Runtime 不在名单里" });
  assert.deepEqual(parseSettingsWriteBody({}), { error: "请提供要保存的设置" });
  const good = parseSettingsWriteBody({ shortcuts: [{ name: "抽联系人", prompt: "把联系人写成一张表。", kinds: ["pdf", "nope"] }] });
  assert.ok("ok" in good);
  assert.equal(good.ok.shortcuts?.[0]?.name, "抽联系人");
  assert.deepEqual(good.ok.shortcuts?.[0]?.kinds, ["pdf"]);
  assert.ok(good.ok.shortcuts?.[0]?.id);
});

test("panel keys save one slot at a time and keep the rest", async () => {
  await withHome(async (home) => {
    const store = openShelfStore(home, { disabled: true });
    const saved = store.saveSettings({ panel_keys: { copy: { code: "KeyD", meta: true, ctrl: false, alt: false, shift: false } } });
    assert.deepEqual(saved.panel_keys.copy, { code: "KeyD", meta: true, ctrl: false, alt: false, shift: false });
    assert.deepEqual(saved.panel_keys.paste, defaultPanelKeys().paste);
    assert.equal(saved.drop_wheel_enabled, true);
  });
});

test("the engine choice picks the runtime, and a custom CLI can close a job", async () => {
  await withHome(async (home) => {
    const bin = join(home, "bin");
    await fakeAgent(bin, "claude", HELP_WITH_PRINT, "exit 0");
    await fakeAgent(bin, "gemini", "Usage: gemini\\n  --prompt <text>", "exit 0");
    const store = openShelfStore(home, { pathEnvironment: bin, home });
    assert.equal(store.runtime().runtime_key, "claude");
    store.saveSettings({ engine: "gemini" });
    clearShelfRuntimeCache();
    assert.equal(store.runtime().runtime_key, "gemini");

    const custom = await fakeAgent(bin, "house-agent", "Usage: house-agent", `printf '%s\\n' "# 摘要" "" "这份材料的重点。" > summary.md`);
    store.saveSettings({ custom_runtimes: [{ id: "house", title: "House CLI", executable: custom, kind: "cli" }] });
    store.saveSettings({ engine: "custom:house" });
    clearShelfRuntimeCache();
    const runtime = store.runtime();
    assert.equal(runtime.runtime_key, "custom:house");
    assert.equal(runtime.can_run_job, true);
    assert.equal(runtime.catalog.some((entry) => entry.runtime_key === "custom:house"), true);
    assert.equal(runtime.catalog.find((entry) => entry.runtime_key === "codex")?.executable, "");

    const item = store.admit({ filename: "报价.md", bytes: Buffer.from("总价 12 万元。", "utf8"), mime: "text/markdown" });
    const outcome = await store.runJob({ recipe: "summarize", item_id: item.item_id });
    assert.equal(outcome.result?.name, "summary.md");
    assert.equal(outcome.job.runtime, "custom:house");
  });
});

test("a saved shortcut action runs on the copy and writes 原名-动作.md", async () => {
  await withHome(async (home) => {
    const bin = join(home, "bin");
    await fakeAgent(bin, "claude", HELP_WITH_PRINT, `printf '%s\\n' "# 联系人" "" "张三 · 13800000000" > 报价-抽联系人.md`);
    const store = openShelfStore(home, { pathEnvironment: bin, home });
    const settings = store.saveSettings({
      shortcuts: [{ id: "act1", name: "抽联系人", prompt: "把材料里的联系人写成一张表。", kinds: ["markdown", "pdf"] }],
    });
    assert.deepEqual(settings.action_order.at(-1), shortcutSlotId("act1"));

    const item = store.admit({ filename: "报价.md", bytes: Buffer.from("联系人：张三 13800000000", "utf8"), mime: "text/markdown" });
    const outcome = await store.runJob({ recipe: "shortcut", item_id: item.item_id, shortcut_id: "act1" });
    assert.equal(outcome.result?.name, shortcutOutputName("报价.md", "抽联系人"));
    assert.equal(outcome.result?.name, "报价-抽联系人.md");
    const prompt = readFileSync(join(home, "shelf", "jobs", outcome.job.job_id, "prompt.txt"), "utf8");
    assert.match(prompt, /把材料里的联系人写成一张表。/u);
    assert.match(prompt, /把完整结果写成文件：报价-抽联系人\.md/u);

    const image = store.admit({ filename: "图.png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mime: "image/png" });
    await assert.rejects(
      store.runJob({ recipe: "shortcut", item_id: image.item_id, shortcut_id: "act1" }),
      (error: ShelfError) => error.message === "选中的材料不能用「抽联系人」",
    );
    await assert.rejects(
      store.runJob({ recipe: "shortcut", item_id: item.item_id, shortcut_id: "gone" }),
      (error: ShelfError) => error.message === "这个快捷动作已经不在了",
    );
  });
});

test("the action bar order keeps known slots, drops strangers, and adopts new actions", async () => {
  await withHome(async (home) => {
    const store = openShelfStore(home, { disabled: true });
    const saved = store.saveSettings({
      shortcuts: [{ id: "act1", name: "抽联系人", prompt: "写成一张表。", kinds: ["markdown"] }],
      action_order: ["combine", "made-up", "summarize"],
      hidden_actions: ["redact"],
    });
    assert.equal(saved.action_order[0], "combine");
    assert.equal(saved.action_order[1], "summarize");
    assert.equal(saved.action_order.includes("made-up"), false);
    assert.equal(saved.action_order.includes(shortcutSlotId("act1")), true);
    assert.deepEqual(saved.hidden_actions, ["redact"]);
    assert.equal(store.snapshot().settings.action_order.includes("extract_text"), true);
  });
});

test("an old catalog without the new settings still opens", async () => {
  await withHome(async (home) => {
    const store = openShelfStore(home, { disabled: true });
    store.admit({ filename: "旧.md", bytes: Buffer.from("旧材料", "utf8"), mime: "text/markdown" });
    const catalogPath = join(home, "shelf", "catalog.json");
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Record<string, unknown>;
    catalog.settings = { drop_wheel_enabled: false };
    for (const item of catalog.items as Record<string, unknown>[]) {
      delete item.status;
      delete item.failure_reason;
      delete item.source_item_ids;
    }
    writeFileSync(catalogPath, JSON.stringify(catalog));
    const snapshot = openShelfStore(home, { disabled: true }).snapshot();
    assert.equal(snapshot.settings.drop_wheel_enabled, false);
    assert.deepEqual(snapshot.settings.panel_keys, defaultPanelKeys());
    assert.equal(snapshot.materials[0]?.status, "done");
    assert.deepEqual(snapshot.materials[0]?.source_item_ids, []);
  });
});

test("a folder comes in whole: children stay in place and a recipe gets the tree", async () => {
  await withHome(async (home) => {
    const bin = join(home, "bin");
    await fakeAgent(bin, "claude", HELP_WITH_PRINT, `printf '%s\\n' "# 合稿" "" "读了整棵树。" > summary.md`);
    const store = openShelfStore(home, { pathEnvironment: bin, home });
    const folder = store.admitFolder({
      name: "报价材料",
      entries: [
        { relative: "说明.md", bytes: Buffer.from("总价 12 万元。", "utf8"), mime: "text/markdown" },
        { relative: "附件/明细.md", bytes: Buffer.from("人力 8 万，硬件 4 万。", "utf8"), mime: "text/markdown" },
        { relative: "../逃逸.md", bytes: Buffer.from("不该出现", "utf8") },
      ],
    });
    assert.equal(folder.kind, "folder");
    assert.equal(folder.children.length, 3);
    assert.equal(folder.children.some((child) => child.relative.includes("..")), false);
    assert.equal(folder.children.find((child) => child.relative === "附件/明细.md")?.name, "明细.md");

    const child = store.readChild(folder.item_id, "附件/明细.md");
    assert.match(child.bytes.toString("utf8"), /人力 8 万/u);
    assert.throws(
      () => store.readChild(folder.item_id, "不存在.md"),
      (error: unknown) => error instanceof ShelfError && error.code === "shelf.item_not_found",
    );

    const outcome = await store.runJob({ recipe: "summarize", item_id: folder.item_id });
    assert.equal(outcome.result?.name, "summary.md");
    const staged = join(home, "shelf", "jobs", outcome.job.job_id, "work", "报价材料", "附件", "明细.md");
    assert.equal(readFileSync(staged, "utf8"), "人力 8 万，硬件 4 万。");
  });
});

test("a catalog whose jobs predate multi-material runs still hides and deletes", async () => {
  await withHome(async (home) => {
    const store = openShelfStore(home, { disabled: true });
    const item = store.admit({ filename: "旧.md", bytes: Buffer.from("旧材料", "utf8"), mime: "text/markdown" });
    const catalogPath = join(home, "shelf", "catalog.json");
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Record<string, unknown>;
    catalog.jobs = [{
      job_id: "job_old",
      recipe: "extract_text",
      status: "succeeded",
      item_id: item.item_id,
      result_item_id: null,
      isolation: "本机抽字，不调用 Agent",
      error: null,
      created_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
    }];
    writeFileSync(catalogPath, JSON.stringify(catalog));
    const reopened = openShelfStore(home, { disabled: true });
    assert.equal(reopened.snapshot().running_jobs.length, 0);
    reopened.hide(item.item_id);
    assert.equal(reopened.snapshot().materials.length, 0);
  });
});

test("a link is shelved as a captured page, and a dead link still lands with its URL", async () => {
  await withHome(async (home) => {
    const server = createServer((request, response) => {
      if (request.url === "/page") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end("<html><head><title>报价说明</title></head><body><nav>导航</nav><main><h1>报价</h1><p>总价 12 万元。</p></main></body></html>");
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    const store = openShelfStore(home, { disabled: true });
    try {
      const page = await store.admitText(`http://127.0.0.1:${address.port}/page`);
      assert.equal(page.kind, "website");
      assert.equal(page.name, "报价说明.md");
      assert.match(page.preview_text ?? "", /# 报价说明/u);
      assert.match(page.preview_text ?? "", /总价 12 万元。/u);
      assert.doesNotMatch(page.preview_text ?? "", /导航/u);

      const dead = await store.admitText("http://127.0.0.1:1/missing");
      assert.equal(dead.kind, "website");
      assert.match(dead.preview_text ?? "", /没有抓到正文/u);
      assert.match(dead.preview_text ?? "", /http:\/\/127\.0\.0\.1:1\/missing/u);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
