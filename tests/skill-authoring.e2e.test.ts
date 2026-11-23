import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ChromeHarness } from "@molis-ai/molis-work-test-kit/browser";
import { SKILL_AUTHORED_PLUGIN_IDS, type SkillAuthoredSource, type SkillCatalogEntry, type SkillDraft, type SkillDraftSummary } from "@molis-ai/molis-work-contracts/services/skills";
import { requiredHeadlessTestBrowser } from "./fixtures/dedicated-headless-browser.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

// Batches 41 and 42 (定样 docs/design/skill-authoring scheme B; docs/design/skill-improvement scheme B): on 「能力包」 every change to a
// Skill is a draft first — a new one from one sentence, a change, a restored version, a copy of a general one — written on the left
// and tried on the right; it is replayed against a known answer, compared, and only adopting it makes a version. Deleting and
// discarding are taken back from the notice. Through the actual browser and Host.

const SHOTS = join(process.cwd(), ".impeccable/qa/review/skill-authoring");
/** The replay's judge: a result that says `differs` differs from the known answer, the others match. */
const judge = (prompt: string) => JSON.stringify({ results: [...prompt.matchAll(/\{"index":(\d+),"output":"((?:[^"\\]|\\.)*)"\}/gu)].map(([, index, output]) => output!.includes("two-differs")
  ? { index: Number(index), verdict: "differs", differences: ["少了按负责人分组", "少了截止日期"] }
  : output!.includes("differs")
    ? { index: Number(index), verdict: "differs", differences: ["少了按负责人分组"] }
    : { index: Number(index), verdict: "match", differences: [] }) });

