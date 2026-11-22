import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { scriptedModelServer } from "./fixtures/connector-assistant-model.js";
import { CODING_BOX, CODING_OPEN, CODING_SEND, codingControl, codingType, CODING_MODEL, CODING_MODELS_LISTED, codingSetting } from "./fixtures/coding-composer.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

test("QEA-47 QEA-166 · real Coding environment controls preserve the draft, open Files, and require the person to send", { timeout: 150_000 }, async t => {
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  const model = await scriptedModelServer(t, () => "只读完环境说明，没有运行命令。");
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, {
    prepareHome: home => seedConfiguredModels(home, [{ provider_id: "fixture", model_id: "fixture-model" }], model.base),
  });
  if (!b) return;
  const directory = join(b.homeDirectory, "environment-recovery"); await mkdir(directory);
  const git = (...args: string[]) => execFileSync("git", args, { cwd: directory, stdio: "pipe" });
  git("init", "-b", "main"); git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
  await writeFile(join(directory, "package.json"), JSON.stringify({ name: "environment-fixture", scripts: {
    test: "node -e \"throw new Error('must not execute from a UI click')\"", 'check<img src=x onerror="globalThis.environmentInjected=1">': "ignored",
  }, dependencies: { "fixture-dependency": "1.0.0" } }));
  await writeFile(join(directory, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(join(directory, "conflict.txt"), "base\n"); git("add", "."); git("commit", "-m", "fixture base");
  git("checkout", "-b", "other"); await writeFile(join(directory, "conflict.txt"), "other\n"); git("commit", "-am", "fixture other");
  git("checkout", "main"); await writeFile(join(directory, "conflict.txt"), "main\n"); git("commit", "-am", "fixture main");
  assert.throws(() => git("merge", "other"));
  await setProjectOutputFolder(b.web, b.projectId!, directory);
  const child = await pluginFrameBrowser(t, b, "coding");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=coding` }, b.sessionId));
  const visible = (selector: string) => `document.querySelector(${JSON.stringify(selector)})?.checkVisibility()`;
  const back = "[data-coding-directory-back]";
  const directoryClick = async (selector: string) => {
    await child.waitFor(`${visible(selector)} || ${visible(back)}`);
    if (!await child.evaluate(visible(selector))) await child.click(back);
    await child.click(selector);
  };
  await child.click("[data-coding-new]"); await b.waitFor(CODING_OPEN);
  const sid = await child.evaluate<string>("document.querySelector('[data-coding-session].is-selected').dataset.codingSession");
  const session = `[data-coding-session="${sid}"]`, sessions = "[data-coding-face=sessions]", files = "[data-coding-face=files]";
  await child.waitFor(CODING_MODELS_LISTED);
  await child.evaluate(codingSetting(CODING_MODEL, JSON.stringify(["fixture", "fixture-model"])));
  for (const [id, value] of [["intent", "discuss"]]) {
    await b.evaluate(`{ const node = document.querySelector(${JSON.stringify(codingControl(id!))}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('change', { bubbles: true })); }`);
  }
  await child.waitFor("document.querySelector('[data-coding-env-checklist]')?.textContent.includes('pnpm')");
  await b.evaluate(codingType("原来的草稿"));
  const readDraft = () => b.evaluate<string>(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`);
  const priorCalls = model.requests.length;
  // Click the visible button even on the old build, whose sanitizer has erased its action attributes.
  await child.evaluate("[...document.querySelectorAll('[data-coding-env-checklist] button')].find(button => button.textContent.includes('准备安装依赖')).click()");
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value.includes('安装依赖（pnpm）')`, 4_000);
  assert.match(await readDraft(), /^原来的草稿\n/);
  assert.equal(await b.evaluate(`document.querySelector(${JSON.stringify(codingControl("intent"))}).value`), "execute");
  assert.equal(await child.evaluate("Boolean(document.querySelector('[data-coding-env-action=run-baseline]'))"), false, "a missing dependency is not reported ready for baseline execution");
  assert.equal(model.requests.length, priorCalls, "preparing dependencies only changes the visible draft");
  // The actual directory becomes ready independently; a later normal read must install the refreshed controls too.
  await mkdir(join(directory, "node_modules"));
  await new Promise(resolve => setTimeout(resolve, 15_050));
  await b.reloadPage(); await b.waitFor(CODING_OPEN);
  await child.waitFor("document.querySelector('[data-coding-env-action=run-baseline]')");
  await child.click("[data-coding-env-action='run-baseline']");
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value.includes('基线测试（pnpm test）')`);
  assert.equal(model.requests.length, priorCalls, "preparing dependencies and baseline only changes the visible draft");
  assert.equal(await child.evaluate("Boolean(document.querySelector('[data-coding-env-checklist] img')) || Boolean(globalThis.environmentInjected)"), false);
  const draft = await readDraft();
  await child.click("[data-coding-env-action='open-workspace']");
  await child.waitFor("document.querySelector('[data-coding-workspace-dialog]').open");
  await child.click("[data-coding-workspace-close]");
  await child.waitFor("!document.querySelector('[data-coding-workspace-dialog]').open");
  await b.setViewport(390, 900);
  await child.waitFor(`${visible(back)} && !${visible(files)}`);
  await child.click("[data-coding-env-action='open-files']");
  await child.waitFor(`${visible(files)} && document.querySelector('${files}').getAttribute('aria-pressed') === 'true'`, 4_000);
  assert.equal(await child.evaluate(`document.activeElement === document.querySelector('${files}')`), true);
  assert.equal(await readDraft(), draft); assert.equal(model.requests.length, priorCalls);
  await directoryClick(sessions);
  await directoryClick(session);
  await b.waitFor(CODING_OPEN);
  // The person explicitly sends in discussion mode; the fixture model never requests a command.
  await b.evaluate(`{ const node = document.querySelector(${JSON.stringify(codingControl("intent"))}); node.value = 'discuss'; node.dispatchEvent(new Event('change', { bubbles: true })); }`);
  await b.click(CODING_SEND);
  await child.waitFor("document.querySelector('[data-coding-workbench]').textContent.includes('只读完环境说明，没有运行命令。')", 30_000);
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value === ''`);
  // Expected change (screen-polish POLISH-24): a round's environment card sits inside the round's one-line fold of what it was
  // prepared with (`[data-coding-prep]`), not directly in the round; the card, its actions and what they do are the same.
  await child.waitFor("document.querySelector('[data-run] > [data-coding-prep] > [data-coding-env-checklist] [data-coding-env-action=run-baseline]')");
  const afterRun = model.requests.length;
  await b.evaluate(codingType("下一轮草稿"));
  await child.click("[data-run] > [data-coding-prep] > [data-coding-env-checklist] [data-coding-env-action='run-baseline']");
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value.includes('基线测试（pnpm test）')`);
  assert.match(await readDraft(), /^下一轮草稿\n/); assert.equal(model.requests.length, afterRun);
  const endedDraft = await readDraft();
  await directoryClick(sessions);
  await child.click("[data-coding-new]"); await b.waitFor(CODING_OPEN);
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value === ''`);
  await directoryClick(session);
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value === ${JSON.stringify(endedDraft)}`);
  await b.reloadPage(); await b.waitFor(CODING_OPEN);
  await child.waitFor(`document.querySelector('[data-coding-session="${sid}"]')?.classList.contains('is-selected')`);
  await child.click("[data-run] > [data-coding-prep] > [data-coding-env-checklist] [data-coding-env-action='run-baseline']");
  await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value.includes('基线测试（pnpm test）')`);
  assert.equal(model.requests.length, afterRun);
  const evidence = reviewEvidenceUrl("quality-audit-coding-recovery/"); await mkdir(evidence, { recursive: true });
  for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
    await b.setViewport(width, 900);
    await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }, { name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
    await b.evaluate(codingType("保留这段草稿"));
    await child.click("[data-run] > [data-coding-prep] > [data-coding-env-checklist] [data-coding-env-action='run-baseline']");
    await b.waitFor(`document.querySelector(${JSON.stringify(CODING_BOX)}).value.includes('基线测试（pnpm test）')`);
    assert.match(await readDraft(), /^保留这段草稿\n/); assert.equal(model.requests.length, afterRun);
    assert.equal(await child.evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
    await child.evaluate("document.querySelector('[data-run] > [data-coding-prep] > [data-coding-env-checklist]').scrollIntoView({ block: 'center' })");
    await writeFile(new URL(`environment-${theme}-${width}.png`, evidence), Buffer.from((await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId)).data, "base64"));
  }
  assert.match(git("status", "--porcelain").toString(), /UU conflict\.txt/, "UI preparation never resolves or overwrites the actual repository");
});
