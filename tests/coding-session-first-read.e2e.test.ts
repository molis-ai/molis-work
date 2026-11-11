import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { coding, CONTEXT, FIRST_WORDS, openCoding } from "./fixtures/coding-browser.js";
import { CODING_COMPOSER, CODING_COMPOSER_STATUS, CODING_OPEN, codingAdd } from "./fixtures/coding-composer.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

// specs/ai-interaction-experience AC-05: what a person writes stays with the session it was written in. After「新会话」is
// pressed, or another session is opened, the composer takes nothing until that session is made and its first read has put its
// own draft and next-round settings in: the box still shows the session before it, and what is typed, chosen, handed back or
// sent then would land in the wrong one, or be wiped when the read lands.

const ALL_CLOSED = { task: true, send: true, intent: true, model: true };
// Materials are picked in the page's one knowledge picker (specs/project-knowledge PMAT-17), not a dialog of Coding's own.
const DIALOGS = CONTEXT.filter(name => name !== "material");
/**
 * The service confirmed a session's words: the PATCH that carried them is in, and this window keeps no unconfirmed copy (its
 * sessionStorage buffer holds only what the service has not confirmed, unified-input-voice K4).
 */
const confirmed = (id: string, words: string) => `patches.some(one=>one.path.endsWith('/sessions/'+${JSON.stringify(encodeURIComponent(id))})&&JSON.parse(one.body).draft===${JSON.stringify(words)})
  && sessionStorage.getItem('molis-coding-draft:'+document.querySelector('${coding}').dataset.codingPrefix+':'+${JSON.stringify(id)})===null`;

test("AC-05: while「新会话」is being made, the composer of the session shown takes and sends nothing; then the new session's box opens empty", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { click, evaluate, waitFor, box, type, current, closed, trySend, sentWith, start, afterAStateRead, owner } = opened;
  const first = await start();

  await evaluate("hold.what='create'");
  await click(`${coding} [data-coding-new]`);
  await waitFor("hold.seen === 1 && typeof hold.release === 'function'");
  await afterAStateRead();
  assert.equal(await current(), first, "the new session is not made yet");
  assert.equal(await owner.evaluate<string>(`${box}.value`), FIRST_WORDS);
  assert.deepEqual(await closed(), ALL_CLOSED, "what is chosen or typed now would land in the session before it");
  await trySend();
  assert.deepEqual(await sentWith(FIRST_WORDS), [], "nothing is sent while the composer is closed");

  await evaluate("hold.release()");
  await owner.waitFor(CODING_OPEN);
  const second = await current();
  assert.notEqual(second, first);
  assert.equal(await owner.evaluate<string>(`${box}.value`), "", "the new session's box holds its own (empty) draft");
  assert.deepEqual(await sentWith(FIRST_WORDS), []);
  await type("乙会话的任务");
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(await owner.evaluate<string>(`${box}.value`), "乙会话的任务", "what is typed once the box opens stays");
});

test("AC-05: until a new session's first read lands, its composer stays closed and the words of the session before it are not sent into it; then the box holds its own draft", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { click, evaluate, waitFor, box, type, current, closed, trySend, sentWith, start, afterAStateRead, owner } = opened;
  const first = await start();

  await evaluate(`hold.except=${JSON.stringify(first)};hold.what='read'`);
  await click(`${coding} [data-coding-new]`);
  await waitFor("hold.seen === 1 && typeof hold.release === 'function'");
  await afterAStateRead();
  const second = await current();
  assert.notEqual(second, first);
  // The box still shows the first session's words: this is the moment they could have gone into the second one.
  assert.equal(await owner.evaluate<string>(`${box}.value`), FIRST_WORDS);
  assert.deepEqual(await closed(), ALL_CLOSED, "the composer is closed while the new session's first read is on its way");
  await trySend();
  assert.deepEqual(await sentWith(FIRST_WORDS), [], "nothing carrying the first session's words is sent");

  await evaluate("hold.release()");
  await owner.waitFor(CODING_OPEN);
  assert.equal(await current(), second);
  assert.equal(await owner.evaluate<string>(`${box}.value`), "", "the new session's box holds its own (empty) draft, not the other session's words");
  assert.deepEqual(await sentWith(FIRST_WORDS), [], "the second session never received the first one's words");
  await type("乙会话的任务");
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(await owner.evaluate<string>(`${box}.value`), "乙会话的任务", "what is typed once the box opens stays");
});

