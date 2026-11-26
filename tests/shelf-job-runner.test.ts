import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isShelfFailure, shelfErrors } from "@molis-ai/molis-work-module-shelf";
import { shelfTestAi, shelfTestReceipt } from "./shelf-test-ai.js";
import { openTestShelfStore } from "./shelf-direct-actions.js";

for (const mode of ["cancel", "abort", "revoke", "source", "model", "shortcut"] as const) test(`Shelf ${mode} refuses late model results and failure records`, async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-late-"));
  let enter!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { enter = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let valid = true;
  const controller = new AbortController();
  const store = openTestShelfStore(home, { disabled: true }, {}, shelfTestAi(async () => {
    enter(); await held; return { text: "Late output", execution: shelfTestReceipt };
  }));
  try {
    const item = await store.admit({ filename: "材料.md", bytes: Buffer.from("原材料") });
    await store.saveSettings({ shortcuts: [{ id: "custom", name: "摘要", prompt: "总结", kinds: ["markdown"] }] });
    const pending = store.runJob({ recipe: mode === "shortcut" ? "shortcut" : "summarize", item_id: item.item_id, shortcut_id: "custom" },
      { signal: controller.signal, beforeEffect: async () => { if (!valid) throw new Error("revoked"); } });
    const rejected = assert.rejects(pending);
    await started;
    const job = (await store.snapshot()).running_jobs[0]!;
    if (mode === "cancel") await store.cancelJob(job.job_id);
    if (mode === "abort") controller.abort(new Error("aborted"));
    if (mode === "revoke") valid = false;
    if (mode === "source") writeFileSync(join(store.root, item.relative_path), "changed");
    if (mode === "model") await store.saveSettings({ model_selection: { provider_id: "test", model_id: "other" } });
    if (mode === "shortcut") await store.saveSettings({ shortcuts: [{ id: "custom", name: "摘要", prompt: "已改变的任务", kinds: ["markdown"] }] });
    release(); await rejected;
    assert.equal((await store.snapshot()).results.length, 0);
    const saved = JSON.parse(readFileSync(join(store.root, "catalog.json"), "utf8")).jobs[0];
    assert.equal(saved.status, mode === "cancel" ? "cancelled" : "running"); assert.equal(saved.error, null);
    assert.equal((await store.snapshot()).running_jobs.length, 0);
  } finally { release(); await rm(home, { recursive: true, force: true }); }
});

test("F-modules-server-19 recordFailure preserves cancelled status under concurrent cancel and keeps shelf.configuration_changed non-failure", async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-f19-"));
  try {
    // 1. shelf.configuration_changed from host AI port must not file a failed result item.
    const cfgStore = openTestShelfStore(home, { disabled: true }, {}, shelfTestAi(async () => {
      throw shelfErrors.configuration_changed("模型连接已变更");
    }));
    const item = await cfgStore.admit({ filename: "材料.md", bytes: Buffer.from("原材料") });
    await assert.rejects(
      cfgStore.runJob({ recipe: "summarize", item_id: item.item_id }),
      (error: unknown) => isShelfFailure(error) && error.code === "shelf.configuration_changed",
    );
    assert.equal((await cfgStore.snapshot()).results.length, 0);

    // 2. If the job row was already marked cancelled before recordFailure writes, recordFailure must not overwrite it as failed or file a failed result.
    let calls = 0;
    const cancelHome = await mkdtemp(join(tmpdir(), "shelf-f19-cancel-"));
    try {
      const store = openTestShelfStore(cancelHome, { disabled: true }, {}, shelfTestAi(async () => {
        throw new Error("model error");
      }));
      const doc = await store.admit({ filename: "doc.md", bytes: Buffer.from("body") });
      await assert.rejects(
        store.runJob({ recipe: "summarize", item_id: doc.item_id }, {
          beforeEffect: async () => {
            calls += 1;
            if (calls === 3) {
              // Simulate a cancel landing right after catch-path beforeCommit checks and before recordFailure's write lock.
              const catalogPath = join(store.root, "catalog.json");
              const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as { jobs: Array<{ status: string }> };
              catalog.jobs[0]!.status = "cancelled";
              writeFileSync(catalogPath, JSON.stringify(catalog));
            }
          },
        }),
        (error: unknown) => isShelfFailure(error) && error.code === "shelf.cancelled",
      );
      const catalog = JSON.parse(readFileSync(join(store.root, "catalog.json"), "utf8")) as { jobs: Array<{ status: string; error: string | null }> };
      assert.equal(catalog.jobs[0]!.status, "cancelled");
      assert.equal(catalog.jobs[0]!.error, null);
      assert.equal((await store.snapshot()).results.length, 0);
    } finally {
      await rm(cancelHome, { recursive: true, force: true });
    }
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
