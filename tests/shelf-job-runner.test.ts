import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { shelfTestAi, shelfTestReceipt } from "./shelf-test-ai.js";

for (const mode of ["cancel", "abort", "revoke", "source", "model", "shortcut"] as const) test(`Shelf ${mode} refuses late model results and failure records`, async () => {
  const home = await mkdtemp(join(tmpdir(), "shelf-late-"));
  let enter!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => { enter = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let valid = true;
  const controller = new AbortController();
  const store = openShelfStore(home, { disabled: true }, {}, shelfTestAi(async () => {
    enter(); await held; return { text: "Late output", execution: shelfTestReceipt };
  }));
  try {
    const item = store.admit({ filename: "材料.md", bytes: Buffer.from("原材料") });
    store.saveSettings({ shortcuts: [{ id: "custom", name: "摘要", prompt: "总结", kinds: ["markdown"] }] });
    const pending = store.runJob({ recipe: mode === "shortcut" ? "shortcut" : "summarize", item_id: item.item_id, shortcut_id: "custom" },
      { signal: controller.signal, beforeEffect: async () => { if (!valid) throw new Error("revoked"); } });
    const rejected = assert.rejects(pending);
    await started;
    const job = store.snapshot().running_jobs[0]!;
    if (mode === "cancel") store.cancelJob(job.job_id);
    if (mode === "abort") controller.abort(new Error("aborted"));
    if (mode === "revoke") valid = false;
    if (mode === "source") writeFileSync(join(store.root, item.relative_path), "changed");
    if (mode === "model") store.saveSettings({ model_selection: { provider_id: "test", model_id: "other" } });
    if (mode === "shortcut") store.saveSettings({ shortcuts: [{ id: "custom", name: "摘要", prompt: "已改变的任务", kinds: ["markdown"] }] });
    release(); await rejected;
    assert.equal(store.snapshot().results.length, 0);
    const saved = JSON.parse(readFileSync(join(store.root, "catalog.json"), "utf8")).jobs[0];
    assert.equal(saved.status, mode === "cancel" ? "cancelled" : "running"); assert.equal(saved.error, null);
    assert.equal(store.snapshot().running_jobs.length, 0);
  } finally { release(); await rm(home, { recursive: true, force: true }); }
});
