import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  ShelfError,
  clearShelfRuntimeCache,
  ocrHelperPath,
  detectShelfRuntime,
  headlessArguments,
  openShelfStore,
  recipePrompt,
  shelfRecipeSpec,
} from "@molis-ai/molis-work-module-shelf";

interface Fixture {
  home: string;
  bin: string;
  store: ReturnType<typeof openShelfStore>;
}

const HELP_WITH_PRINT = [
  "Usage: claude [options] [prompt]",
  "  --print                 Print response and exit",
  "  --output-format <fmt>   Output format",
  "  --add-dir <dir>         Additional directory",
].join("\\n");

const HELP_TUI_ONLY = [
  "Usage: claude",
  "  Start an interactive session in this terminal.",
  "  --version   Show version",
].join("\\n");

async function fakeAgent(bin: string, help: string, body: string): Promise<void> {
  await mkdir(bin, { recursive: true });
  const script = `#!/bin/sh
if [ "$1" = "--help" ]; then
  printf '%b\\n' "${help}"
  exit 0
fi
${body}
`;
  const file = join(bin, "claude");
  await writeFile(file, script);
  chmodSync(file, 0o755);
}

async function withFixture<T>(run: (fixture: Fixture) => Promise<T>, help?: string, body?: string): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "molis-work-shelf-recipes-"));
  const bin = join(home, "bin");
  clearShelfRuntimeCache();
  if (help !== undefined) await fakeAgent(bin, help, body ?? "exit 0");
  try {
    return await run({ home, bin, store: openShelfStore(home, { pathEnvironment: bin, home }) });
  } finally {
    clearShelfRuntimeCache();
    await rm(home, { recursive: true, force: true });
  }
}