test("SKP-11 PWA-14 PWA-103 PWA-105 SKL-41-2-AU-10 B42-F02 B42-F05 B42-F06 B42-F07 Skill authorship on the 「能力包」 page", { timeout: 300_000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis42-improve-"));
  let browser: ChromeHarness | undefined;
  t.after(async () => { try { await browser?.close(); } finally { await rm(directory, { recursive: true, force: true }); } });
  const answers: string[] = [];
  const completeText = async (prompt: unknown) => {
    const text = String(prompt);
    if (text.includes("你在对照技能回放的结果")) return judge(text);
    if (text.includes("没有任何工具")) {
      if (text.includes("纯一致样本")) return "周报：按负责人分组。";
      return text.includes("改过的做法") ? "周报：A 完成。（two-differs）" : "周报：按负责人分组。";
    }
    return answers.shift() ?? "";
  };
  const f = await serveHomeRuntime(t, { completeText: completeText as never }), project = await f.project("Skill authoring");
  browser = await ChromeHarness.start(directory, { executable: requiredHeadlessTestBrowser() });
  const page = await browser.page();
  await page.command("Runtime.enable");
  const size = (width: number, height: number) => page.command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  await size(1440, 900);
  const shot = async (name: string) => {
    await mkdir(SHOTS, { recursive: true });
    const image = await page.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(join(SHOTS, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  const api = async <T>(path: string, body: object = {}) => (await (await f.request(`/projects/${project.project_id}/api/skills/${path}`, { method: "POST", body })).json()) as T;
  const all = async () => (await api<{ skills: SkillCatalogEntry[] }>("list")).skills;
  const mine = async () => (await all()).filter(skill => skill.pack.plugin_id === SKILL_AUTHORED_PLUGIN_IDS.project);
  const text = (selector: string) => page.evaluate<string>(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ""`);
  const state = "JSON.stringify({ href: location.href, wraps: [...document.querySelectorAll('[data-settings-panel]')].map(n => [n.dataset.settingsPanel, n.dataset.settingsSource, n.dataset.settingsSearch, n.isConnected]), drafts: document.querySelectorAll('[data-kit-act=sk-open]').length, notice: document.querySelector('[data-kit-notice]')?.innerText, work: document.querySelector('[data-sk-work]')?.innerText.slice(0, 600), detail: document.querySelector('.kit-detail')?.innerText.slice(0, 400) })";
  const act = (name: string, value?: string) => `[data-kit-settings] [data-kit-act="${name}"]${value ? `[data-kit-v="${value}"]` : ""}`;
  const saved = "document.querySelector('[data-sk-bar] .mw-adopt-bar__status')?.innerText.includes('已自动保存')";
  const noticeHas = (words: string) => `document.querySelector('[data-kit-notice]')?.innerText.includes(${JSON.stringify(words)})`;

  await page.command("Page.navigate", { url: `${f.origin}/projects/${project.project_id}/settings/kit` });
  await page.wait("!!document.querySelector('[data-kit-body] .mw-item__pick')");

  // 新建 → 先说一句：起草失败留在原处；再起草，草稿在左边改、右边试的工作区里打开，列表收起；采用之前它没生效。
  await page.click(act("skill-new"));
  await page.wait("document.activeElement?.dataset.auField === 'intent'");
  assert.equal(await page.evaluate(`document.querySelector('${act("au-draft")}').disabled`), true, "nothing to draft from yet");
  await page.fill("[data-au-field=intent]", "每周五把一周的进展整理成周报");
  answers.push("我不确定。");
  await page.click(act("au-draft"));
  await page.wait("!!document.querySelector('.au-ask .au-failure')", { describe: state });
  assert.equal(await page.evaluate("document.querySelector('[data-au-field=intent]').value"), "每周五把一周的进展整理成周报", "the sentence stays");
  answers.push(JSON.stringify({ name: "每周周报", description: "要把一周的进展整理成周报时用。", when_not_to_use: "只想看某一天做了什么。", applies_to: "assistant", body: "# 每周周报\n\n1. 列出完成的事。\n2. 列出卡住的事。" }));
  // QEA-126: the shared renderer still drives the draft's choices and their selected state.
  await page.click(act("au-scope", "home"));
  assert.equal(await page.evaluate(`document.querySelector('${act("au-scope", "home")}').getAttribute('aria-pressed')`), "true");
  await page.click(act("au-scope", "project"));
  await page.click(act("au-draft"));
  await page.wait("document.querySelector('#au-name')?.value === '每周周报' && document.activeElement?.id === 'sk-title'", { describe: state });
  assert.equal(await page.evaluate("!!document.querySelector('[data-kit-body] .mw-list-detail')"), false, "the list folds away while a draft is open");
  assert.match(await text(".sk-work__live"), /还没生效/);
  assert.match(await text("[data-au-count]"), /4 \/ 500 行/);
  assert.match(await text("[data-sk-bar]"), /采用为新技能/);
  assert.deepEqual(await mine(), [], "a draft is in no catalog");
  const newDrafts = await api<{ drafts: SkillDraftSummary[] }>("drafts/list");
  const firstDraft = newDrafts.drafts.find(item => item.name === "每周周报")!;
  assert.equal(firstDraft.scope, "project");
  await page.click(act("au-applies", "both"));
  await page.wait(saved, { describe: state });
  assert.equal(await page.evaluate(`document.querySelector('${act("au-applies", "both")}').getAttribute('aria-pressed')`), "true");
  assert.equal((await api<SkillDraft>("drafts/read", { draft_id: firstDraft.draft_id })).fields.applies_to, "both");
  await page.click(act("au-applies", "assistant"));
  await page.wait(saved, { describe: state });
  await shot("draft-new-1440");
  const gap = await page.evaluate<number>("document.querySelector('.settings-content').getBoundingClientRect().bottom - document.querySelector('[data-sk-bar]').getBoundingClientRect().bottom");
  assert.ok(Math.abs(gap) <= 1, `the adopt bar sits on the edge, nothing shows under it (gap ${gap}px)`);

  // 缺项在采用时就地提示，焦点落在那一处；改了就消失。边写边存，不再有离开提示条。
  await page.fill("#au-name", "");
  await page.wait(saved, { describe: state });
  await page.click(act("sk-adopt"));
  await page.wait("document.activeElement?.id === 'au-name' && document.activeElement.getAttribute('aria-invalid') === 'true'", { describe: state });
  assert.match(await text('[data-au-error="name"]'), /要有名称/);
  await page.fill("#au-name", "每周周报");
  assert.equal(await page.evaluate("!!document.querySelector('[data-au-error]')"), false);
  await page.wait(saved, { describe: state });

  // 采用：回到详情，关着，提示里一步设成自动。
  await page.click(act("sk-adopt"));
  await page.wait(noticeHas("已采用，现在是关着的"), { describe: state });
  let [skill] = await mine();
  assert.deepEqual([skill?.name, skill?.state, skill?.ref.version], ["每周周报", "off", 1]);
  await page.click(`[data-kit-notice] [data-kit-act="au-auto"]`);
  await page.wait(noticeHas("改成自动"), { describe: state });
  assert.equal((await mine())[0]?.state, "auto");

  // 修改先是草稿：AI 照旧用第 1 版；加一条已知答案后，采用条的主按钮是「先回放」。
  await page.click(act("skill-edit"));
  await page.wait("document.querySelector('#sk-title')?.innerText.includes('「每周周报」的草稿')", { describe: state });
  assert.match(await text(".sk-work__live"), /AI 现在用的是第 1 版/);
  await page.fill("#au-body", "# 每周周报\n\n改过的做法。");
  await page.wait(saved, { describe: state });
  assert.equal((await mine())[0]?.ref.version, 1, "a change is not in use until adopted");
  assert.ok((await all()).find(item => item.name === "每周周报")?.draft, "the Skill says it has a draft");
  await page.click(act("sk-case-add"));
  await page.wait("document.activeElement?.id === 'sk-case-title'");
  await page.fill("#sk-case-title", "上周的周报");
  await page.fill("#sk-case-task", "整理 11 月第二周的进展");
  await page.fill("#sk-case-expected", "周报：按负责人分组。");
  await page.click("[data-sk-case-form] [type=submit]");
  await page.wait("document.querySelectorAll('.sk-case').length === 1", { describe: state });
  assert.match(await text("[data-sk-bar]"), /先回放/);
  assert.match(await text(".sk-try"), /调用模型 3 次/);

  await page.click(act("sk-case-add"));
  await page.wait("document.activeElement?.id === 'sk-case-title'");
  await page.fill("#sk-case-title", "纯一致的周报");
  await page.fill("#sk-case-task", "整理纯一致样本的进展");
  await page.fill("#sk-case-expected", "周报：按负责人分组。");
  await page.click("[data-sk-case-form] [type=submit]");
  await page.wait("document.querySelectorAll('.sk-case').length === 2", { describe: state });

  // 回放：先回放第 1 条（2 处出入），再回放第 2 条（一致）；第 1 条仍保持已回放，采用确认条仍报 2 处不同。
  await page.click(`[data-sk-bar] [data-kit-act="sk-run"]`);
  await page.wait("!!document.querySelector('[data-sk-replay] .mw-replay-grid')", { describe: state });
  assert.deepEqual(await page.evaluate("[...document.querySelectorAll('.mw-replay-cell')].map(cell => cell.dataset.verdict)"), ["match", "differs"]);
  await shot("replayed-1440");
  await page.click(act("sk-out", "assistant:draft"));
  await page.wait("!!document.querySelector('.sk-compare .sk-diff')", { describe: state });
  assert.equal(await page.evaluate("document.querySelector('.sk-side-tabs [aria-selected=true]').id"), "sk-side-compare");
  assert.equal(await page.evaluate("document.querySelector('.sk-panel').getAttribute('aria-labelledby')"), "sk-side-compare");
  assert.match(await text(".sk-what"), /草稿 · 助理 的结果 → 你认可的结果/);
  await page.click(act("sk-compare", "how"));
  await page.wait("document.querySelector('.sk-what')?.innerText.includes('第 1 版 → 草稿')", { describe: state });
  await shot("compare-1440");
  await page.click(act("sk-side", "try"));
  await page.wait("document.querySelectorAll('.sk-case [data-kit-act=sk-run]').length === 2", { describe: state });
  await page.click(`[data-sk-bar] [data-kit-act="sk-run"]`);
  await page.wait("document.querySelector('[data-sk-bar]')?.innerText.includes('采用为第 2 版')", { describe: state });
  assert.deepEqual(await page.evaluate("[...document.querySelectorAll('.sk-case [data-kit-act=sk-run]')].map(node => node.innerText.trim())"), ["再回放", "再回放"], "replaying the second case preserves the first case's replayed state");
  await page.click(act("sk-adopt"));
  await page.wait("document.activeElement?.matches('[data-slot=leave-bar]')", { describe: state });
  assert.match(await text("[data-slot=leave-bar]"), /还有 2 处不同，仍然采用吗/);
  assert.equal(await page.evaluate("document.querySelectorAll('[data-sk-bar] .mw-btn--primary').length"), 1, "one main act in view");
  // Changing known answers while the confirm bar is open clears the stale confirmation so dual primary buttons never appear.
  await page.click(act("sk-case-add"));
  await page.wait("document.activeElement?.id === 'sk-case-title'");
  await page.fill("#sk-case-title", "临时样本");
  await page.fill("#sk-case-task", "临时任务");
  await page.fill("#sk-case-expected", "临时结果");
  await page.click("[data-sk-case-form] [type=submit]");
  await page.wait("document.querySelectorAll('.sk-case').length === 3", { describe: state });
  assert.equal(await page.evaluate("!!document.querySelector('[data-slot=leave-bar]')"), false, "adding a case clears the stale adopt confirmation");
  assert.equal(await page.evaluate("document.querySelectorAll('[data-sk-bar] .mw-btn--primary').length"), 1, "only replay-first stays primary");
  await page.evaluate("document.querySelectorAll('.sk-case')[2].querySelector('[data-kit-act=sk-case-remove]').click()");
  await page.wait("document.querySelectorAll('.sk-case').length === 2", { describe: state });
  await page.click(act("sk-adopt"));
  await page.wait("document.activeElement?.matches('[data-slot=leave-bar]')", { describe: state });
  assert.match(await text("[data-slot=leave-bar]"), /还有 2 处不同，仍然采用吗/);
  await shot("confirm-1440");
  await page.click(act("sk-adopt-anyway"));
  await page.wait(noticeHas("已采用为第 2 版"), { describe: state });
  [skill] = await mine();
  assert.deepEqual([skill?.ref.version, skill?.state], [2, "auto"], "adopting keeps the person's choice of state");

  // 版本：列出全部；对照旧版；恢复第 1 版先开一份草稿（已知答案跟着技能走，要先回放两条），采用存成第 3 版。
  await page.wait("document.querySelectorAll('.sk-version').length === 2", { describe: state });
  await page.click(act("sk-version-diff", "1"));
  await page.wait("!!document.querySelector('.sk-version-diff .sk-diff')", { describe: state });
  await page.evaluate("document.querySelector('[data-sk-versions]').scrollIntoView({ block: 'start' })");
  await shot("versions-1440");
  await page.click(act("sk-version-restore", "1"));
  await page.wait("!!document.querySelector('[data-sk-work] .sk-compare')", { describe: state });
  assert.match(await text("[data-sk-bar]"), /先回放/);
  await page.click(`[data-sk-bar] [data-kit-act="sk-run"]`);
  await page.wait("document.querySelectorAll('.sk-case [data-kit-act=sk-run]').length === 2 && document.querySelectorAll('.sk-case [data-kit-act=sk-run]')[0].innerText.includes('再回放')", { describe: state });
  await page.click(`[data-sk-bar] [data-kit-act="sk-run"]`);
  await page.wait("[...document.querySelectorAll('.mw-replay-cell')].some(cell => cell.dataset.verdict === 'match') && document.querySelector('[data-sk-bar]')?.innerText.includes('采用为第 3 版')", { describe: state });
  await page.click(act("sk-adopt"));
  await page.wait(noticeHas("已采用为第 3 版"), { describe: state });
  assert.equal((await mine())[0]?.ref.version, 3);

  // 放弃草稿可以撤销。
  await page.click(act("skill-edit"));
  await page.wait("!!document.querySelector('[data-sk-work]')");
  await page.click(act("sk-discard"));
  await page.wait(noticeHas("已放弃草稿"), { describe: state });
  assert.equal((await api<{ drafts: SkillDraftSummary[] }>("drafts/list")).drafts.length, 0);
  await page.click(`[data-kit-notice] [data-kit-act="sk-undiscard"]`);
  await page.wait("!!document.querySelector('[data-sk-work]')", { describe: state });
  const [kept] = (await api<{ drafts: SkillDraftSummary[] }>("drafts/list")).drafts;
  assert.ok(kept, "the discarded draft is back");
  await page.click(act("sk-close"));
  await page.wait("!document.querySelector('[data-sk-work]') && !!document.querySelector('.mw-list-detail')", { describe: state });

  // 回执里的「打开草稿」：地址里带上草稿，打开页面就在它上面；关闭留下这份草稿，删除技能后它仍在顶部草稿区可见。
  await page.command("Page.navigate", { url: `${f.origin}/projects/${project.project_id}/settings/kit?draft=${kept!.draft_id}` });
  await page.wait("!!document.querySelector('[data-kit-body]')", { describe: state });
  await page.wait("document.querySelector('#sk-title')?.innerText.includes('「每周周报」的草稿') && !location.search.includes('draft=')", { describe: state });
  await page.click(act("sk-close"));
  await page.wait("!document.querySelector('[data-sk-work]') && !!document.querySelector('.mw-list-detail')", { describe: state });

  // B42-F06 / B42-F07: the deleted skill's draft stays visible, and the receipt describes exactly what can be restored.
  await page.click(act("skill-delete"));
  await page.wait(noticeHas("已删除「每周周报」"), { describe: state });
  assert.deepEqual(await mine(), []);
  const orphan = `.sk-drafts [data-kit-act="sk-open"][data-kit-v="${kept!.draft_id}"]`;
  assert.match(await text(orphan), /技能已删除/);
  assert.match(await text("[data-kit-notice]"), /从第 1 版开始.*已知答案和来源无法找回/);
  assert.equal((await text('[data-kit-notice] [data-kit-act="au-undelete"]')).trim(), "只恢复内容");
  await page.click(`[data-kit-notice] [data-kit-act="au-undelete"]`);
  await page.wait(noticeHas("已恢复「每周周报」的内容"), { describe: state });
  [skill] = await mine();
  assert.deepEqual([skill?.name, skill?.state, skill?.ref.version, skill?.based_on], ["每周周报", "auto", 1, undefined]);
  await page.click(orphan);
  await page.wait("!!document.querySelector('[data-sk-work]')", { describe: state });
  await page.click(act("sk-discard"));
  await page.wait(noticeHas("已放弃草稿"), { describe: state });

  // B42-F05: two live drafts can be adopted in order. An extra draft of a live skill is still a normal draft.
  const competing = async (body: string) => {
    const opened = await api<SkillDraft>("drafts/create", { scope: "project", target: { kind: "own", skill_id: skill!.ref.skill_id } });
    assert.deepEqual(opened.cases, [], "the deleted skill's known answers were not restored");
    const updated = await api<{ revision: number }>("drafts/update", {
      draft_id: opened.draft_id, expected_revision: opened.revision, fields: { ...opened.fields, body },
    });
    assert.equal(updated.revision, opened.revision + 1);
    return opened.draft_id;
  };
  const firstCompeting = await competing("# 第一份草稿的做法"), secondCompeting = await competing("# 第二份草稿的做法");
  const kitPath = `${f.origin}/projects/${project.project_id}/settings/kit`;
  await page.command("Page.navigate", { url: kitPath });
  await page.wait(`!!document.querySelector('.sk-drafts [data-kit-act="sk-open"]')`, { describe: state });
  assert.doesNotMatch(await text(".sk-drafts [data-kit-act=sk-open]"), /技能已删除/);
  for (const [draftId, body, version] of [[firstCompeting, "第一份", 2], [secondCompeting, "第二份", 3]] as const) {
    await page.command("Page.navigate", { url: `${kitPath}?draft=${draftId}` });
    await page.wait(`document.querySelector('#au-body')?.value === '# ${body}草稿的做法'`, { describe: state });
    assert.match(await text("[data-sk-bar]"), /后采用的版本会覆盖先采用的版本/);
    await page.click(act("sk-adopt"));
    await page.wait(noticeHas(`已采用为第 ${version} 版`), { describe: state });
    [skill] = await mine();
    const source = await api<SkillAuthoredSource>("source", { ref: skill!.ref });
    assert.equal(source.body, `# ${body}草稿的做法`);
  }

  // 改一份通用技能：说明不能直接改；「改一份我的」开草稿；写进占位符就列出来让你换成自己用的；采用时把原来的关掉。
  const systemSkill = "[...document.querySelectorAll('.kit-detail [data-kit-act=item]')].find(node => node.innerText.includes('分析与决策'))";
  await page.fill("[data-kit-search]", "分析与决策");
  await page.wait("document.querySelectorAll('[data-kit-body] .mw-list-detail__list .mw-item__pick').length === 1", { describe: state });
  await page.click("[data-kit-body] .mw-list-detail__list .mw-item__pick");
  await page.wait(`!!${systemSkill}`, { describe: state });
  await page.evaluate(`${systemSkill}.click()`);
  await page.wait("!!document.querySelector('.au-readonly')", { describe: state });
  assert.match(await text(".au-readonly"), /不是你写的/);
  await page.click(act("skill-copy"));
  await page.wait("document.querySelector('#sk-title')?.innerText.includes('「分析与决策」的草稿')", { describe: state });
  assert.ok((await page.evaluate<string>("document.querySelector('#au-body').value")).length > 100, "the copy starts from the original's body");
  assert.equal(await page.evaluate("document.querySelector('[data-sk-turn-off]').checked"), true);
  await page.fill("#au-body", `${await page.evaluate<string>("document.querySelector('#au-body').value")}\n\n结论发到 ~~聊天工具，任务记进 ~~项目管理工具，别改项目进度。`);
  await page.wait(saved, { describe: state });
  await page.click(act("sk-side", "compare"));
  await page.wait("document.querySelectorAll('[data-sk-placeholder]').length === 2", { describe: state });
  // Typing character by character with characters already present in the body must never rewrite unrelated text.
  for (const step of ["项", "项目", "项目群", "", "工", "工具"]) await page.fill('[data-sk-placeholder="~~聊天工具"]', step);
  // While ~~项目管理工具 is still unreplaced, rebuilding placeholderBase after manual edits must protect ~~项目管理工具 from "工具".
  const descBefore = await page.evaluate<string>("document.querySelector('#au-description').value");
  await page.fill("#au-description", `${descBefore} `);
  await page.fill("#au-description", descBefore);
  await page.fill('[data-sk-placeholder="~~聊天工具"]', "飞书");
  assert.match(await page.evaluate<string>("document.querySelector('#au-body').value"), /结论发到 飞书，任务记进 ~~项目管理工具，别改项目进度。/);
  // Rebuilding body template after a direct body edit also protects unreplaced ~~项目管理工具 when another placeholder equals "工具".
  await page.fill('[data-sk-placeholder="~~聊天工具"]', "工具");
  const bodyBeforeCount = await page.evaluate<string>("document.querySelector('[data-au-count] .mw-text-count__n').textContent");
  await page.fill("#au-body", `${await page.evaluate<string>("document.querySelector('#au-body').value")}`);
  await page.fill('[data-sk-placeholder="~~聊天工具"]', "企业微信测试群");
  assert.match(await page.evaluate<string>("document.querySelector('#au-body').value"), /结论发到 企业微信测试群，任务记进 ~~项目管理工具，别改项目进度。/);
  assert.notEqual(
    await page.evaluate<string>("document.querySelector('[data-au-count] .mw-text-count__n').textContent"),
    bodyBeforeCount,
    "body character count updates immediately when typing a placeholder",
  );
  // IME composing input must not rewrite body prematurely; compositionend commits the final replacement.
  await page.evaluate(`(() => {
    const input = document.querySelector('[data-sk-placeholder="~~聊天工具"]');
    input.value = "gongju";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, isComposing: true, data: "gongju" }));
  })()`);
  assert.match(
    await page.evaluate<string>("document.querySelector('#au-body').value"),
    /结论发到 企业微信测试群，任务记进 ~~项目管理工具，别改项目进度。/,
    "composing input does not rewrite body before compositionend",
  );
  await page.evaluate(`(() => {
    const input = document.querySelector('[data-sk-placeholder="~~聊天工具"]');
    input.value = "工具";
    input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "工具" }));
  })()`);
  assert.match(await page.evaluate<string>("document.querySelector('#au-body').value"), /结论发到 工具，任务记进 ~~项目管理工具，别改项目进度。/);
  await page.fill('[data-sk-placeholder="~~项目管理工具"]', "Linear");
  assert.match(await page.evaluate<string>("document.querySelector('#au-body').value"), /结论发到 工具，任务记进 Linear，别改项目进度。/);
  // Rebuild placeholderBase after a manual wording edit: single-pass restore keeps "工具" from mutating inside "~~项目管理工具".
  const desc = await page.evaluate<string>("document.querySelector('#au-description').value");
  await page.fill("#au-description", `${desc} `);
  await page.fill("#au-description", desc);
  // Two placeholders given the same value survive manual body edits and draft reopen without losing the second slot.
  await page.fill('[data-sk-placeholder="~~聊天工具"]', "飞书");
  await page.fill('[data-sk-placeholder="~~项目管理工具"]', "飞书");
  assert.match(await page.evaluate<string>("document.querySelector('#au-body').value"), /结论发到 飞书，任务记进 飞书，别改项目进度。/);
  const bodyWithSameValues = await page.evaluate<string>("document.querySelector('#au-body').value");
  await page.fill("#au-body", `${bodyWithSameValues}\n补充说明。`);
  await page.fill('[data-sk-placeholder="~~项目管理工具"]', "Linear");
  assert.match(await page.evaluate<string>("document.querySelector('#au-body').value"), /结论发到 飞书，任务记进 Linear，别改项目进度。\n补充说明。/);
  // Reopening a saved draft whose two placeholders share the same value still keeps both slots editable.
  await page.fill('[data-sk-placeholder="~~项目管理工具"]', "飞书");
  await page.wait(saved, { describe: state });
  const copyDraftForReopen = (await api<{ drafts: SkillDraftSummary[] }>("drafts/list")).drafts.find(item => item.name === "分析与决策")!;
  await page.command("Page.navigate", { url: `${f.origin}/projects/${project.project_id}/settings/kit?draft=${copyDraftForReopen.draft_id}` });
  await page.wait("!!document.querySelector('#au-body')", { describe: state });
  await page.click(act("sk-side", "compare"));
  await page.wait("document.querySelectorAll('[data-sk-placeholder]').length === 2", { describe: state });
  await page.fill('[data-sk-placeholder="~~项目管理工具"]', "Linear");
  assert.match(await page.evaluate<string>("document.querySelector('#au-body').value"), /结论发到 飞书，任务记进 Linear，别改项目进度。\n补充说明。/);
  // Replacing one placeholder with another placeholder's literal survives manual body edits without dropping either slot.
  await page.fill('[data-sk-placeholder="~~项目管理工具"]', "");
  await page.fill('[data-sk-placeholder="~~聊天工具"]', "~~项目管理工具");
  assert.match(await page.evaluate<string>("document.querySelector('#au-body').value"), /结论发到 ~~项目管理工具，任务记进 ~~项目管理工具，别改项目进度。\n补充说明。/);
  await page.fill("#au-body", (await page.evaluate<string>("document.querySelector('#au-body').value")).replace(/\n补充说明。$/u, ""));
  await page.fill('[data-sk-placeholder="~~项目管理工具"]', "Jira");
  await page.fill('[data-sk-placeholder="~~聊天工具"]', "Slack");
  assert.match(await page.evaluate<string>("document.querySelector('#au-body').value"), /结论发到 Slack，任务记进 Jira，别改项目进度。/);
  assert.doesNotMatch(await page.evaluate<string>("document.querySelector('#au-body').value"), /项目群进度|~~聊天工具进度|~~项目管理/);
  assert.equal(await page.evaluate(`document.querySelector('[data-sk-placeholder="~~聊天工具"]').getAttribute('aria-label')`), "把 ~~聊天工具 换成");
  await page.wait(saved, { describe: state });
  await shot("copy-1440");
  // QEA-123: the placeholder and its expanded text are one decision, while an unrelated field survives.
  const listedCopies = await api<{ drafts: SkillDraftSummary[] }>("drafts/list");
  const editingCopy = listedCopies.drafts.find(item => item.name === "分析与决策");
  assert.ok(editingCopy);
  const oldCopy = await api<SkillDraft>("drafts/read", { draft_id: editingCopy.draft_id });
  const otherBody = `${oldCopy.fields.body}\n\n别处补充的实操说明。`;
  const updated = await api<{ revision: number }>("drafts/update", { draft_id: oldCopy.draft_id, expected_revision: oldCopy.revision,
    fields: { ...oldCopy.fields, body: otherBody }, replacements: oldCopy.replacements });
  assert.equal(updated.revision, oldCopy.revision + 1);
  await page.click(".au-more summary");
  await page.fill("#au-argument_hint", "补充目标");
  await page.fill('[data-sk-placeholder="~~聊天工具"]', "Teams");
  await page.wait(`!!document.querySelector('[data-sk-bar] [data-kit-act=sk-review-conflict]')`, { describe: state });
  assert.equal((await api<SkillDraft>("drafts/read", { draft_id: oldCopy.draft_id })).fields.body, otherBody);
  await page.click(act("sk-review-conflict"));
  await page.wait(`document.activeElement?.hasAttribute('data-sk-conflict')`, { describe: state });
  const copyConflict = await text("[data-sk-conflict]");
  assert.match(copyConflict, /结论发到 Slack，任务记进 Jira，别改项目进度。/);
  assert.match(copyConflict, /结论发到 Teams，任务记进 Jira，别改项目进度。/);
  assert.match(copyConflict, /别处补充的实操说明。/);
  await page.click(act("sk-keep-edit"));
  await page.wait(saved, { describe: state });
  const settledCopy = await api<SkillDraft>("drafts/read", { draft_id: oldCopy.draft_id });
  assert.deepEqual([settledCopy.revision, settledCopy.replacements, settledCopy.fields.argument_hint],
    [updated.revision + 1, { "~~聊天工具": "Teams", "~~项目管理工具": "Jira" }, "补充目标"]);
  assert.match(settledCopy.fields.body, /结论发到 Teams，任务记进 Jira，别改项目进度。/);
  assert.doesNotMatch(settledCopy.fields.body, /别处补充的实操说明。/);
  // QEA-129: actual completed operations can have a late HTTP receipt. Every editor control follows the same busy state.
  const holdReceipt = (route: string) => page.evaluate(`(() => {
    const send = window.fetch.bind(window);
    window.__qeaCopyReceipt = { status: 0 };
    const release = new Promise(done => { window.__qeaCopyReceipt.release = done; });
    window.fetch = async (url, options) => {
      const response = await send(url, options);
      if (String(url).endsWith(${JSON.stringify(route)})) {
        window.fetch = send;
        window.__qeaCopyReceipt.status = response.status;
        await release;
      }
      return response;
    };
  })()`);
  const copyControls = () => page.evaluate<boolean[]>(`['[data-sk-placeholder]', '[data-sk-turn-off]'].map(selector => document.querySelector(selector).disabled)`);
  await holdReceipt("/api/skills/drafts/revise");
  answers.push(JSON.stringify({ ...settledCopy.fields, when_not_to_use: "只想抄录原文时。" }));
  await page.fill("[data-sk-ask-input]", "补一句什么时候不适用");
  let duringRevise: boolean[];
  try {
    await page.click("[data-sk-ask] [type=submit]");
    await page.wait("window.__qeaCopyReceipt.status === 200", { describe: state });
    duringRevise = await copyControls();
  } finally { await page.evaluate("window.__qeaCopyReceipt.release()"); }
  await page.wait("document.querySelector('#au-when_not_to_use')?.value === '只想抄录原文时。' && !document.querySelector('[data-sk-placeholder]').disabled", { describe: state });
  assert.equal(await page.evaluate("document.querySelector('[data-sk-placeholder]').value"), "Teams");
  await holdReceipt("/api/plugin-trust/skills/drafts/adopt");
  let duringAdoption: boolean[];
  try {
    await page.click(act("sk-adopt"));
    await page.wait("window.__qeaCopyReceipt.status === 200", { describe: state });
    duringAdoption = await copyControls();
    assert.equal(await page.evaluate("document.querySelector('[data-sk-ask-input]').readOnly && document.querySelector('[data-sk-ask] [type=submit]').disabled"), true,
      "adopting also holds the next rewrite instruction");
  } finally { await page.evaluate("window.__qeaCopyReceipt.release()"); }
  await page.wait(noticeHas("原来的已关掉"), { describe: state });
  assert.equal((await mine()).length, 2);
  assert.equal((await all()).find(item => item.name === "分析与决策" && item.pack.plugin_id !== SKILL_AUTHORED_PLUGIN_IDS.project)?.state, "off", "the original is off");
  const copy = (await mine()).find(item => item.name === "分析与决策");
  assert.ok(copy?.based_on, "the copy remembers where it came from");
  const installedCopy = await api<SkillAuthoredSource>("source", { ref: copy.ref });
  assert.equal(installedCopy.when_not_to_use, "只想抄录原文时。");
  assert.equal(installedCopy.argument_hint, "补充目标");
  assert.match(installedCopy.body, /结论发到 Teams，任务记进 Jira，别改项目进度。/);
  assert.deepEqual([duringRevise, duringAdoption], [[true, true], [true, true]], "companion fields are protected for the same operation as the main fields");

  // B42-F02: a newer switch setting arrives before the page can turn the original off; the copy has already been adopted.
  const original = (await all()).find(item => item.name === "分析与决策" && item.pack.plugin_id !== SKILL_AUTHORED_PLUGIN_IDS.project)!;
  const changeOriginal = (entry: SkillCatalogEntry, state: "auto" | "manual") => api<SkillCatalogEntry>("set", {
    scope: "project", install_id: entry.ref.install_id, skill_id: entry.ref.skill_id, expected_revision: entry.settings_revision, state,
  });
  const enabled = await changeOriginal(original, "auto");
  const nextCopy = await api<SkillDraft>("drafts/create", { scope: "project", target: { kind: "custom", ref: enabled.ref },
    fields: { ...settledCopy.fields, name: "另一份分析方法" } });
  await page.command("Page.navigate", { url: `${kitPath}?draft=${nextCopy.draft_id}` });
  await page.wait("document.querySelector('#au-name')?.value === '另一份分析方法'", { describe: state });
  await holdReceipt("/api/plugin-trust/skills/drafts/adopt");
  try {
    await page.click(act("sk-adopt"));
    await page.wait("window.__qeaCopyReceipt.status === 200", { describe: state });
    assert.equal((await changeOriginal(enabled, "manual")).state, "manual");
  } finally { await page.evaluate("window.__qeaCopyReceipt.release()"); }
  await page.wait(noticeHas("已采用「另一份分析方法」，原技能关闭失败"), { describe: state });
  assert.match(await text("[data-kit-notice]"), /技能状态已变化/);
  assert.ok((await mine()).some(item => item.name === "另一份分析方法"));
  assert.equal((await all()).find(item => item.ref.install_id === original.ref.install_id && item.ref.skill_id === original.ref.skill_id)?.state, "manual");

  // 1024 与 390、深色：1024 时两栏变成页签；390 没有横向滚动。
  const draft = await (await f.request(`/projects/${project.project_id}/api/skills/drafts/create`, { method: "POST", body: { scope: "project", target: { kind: "own", skill_id: copy!.ref.skill_id } } })).json() as { draft_id: string };
  await page.command("Page.navigate", { url: `${f.origin}/projects/${project.project_id}/settings/kit?draft=${draft.draft_id}` });
  await page.wait("!!document.querySelector('[data-kit-body]')", { describe: state });
  await page.wait("!!document.querySelector('[data-sk-work]')", { describe: state });
  await size(1024, 800);
  await page.wait("getComputedStyle(document.querySelector('.sk-narrow-tabs')).display !== 'none'", { describe: state });
  await shot("draft-1024");
  await page.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  await size(390, 844);
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "no sideways scroll at 390");
  await shot("draft-390-dark");
  await page.click(act("sk-tab", "try"));
  await page.wait("getComputedStyle(document.querySelector('.sk-col--edit')).display === 'none' && !!document.querySelector('.sk-try')", { describe: state });
  assert.equal(await page.evaluate("document.documentElement.scrollWidth <= innerWidth"), true, "no sideways scroll on the try tab");
  await shot("try-390-dark");
});
