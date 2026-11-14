import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { SKILL_AUTHORED_PLUGIN_ID, type SkillCatalogEntry } from "@molis-ai/molis-work-contracts/services/skills";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// Batch 41, 41-2 (定样 docs/design/skill-authoring, scheme B): on 「能力包」 the person writes a Skill of their own — one sentence the
// assistant drafts from, or 「我自己写」 — changes it, is asked once before unsaved work is left, deletes it and takes that back, and
// starts a copy of a Skill that is not theirs. Through the actual browser and Host.

const SHOTS = join(process.cwd(), ".impeccable/qa/review/skill-authoring");

test("SKL-41-2-AU-10 writing, drafting, changing, leaving, deleting and copying a Skill on the 「能力包」 page", { timeout: 180_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis41-authoring-"));
  let browser: ChromeHarness | undefined;
  t.after(async () => { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const answers: string[] = [];
  const f = await serveHomeRuntime(t, { completeText: async () => answers.shift() ?? "" }), project = await f.project("Skill authoring");
  browser = await ChromeHarness.start(directory, { executable: requiredHeadlessTestBrowser() });
  const page = await browser.page();
  await page.command("Runtime.enable");
  await page.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const shot = async (name: string) => {
    await mkdir(SHOTS, { recursive: true });
    const image = await page.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(SHOTS, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  const mine = async () => ((await (await f.request(`/projects/${project.project_id}/api/skills/list`, { method: "POST", body: {} })).json()) as { skills: SkillCatalogEntry[] }).skills
    .filter(skill => skill.pack.plugin_id === SKILL_AUTHORED_PLUGIN_ID);
  const text = (selector: string) => page.evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ""`);
  const state = "JSON.stringify({ notice: document.querySelector('[data-kit-notice]')?.innerText, detail: document.querySelector('.kit-detail')?.innerText.slice(0, 400) })";
  const act = (name: string) => `[data-kit-settings] [data-kit-act="${name}"]`;

  await page.command("Page.navigate", { url: `${f.origin}/projects/${project.project_id}/settings/kit` });
  await page.wait("!!document.querySelector('[data-kit-body] .mw-item__pick')");

  // 新建 → 先说一句：起草失败留在原处；再起草，表单里是助理的初稿。
  await page.click(act("skill-new"));
  await page.wait("document.activeElement?.dataset.auField === 'intent'");
  assert.equal(await page.evaluate(`document.querySelector('${act("au-draft")}').disabled`), true, "nothing to draft from yet");
  await page.fill("[data-au-field=intent]", "每周五把一周的进展整理成周报");
  answers.push("我不确定。");
  await page.click(act("au-draft"));
  await page.wait("!!document.querySelector('.au-ask .au-failure')", { describe: state });
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=intent]').value"), "每周五把一周的进展整理成周报", "the sentence stays");
  answers.push(JSON.stringify({ name: "每周周报", description: "要把一周的进展整理成周报时用。", when_not_to_use: "只想看某一天做了什么。", applies_to: "assistant", body: "# 每周周报\n\n1. 列出完成的事。\n2. 列出卡住的事。" }));
  await page.click(act("au-draft"));
  await page.wait("document.querySelector('#au-name')?.value === '每周周报'", { describe: state });
  assert.match(await text(".au-drafted"), /助理起草的/);
  assert.match(await text("[data-au-count]"), /4 \/ 500 行/);
  await shot("drafted-form");

  // 缺项就地提示，焦点落在第一处；改了就消失。
  await page.fill("#au-name", "");
  await page.click(act("au-save"));
  await page.wait("document.activeElement?.id === 'au-name' && document.activeElement.getAttribute('aria-invalid') === 'true'", { describe: state });
  assert.match(await text('[data-au-error="name"]'), /要有名称/);
  await page.fill("#au-name", "每周周报");
  assert.equal(await page.evaluate("!!document.querySelector('[data-au-error]')"), false);

  // 保存：回到详情，关着，提示里一步设成自动。
  await page.click(act("au-save"));
  await page.wait("document.querySelector('[data-kit-notice]')?.innerText.includes('已保存，现在是关着的')", { describe: state });
  let [skill] = await mine();
  assert.deepEqual([skill?.name, skill?.state, skill?.ref.version], ["每周周报", "off", 1]);
  assert.match(await text(".kit-detail > header h3"), /每周周报/);
  await shot("saved-new");
  await page.click(`[data-kit-notice] [data-kit-act="au-auto"]`);
  await page.wait("document.querySelector('[data-kit-notice]')?.innerText.includes('改成自动')", { describe: state });
  assert.equal((await mine())[0]?.state, "auto");

  // 修改：没改动时不能保存；有改动要去别处，表单顶上问一次；接着写，保存为第 2 版。
  await page.click(act("skill-edit"));
  await page.wait("document.querySelector('#au-title')?.innerText.includes('修改「每周周报」')", { describe: state });
  assert.equal(await page.evaluate("document.querySelector('[data-au-save]').disabled"), true);
  await page.fill("#au-body", "改过的做法。");
  assert.equal(await page.evaluate("document.querySelector('[data-au-save]').disabled"), false);
  assert.match(await text("[data-au-dirty]"), /有没保存的改动/);
  await page.click("[data-kit-body] .mw-list-detail__list .mw-item__pick");
  await page.wait("document.activeElement?.matches('[data-au-leave]')", { describe: state });
  assert.equal(await page.evaluate("document.querySelector('#au-body').value"), "改过的做法。", "nothing is lost while asked");
  await shot("leave-bar");
  await page.click(act("au-leave-stay"));
  await page.wait("!document.querySelector('[data-au-leave]') && !!document.querySelector('#au-body')");
  await page.click(act("au-save"));
  await page.wait("document.querySelector('[data-kit-notice]')?.innerText.includes('保存为第 2 版')", { describe: state });
  [skill] = await mine();
  assert.deepEqual([skill?.ref.version, skill?.state], [2, "auto"], "a change keeps the person's choice of state");

  // 删除带撤销。
  await page.click(act("skill-delete"));
  await page.wait("document.querySelector('[data-kit-notice]')?.innerText.includes('删除了「每周周报」')", { describe: state });
  assert.deepEqual(await mine(), []);
  await page.click(`[data-kit-notice] [data-kit-act="au-undelete"]`);
  await page.wait("document.querySelector('[data-kit-notice]')?.innerText.includes('恢复了')", { describe: state });
  [skill] = await mine();
  assert.deepEqual([skill?.name, skill?.state], ["每周周报", "auto"]);

  // 不是自己写的：说明不能直接改，「改一份我的」从它起一个自己的。
  const systemSkill = "[...document.querySelectorAll('.kit-detail [data-kit-act=item]')].find(node => node.innerText.includes('分析与决策'))";
  await page.fill("[data-kit-search]", "分析与决策");
  await page.wait("document.querySelectorAll('[data-kit-body] .mw-list-detail__list .mw-item__pick').length === 1", { describe: state });
  await page.click("[data-kit-body] .mw-list-detail__list .mw-item__pick");
  await page.wait(`!!${systemSkill}`, { describe: state });
  await page.evaluate(`${systemSkill}.click()`);
  await page.wait("!!document.querySelector('.au-readonly')", { describe: state });
  assert.match(await text(".au-readonly"), /不是你写的/);
  assert.equal(await page.evaluate(`!!document.querySelector('${act("skill-edit")}')`), false);
  await shot("read-only");
  await page.click(act("skill-copy"));
  await page.wait("document.querySelector('#au-title')?.innerText.startsWith('从「')", { describe: state });
  assert.ok((await page.evaluate<string>("document.querySelector('#au-body').value")).length > 100, "the copy starts from the original's body");
  await page.click(act("au-save"));
  await page.wait("document.querySelector('[data-kit-notice]')?.innerText.includes('已保存，现在是关着的')", { describe: state });
  assert.equal((await mine()).length, 2);

  // 窄屏与深色各看一眼表单。
  await page.click(act("skill-edit"));
  await page.wait("!!document.querySelector('.au-form')");
  await page.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "no sideways scroll at 390");
  await shot("form-390-dark");
});
