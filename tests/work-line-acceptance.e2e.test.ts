import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import type { AcceptanceReadResult, AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { openAcceptance, type AcceptanceCaller, type AcceptanceEvidencePorts } from "@molis-ai/molis-work-module-acceptance";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// specs/proactive-assistant §7.3.1 on the page: an event's card says how the requirements on its object stand (the run, what was
// verified, what the person accepted — three readings), and the column beside the work goes through them one by one. The object
// here is a plugin's (a todo), so nothing on the way knows Goals (APR-15).

const pad = (value: number) => String(value).padStart(2, "0");
const today = () => { const at = new Date(); return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`; };
const COLUMN = "document.querySelector('[data-acceptance-column]')";
const card = (id: string) => `${COLUMN}.querySelector('[data-requirement=${id}]')`;
const FOUR = [
  { id: "r1", statement: "三档并排，三种宽度都不掉行", part: "三档价格表", requires_person: false },
  { id: "r2", statement: "企业版写联系我们，不写价格，按钮通到销售的表单并且在三种宽度下都看得见", part: "企业版一栏", requires_person: false },
  { id: "r3", statement: "发布前给你看一眼", part: "整页预览", requires_person: true },
  { id: "r4", statement: "页脚链接都能打开", part: "页脚", requires_person: false },
];

test("PWA-144 PWA-145 PWA-146: the event's card sums up its requirements in three readings and the column goes through them one by one — accept, return with a reason, change what is asked — at 1440 and 390, in Chinese and English", { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory, evaluate, waitFor, click, setViewport } = browser;
  const store = openTodoStore(homeDirectory);
  const todo = store.create({ title: "改定价页", placement: "project", notes: "三档", planned_date: today() }, { projectId, projectIds: [], actor: "user" as const, actorId: "test" }).item;
  store.close();
  const PRESS = `[data-work-line] [data-work-event*="todo-planned:${todo.id}"]`;
  // What the page asks the acceptance doors, as it posted it.
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `window.__acceptance = []; (() => { const real = window.fetch; window.fetch = function (input, init) {
    try { const url = new URL(typeof input === 'string' ? input : input.url, location.href); const at = url.pathname.match(/\\/api\\/acceptance\\/(\\w+)$/);
      if (at && init && typeof init.body === 'string') window.__acceptance.push({ door: at[1], body: JSON.parse(init.body) }); } catch {}
    return real.apply(this, arguments); }; })();` }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  const open = async (locale: "zh" | "en", width: number, height: number) => {
    await command("Network.setCookie", { name: "molis_work_locale", value: locale, url: origin, path: "/" }, sessionId);
    await setViewport(width, height, width < 600);
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
    await waitFor(`document.querySelector(${JSON.stringify(PRESS)})`, 20_000);
    // On a phone the line is a track that slides: the event is reached as the keyboard reaches it, and rests whole in the track.
    if (width < 600) {
      await evaluate(`document.querySelector(${JSON.stringify(PRESS)}).focus()`);
      await waitFor(`(() => { const track = document.querySelector('[data-work-line] .work-line-track').getBoundingClientRect(), at = document.querySelector(${JSON.stringify(PRESS)}).getBoundingClientRect(); return at.left >= track.left - 1 && at.right <= track.right + 1; })()`);
    }
    await click(PRESS);
    await waitFor("window.__acceptance.some(one => one.door === 'read')", 15_000);
  };
  const shot = new URL("../.impeccable/qa/review/work-line/", import.meta.url);
  await mkdir(shot, { recursive: true });
  const picture = async (name: string) => {
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await writeFile(new URL(`${name}.png`, shot), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));
  };
  const door = <T>(name: string, body: unknown) => evaluate<{ status: number; body: T & { error?: { code?: string } } }>(`fetch(${JSON.stringify(`/projects/${projectId}/api/acceptance/${name}`)}, { method: 'POST',
    headers: { 'content-type': 'application/json', ...(globalThis.molisWorkControlHeaders?.() || {}) }, body: ${JSON.stringify(JSON.stringify(body))} }).then(async response => ({ status: response.status, body: await response.json().catch(() => ({})) }))`);

  // Nothing is asked of the todo yet: its card says nothing about requirements.
  await open("zh", 1440, 900);
  await waitFor("document.querySelector('[data-assistant-event-card] [data-card-acceptance]')");
  assert.equal(await evaluate("document.querySelector('[data-card-acceptance]').hidden"), true, "an object with no requirements shows no summary");
  const reads = (await evaluate<Array<{ door: string; body: { subjects: Array<{ provider_id: string; subject: { kind: string; id: string } }> } }>>("window.__acceptance")).filter(one => one.door === "read");
  // Each read asks for every card shown at once (here the line has one), not one request per object.
  const target = reads[0]!.body.subjects[0]!;
  assert.ok(reads.every(one => JSON.stringify(one.body.subjects) === JSON.stringify([target])), JSON.stringify(reads));
  assert.deepEqual(target.subject, { kind: "todo_item", id: todo.id }, "the card asks about the event's own object, under the provider that reported it");

  // The person says what is asked, through their own door; the work is then delivered and reported the way an executor would.
  const asked = await door<AcceptanceView>("requirements", { subject: target, requirements: FOUR });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  const maker: AcceptanceCaller = { project_id: projectId, actor_id: "agent:assistant", person: false, session: "s-maker" };
  const ports: AcceptanceEvidencePorts = { artifactReadable: async () => true, stopped: () => false,
    checkRun: async (_run, calls) => ({ commands: calls.map(call_id => ({ call_id, recorded: true, exit_code: 0, timed_out: false, cancelled: false, changed_after: false })) }) };
  const acceptance = openAcceptance(homeDirectory);
  try {
    await acceptance.service.deliver(maker, { subject: target, version: "v1", made_in: { run_id: "run-1" } }, ports);
    await acceptance.service.report(maker, { subject: target, reports: [
      { requirement_id: "r1", verdict: "supports", checked: { version: "v1" }, method: "三种宽度截图比对", observed: "都不掉行", evidence: [{ kind: "command_receipt", run_id: "run-1", call_id: "c1" }] },
      { requirement_id: "r2", verdict: "supports", checked: { version: "v1" }, method: "执行者说明", observed: "已按要求改" },
      { requirement_id: "r3", verdict: "supports", checked: { version: "v1" }, method: "整页截图", observed: "与定样一致", evidence: [{ kind: "command_receipt", run_id: "run-1", call_id: "c3" }] },
    ] }, ports);
  } finally { acceptance.close(); }
  const stands = await door<AcceptanceReadResult>("read", { subjects: [target] });
  assert.deepEqual(stands.body.views[0]!.counts, { total: 4, verified: 2, needs_person: 3, accepted: 0, satisfied: 1 });

  // PWA-144 & APR-15/16: the card's summary keeps the three readings apart — delivered is not verified, verified is not accepted —
  // and both the overview card and the requirement column expose the shared platform ReviewReference.
  await open("zh", 1440, 900);
  await waitFor("document.querySelector('[data-acceptance-overview]')", 15_000);
  assert.ok(stands.body.views[0]!.review_reference?.id && stands.body.views[0]!.review_reference?.version, "read attaches the platform ReviewReference");
  assert.equal(await evaluate("document.querySelector('[data-acceptance-overview]').dataset.reviewReference"), stands.body.views[0]!.review_reference!.id);
  assert.equal(await evaluate("document.querySelector('[data-acceptance-overview]').dataset.reviewVersion"), stands.body.views[0]!.review_reference!.version);
  const summary = String(await evaluate("document.querySelector('[data-acceptance-overview] .work-reqs-sum').textContent"));
  assert.match(summary, /执行 完成/u); assert.match(summary, /核验通过 2\/4/u); assert.match(summary, /你的认可 0\/3/u);
  assert.equal(await evaluate(`${COLUMN}.hidden`), true, "the column stays shut until asked for");

  // The column opens beside the work, which gives way to it; one card per requirement, and exactly one primary button.
  await click("[data-acceptance-overview] [data-acceptance-open]");
  await waitFor(`!${COLUMN}.hidden && ${COLUMN}.querySelectorAll('[data-requirement]').length === 4`);
  assert.equal(await evaluate(`${COLUMN}.dataset.reviewReference`), stands.body.views[0]!.review_reference!.id);
  assert.equal(await evaluate(`${COLUMN}.dataset.reviewVersion`), stands.body.views[0]!.review_reference!.version);
  assert.equal(await evaluate("document.body.dataset.acceptanceOpen"), "true");
  assert.equal(await evaluate("document.querySelector('[data-assistant-panel]').hidden"), true, "the dialog is put away while the column is open");
  const layout = await evaluate<{ column: { left: number; right: number; width: number }; stage: { left: number } | null; primary: number; lead: string | null; wrapped: string[]; unnamed: string[] }>(`(() => {
    const column = ${COLUMN}, box = column.getBoundingClientRect(), stage = [...document.querySelectorAll('[data-plugin-stage]')].find(one => one.getClientRects().length);
    const cards = [...column.querySelectorAll('[data-requirement]')];
    return { column: { left: box.left, right: box.right, width: box.width }, stage: stage ? { left: stage.getBoundingClientRect().left } : null,
      primary: column.querySelectorAll('.mw-btn--primary').length, lead: column.querySelector('[data-lead]')?.dataset.requirement ?? null,
      // A row is one line: its name, its state, its reason each end in an ellipsis rather than fold.
      wrapped: cards.flatMap(one => [...one.querySelectorAll('.work-req-head, .work-req-meta, .work-req-why, .work-card-actions')].filter(row => row.getBoundingClientRect().height > 40).map(row => one.dataset.requirement + ':' + row.className)),
      // A state is a ring and words together, never colour alone.
      unnamed: cards.filter(one => !one.querySelector('.work-req-head svg') || !one.querySelector('.work-req-meta .mw-badge')?.textContent.trim()).map(one => one.dataset.requirement) };
  })()`);
  assert.equal(layout.column.width, 320); assert.equal(layout.primary, 1, "one primary button in the column");
  assert.equal(layout.lead, "r2", "the first requirement that waits on the person leads");
  if (layout.stage) assert.ok(layout.stage.left >= layout.column.right, `the work gives way to the column (${layout.stage.left} < ${layout.column.right})`);
  assert.deepEqual(layout.wrapped, []); assert.deepEqual(layout.unnamed, []);
  assert.match(String(await evaluate(`${card("r1")}.textContent`)), /机器核过/u);
  assert.match(String(await evaluate(`${card("r2")}.textContent`)), /只有自述.*只有执行者自己的说明，不算通过/su, "a self-report is shown as one, with what the person can do");
  assert.match(String(await evaluate(`${card("r3")}.textContent`)), /要你认可/u, "machine-checked, and still the person's to accept");
  assert.match(String(await evaluate(`${card("r4")}.textContent`)), /没有证据/u);
  assert.equal(await evaluate(`${card("r1")}.querySelector('[data-acceptance-accept]') === null`), true, "what needs no one's word offers no accept");
  await picture("acceptance-column-1440");

  // The person accepts the leading item: the versions on screen go with it, and the next one that waits takes the lead.
  await click("[data-acceptance-column] [data-lead] [data-acceptance-accept]");
  await waitFor(`${card("r2")}.textContent.includes('你已认可')`);
  const accepted = (await evaluate<Array<{ door: string; body: { version: string; accepts: unknown[]; returns: unknown[] } }>>("window.__acceptance")).filter(one => one.door === "decide").at(-1)!.body;
  assert.deepEqual([accepted.version, accepted.accepts, accepted.returns], ["v1", [{ id: "r2", version: 1 }], []]);
  assert.equal(await evaluate(`${COLUMN}.querySelector('[data-lead]').dataset.requirement`), "r3");
  assert.match(String(await evaluate("document.querySelector('[data-acceptance-overview] .work-reqs-sum').textContent")), /你的认可 1\/3/u, "the card's summary follows");

  // PWA-145: a return needs its reason — nothing is sent without one, and the reason stays on the item.
  await click(`[data-acceptance-column] [data-requirement=r4] [data-acceptance-return]`);
  await waitFor(`${card("r4")}.querySelector('[data-acceptance-note]') === document.activeElement`);
  const before = await evaluate<number>("window.__acceptance.filter(one => one.door === 'decide').length");
  await click(`[data-acceptance-column] [data-requirement=r4] [data-acceptance-note-send]`);
  assert.equal(await evaluate("window.__acceptance.filter(one => one.door === 'decide').length"), before, "an empty reason is not sent");
  await evaluate(`(() => { const field = ${card("r4")}.querySelector('[data-acceptance-note]'); field.value = '隐私政策的链接是 404'; field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  await waitFor(`${card("r4")}.textContent.includes('已退回 · 在返工')`);
  assert.match(String(await evaluate(`${card("r4")}.textContent`)), /隐私政策的链接是 404/u);
  assert.equal(await evaluate(`${card("r4")}.querySelector('[data-acceptance-accept]') === null`), true, "what was returned waits for the rework, not for another answer");
  const reopened = await evaluate<{ status: number; body: { decision?: { decision_id: string }; choices: Array<{ availability: { available: boolean } }> } }>(`fetch(${JSON.stringify(`/projects/${projectId}/api/project-approvals/request`)}, { method: 'POST',
    headers: { 'content-type': 'application/json', ...(globalThis.molisWorkControlHeaders?.() || {}) }, body: ${JSON.stringify(JSON.stringify({ reference: stands.body.views[0]!.review_reference }))} }).then(async response => ({ status: response.status, body: await response.json() }))`);
  assert.equal(reopened.status, 200);
  assert.ok(reopened.body.decision?.decision_id, "the settled ReviewReference reopens with its committed platform decision");
  assert.equal(reopened.body.choices.every(choice => !choice.availability.available), true);
  const reviewHistory = await evaluate<{ status: number; rows: Array<{ id: string }> }>(`fetch(${JSON.stringify(`/api/settings/authorizations/reviews?project=${encodeURIComponent(projectId ?? "")}`)},
    { headers: globalThis.molisWorkControlHeaders?.() || {} }).then(async response => ({ status: response.status, rows: ((await response.json()).rows || []) }))`);
  assert.equal(reviewHistory.status, 200);
  assert.ok(reviewHistory.rows.some(row => row.id === reopened.body.decision!.decision_id), "authorization provenance lists the committed acceptance decision");

  // PWA-146: the person changes what is asked; what was checked for the old words stops counting.
  await click(`[data-acceptance-column] [data-requirement=r3] [data-acceptance-edit]`);
  await waitFor(`${card("r3")}.querySelector('[data-acceptance-text]') === document.activeElement`);
  await evaluate(`(() => { const field = ${card("r3")}.querySelector('[data-acceptance-text]'); field.value = '发布前给你看一眼，手机上也看'; })()`);
  await click(`[data-acceptance-column] [data-requirement=r3] [data-acceptance-text-send]`);
  await waitFor(`${card("r3")}.textContent.includes('要求改了 · 待重新核')`);
  assert.equal(await evaluate(`${card("r3")}.dataset.requirementVersion`), "2");
  assert.match(String(await evaluate(`${card("r3")}.querySelector('.work-req-history').textContent`)), /你把要求改为：发布前给你看一眼，手机上也看/u, "the record says who changed it");

  // Escape shuts the column and gives the focus back to where it was opened from.
  await evaluate(`${COLUMN}.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(`${COLUMN}.hidden`);
  assert.equal(await evaluate("document.body.dataset.acceptanceOpen"), "false");
  assert.equal(await evaluate("document.querySelector('[data-assistant-panel]').hidden"), false, "and comes back with it");
  assert.equal(await evaluate("document.activeElement?.hasAttribute('data-acceptance-open')"), true);

  // At 390, in English: the column covers the work, nothing spills, and what is pressed is big enough to press.
  await open("en", 390, 844);
  await waitFor("document.querySelector('[data-acceptance-overview]')", 15_000);
  assert.match(String(await evaluate("document.querySelector('[data-acceptance-overview]').textContent")), /Run done.*Checks passed 1\/4.*Your OK 1\/3.*Review items/su);
  await click("[data-acceptance-overview] [data-acceptance-open]");
  await waitFor(`!${COLUMN}.hidden && ${COLUMN}.querySelectorAll('[data-requirement]').length === 4`);
  const phone = await evaluate<{ left: number; right: number; spill: string[]; small: string[]; title: string; covered: string[] }>(`(() => {
    const column = ${COLUMN}, box = column.getBoundingClientRect();
    return { left: box.left, right: box.right, title: column.querySelector('.work-reqs-head strong').textContent,
      // What is pressed is really on top: nothing else takes the press.
      covered: [...column.querySelectorAll('.work-reqs-head button, [data-lead] button')].filter(one => { const at = one.getBoundingClientRect(); return !one.contains(document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2)); }).map(one => { const at = one.getBoundingClientRect(), hit = document.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2); return (one.getAttribute('aria-label') || one.textContent.trim()) + ' @' + Math.round(at.top) + ' under ' + (hit ? hit.tagName + '.' + hit.className : 'nothing'); }),
      spill: [...column.querySelectorAll('[data-requirement]')].filter(one => one.getBoundingClientRect().right > box.right || one.scrollWidth > one.clientWidth + 1).map(one => one.dataset.requirement),
      small: [...column.querySelectorAll('button, summary')].filter(one => one.getClientRects().length && one.getBoundingClientRect().height < 44).map(one => one.getAttribute('aria-label') || one.textContent.trim()) };
  })()`);
  await picture("acceptance-column-390-en");
  assert.equal(phone.title, "Item by item");
  assert.ok(phone.left >= 0 && phone.right <= 390, `the column fits the phone (${phone.left}–${phone.right})`);
  assert.deepEqual(phone.spill, []); assert.deepEqual(phone.small, [], "touch targets are 44px on a phone"); assert.deepEqual(phone.covered, [], "nothing lies over the column");
  assert.match(String(await evaluate(`${card("r4")}.textContent`)), /Returned · in rework/u);
});
