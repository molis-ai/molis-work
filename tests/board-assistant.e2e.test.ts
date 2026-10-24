import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/visual-ui-experience VUX-39 (§render-lifecycle 同源标本), with VUX-08/09/10/13/18 as the board shows them: the
// component board's 助理信息与任务 section runs the shipped Assistant island in its own bar on fixed works that the Host drew
// as it draws a real answer (the samples and the stand-in Host are simulated, and the frame says so). It shows several works
// in every state, the side pane's six groups with their summaries, a round's steps with a failure and an unknown outcome, the
// draft against what a round used, attachments that partly fail, a step that moves on in place, the interface in English and
// the container's width; nothing reaches the real Host and nothing the workbench remembers on this computer changes.

const CJK = /[㐀-鿿]/;
type Block = [title: string, badge: string, attention: boolean];

test("VUX-39 the board's Assistant section drives the shipped island through several works, six groups, steps, draft and scope, partial attachment failure, in-place progress, language and width", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#assistant` }, sessionId));
  await evaluate("document.querySelector('#assistant').scrollIntoView()");
  const frame = "document.querySelector('[data-asst-frame]')";
  const inFrame = <T>(body: string) => evaluate<T>(`(async () => { const d = ${frame}.contentDocument, w = d.defaultView; ${body} })()`);
  const ready = (work: string) => `(() => { const d = ${frame}.contentDocument; const p = d?.querySelector('[data-assistant-panel]'); return d?.readyState === 'complete' && p && !p.hidden
    && d.querySelector('[data-assistant-tab][data-current], .assistant-tab[data-current]')?.dataset.tab === '${work}' && (${work === "new"} || !d.querySelector('[data-assistant-block=tools]').hidden); })()`;
  const choose = async (name: string, value: string, work: string) => {
    await evaluate(`document.querySelector('[data-asst-params] [data-cond-param="${name}"][data-cond-value="${value}"]').click()`);
    if (name !== "width") await waitFor(`${frame}.contentWindow.location.search.includes('${name}=${value}') && ${ready(work)}`, 20_000);
  };
  const blocks = () => inFrame<Record<string, Block>>(`return Object.fromEntries([...d.querySelectorAll('[data-assistant-block]:not([hidden])')].map((b) => [b.dataset.assistantBlock,
    [b.querySelector('.assistant-block-title')?.textContent ?? '', b.querySelector('.assistant-block-badge')?.textContent ?? '', !!b.querySelector('.assistant-block-badge.is-attention')]]));`);
  await waitFor(ready("board-plan"), 20_000);

  // The strip: three parameters, each at its first value; the frame says what is simulated.
  const strip = await evaluate<{ params: string[]; current: string[] }>(`(() => { const groups = [...document.querySelectorAll('[data-asst-params] [data-slot=toggle-group]')];
    return { params: groups.map((g) => g.querySelector('[data-cond-param]').dataset.condParam), current: groups.map((g) => g.querySelector('.is-current').dataset.condValue) }; })()`);
  assert.deepEqual(strip, { params: ["lang", "text", "work", "answer", "width"], current: ["zh", "zh", "plan", "ok", "1280"] });
  assert.match(await inFrame<string>("return d.querySelector('[data-asst-note]').textContent;"), /^模拟：/);
  assert.equal(await inFrame<boolean>("return !!d.querySelector('.workbench-bar [data-assistant-island] [data-assistant-composer]');"), true, "the island stands in the bar the workbench composes");

  // Several works, each in its own state: the tabs and the list of all works, grouped as the person looks for them.
  const works = await inFrame<{ tabs: string[]; groups: string[]; states: string[] }>(`
    d.querySelector('[data-assistant-works-toggle]').click();
    const out = { tabs: [...d.querySelectorAll('.assistant-tab-title')].map((n) => n.textContent), groups: [...d.querySelectorAll('.assistant-works-group')].map((n) => n.textContent),
      states: [...d.querySelectorAll('.assistant-works-meta')].map((n) => n.textContent.split(' · ')[0]) };
    d.querySelector('[data-assistant-works-toggle]').click(); return out;`);
  assert.deepEqual(works.tabs, ["登录兼容旧的 session cookie", "安排试用复盘", "给王一骏回邮件", "整理上周的 Feed 摘要", "检查依赖更新", "写本周周报"],
    "six tabs at most; the work cut off and the two sub-tasks are in the list");
  assert.deepEqual(works.groups, ["等你", "进行中", "最近"]);
  assert.deepEqual([...works.states].sort(), ["已停止", "已完成", "没有完成", "等你回答", "等你确认", "进行中", "需要核对", "进行中", "已完成"].sort(),
    "running, waiting on an answer and a confirmation, failed, stopped, done, cut off and to be checked, and the plan's running and finished sub-tasks");

  // Not about code: the six groups in order, each with the summary that lets it stay folded; what went wrong stands out.
  const plan = await blocks();
  assert.deepEqual(Object.keys(plan).filter((key) => ["environment", "materials", "tools", "results", "changes", "background"].includes(key)),
    ["environment", "materials", "tools", "results", "changes", "background"]);
  assert.deepEqual([plan.environment, plan.materials, plan.tools, plan.results, plan.changes, plan.background], [
    ["工作环境", "", false], ["上下文", "2 项有变化", true], ["连接与工具", "1 项要处理", true], ["产出", "2", false], ["变更", "1 项失败", true], ["后台任务", "1 项没有完成", true]]);
  const groups = await inFrame<Record<string, string>>(`return Object.fromEntries(['environment', 'tools', 'results', 'changes', 'background'].map((key) => [key, d.querySelector('[data-assistant-block=' + key + ']').textContent.replace(/\\s+/g, ' ')]));`);
  assert.match(groups.environment!, /示例项目.*项目范围/);
  assert.match(groups.tools!, /你的连接.*Google Calendar.*企业微信.*需要登录授权.*可调用.*现在不能用.*通讯录/);
  assert.match(groups.results!, /固定成果.*试用复盘议程 v1.*工作文件.*试用复盘提纲/);
  assert.match(groups.changes!, /Inbox · 归档 3 条没能撤销：Inbox 已关闭.*Todo · 新建待办「订会议室」可以撤销.*停止时仍在执行.*还在等它的结果，不会重新提交/, "newest change first");
  assert.match(groups.background!, /Research · 汇总试用访谈.*进行中.*Dataset · 导入试用问卷.*没有完成/);

  // A round's steps: what was done to what, and how many did not finish; the failure says why, the unknown says so, the technical part opens from the step.
  const steps = await inFrame<{ summary: string; failed: string; unknown: string; facts: string }>(`
    const box = [...d.querySelectorAll('[data-assistant-thread] details.assistant-steps')].at(-1);
    const line = (id) => box.querySelector('[data-entry="a:' + id + '"]');
    return { summary: box.querySelector('summary').textContent, failed: line('c-p5').querySelector('.assistant-activity').textContent, unknown: line('c-p6').querySelector('.assistant-activity').textContent,
      facts: line('c-p6').querySelector('.assistant-activity-detail').textContent };`);
  assert.equal(steps.summary, "查找能力、读取 日程等 · 5 步 · 2 步没有完成");
  assert.equal(steps.failed, "读取 通讯录 · 查找联系人 — 未获授权，没有执行");
  assert.equal(steps.unknown, "读取 会议室 · 查看空闲会议室 — 结果未确认");
  assert.equal(steps.facts, "调用的能力rooms.availability.read返回的说明会议室服务没有回答");

  // Draft against execution: the work's unsent text is in the input, the context group keeps 待发送, 本次使用 and 历史引用 apart.
  const context = () => inFrame<Record<string, string[]>>(`const out = {}; let at = '';
    for (const node of d.querySelectorAll('[data-assistant-block=materials] .assistant-drop-label, [data-assistant-block=materials] .assistant-block-sub, [data-assistant-block=materials] .assistant-item-title'))
      if (!node.classList.contains('assistant-item-title')) out[at = node.textContent] = []; else out[at].push(node.textContent);
    return out;`);
  assert.equal(await inFrame<string>("return d.querySelector('[data-assistant-input]').value;"), "顺便把三楼的会议室也订上");
  assert.deepEqual(await context(), { 待发送: [], 本次使用: ["首次使用记录汇总", "选中的内容：首次使用卡住最久的三处"], 历史引用: ["上周用户反馈", "试用记录.md", "白板.png"] });

  // Attachments that partly fail, through the island's own file input: one goes in, one is refused before reading, one the (simulated) Host refuses and can be tried again.
  const chips = () => inFrame<Array<[string, string, string, boolean]>>(`return [...d.querySelectorAll('[data-assistant-context-strip] .assistant-strip-chip')].map((c) =>
    [c.querySelector('.assistant-strip-label').textContent, [...c.classList].find((n) => n.startsWith('is-')) ?? '', c.querySelector('.assistant-strip-note')?.textContent ?? '', !!c.querySelector('[aria-label^="重试"]')]);`);
  await inFrame("d.querySelector('[data-asst-attach]').click(); return null;");
  await waitFor(`${frame}.contentDocument.querySelectorAll('[data-assistant-context-strip] .assistant-strip-chip').length === 3 && !${frame}.contentDocument.querySelector('[data-assistant-context-strip] .is-reading')`, 15_000);
  assert.deepEqual(await chips(), [["会议记录.md", "", "", false], ["设计稿.zip", "is-failed", "暂时只能读取文本文件、PDF 和图片", false], ["图片：白板照片.png", "is-failed", "样例不执行这一步（模拟）", true]]);
  assert.deepEqual((await context()).待发送, ["会议记录.md"], "what went in waits for the next Send; the rounds' own materials do not change");
  assert.equal(await inFrame<boolean>(`const chip = d.querySelectorAll('[data-assistant-context-strip] .assistant-strip-chip')[2]; w.__chip = chip; chip.querySelector('[aria-label^="重试"]').click();
    await new Promise((r) => setTimeout(r, 600)); const now = d.querySelectorAll('[data-assistant-context-strip] .assistant-strip-chip')[2]; return now === chip && now.classList.contains('is-failed');`), true,
    "a retry the Host refuses again stays failed on the same chip");
  await inFrame("d.querySelector('[data-assistant-context-strip] [aria-label=\"不带上：设计稿.zip\"]').click(); return null;");
  await waitFor(`${frame}.contentDocument.querySelectorAll('[data-assistant-context-strip] .assistant-strip-chip').length === 2`);
  // A Send the (simulated) Host refuses fails where the island shows a failure, and the words stay in the input.
  await inFrame("d.querySelector('[data-assistant-send]').click(); return null;");
  await waitFor(`!!${frame}.contentDocument.querySelector('.assistant-problem')`, 15_000);
  assert.deepEqual(await inFrame("return [d.querySelector('[data-assistant-input]').value, d.querySelector('.assistant-problem').textContent.includes('样例不执行这一步（模拟）')];"), ["顺便把三楼的会议室也订上", true]);

  // About code: each work keeps its own draft; Coding's surroundings are its directory, repository and its own tools.
  await inFrame("d.querySelector('[data-tab=\"board-coding\"] .assistant-tab-main').click(); return null;");
  await waitFor(ready("board-coding"), 15_000);
  await waitFor(`${frame}.contentDocument.querySelector('[data-assistant-block=environment]').textContent.includes('molis-auth')`, 15_000);
  const coding = await blocks();
  assert.deepEqual([coding.environment, coding.tools], [["工作环境", "1 处冲突", true], ["连接与工具", "1 项要处理", true]]);
  const codingText = await inFrame<{ input: string; environment: string; tools: string }>(`return { input: d.querySelector('[data-assistant-input]').value,
    environment: d.querySelector('[data-assistant-block=environment]').textContent.replace(/\\s+/g, ' '), tools: d.querySelector('[data-assistant-block=tools]').textContent.replace(/\\s+/g, ' ') };`);
  assert.equal(codingText.input, "", "the Coding work has its own (empty) draft");
  assert.match(codingText.environment, /~\/code\/molis-auth.*molis-ai\/molis-auth · feature\/session-cookie.*领先 2 · 3 处未提交 · 1 处冲突/);
  // The card is titled by the executor's own name (the sample's executor is "Coding"), not by a label the Assistant wrote for it.
  assert.match(codingText.tools, /Coding.*自己的读写与命令.*GitHub MCP.*3 项可用.*create_issue.*Linear MCP · 服务未连接/);

  // 推进一步 (simulated): the Host's long wait answers with the next view; the step changes in its own line, the group the person opened stays open.
  const moved = await inFrame<{ same: boolean; open: boolean; line: string; summary: string; path: string }>(`
    const box = d.querySelector('[data-assistant-thread] details.assistant-steps'), line = box.querySelector('[data-entry="a:c-c7"]');
    box.open = true; d.querySelector('[data-asst-advance]').click();
    for (let i = 0; i < 50 && !line.textContent.startsWith('已'); i += 1) await new Promise((r) => setTimeout(r, 100));
    const now = d.querySelector('[data-assistant-thread] details.assistant-steps');
    return { same: now === box && line.isConnected, open: now.open, line: line.textContent, summary: now.querySelector('summary').textContent,
      path: d.querySelector('[data-assistant-block=path] .assistant-block-badge').textContent };`);
  assert.deepEqual(moved, { same: true, open: true, line: "已运行命令 pnpm test auth", summary: "正在修改文件 docs/auth.md", path: "步骤 3/4" });

  // Nothing reached the Host and nothing the workbench remembers here changed: the island's memory stayed in the frame.
  assert.deepEqual(await inFrame("return w.performance.getEntriesByType('resource').map((e) => new URL(e.name).pathname).filter((p) => p.startsWith('/api/') || p.includes('/sample/'));"), []);
  assert.deepEqual(await evaluate("Object.keys(localStorage).filter((key) => key.startsWith('molis.assistant.'))"), []);

  // A new work: where it would go is chosen before anything is sent.
  await choose("work", "new", "new");
  const fresh = await inFrame<{ title: string; target: string; scope: string[] }>(`return { title: d.querySelector('[data-assistant-work-title]').textContent, target: d.querySelector('[data-assistant-target-label]').textContent,
    scope: [...d.querySelectorAll('[data-assistant-meta] [aria-label="新工作放在"] button')].map((b) => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')) };`);
  assert.deepEqual(fresh, { title: "新工作", target: "新工作 · 示例项目", scope: ["示例项目*", "个人"] });
  assert.equal(await inFrame<string>("d.querySelectorAll('[data-assistant-meta] [aria-label=\"新工作放在\"] button')[1].click(); return d.querySelector('[data-assistant-target-label]').textContent;"), "新工作 · 个人");

  // The interface in English: the island's own words, the groups' titles and the states, with no Chinese of the product's.
  await choose("work", "plan", "board-plan");
  await choose("lang", "en", "board-plan");
  const english = await blocks();
  assert.deepEqual([english.materials, english.tools, english.changes, english.background].map(([title, badge]) => title + " | " + badge),
    ["Context | 2 changed", "Connections and tools | 1 to handle", "Changes | 1 failed", "Background tasks | 1 did not finish"]);
  assert.equal(Object.values(english).some(([title, badge]) => CJK.test(title + badge)), false);
  assert.equal(await inFrame<string>("return d.documentElement.lang;"), "en");

  // The container: a wide window keeps the side pane beside the conversation, a split pane's width makes it a drawer, a phone's runs out nowhere.
  assert.equal(await inFrame<string>("return d.querySelector('[data-assistant-panel]').dataset.layout;"), "split");
  for (const [width, layout] of [["760", "drawer"], ["390", "drawer"]] as const) {
    await choose("width", width, "board-plan");
    await waitFor(`${frame}.contentWindow.innerWidth === ${width} && ${frame}.contentDocument.querySelector('[data-assistant-panel]').dataset.layout === '${layout}'`, 15_000);
    assert.equal(await inFrame<boolean>("return d.scrollingElement.scrollWidth <= d.scrollingElement.clientWidth;"), true, `nothing runs out sideways at ${width}px`);
  }

  // The summary's top line in the side pane beside the conversation: each work's state and what can be done to it now
  // (stop, stop the task and take over, resume) each stay on one line and never overlap; when they do not fit, the controls go under.
  await choose("width", "1280", "board-plan");
  await choose("lang", "zh", "board-plan");
  const tops: Record<string, { state: string; heights: number[]; overlap: boolean }> = {};
  for (const tab of await inFrame<string[]>("return [...d.querySelectorAll('[data-assistant-tab][data-tab], .assistant-tab[data-tab]')].map((n) => n.dataset.tab);")) {
    await inFrame(`d.querySelector('[data-tab="${tab}"] .assistant-tab-main').click();`);
    await waitFor(`${frame}.contentDocument.querySelector('[data-tab="${tab}"]').hasAttribute('data-current')`, 10_000);
    const top = await inFrame<{ state: string; heights: number[]; overlap: boolean } | null>(`const top = d.querySelector('[data-assistant-panel] .assistant-summary-top');
      if (!top || !top.getClientRects().length) return null;
      const parts = [top.querySelector('.assistant-state'), ...top.querySelectorAll('.assistant-control:not([hidden])')].filter((n) => n && n.getClientRects().length);
      const boxes = parts.map((n) => n.getBoundingClientRect());
      return { state: top.querySelector('.assistant-state')?.textContent ?? '', heights: boxes.map((r) => Math.round(r.height)),
        overlap: boxes.some((a, i) => boxes.some((b, j) => j > i && a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5)) };`);
    if (top) tops[tab] = top;
  }
  assert.equal(Object.keys(tops).length, 6, "every work's summary has its top line");
  for (const [tab, top] of Object.entries(tops)) {
    assert.equal(top.heights.every((height) => height <= 24), true, `${tab} (${top.state}): the state and each control stay on one line (before, 等你回答 broke onto two, 38px)`);
    assert.equal(top.overlap, false, `${tab}: nothing on the top line overlaps`);
  }

  // A Coding work's mode in the bar, in English: one sentence ("Mode: Execute", not a Chinese colon); where the bar is
  // tight it shows the mode alone, the whole sentence still read out, and words that still do not fit end in an ellipsis
  // inside the chip instead of running under the input (before, at 760 and 390).
  await choose("lang", "en", "board-plan");
  await inFrame("d.querySelector('[data-tab=\"board-coding\"] .assistant-tab-main').click(); return null;");
  await waitFor(`${frame}.contentDocument.querySelector('[data-tab="board-coding"]').hasAttribute('data-current') && !${frame}.contentDocument.querySelector('[data-assistant-mode]').hidden`, 10_000);
  for (const width of ["1280", "760", "390"]) {
    await choose("width", width, "board-coding");
    await waitFor(`${frame}.contentWindow.innerWidth === ${width}`, 15_000);
    // The frame applies its media rules for a new width at its next rendering step, not when innerWidth changes.
    await inFrame("await new Promise((resolve) => w.requestAnimationFrame(() => w.requestAnimationFrame(resolve))); return null;");
    const chip = await inFrame<{ text: string; said: string; inside: boolean; clear: boolean; cut: boolean; ellipsis: boolean }>(`const button = d.querySelector('.bar-composer [data-assistant-mode]'), label = d.querySelector('[data-assistant-mode-label]');
      const b = button.getBoundingClientRect(), l = label.getBoundingClientRect(), input = d.querySelector('.bar-composer .assistant-composer-input').getBoundingClientRect();
      return { text: label.innerText, said: button.getAttribute('aria-label'), inside: l.right <= b.right + 0.5, clear: b.right <= input.left + 0.5, cut: label.scrollWidth > label.clientWidth, ellipsis: w.getComputedStyle(label).textOverflow === 'ellipsis' };`);
    assert.equal(chip.text, width === "1280" ? "Mode: Execute" : "Execute", width);
    assert.match(chip.said, /Mode: Execute$/, `${width}px: the whole sentence is read out`);
    assert.equal(chip.inside && chip.clear, true, `${width}px: the mode's words stay inside its chip, clear of the input`);
    assert.equal(!chip.cut || chip.ellipsis, true, `${width}px: words that do not fit end in an ellipsis`);
  }
});

