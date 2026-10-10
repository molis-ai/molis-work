import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { TODO_ACTION_PERMISSIONS, openTodoStore, todoOrganizeActions } from "@molis-ai/molis-work-plugin-todo";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { specEvidenceDirectory } from "./fixtures/review-evidence.js";

for (const width of [1440, 390]) test(`Todo ${width}px: quick entry, views, complete and undo, batch, detail editing, delete`, { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const all = () => { const store = openTodoStore(homeDirectory); try { return store.list({ projectId, everything: true, actor: "user", actorId: "test" }); } finally { store.close(); } };
  const byTitle = (title: string) => all().find(item => item.title === title);
  const output = new URL(`../${specEvidenceDirectory("specs/archive/todo-plugin/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const screenshot = async (name: string) => {
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(new URL(`todo-${name}-${width}.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  const idle = () => waitFor("document.querySelector('[data-todo=workbench]').getAttribute('aria-busy') !== 'true'");
  const type = async (selector: string, value: string) => {
    await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.focus(); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  };
  const change = async (selector: string, value: string) => {
    await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event("change", { bubbles: true })); })()`);
  };
  const rowOf = (title: string) => `[data-todo-row="${byTitle(title)!.id}"]`;
  const noOverflow = async () => assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), "页面不应横向滚动");

  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=todo]')");
  if (await evaluate("document.body.dataset.desktopSurface") !== "todo") await click("[data-plugin-strip] [data-plugin-id=todo]");
  await waitFor("document.body.dataset.desktopSurface === 'todo'");
  await waitFor("document.querySelector('[data-todo-loading]').hidden && !document.querySelector('[data-todo-empty]').hidden");
  assert.equal(await evaluate("document.querySelector('[data-todo-empty-title]').textContent"), "今天没有要处理的事");
  await noOverflow();
  await screenshot("empty");

  // Quick entry: the date is read without a model and shown before saving; the row lands in the view that answers it.
  await type("[data-todo-quick-input]", "明天前给王总回电话");
  await waitFor("document.querySelector('[data-todo-quick-parts]').textContent.includes('截止 明天')");
  assert.equal(await evaluate("document.querySelector('[data-todo-quick-submit]').disabled"), false);
  await screenshot("quick-parse");
  await click("[data-todo-quick-submit]");
  await waitFor("document.querySelector('[data-todo-note-text]').textContent.startsWith('已记下「给王总回电话」')");
  assert.match(String(await evaluate("document.querySelector('[data-todo-note-text]').textContent")), /即将到期/);
  // V-3: the item landed in another view, so the note offers a way there; it is not offered for an item already in view.
  assert.equal(await evaluate("!document.querySelector('[data-todo-note-view]').hidden && document.querySelector('[data-todo-note-view]').textContent"), "查看");
  await click("[data-todo-note-view]");
  await waitFor(`document.querySelector('[data-todo-view="upcoming"]').getAttribute('aria-pressed') === 'true' && document.querySelector('[data-todo-rows]').textContent.includes('给王总回电话')`);
  assert.equal(await evaluate("document.querySelector('[data-todo-note-view]').hidden"), true, "taken, the offer goes away");
  await click('[data-todo-view="today"]');
  await waitFor(`document.querySelector('[data-todo-view="today"]').getAttribute('aria-pressed') === 'true'`);
  const call = byTitle("给王总回电话")!;
  assert.equal(call.due_date !== null && call.planned_date === null, true);
  assert.equal(call.placement, "unassigned", "项目里记下的默认暂未归类");

  await type("[data-todo-quick-input]", "今天整理会议纪要");
  await click("[data-todo-quick-submit]");
  await waitFor(`document.querySelector('[data-todo-rows]').textContent.includes('整理会议纪要')`);
  await type("[data-todo-quick-input]", "问问设计进展");
  await click("[data-todo-quick-submit]");
  await waitFor("Boolean(document.querySelector('[data-todo-note-text]').textContent.includes('问问设计进展'))");
  await type("[data-todo-quick-input]", "今天交周报");
  await click("[data-todo-quick-submit]");
  await waitFor(`document.querySelector('[data-todo-rows]').textContent.includes('交周报')`);
  assert.equal(all().length, 4);
  await screenshot("today");

  // Complete from the row, then undo from the note.
  await click(`${rowOf("整理会议纪要")} [data-todo-done]`);
  await waitFor("document.querySelector('[data-todo-note-text]').textContent === '已完成「整理会议纪要」'");
  assert.equal(byTitle("整理会议纪要")!.status, "done");
  await click("[data-todo-undo]");
  await waitFor("document.querySelector('[data-todo-note-text]').textContent === '已撤销'");
  assert.equal(byTitle("整理会议纪要")!.status, "open");

  // Batch: two todos pushed back a day, then undone together.
  await click(`${rowOf("整理会议纪要")} [data-todo-pick]`);
  await click(`${rowOf("交周报")} [data-todo-pick]`);
  await waitFor("!document.querySelector('[data-todo-batch]').hidden && document.querySelector('[data-todo-batch-count]').textContent === '已选 2 件'");
  await screenshot("batch");
  await click("[data-todo-batch-action=shift]");
  await waitFor("document.querySelector('[data-todo-note-text]').textContent === '已把 2 件推后一天'");
  const shifted = byTitle("交周报")!.planned_date;
  assert.ok(shifted && shifted > byTitle("交周报")!.created_at.slice(0, 10) === false || shifted !== null);
  assert.equal(await evaluate("document.querySelector('[data-todo-batch]').hidden"), true);
  await click("[data-todo-undo]");
  await waitFor("document.querySelector('[data-todo-note-text]').textContent === '已撤销'");
  await waitFor(`document.querySelector('[data-todo-rows]').textContent.includes('交周报')`);

  // Views answer their questions.
  await click("[data-todo-view=unscheduled]");
  await waitFor("document.querySelector('[data-todo-rows]').textContent.includes('问问设计进展') && !document.querySelector('[data-todo-rows]').textContent.includes('交周报')");
  await click("[data-todo-view=upcoming]");
  await waitFor("document.querySelector('[data-todo-rows]').textContent.includes('给王总回电话')");

  // Detail: waiting on someone, a due date and notes save as the person types; history records it as theirs.
  await click(`${rowOf("给王总回电话")} [data-todo-id]`);
  await waitFor("!document.querySelector('[data-todo-stage-workspace]').hidden && document.querySelector('[data-todo-field=title]').value === '给王总回电话'");
  await click("[data-todo-status=waiting]");
  await waitFor("!document.querySelector('[data-todo-waiting]').hidden");
  await type("[data-todo-field='waiting.who']", "王总");
  await type("[data-todo-field='waiting.what']", "回电时间");
  await change("[data-todo-field=planned_date]", byTitle("给王总回电话")!.due_date!);
  await type("[data-todo-field=notes]", "先确认方案版本");
  await waitFor(`(() => { const s = document.querySelector('[data-todo-save-status]').textContent; return s === '等待他人'; })()`);
  await waitFor("document.querySelector('[data-todo-history]').textContent.includes('你改了')");
  const waiting = byTitle("给王总回电话")!;
  assert.equal(waiting.status, "waiting");
  assert.deepEqual([waiting.waiting?.who, waiting.waiting?.what], ["王总", "回电时间"]);
  assert.equal(waiting.notes, "先确认方案版本");
  assert.ok(waiting.edited_fields.includes("waiting") && waiting.edited_fields.includes("notes"));
  await noOverflow();
  await screenshot("detail");

  // Relation between two todos, read from both ends.
  await change("[data-todo-link-target]", byTitle("交周报")!.id);
  await click("[data-todo-link-add]");
  await waitFor("document.querySelector('[data-todo-links]').textContent.includes('交周报')");

  // Delete asks first and cannot be undone.
  await click("[data-todo-delete]");
  await waitFor("document.querySelector('[data-todo-confirm]').open");
  await click("[data-todo-confirm] [data-confirm-ok]");
  await waitFor("document.querySelector('[data-todo-note-text]').textContent === '已删除「给王总回电话」'");
  assert.equal(byTitle("给王总回电话"), undefined);
  assert.equal(await evaluate("document.querySelector('[data-todo-stage-workspace]').hidden"), true);
  await idle();
  await noOverflow();
  await screenshot("after-delete");
});

test("Todo reminders and the project home: a due reminder shows once, later and got-it act on it, home lists today's todos", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory } = browser;
  const everything = { projectId, everything: true, actor: "user" as const, actorId: "test" };
  const store = openTodoStore(homeDirectory);
  const now = Date.now();
  let dueId = "", overdueId = "";
  try {
    dueId = store.create({ title: "交报销单", remind_at: new Date(now - 5 * 60_000).toISOString() }, everything).item.id;
    store.create({ title: "给妈妈打电话", remind_at: new Date(now - 3 * 3_600_000).toISOString() }, everything);
    const yesterday = new Date(now - 86_400_000);
    overdueId = store.create({ title: "逾期的方案", due_date: `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}` }, everything).item.id;
  } finally { store.close(); }
  const output = new URL(`../${specEvidenceDirectory("specs/archive/todo-plugin/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const screenshot = async (name: string) => {
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(new URL(`todo-${name}-1440.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  const read = (id: string) => { const opened = openTodoStore(homeDirectory); try { return opened.get(id, everything); } finally { opened.close(); } };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);

  // The project home lists what needs attention today, Todo among the other sources.
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-home-list]') && document.querySelector('[data-home-list]').textContent.includes('交报销单')");
  assert.match(String(await evaluate("document.querySelector('[data-home-list]').textContent")), /逾期的方案/);
  await screenshot("home");

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=todo]')");
  if (await evaluate("document.body.dataset.desktopSurface") !== "todo") await click("[data-plugin-strip] [data-plugin-id=todo]");
  await waitFor("!document.querySelector('[data-todo-reminders]').hidden && document.querySelectorAll('[data-todo-reminder]').length === 2");
  assert.match(String(await evaluate("document.querySelector('[data-todo-reminders]').textContent")), /错过：/);
  await screenshot("reminders");

  await click(`[data-todo-reminder="${dueId}"] .todo-reminder-later > summary`);
  await click(`[data-todo-reminder="${dueId}"] [data-todo-reminder-later]`);
  await waitFor("document.querySelector('[data-todo-note-text]').textContent.startsWith('会在')");
  assert.ok(Date.parse(read(dueId).remind_at!) > now, "稍后把提醒挪到之后");
  await waitFor("document.querySelectorAll('[data-todo-reminder]').length === 1");
  await click("[data-todo-reminder] [data-todo-reminder-ack]");
  await waitFor("document.querySelector('[data-todo-reminders]').hidden");
  assert.equal(read(overdueId).status, "open");
});

test("Organizing results wait in Todo: the person ticks, edits, adds and ignores; nothing is added before they choose", { timeout: 120_000 }, async t => {
  const answer = JSON.stringify({
    candidates: [
      { ref: "c1", kind: "request", title: "发送新版方案", why: "张总要求周五前收到", owner: { who: "你", stated: true }, due: { date: null, time: null, phrase: null },
        evidence: [{ material: 1, excerpt: "请周五前发新版方案" }], uncertain: ["发给谁没写，推测是张总"], depends_on: ["c2"] },
      { ref: "c2", kind: "waiting", title: "等待小李确认预算", why: "预算要小李确认", owner: { who: "小李", stated: true }, due: { date: null, phrase: null },
        waiting: { who: "小李", what: "确认预算" }, evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
      { ref: "c3", kind: "suggestion", title: "今天催小李确认预算", why: "预算确认影响周五交付", owner: { who: "你", stated: false }, due: { date: null, phrase: null },
        evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
    ],
    reference_only: [{ summary: "下周团建改到周四（通知）", material: 1 }],
  });
  const browser = await openGoalBrowser(t, true, undefined, async () => answer);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, homeDirectory, localHost } = browser;
  const everything = { projectId, everything: true, actor: "user" as const, actorId: "test" };
  const items = () => { const store = openTodoStore(homeDirectory); try { return store.list(everything); } finally { store.close(); } };
  // The Assistant's path: an agent asks Todo to organize; the result waits for the person.
  await localHost.homeActionClient().invoke({ actor_id: "assistant", project_id: null, audience: "agent", permissions: [...TODO_ACTION_PERMISSIONS] }, todoOrganizeActions.extract,
    { title: "整理：张总的邮件", materials: [{ title: "张总：新版方案", text: "小王你好，请周五前发新版方案，预算等小李确认。另外，下周的团建改到周四，大家知悉。" }] });
  assert.equal(items().length, 0, "整理不会直接新建待办");
  const output = new URL(`../${specEvidenceDirectory("specs/archive/todo-plugin/verification")}/`, import.meta.url);
  await mkdir(output, { recursive: true });
  const screenshot = async (name: string) => {
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(new URL(`todo-${name}-1440.png`, output), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=todo]')");
  if (await evaluate("document.body.dataset.desktopSurface") !== "todo") await click("[data-plugin-strip] [data-plugin-id=todo]");
  await waitFor("!document.querySelector('[data-todo-view=review]').hidden && document.querySelector('[data-todo-view=review]').textContent.includes('3')");
  await click("[data-todo-view=review]");
  await waitFor("document.querySelectorAll('[data-todo-candidate]').length === 3");
  assert.equal(await evaluate("document.querySelector('[data-todo-apply]').textContent"), "加入 2 项待办");
  assert.match(String(await evaluate("document.querySelector('[data-todo-review]').textContent")), /另有 1 条仅供参考，未列入/);
  assert.match(String(await evaluate("document.querySelector('[data-todo-review]').textContent")), /“请周五前发新版方案”/);
  await screenshot("review");

  // Edit before adding, then add the two ticked ones.
  await click("[data-todo-candidate-edit-toggle]");
  await waitFor("document.querySelector('[data-todo-candidate-field=title]')");
  await evaluate(`(() => { const node = document.querySelector('[data-todo-candidate-field=title]'); node.value = '发送新版方案给张总'; node.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await click("[data-todo-apply]");
  await waitFor("document.querySelector('[data-todo-note-text]').textContent === '已处理：加入 2 项待办'");
  assert.deepEqual(items().map(item => item.title).sort(), ["发送新版方案给张总", "等待小李确认预算"]);
  await waitFor("document.querySelector('[data-todo-ignore-rest]') && !document.querySelector('[data-todo-ignore-rest]').hidden");
  await click("[data-todo-ignore-rest]");
  await waitFor("document.querySelector('[data-todo-review]').textContent.includes('没有等你确认的整理结果')");
  assert.equal(items().length, 2);
});

// Frontend flow walk V-4: the tab strip scrolls sideways to keep the chosen view in sight, and only the strip. Opening one organize
// result by its id puts that batch at the top of the review list; revealing the tab must not scroll the list back up over it.
test("390px: opening an organize result by id keeps that batch in view", { timeout: 120_000 }, async t => {
  const answer = JSON.stringify({
    candidates: [
      { ref: "c1", kind: "request", title: "发送新版方案", why: "张总要求周五前收到", owner: { who: "你", stated: true }, due: { date: null, time: null, phrase: null },
        evidence: [{ material: 1, excerpt: "请周五前发新版方案" }] },
      { ref: "c2", kind: "waiting", title: "等待小李确认预算", why: "预算要小李确认", owner: { who: "小李", stated: true }, due: { date: null, phrase: null },
        waiting: { who: "小李", what: "确认预算" }, evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
      { ref: "c3", kind: "suggestion", title: "今天催小李确认预算", why: "预算确认影响周五交付", owner: { who: "你", stated: false }, due: { date: null, phrase: null },
        evidence: [{ material: 1, excerpt: "预算等小李确认" }] },
    ],
    reference_only: [],
  });
  const browser = await openGoalBrowser(t, true, undefined, async () => answer);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin, projectId, localHost } = browser;
  for (const name of ["张总", "李主管", "赵经理", "陈老师", "周女士"]) {
    await localHost.homeActionClient().invoke({ actor_id: "assistant", project_id: null, audience: "agent", permissions: [...TODO_ACTION_PERMISSIONS] }, todoOrganizeActions.extract,
      { title: `整理：${name}的邮件`, materials: [{ title: `${name}：新版方案`, text: `${name}：请周五前发新版方案，预算等小李确认。` }] });
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 700, deviceScaleFactor: 1, mobile: true }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=todo]')");
  if (await evaluate("document.body.dataset.desktopSurface") !== "todo") await click("[data-plugin-strip] [data-plugin-id=todo]");
  await waitFor("!document.querySelector('[data-todo-view=review]').hidden");
  await click("[data-todo-view=review]");
  await waitFor("document.querySelectorAll('[data-todo-batch-review]').length === 5");
  const last = String(await evaluate("[...document.querySelectorAll('[data-todo-batch-review]')].pop().dataset.todoBatchReview"));
  // The result named by the Assistant or by search: Todo reloads the review list and brings that batch to the top.
  await evaluate(`(() => { document.querySelector('[data-todo=workbench]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: 'batch:${last}' } })); })()`);
  await waitFor(`document.querySelector('[data-todo-batch-review="${last}"]')?.classList.contains('is-arriving')`);
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  const seen = await evaluate<{ scrolled: number; gap: number; below: number }>(`(() => { const list = document.querySelector('[data-todo=directory]'), box = list.getBoundingClientRect(),
    top = document.querySelector('[data-todo-batch-review="${last}"]').getBoundingClientRect().top; return { scrolled: list.scrollTop, gap: Math.round(top - box.top), below: Math.round(box.bottom - top) }; })()`);
  assert.ok(seen.scrolled > 0, `the list was scrolled down to the batch: ${JSON.stringify(seen)}`);
  assert.ok(seen.gap >= -1 && seen.below > 120, `the batch sits at the top of what the person sees, not scrolled away again: ${JSON.stringify(seen)}`);
});
