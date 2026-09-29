import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ShelfError, openShelfStore, SHELF_RECIPES, shelfRecipeOutputName } from "@molis-ai/molis-work-module-shelf";
import { extractMaterial } from "../apps/local-host/src/material-extraction.js";
import { materialImageTextAvailable } from "../apps/local-host/src/material-native.js";
import { shelfTestAi, shelfTestReceipt } from "./shelf-test-ai.js";

async function fixture(run: (home: string) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), "shelf-recipes-"));
  try { await run(home); } finally { await rm(home, { recursive: true, force: true }); }
}
const materials = { extract: extractMaterial, imageTextAvailable: materialImageTextAvailable };

test("automatic recipes require a configured model; local extraction works without one", async () => fixture(async home => {
  const store = openShelfStore(home, { disabled: true }, materials);
  const snapshot = store.snapshot();
  assert.equal(snapshot.runtime.runtime_key, "");
  assert.equal(snapshot.recipes.find(recipe => recipe.recipe === "summarize")?.available, false);
  assert.match(snapshot.ai!.reason!, /AI 模型/);
  const sample = store.seedSample();
  await assert.rejects(store.runJob({ recipe: "summarize", item_id: sample.item_id }), { code: "shelf.no_model" });
  assert.equal((await store.runJob({ recipe: "extract_text", item_id: sample.item_id })).job.runtime, "pdfkit");
}));

test("every AI recipe preserves source identity, uses frozen copies, and stores the complete execution receipt", async () => fixture(async home => {
  const ai = shelfTestAi(async (input, control) => {
    await control.beforeEffect?.();
    assert.equal(statSync(join(input.root, input.sources[0]!.relative_path)).mode & 0o222, 0);
    assert.match(readFileSync(join(input.root, input.sources[0]!.relative_path), "utf8"), /12 万元/);
    return { text: input.recipe === "extract_structure" && input.option_id === "json" ? '{"amount":120000}' : "# 摘要\n\n总价 12 万元。", execution: shelfTestReceipt };
  });
  const store = openShelfStore(home, { disabled: true }, materials, ai);
  const origin = join(home, "报价.md"); writeFileSync(origin, "总价 12 万元。");
  const original = readFileSync(origin), hash = createHash("sha256").update(original).digest("hex");
  const one = store.admit({ filename: "报价.md", bytes: original, origin_realpath: origin });
  const two = store.admit({ filename: "补充.md", bytes: Buffer.from("人力 12 万元。") });
  for (const recipe of SHELF_RECIPES.filter(recipe => recipe.requires_agent)) {
    for (const choice of recipe.choices) {
      const out = await store.runJob({ recipe: recipe.recipe, item_ids: recipe.recipe === "combine" ? [one.item_id, two.item_id] : [one.item_id], option_id: choice.id });
      assert.equal(out.job.status, "succeeded"); assert.equal(out.job.runtime, "prologue");
      assert.equal(out.origin_hash, hash); assert.deepEqual(readFileSync(origin), original);
      assert.deepEqual(out.job.execution, shelfTestReceipt);
      assert.equal(out.result!.name.split(".").at(-1), shelfRecipeOutputName(recipe.recipe, "markdown", choice.id).split(".").at(-1));
      assert.ok(out.result!.source_item_ids.includes(one.item_id));
      assert.equal(existsSync(join(home, "shelf", "jobs", out.job.job_id, "prompt.txt")), false);
    }
  }
  const result = store.snapshot().results[0]!;
  const job = result.job_id!; store.deleteCopy(result.item_id);
  assert.equal(existsSync(join(home, "shelf", "jobs", job)), false);
}));

test("a failed model response retains its reason and receipt without a fake deliverable", async () => fixture(async home => {
  const store = openShelfStore(home, { disabled: true }, materials, shelfTestAi(async () => {
    const error = new ShelfError("shelf.invalid_result", "没有交付正文"); error.execution = shelfTestReceipt; throw error;
  }));
  const item = store.admit({ filename: "材料.md", bytes: Buffer.from("事实") });
  await assert.rejects(store.runJob({ recipe: "summarize", item_id: item.item_id }), { code: "shelf.invalid_result" });
  const failed = store.snapshot().results[0]!;
  assert.equal(failed.status, "failed"); assert.equal(failed.relative_path, ""); assert.deepEqual(failed.source_item_ids, [item.item_id]);
  assert.throws(() => store.readFile(failed.item_id), { code: "shelf.missing_output" });
  const catalog = JSON.parse(readFileSync(join(home, "shelf", "catalog.json"), "utf8"));
  assert.deepEqual(catalog.jobs[0].execution, shelfTestReceipt);
}));

test("kind and minimum selection checks still precede model dispatch", async () => fixture(async home => {
  let calls = 0;
  const store = openShelfStore(home, { disabled: true }, materials, shelfTestAi(async () => { calls++; throw new Error("must not dispatch"); }));
  const item = store.admit({ filename: "材料.md", bytes: Buffer.from("事实") });
  await assert.rejects(store.runJob({ recipe: "combine", item_ids: [item.item_id] }), /至少要两份/);
  const image = store.admit({ filename: "image.png", mime: "image/png", bytes: Buffer.from([1, 2]) });
  await assert.rejects(store.runJob({ recipe: "translate", item_id: image.item_id }), /不能用/);
  assert.equal(calls, 0);
}));

test("local Vision still extracts the original image without a model", async t => {
  if (process.platform !== "darwin") { t.skip("Vision requires macOS"); return; }
  await fixture(async home => {
    assert.equal(materialImageTextAvailable(), true);
    const store = openShelfStore(home, { disabled: true }, materials);
    const item = store.admit({ filename: "截图.png", mime: "image/png", bytes: readFileSync(new URL("./fixtures/shelf-ocr-text.png", import.meta.url)) });
    const out = await store.runJob({ recipe: "extract_text", item_id: item.item_id, option_id: "en" });
    assert.equal(out.result?.name, "ocr.md"); assert.equal(out.job.runtime, "vision"); assert.match(out.result?.preview_text ?? "", /SHELF/);
  });
});