// The frame is one specimen on a long page. When it loads beside what the person is reading, the island opening its work
// does not take the board's focus or scroll it to the frame (before, its input's focus smooth-scrolled the board by about
// 3000px, so a reader of the specimen above lost their place and a pointer resting on a cut name lost its tooltip).
test("VUX-39 the board's Assistant frame loads without taking the board's focus or scroll", { timeout: 90_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog` }, sessionId));
  await waitFor("document.readyState === 'complete' && Boolean(document.querySelector('#assistant'))", 20_000);
  // The end of the section above, so the lazy frame starts loading just below what is read.
  await evaluate("(() => { const above = document.querySelector('#assistant').previousElementSibling; above.scrollIntoView({ block: 'end', behavior: 'instant' }); })()");
  const at = await evaluate<number>("document.querySelector('.mw-catalog').scrollTop");
  await waitFor("(() => { const d = document.querySelector('[data-asst-frame]').contentDocument; const p = d?.querySelector('[data-assistant-panel]'); return d?.readyState === 'complete' && p && !p.hidden; })()", 20_000);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  // Within a line: the frame's edge settling as it loads may nudge the page a few pixels; being scrolled to it is thousands.
  const after = await evaluate<{ scrollTop: number; active: string }>("({ scrollTop: document.querySelector('.mw-catalog').scrollTop, active: document.activeElement.tagName })");
  assert.equal(after.active, "BODY", "the frame did not take focus");
  assert.ok(Math.abs(after.scrollTop - at) < 24, `the board stayed where it was read (${at} → ${after.scrollTop})`);
});

// The paths that end well beside the ones that fail: sub-tasks the plan handed on and the work they report to, the bell's
// notices (what needs the person first, news folded, one held by a rule, a reminder that opens its item), a question that
// is answered and lets the round finish, and a round cut off by a closed window that is checked and then ended.
test("VUX-39 the board's Assistant shows delegated sub-tasks, the bell's notices, an answered question and an interrupted round's recovery", { timeout: 180_000 }, async (t) => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, navigate, waitFor, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/__ui/catalog#assistant` }, sessionId));
  await evaluate("document.querySelector('#assistant').scrollIntoView()");
  const frame = "document.querySelector('[data-asst-frame]')";
  const inFrame = <T>(body: string) => evaluate<T>(`(async () => { const d = ${frame}.contentDocument, w = d.defaultView; ${body} })()`);
  const inside = (expression: string) => `(() => { const d = ${frame}.contentDocument; if (!d || d.readyState !== 'complete') return false; return ${expression}; })()`;
  await waitFor(inside("!!d.querySelector('[data-assistant-panel]:not([hidden]) .assistant-subtask')"), 20_000);

  // Sub-tasks: the plan names both, how far they are, and one opens its work, which says whom it reports to.
  const subtasks = await inFrame<string[]>("return [...d.querySelectorAll('.assistant-subtask')].filter((n) => n.querySelector('button.assistant-subtask-name')).map((n) => n.querySelector('.assistant-subtask-name').textContent + ' | ' + n.querySelector('.assistant-subtask-state').textContent);");
  assert.deepEqual(subtasks, ["汇总试用访谈 | 进行中 · 补改 1", "整理问卷里的首次导入问题 | 已完成"]);
  assert.match(await inFrame<string>("return [...d.querySelectorAll('.assistant-step-label')].find((n) => n.textContent === '分出去的子任务').parentElement.textContent;"), /1\/2/);
  await inFrame("[...d.querySelectorAll('button.assistant-subtask-name')][0].click();");
  await waitFor(inside("[...d.querySelectorAll('.assistant-step-label')].some((n) => n.textContent === '受托于')"), 10_000);
  assert.match(await inFrame<string>("return [...d.querySelectorAll('.assistant-step-label')].find((n) => n.textContent === '受托于').parentElement.textContent;"), /安排试用复盘.*验收：列出首次导入卡住最久的三处/);
  t.diagnostic("delegated: " + subtasks.join("; "));

  // The bell: the decision on the open work counts as seen; a failure and a reminder wait; news and a held one fold below.
  await waitFor(inside("!d.querySelector('[data-assistant-attention]').hidden"), 10_000);
  const bell = async () => inFrame<{ count: string; rows: string[]; folds: string[] }>(`
    const pop = d.querySelector('[data-assistant-notices]'); if (pop.hidden) d.querySelector('[data-assistant-attention]').click();
    await new Promise((r) => setTimeout(r, 200));
    return { count: d.querySelector('[data-assistant-attention-count]').textContent,
      rows: [...pop.querySelectorAll(':scope > .assistant-notice .assistant-notice-text')].map((n) => n.textContent),
      folds: [...pop.querySelectorAll(':scope > details > summary')].map((n) => n.textContent) };`);
  const first = await bell();
  t.diagnostic("bell: " + JSON.stringify(first));
  assert.deepEqual(first.rows, ["「安排试用复盘」等你确认创建日程", "「整理上周的 Feed 摘要」没有完成：模型服务暂时不可用", "到时间了：订会议室"]);
  assert.deepEqual(first.folds, ["有新结果 · 1", "按你的规则暂不提醒 · 1"]);
  assert.equal(first.count, "等你 3");
  // 知道了 on the reminder settles it; the count follows.
  await inFrame("d.querySelector('[data-notice-id=n-room][data-notice-action=dismiss]').click();");
  await waitFor(inside("d.querySelector('[data-assistant-attention-count]').textContent === '等你 2'"), 10_000);
  // 打开 on the failure opens its work.
  await inFrame("d.querySelector('[data-notice-id=n-digest][data-notice-action=open]').click();");
  await waitFor(inside("d.querySelector('[data-assistant-thread]').textContent.includes('Feed 里和试用有关的整理成摘要')"), 10_000);

  // A question answered: the card goes, the round runs on to its end and says what it made.
  await inFrame("[...d.querySelectorAll('.assistant-tab-title')].find((n) => n.textContent === '给王一骏回邮件').click();");
  await waitFor(inside("!!d.querySelector('[data-question] [type=submit]')"), 10_000);
  // The question is a questionnaire now (VUX-39: one choice, several, other words); the recommended language and one arrangement.
  await inFrame(`const card = d.querySelector('[data-question]'); card.querySelector('[data-ix-field=q1] [data-ix-option="1"]').click();
    card.querySelector('[data-ix-field=q2] [data-ix-option="1"]').click(); await new Promise((r) => setTimeout(r, 100)); card.querySelector('[type=submit]').click();`);

  await waitFor(inside("!d.querySelector('[data-question]') && d.querySelector('[data-assistant-thread]').textContent.includes('回复草稿写好了')"), 10_000);

  // An interrupted round: what really happened, one line per step, and only then the round is ended.
  await evaluate(`document.querySelector('[data-asst-params] [data-cond-param="work"][data-cond-value="check"]').click()`);
  await waitFor(`${frame}.contentWindow.location.search.includes('work=check') && ` + inside("!!d.querySelector('.assistant-problem')"), 20_000);
  assert.match(await inFrame<string>("return d.querySelector('.assistant-problem').textContent;"), /出了问题上一轮在窗口关闭时中断了/);
  await inFrame("[...d.querySelectorAll('.assistant-problem button')].find((n) => n.textContent === '查看实际发生了什么').click();");
  await waitFor(inside("!!d.querySelector('.assistant-recovery li')"), 10_000);
  const recovery = await inFrame<string[]>("return [...d.querySelectorAll('.assistant-recovery li')].map((n) => n.textContent);");
  assert.deepEqual(recovery, ["Todo · 新建待办「复盘跟进」 — 已发生", "Mail · 发送邮件给产品组 — 结果未知，请到原处核对", "日程 · 修改「试用复盘」 — 失败，没有发生", "Pages · 更新「试用复盘提纲」 — 没有执行"]);
  // Each outcome reads in the tone a step's own line uses; the close is the box's action, after the list, not one of its items.
  const tones = await inFrame<{ colors: string[]; closeIn: boolean; close: string }>(`const items = [...d.querySelectorAll('.assistant-recovery li')];
    const close = [...d.querySelectorAll('.assistant-problem button')].find((n) => n.textContent === '已核对，结束这一轮');
    return { colors: items.map((n) => w.getComputedStyle(n).color), closeIn: !!close.closest('ul'), close: close.previousElementSibling?.className ?? '' };`);
  assert.equal(new Set(tones.colors).size, 3, "done and not run read plainly; failed and unknown each have their tone: " + tones.colors.join(" "));
  assert.equal(tones.colors[0], tones.colors[3]);
  // The round's steps, one done and one whose outcome is unknown, are summed up in the unknown's tone, not a failure's.
  assert.equal(await inFrame<string>("return w.getComputedStyle(d.querySelector('[data-assistant-thread] details.assistant-steps > summary')).color;"), tones.colors[1]);
  assert.deepEqual([tones.closeIn, tones.close], [false, "assistant-recovery"]);
  await inFrame("[...d.querySelectorAll('.assistant-problem button')].find((n) => n.textContent === '已核对，结束这一轮').click();");
  await waitFor(inside("!d.querySelector('.assistant-problem')"), 10_000);
  assert.match(await inFrame<string>("return d.querySelector('[data-assistant-thread]').textContent;"), /你核对后结束了这一轮/);
});
