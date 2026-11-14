import assert from "node:assert/strict";
import test from "node:test";
import { openCoding } from "./fixtures/coding-browser.js";
import { CODING_COMPOSER, CODING_OPEN, codingControl } from "./fixtures/coding-composer.js";

// specs/coding-harness-optimization/batch12-design.md §2: in a read-only way of working Coding gives the bar's one input a line above
// the box (R3 定样 A). The page sits in its frame; what crosses is plain data, and the button comes back as `composer-act` `notice`.
const NOTICE = `${CODING_COMPOSER} .mw-composer__notice`;

test("BCD-02 BCD-03: discuss, plan and review say they are read-only above the bar's box; 换成修改 switches to editing and the line goes", { timeout: 120_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { start, owner } = opened;
  await start("看看登录页的结构");
  await owner.waitFor(CODING_OPEN, 20_000);
  const intent = () => owner.evaluate<string>(`document.querySelector(${JSON.stringify(codingControl("intent"))}).value`);
  const choose = (value: string) => owner.evaluate(`(()=>{const s=document.querySelector(${JSON.stringify(codingControl("intent"))});s.value=${JSON.stringify(value)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const line = () => owner.evaluate<{ text: string; tone: string; button: boolean } | null>(`(()=>{const n=document.querySelector(${JSON.stringify(NOTICE)});
    return n?{text:n.textContent,tone:n.closest('.mw-composer').dataset.notice||'',button:Boolean(n.querySelector('[data-composer-notice]'))}:null;})()`);
  for (const mode of ["discuss", "plan", "review"]) {
    if (await intent() !== mode) await choose(mode);
    await owner.waitFor(`document.querySelector(${JSON.stringify(NOTICE)})?.textContent.includes('只读')`, 15_000);
    const seen = await line();
    assert.equal(seen?.tone, "readonly", mode); assert.ok(seen?.button, `${mode}: 换成修改 is offered`);
  }
  for (const mode of ["execute"]) {
    await choose(mode);
    await owner.waitFor(`!document.querySelector(${JSON.stringify(NOTICE)})`, 15_000);
  }
  await choose("discuss");
  await owner.waitFor(`Boolean(document.querySelector(${JSON.stringify(NOTICE + " [data-composer-notice]")}))`, 15_000);
  // The bar's button reaches the page's own `run` across the frame: the way of working becomes editing and the line goes.
  await owner.click(`${NOTICE} [data-composer-notice]`);
  await owner.waitFor(`document.querySelector(${JSON.stringify(codingControl("intent"))}).value === 'edit' && !document.querySelector(${JSON.stringify(NOTICE)})`, 15_000);
  assert.equal(await intent(), "edit");
});