function admitText(store: Fixture["store"], name: string, body: string, origin?: string): string {
  if (origin) writeFileSync(origin, body);
  const item = store.admit({
    filename: name,
    bytes: Buffer.from(body, "utf8"),
    mime: "text/markdown",
    origin_realpath: origin ?? null,
  });
  return item.item_id;
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("with no terminal agent on PATH the CLI recipes stay off and say why", async () => {
  await withFixture(async ({ store }) => {
    const snapshot = store.snapshot();
    assert.equal(snapshot.runtime.runtime_key, "");
    assert.equal(snapshot.runtime.can_run_job, false);
    const summarize = snapshot.recipes.find((entry) => entry.recipe === "summarize");
    assert.equal(summarize?.available, false);
    assert.equal(summarize?.reason, "未发现终端 Agent。");
    assert.equal(snapshot.recipes.find((entry) => entry.recipe === "extract_text")?.available, true);
    const itemId = admitText(store, "报价.md", "# 报价\n\n总价 12 万元。");
    await assert.rejects(
      store.runJob({ recipe: "summarize", item_id: itemId }),
      (error: ShelfError) => error.message === "未发现终端 Agent。",
    );
  });
});

test("a TUI without a headless entry can be found but still cannot run a recipe", async () => {
  await withFixture(async ({ store }) => {
    const snapshot = store.snapshot();
    assert.equal(snapshot.runtime.runtime_key, "claude");
    assert.equal(snapshot.runtime.can_run_job, false);
    assert.equal(snapshot.runtime.isolation, "tui");
    const summarize = snapshot.recipes.find((entry) => entry.recipe === "summarize");
    assert.equal(summarize?.available, false);
    assert.equal(summarize?.reason, "Claude 没有无界面执行入口，动作不能跑。");
  }, HELP_TUI_ONLY);
});

test("summarize runs the agent on the copy, keeps the original, and files the result", async () => {
  await withFixture(async ({ home, store }) => {
    const origin = join(home, "报价.md");
    const itemId = admitText(store, "报价.md", "# 报价\n\n总价 12 万元，2026 年 3 月交付。", origin);
    const originHashBefore = sha256(origin);

    const snapshot = store.snapshot();
    assert.equal(snapshot.runtime.can_run_job, true);
    assert.equal(snapshot.runtime.isolation, "unknown");
    assert.equal(snapshot.recipes.find((entry) => entry.recipe === "summarize")?.available, true);

    const outcome = await store.runJob({ recipe: "summarize", item_id: itemId, option_id: "short" });
    assert.equal(outcome.job.status, "succeeded");
    assert.equal(outcome.job.option_id, "short");
    assert.equal(outcome.job.runtime, "claude");
    assert.equal(outcome.job.isolation, "未确认工作区限制，仍在副本目录跑");
    assert.equal(outcome.result?.name, "summary.md");
    assert.equal(outcome.result?.group, "result");
    assert.match(outcome.result?.preview_text ?? "", /约 200 字的短总结/);

    const jobRoot = join(home, "shelf", "jobs", outcome.job.job_id);
    const prompt = readFileSync(join(jobRoot, "prompt.txt"), "utf8");
    assert.match(prompt, /把完整结果写成文件：summary\.md/u);
    assert.match(prompt, /- 报价\.md/u);
    assert.doesNotMatch(prompt, new RegExp(origin.replaceAll(".", "\\.")));
    assert.doesNotMatch(prompt, /\/shelf\/files\//u);

    assert.equal(statSync(join(jobRoot, "input", "报价.md")).mode & 0o222, 0);
    assert.equal(sha256(origin), originHashBefore);
    assert.equal(store.snapshot().results[0]?.name, "summary.md");

    const second = await store.runJob({ recipe: "summarize", item_id: itemId });
    assert.equal(second.result?.name, "summary-2.md");
  }, HELP_WITH_PRINT, `printf '%s\\n' "# 报价摘要" "" "这是约 200 字的短总结。" > summary.md
printf '%s\\n' "已写入 summary.md"`);
});

test("a deliverable that only came back on stdout still lands in the results", async () => {
  await withFixture(async ({ store }) => {
    const itemId = admitText(store, "会议.md", "讨论了排期与预算。");
    const outcome = await store.runJob({ recipe: "summarize", item_id: itemId });
    assert.equal(outcome.result?.name, "summary.md");
    assert.match(outcome.result?.preview_text ?? "", /排期与预算/u);
  }, HELP_WITH_PRINT, `printf '%s\\n' "# 会议摘要" "" "团队确认了排期与预算。"`);
});

test("a run that only reports success leaves a failed row with the reason and nothing to take away", async () => {
  await withFixture(async ({ store }) => {
    const itemId = admitText(store, "会议.md", "讨论了排期与预算。");
    await assert.rejects(
      store.runJob({ recipe: "summarize", item_id: itemId }),
      (error: ShelfError) => error.message === "这次没有生成文件",
    );
    const snapshot = store.snapshot();
    assert.equal(snapshot.materials.length, 1);
    assert.equal(snapshot.results.length, 1);
    const failed = snapshot.results[0]!;
    assert.equal(failed.status, "failed");
    assert.equal(failed.failure_reason, "这次没有生成文件");
    assert.equal(failed.relative_path, "");
    assert.deepEqual(failed.source_item_ids, [itemId]);
    assert.throws(
      () => store.readFile(failed.item_id),
      (error: unknown) => error instanceof ShelfError && error.code === "shelf.missing_output",
    );
    assert.throws(
      () => store.useAsMaterial(failed.item_id),
      (error: unknown) => error instanceof ShelfError && error.code === "shelf.missing_output",
    );
    store.deleteCopy(failed.item_id);
    assert.equal(store.snapshot().results.length, 0);
  }, HELP_WITH_PRINT, `printf '%s\\n' "已写入 summary.md"`);
});

test("cancelling a running job stops the agent and files no result", async () => {
  await withFixture(async ({ store }) => {
    const itemId = admitText(store, "长稿.md", "很长的一份材料。");
    const run = store.runJob({ recipe: "summarize", item_id: itemId });
    let jobId = "";
    for (let attempt = 0; attempt < 60 && !jobId; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      jobId = store.snapshot().running_jobs[0]?.job_id ?? "";
    }
    assert.notEqual(jobId, "");
    const cancelled = store.cancelJob(jobId);
    assert.equal(cancelled.status, "cancelled");
    await assert.rejects(run, (error: ShelfError) => error.code === "shelf.cancelled");
    const snapshot = store.snapshot();
    assert.equal(snapshot.results.length, 0);
    assert.equal(snapshot.running_jobs.length, 0);
    assert.equal(snapshot.materials.length, 1);
  }, HELP_WITH_PRINT, `sleep 30
printf '%s\\n' "# 总结" > summary.md`);
});

test("a fenced JSON deliverable is unwrapped into extracted.json", async () => {
  await withFixture(async ({ store }) => {
    const itemId = admitText(store, "合同.md", "甲方：某公司。金额：12 万元。");
    const outcome = await store.runJob({ recipe: "extract_structure", item_id: itemId });
    assert.equal(outcome.result?.name, "extracted.json");
    assert.deepEqual(JSON.parse(outcome.result?.preview_text ?? ""), { amount: "120000" });
  }, HELP_WITH_PRINT, `printf '%b\\n' '\\0140\\0140\\0140json' '{"amount":"120000"}' '\\0140\\0140\\0140' > extracted.json`);
});

test("combine needs two materials and the kind gate refuses the wrong material", async () => {
  await withFixture(async ({ store }) => {
    const first = admitText(store, "一号.md", "第一份材料。");
    await assert.rejects(
      store.runJob({ recipe: "combine", item_ids: [first] }),
      (error: ShelfError) => error.message === "「整合」至少要两份材料",
    );
    const second = admitText(store, "二号.md", "第二份材料。");
    const outcome = await store.runJob({ recipe: "combine", item_ids: [first, second] });
    assert.equal(outcome.result?.name, "brief.md");
    assert.deepEqual(outcome.job.item_ids, [first, second]);

    const image = store.admit({ filename: "截图.png", bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]), mime: "image/png" });
    await assert.rejects(
      store.runJob({ recipe: "translate", item_id: image.item_id }),
      (error: ShelfError) => error.message === "选中的材料不能用「翻译」",
    );
  }, HELP_WITH_PRINT, `printf '%s\\n' "# 合稿" "" "两份材料都保留了。" > brief.md`);
});