test("AC-05: when a session's first read fails, the next read gives the box its draft and opens it", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { click, evaluate, waitFor, box, closed, start, owner } = opened;
  const first = await start();

  await evaluate(`hold.except=${JSON.stringify(first)};hold.what='read';hold.fail=true;hold.next='read'`);
  await click(`${coding} [data-coding-new]`);
  // The next read may already be taken (and held) by the time this looks.
  await waitFor("hold.seen >= 1");
  await waitFor(`document.querySelector('${coding} [data-coding-status]')?.textContent.includes('第一次读取失败')`);
  assert.equal((await closed()).task, true, "the failed read put no draft in: the box stays closed");
  // The session view reads again on its own (held here, so the box is seen closed before it); that read puts the draft in.
  await waitFor("hold.seen === 2 && typeof hold.release === 'function'", 15_000);
  assert.equal((await closed()).task, true);
  await evaluate("hold.release()");
  await owner.waitFor(CODING_OPEN, 15_000);
  assert.equal(await owner.evaluate<string>(`${box}.value`), "");
});

test("AC-05: when「新会话」reuses the session shown, or making one fails, the composer opens again on the session shown", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { click, evaluate, waitFor, box, type, current, closed, owner } = opened;
  const open = { task: false, intent: false, model: false };
  const someOpen = async () => { const { task, intent, model } = await closed(); return { task, intent, model }; };
  const made = () => evaluate<number>("posts.filter(one=>one.path.endsWith('/api/plugins/io.molis.work.coding/sessions')).length");
  const settled = async () => { await owner.waitFor(CODING_OPEN); await waitFor(`[...document.querySelectorAll('${coding} [data-coding-new]')].every(button=>!button.disabled)`); };
  await click(`${coding} [data-coding-new]`);
  await settled();
  const first = await current(), makes = await made();

  // A session holding nothing is the one「新会话」gives back: nothing is made, and the composer is this session's again.
  await click(`${coding} [data-coding-new]`);
  await settled();
  assert.equal(await current(), first);
  assert.equal(await made(), makes, "no session is made");
  assert.deepEqual(await someOpen(), open);

  await type(FIRST_WORDS);
  await evaluate("hold.what='create';hold.fail=true");
  await click(`${coding} [data-coding-new]`);
  await waitFor(`hold.seen === 1 && document.querySelector('${coding} [data-coding-status]')?.textContent.includes('建会话失败')`);
  await settled();
  assert.equal(await current(), first, "making the session failed: the one shown stays");
  assert.equal(await owner.evaluate<string>(`${box}.value`), FIRST_WORDS, "with its words");
  assert.deepEqual(await someOpen(), open);
});

