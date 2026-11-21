import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { scriptedModelServer } from "./fixtures/connector-assistant-model.js";
import { CODING_BOX, CODING_OPEN, CODING_SEND, codingControl, codingType } from "./fixtures/coding-composer.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

test("QEA-54/QEA-55 · new and ended Coding sessions show unreadable environment facts in place, retry without sending and recover without losing the draft", { timeout: 150_000 }, async t => {
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const model = await scriptedModelServer(t, () => "环境检查完成后的正常讨论。");
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, {
    prepareHome: home => seedConfiguredModels(home, [{ provider_id: "fixture", model_id: "fixture-model" }], model.base),
  });
  if (!b) return;
  const directory = join(b.homeDirectory, "environment-read-failure"); await mkdir(join(directory, "node_modules"), { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "fixture", scripts: { test: "node --test" } }));
  await writeFile(join(directory, ".env"), "LOCAL_URL=private-fixture-value\n");
  const template = join(directory, ".env.example"); await writeFile(template, "LOCAL_URL=\0binary");
  await setProjectOutputFolder(b.web, b.projectId!, directory);
  const frame = await pluginFrameBrowser(t, b, "coding");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=coding` }, b.sessionId));
  await frame.click("[data-coding-new]"); await b.waitFor(CODING_OPEN);
  const retry = "[data-coding-env-checklist] [data-coding-env-action=retry]";
  const restoreEnvironment = async (baseline: string) => {
    await writeFile(template, "LOCAL_URL=\n");
    // Periodic refresh can remove Retry after the file is fixed. Look it up and activate it in the same DOM turn.
    await frame.evaluate(`(() => {
      const button = document.querySelector(${JSON.stringify(retry)});
      if (button && !button.disabled && button.getClientRects().length) button.click();
    })()`);
    await frame.waitFor(`document.querySelector(${JSON.stringify(baseline)})`);
  };
  await frame.waitFor(`document.querySelector(${JSON.stringify(retry)})`);
  await b.evaluate(codingType("保留我的任务草稿"));
  const draft = () => b.evaluate<string>(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`);
  await frame.click(retry);
  await frame.waitFor(`document.querySelector(${JSON.stringify(retry)})?.disabled === false`);
  assert.equal(await draft(), "保留我的任务草稿"); assert.equal(model.requests.length, 0);
  assert.equal(await frame.evaluate("document.querySelectorAll('[data-coding-env-checklist]').length"), 1);
  assert.equal(await frame.evaluate("document.querySelector('[data-coding-env-checklist]').textContent.includes('全部就绪')"), false);
  assert.equal(await frame.evaluate("document.body.textContent.includes('private-fixture-value')"), false);
  await restoreEnvironment("[data-coding-env-action=run-baseline]");
  assert.equal(await draft(), "保留我的任务草稿"); assert.equal(model.requests.length, 0);
  for (const [id, value] of [["model", JSON.stringify(["fixture", "fixture-model"])], ["intent", "discuss"]]) {
    await b.evaluate(`{ const node = document.querySelector(${JSON.stringify(codingControl(id!))}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('change', { bubbles: true })); }`);
  }
  await b.click(CODING_SEND);
  await frame.waitFor("document.querySelector('[data-coding-workbench]').textContent.includes('环境检查完成后的正常讨论')", 30_000);
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value === ''`);
  const calls = model.requests.length;
  await b.evaluate(codingType("下一轮仍要保留"));
  await writeFile(template, "LOCAL_URL=\0binary-again");
  // Expire the owner's existing successful inspection; the browser still performs its ordinary reload/read.
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 16_000 });
  await b.reloadPage(); await b.waitFor(CODING_OPEN);
  // Expected change (screen-polish POLISH-24): a round's environment card sits inside the round's one-line fold of what it was
  // prepared with (`[data-coding-prep]`), not directly in the round; the card, its actions and what they do are the same.
  await frame.waitFor(`document.querySelector('[data-run] > [data-coding-prep] > ${retry}')`);
  assert.equal(await draft(), "下一轮仍要保留");
  const evidence = reviewEvidenceUrl("quality-audit-coding-recovery/"); await mkdir(evidence, { recursive: true });
  for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
    await b.setViewport(width, 900);
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
    await frame.click(retry); await frame.waitFor(`document.querySelector(${JSON.stringify(retry)})?.disabled === false`);
    assert.equal(await draft(), "下一轮仍要保留"); assert.equal(model.requests.length, calls);
    assert.equal(await frame.evaluate("document.querySelectorAll('[data-coding-env-action=run-baseline]').length"), 0);
    assert.equal(await frame.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await frame.evaluate(`document.querySelector(${JSON.stringify(retry)}).scrollIntoView({ block: 'center' })`);
    await writeFile(new URL(`environment-unavailable-${theme}-${width}.png`, evidence), Buffer.from((await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId)).data, "base64"));
  }
  await restoreEnvironment("[data-run] > [data-coding-prep] > [data-coding-env-checklist] [data-coding-env-action=run-baseline]");
  assert.equal(await draft(), "下一轮仍要保留"); assert.equal(model.requests.length, calls);
});