test("deleting a result clears the frozen job folder", async () => {
  await withFixture(async ({ home, store }) => {
    const itemId = admitText(store, "报价.md", "总价 12 万元。");
    const outcome = await store.runJob({ recipe: "summarize", item_id: itemId });
    const jobRoot = join(home, "shelf", "jobs", outcome.job.job_id);
    assert.equal(existsSync(jobRoot), true);
    store.deleteCopy(outcome.result?.item_id ?? "");
    assert.equal(existsSync(jobRoot), false);
  }, HELP_WITH_PRINT, `printf '%s\\n' "# 报价摘要" "" "总价 12 万元。" > summary.md`);
});

test("Codex keeps DropAgent's exec arguments and workspace sandbox wording", async () => {
  const spec = shelfRecipeSpec("translate");
  const args = headlessArguments("codex", "exec --sandbox workspace-write", {
    workdir: "/jobs/1/work",
    promptFile: "/jobs/1/prompt.txt",
    outputFile: "/jobs/1/output/translated.md",
    prompt: recipePrompt("translate", "en"),
    isolation: "workspace",
    network: spec.needs_network,
  });
  assert.deepEqual(args.slice(0, 8), [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--json",
    "--cd",
    "/jobs/1/work",
  ]);
  assert.ok(args.includes("--sandbox"));
  assert.ok(args.includes("workspace-write"));
  assert.ok(args.includes("-c"));
  assert.ok(args.includes("sandbox_workspace_write.network_access=true"));
  assert.match(args.at(-1) ?? "", /翻译成 English/u);
});

test("agent discovery only looks at the search path it was given", async () => {
  await withFixture(async ({ bin }) => {
    clearShelfRuntimeCache();
    assert.equal(detectShelfRuntime({ pathEnvironment: "", home: "/nonexistent" }).runtime_key, "");
    assert.equal(detectShelfRuntime({ pathEnvironment: bin, home: "/nonexistent" }).runtime_key, "claude");
  }, HELP_WITH_PRINT);
});

test("an image reads on this Mac: Vision writes ocr.md, no agent and no network", async () => {
  const helper = ocrHelperPath();
  if (!helper) {
    console.log("skipped: no molis-work-ocr helper built");
    return;
  }
  await withFixture(async ({ store }) => {
    const png = readFileSync(new URL("./fixtures/shelf-ocr-text.png", import.meta.url));
    const item = store.admit({ filename: "截图.png", bytes: png, mime: "image/png" });
    const snapshot = store.snapshot();
    assert.equal(snapshot.runtime.image_text, true);
    assert.equal(snapshot.recipes.find((entry) => entry.recipe === "extract_text")?.accepts.includes("image"), true);
    const outcome = await store.runJob({ recipe: "extract_text", item_id: item.item_id, option_id: "en" });
    assert.equal(outcome.result?.name, "ocr.md");
    assert.equal(outcome.job.runtime, "vision");
    assert.equal(outcome.job.isolation, "本机抽字，不调用 Agent");
    assert.match(outcome.result?.preview_text ?? "", /SHELF/u);
  });
});