test("AC-05: a choice open in a dialog when「新会话」is pressed is closed unsaved, and until the new session's first read lands nothing that sets its next round is offered: the buttons by the box, the palette's ways of working, materials, methods, delegation, model and workspace", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, box, type, current, start, afterAStateRead, shut, press, offered, nextRound, saved, stored, owner } = opened;
  const first = await start();
  const dialog = `document.querySelector('${coding} [data-coding-method-dialog]')`;
  const checks = `[...document.querySelectorAll('${coding} [data-coding-method-list] input[type=checkbox]:not(:disabled)')]`;
  const choose = async (n: number) => {
    await owner.evaluate(codingAdd("methods"));
    await waitFor(`${dialog}.open && ${checks}.length >= 2`);
    await evaluate(`(()=>{const node=${checks}[${n}];node.checked=true;node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  };
  // The first session holds a method; its dialog is opened again and a second one ticked, not yet saved. The method is
  // saved slowly while a typing save still waits: that save is dropped, not landed after it with no method.
  await choose(0);
  await type(FIRST_WORDS);
  await evaluate(`hold.slow=800;document.querySelector('${coding} [data-coding-method-form]').requestSubmit()`);
  await waitFor(`!${dialog}.open`);
  await evaluate("hold.slow=0");
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(((await saved(first)).at(-1)!.skills as unknown[]).length, 1, "the first session's last save holds the method");
  assert.equal(((await stored(first)).skills as unknown[]).length, 1, "the service holds the method");
  await choose(1);
  const offeredOnce = await nextRound();

  await evaluate(`hold.except=${JSON.stringify(first)};hold.what='read'`);
  await press("key:'n',code:'KeyN',altKey:true");
  await waitFor("hold.seen === 1 && typeof hold.release === 'function'");
  const second = await evaluate<string>("hold.id");
  assert.notEqual(second, first);
  assert.equal(await evaluate<boolean>(`${dialog}.open`), false, "the first session's method dialog closed when the new one came on show");
  for (const name of DIALOGS) assert.equal(await evaluate<boolean>(`document.querySelector('${coding} [data-coding-${name}-dialog]').open`), false, `${name} dialog`);
  for (const moment of ["before a state read", "after one"]) {
    if (moment === "after one") await afterAStateRead();
    assert.equal(await owner.evaluate<string>(`${box}.value`), FIRST_WORDS, "the box still shows the first session's words");
    assert.deepEqual(await shut(), CONTEXT.map(() => true), `workspace, goal, writers, materials, methods, MCP, capabilities, role and delegation wait for the first read (${moment})`);
    const early = await offered();
    assert.deepEqual(offeredOnce.filter(slash => early.includes(slash)), [], `the palette offers none of what sets the next round (${moment}): ${early.join(" ")}`);
  }

  await evaluate("hold.release()");
  await owner.waitFor(CODING_OPEN);
  assert.equal(await current(), second);
  assert.equal(await owner.evaluate<string>(`${box}.value`), "", "the new session's box holds its own (empty) draft");
  assert.deepEqual(await shut(), CONTEXT.map(() => false));
  const later = await offered();
  assert.deepEqual(offeredOnce.filter(slash => !later.includes(slash)), [], `the palette offers them all again: ${later.join(" ")}`);
  assert.deepEqual((await stored(second)).skills, [], "the new session holds no method of the first one");
  assert.ok((await saved(second)).every(body => !(body.skills as unknown[] | undefined)?.length && body.draft !== FIRST_WORDS), "nothing of the first session's was saved into the new one");
});

test("AC-05: review notes handed back to a session whose first read failed are refused and kept; the box takes them once it holds that session's own draft, never the words of the session shown before", { timeout: 120_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { evaluate, waitFor, box, current, closed, start, saved, openItem, owner } = opened;
  const SECOND_WORDS = "乙会话里写好的任务", TASK = "按审查意见修改 note.txt 第 1 行";
  const second = await start(SECOND_WORDS);
  await waitFor(confirmed(second, SECOND_WORDS));
  const first = await start();
  assert.notEqual(first, second);
  const run = `/sessions/${encodeURIComponent(second)}/runs/run-fixed/changeset`;
  const file = { path: "note.txt", kind: "modified", added_lines: 1, removed_lines: 1, review: { decision: "approved", execution: "applied" } };
  await evaluate(`fakes.push({method:'GET',path:${JSON.stringify(run + "?")},body:${JSON.stringify({
    html: '<ol class="mw-diff-rows"><li data-kind="insert"><button type="button" data-coding-line="1" data-coding-line-side="after">1</button>release notes go in CHANGES.md</li></ol>',
    change: { files: [file] }, reference: { artifact_id: "artifact-fixed", version: 1 }, saved_at: "2026-10-19T00:00:00.000Z", view_mode: "write", net_groups: [], output: null,
  })}},{method:'POST',path:${JSON.stringify(run + "/feedback")},body:${JSON.stringify({ task: TASK })}})`);
  const reader = `document.querySelector('${coding} [data-coding-change-reader]')`, message = `document.querySelector('${coding} [data-coding-change-status]')`;
  const handBack = () => evaluate(`document.querySelector('${coding} [data-coding-feedback-return]').click()`);
  const earlier = (await saved(second)).length;
  const local = () => evaluate<string | null>(`sessionStorage.getItem('molis-coding-draft:'+document.querySelector('${coding}').dataset.codingPrefix+':'+${JSON.stringify(second)})`);

  // The second session's fixed change is opened from elsewhere while the box shows the first one's words; its first read fails.
  await evaluate(`hold.except=${JSON.stringify(first)};hold.what='read';hold.fail=true;hold.next='read'`);
  await openItem(`coding-changeset:${encodeURIComponent(second)}:run-fixed`);
  await waitFor(`hold.seen >= 1 && !${reader}.hidden && !!${reader}.querySelector('[data-coding-line]')`);
  assert.equal(await evaluate<string>("hold.id"), second);
  await evaluate(`${reader}.querySelector('[data-coding-line]').click()`);
  await evaluate(`(()=>{const node=document.querySelector('${coding} [data-coding-feedback-list] textarea');node.value='改成 CHANGELOG.md';node.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await handBack();
  await waitFor(`${message}.textContent.includes('会话还在读取')`);
  assert.equal(await evaluate<number>(`document.querySelectorAll('${coding} [data-coding-feedback-list] textarea').length`), 1, "the note is kept");
  assert.equal(await owner.evaluate<string>(`${box}.value`), FIRST_WORDS, "the box is untouched");
  assert.equal((await closed()).task, true);
  assert.deepEqual((await saved(second)).slice(earlier), [], "nothing was saved into the second session");
  assert.equal(await local(), null, "this window keeps no unconfirmed copy of its draft, and none of the first session's words");

  // The next read is held, then lands: the box holds the second session's own draft.
  await waitFor("hold.seen === 2 && typeof hold.release === 'function'", 15_000);
  await evaluate("hold.release()");
  await owner.waitFor(CODING_OPEN);
  assert.equal(await owner.evaluate<string>(`${box}.value`), SECOND_WORDS);
  await handBack();
  await owner.waitFor(`${box}.value === ${JSON.stringify(SECOND_WORDS + "\n\n" + TASK)}`);
  await waitFor(`patches.some(one=>one.path.endsWith('/sessions/'+${JSON.stringify(encodeURIComponent(second))}))`);
  assert.ok((await saved(second)).every(body => !String(body.draft ?? "").includes(FIRST_WORDS)), "the first session's words never reached the second one");
});

test("AC-05: switching to a session this window has not read yet shuts the box and what sets its next round at once, not at the next state read", { timeout: 90_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { command, sessionId, evaluate, waitFor, box, start, shut, owner } = opened;
  const SECOND_WORDS = "乙会话里写好的任务";
  const second = await start(SECOND_WORDS);
  await waitFor(confirmed(second, SECOND_WORDS));
  const first = await start();

  await evaluate(`hold.except=${JSON.stringify(first)};hold.what='read'`);
  const reads = await evaluate<number>("stateReads");
  // In the same task as the switch: nothing has read the page's state since.
  const buttons = await evaluate<boolean[]>(`(()=>{
    document.querySelector('${coding}').dispatchEvent(new CustomEvent('molis-work:select-item',{detail:{itemId:${JSON.stringify(second)}}}));
    return ['workspace','goal','writer-directories'].map(name=>document.querySelector('${coding} [data-coding-'+name+'-open]').disabled);})()`);
  assert.deepEqual(buttons, [true, true, true], "the buttons above the conversation, in the same task as the switch");
  // The bar's box and ＋ (materials, methods, MCP, capabilities, role, delegation) hear it over the frame bridge (one input), still
  // before any read of the page's state: what shuts them is the switch, not the next state read.
  await owner.waitFor(`document.querySelector(${JSON.stringify(CODING_COMPOSER + " [data-composer-add]")})?.disabled === true && ${box}.disabled`, 5_000);
  assert.equal(await evaluate<number>("stateReads"), reads, "no state read came between the switch and the bar shutting");
  await waitFor("hold.seen === 1 && typeof hold.release === 'function'");
  await owner.evaluate(`document.querySelector('${CODING_COMPOSER} [data-composer-add]').click()`);
  assert.equal(await owner.evaluate<boolean>(`!!document.querySelector('${CODING_COMPOSER} [data-compose-menu]:not([hidden])')`), false, "＋ does not open before the first read");
  assert.ok((await owner.evaluate<string>(`document.querySelector('${CODING_COMPOSER_STATUS}').textContent`)).includes("正在读取这个会话"), "the composer says why it waits");
  // The composer as it looks meanwhile: the box, ＋, the controls and send greyed out, the reason in its status line.
  const evidence = reviewEvidenceUrl("coding-first-read/"); await mkdir(evidence, { recursive: true });
  await writeFile(new URL("attach-menu-before-first-read.png", evidence), Buffer.from((await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId)).data, "base64"));

  await evaluate("hold.release()");
  await owner.waitFor(CODING_OPEN);
  assert.equal(await owner.evaluate<string>(`${box}.value`), SECOND_WORDS);
  assert.deepEqual(await shut(), CONTEXT.map(() => false));
});
