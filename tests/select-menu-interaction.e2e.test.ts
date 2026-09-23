import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { PRIMITIVE_STYLES, SELECT_MENU_CLIENT_SCRIPT, renderIconSprite } from "@molis-ai/molis-work-design-system";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

async function openSelectPage(t: TestContext, html: string, width = 1024, height = 700) {
  const browser = await openGoalBrowser(t);
  if (!browser) return null;
  const { command, sessionId, evaluate, waitFor } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  // Run the package's production enhancer against controlled form inputs. No copy of its logic is under test.
  await evaluate(`document.head.innerHTML = '<style>' + ${JSON.stringify(PRIMITIVE_STYLES)} + '</style>';
    document.body.innerHTML = ${JSON.stringify(renderIconSprite() + html)};
    document.body.style.cssText = 'margin:0;padding:24px;box-sizing:border-box;font:14px sans-serif;--paper:#fff;--ink:#222;--muted:#666;--faint:#777;--hairline:#ddd;--control-border:#ddd;--nav-hover:#eee';
    window.selectErrors = []; addEventListener('error', event => window.selectErrors.push(event.message));
    ${SELECT_MENU_CLIENT_SCRIPT}`);
  await waitFor("document.querySelector('[data-mw-select-trigger]')");
  const key = async (key: string, code: number, modifiers = 0) => {
    await command("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code, modifiers, ...(key === "Enter" ? { text: "\r", unmodifiedText: "\r" } : {}) }, sessionId);
    await command("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code, modifiers }, sessionId);
  };
  const accessibleName = async (selector: string) => {
    const { root } = await command<{ root: { nodeId: number } }>("DOM.getDocument", {}, sessionId);
    const { nodeId } = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector }, sessionId);
    const { nodes } = await command<{ nodes: { ignored: boolean; name?: { value: string } }[] }>("Accessibility.getPartialAXTree", { nodeId, fetchRelatives: false }, sessionId);
    return nodes.find(node => !node.ignored)?.name?.value;
  };
  return { ...browser, key, accessibleName };
}

test("select keeps wrapping and external labels, validation focus and live field state", { timeout: 60_000 }, async t => {
  const b = await openSelectPage(t, `<form id="settings">
    <label id="wrapped"><span id="kind-label">方法类型</span><select id="kind" name="kind" required aria-describedby="kind-hint"><option value="">请选择</option><option value="work">工作类型</option><option value="custom">自定义</option></select></label>
    <small id="kind-hint">按使用场景分类</small><small id="kind-error">请选择方法类型</small>
    <label id="external" for="direction">准确方向</label><select id="direction" name="direction"><option value="out">当前目标提供结果</option><option value="in">另一个目标提供结果</option></select>
    <button type="submit" id="save">保存</button>
  </form>`);
  if (!b) return;
  const { evaluate, waitFor, click, key, accessibleName } = b;
  const trigger = "#kind + [data-mw-select-trigger]";
  assert.equal(await accessibleName(trigger), "方法类型 请选择");
  assert.equal(await accessibleName("#direction + [data-mw-select-trigger]"), "准确方向 当前目标提供结果");
  await click("#kind-label");
  await waitFor("document.querySelector('#kind').closest('[data-mw-select-picker]').querySelector('[role=listbox]').matches(':popover-open')");
  assert.equal(await accessibleName(trigger), "方法类型 请选择", "opening the menu does not add all options to the field name");
  await key("Escape", 27);
  assert.equal(await evaluate("document.activeElement === document.querySelector('#kind + [data-mw-select-trigger]')"), true);
  await click("#external");
  await waitFor("document.querySelector('#direction').closest('[data-mw-select-picker]').querySelector('[role=listbox]').matches(':popover-open')");
  await key("Escape", 27);

  await evaluate("window.submits = 0; document.querySelector('form').addEventListener('submit', event => { event.preventDefault(); window.submits++; });");
  await click("#save");
  assert.equal(await evaluate("window.submits"), 0, "native required validation still prevents a write");
  assert.equal(await evaluate("document.activeElement === document.querySelector('#kind + [data-mw-select-trigger]')"), true, "invalid hidden select sends focus to its visible control");
  assert.equal(await evaluate("document.activeElement.getAttribute('aria-invalid')"), "true");
  await key("ArrowDown", 40);
  await key("ArrowDown", 40);
  await key("Enter", 13);
  assert.deepEqual(await evaluate("({value:document.querySelector('#kind').value, focus:document.activeElement === document.querySelector('#kind + [data-mw-select-trigger]'), invalid:document.activeElement.getAttribute('aria-invalid')})"), { value: "work", focus: true, invalid: null });
  assert.equal(await accessibleName(trigger), "方法类型 工作类型");
  await click("#save");
  assert.equal(await evaluate("window.submits"), 1);
  assert.equal(await evaluate("new FormData(document.querySelector('form')).get('kind')"), "work");

  await evaluate("{ const select = document.querySelector('#kind'); select.setAttribute('aria-invalid', 'true'); select.setAttribute('aria-errormessage', 'kind-error'); select.setAttribute('aria-describedby', 'kind-hint kind-error'); select.required = false; select.disabled = true; }");
  await waitFor("document.querySelector('#kind + [data-mw-select-trigger]').disabled");
  assert.deepEqual(await evaluate("(() => { const t=document.querySelector('#kind + [data-mw-select-trigger]'); return { invalid:t.getAttribute('aria-invalid'), required:t.getAttribute('aria-required'), description:t.getAttribute('aria-describedby'), error:t.getAttribute('aria-errormessage')}; })()"), { invalid: "true", required: "false", description: "kind-hint kind-error", error: "kind-error" });
  await evaluate("{ const select = document.querySelector('#kind'); select.disabled = false; select.removeAttribute('aria-invalid'); select.removeAttribute('aria-describedby'); select.removeAttribute('aria-errormessage'); }");
  await waitFor("!document.querySelector('#kind + [data-mw-select-trigger]').disabled");
  await evaluate("document.querySelector('#kind').focus({preventScroll:true})");
  assert.equal(await evaluate("document.activeElement === document.querySelector('#kind + [data-mw-select-trigger]')"), true, "existing business focus calls target the enhanced control");
  assert.deepEqual(await evaluate("['aria-invalid','aria-describedby','aria-errormessage'].map(name=>document.activeElement.getAttribute(name))"), [null, null, null]);
});

test("select mouse and keyboard skip disabled groups, close predictably and reset without changing submitted state", { timeout: 60_000 }, async t => {
  const b = await openSelectPage(t, `<form id="settings"><input id="before" aria-label="前一项">
    <label>来源<select id="source" name="source"><option value="a" selected>全部来源</option><optgroup label="未连接" disabled><option value="blocked">未连接账号</option></optgroup><option value="disabled" disabled>暂停来源</option><option value="b">公开订阅</option><option value="c">网页查询</option></select></label>
    <input id="after" aria-label="下一项"><button id="reset" type="reset">重置</button></form>`);
  if (!b) return;
  const { evaluate, waitFor, click, key } = b;
  const trigger = "#source + [data-mw-select-trigger]";
  await evaluate("window.changes = []; document.querySelector('#source').addEventListener('change', event => window.changes.push(event.target.value));");
  await click(trigger);
  assert.equal(await evaluate("document.querySelector('[data-value=blocked]').disabled"), true);
  await key("ArrowDown", 40);
  assert.equal(await evaluate("document.activeElement.dataset.value"), "b");
  await key("Enter", 13);
  assert.deepEqual(await evaluate("({value:document.querySelector('#source').value,changes:window.changes,focus:document.activeElement===document.querySelector('#source + [data-mw-select-trigger]')})"), { value: "b", changes: ["b"], focus: true });
  await click(trigger);
  await click("[data-value=c]");
  assert.equal(await evaluate("new FormData(document.querySelector('form')).get('source')"), "c");
  assert.equal(await evaluate("document.activeElement === document.querySelector('#source + [data-mw-select-trigger]')"), true);
  await key("ArrowDown", 40);
  await key("Home", 36);
  await key("Tab", 9);
  assert.equal(await evaluate("document.activeElement.id"), "after");
  assert.equal(await evaluate("document.querySelector('[role=listbox]').matches(':popover-open')"), false);
  assert.equal(await evaluate("document.querySelector('#source').value"), "c", "Tab does not commit a merely focused option");
  await evaluate("document.querySelector('#source').focus()");
  await key("ArrowUp", 38);
  await key("Tab", 9, 8);
  assert.equal(await evaluate("document.activeElement.id"), "before");
  await click(trigger);
  await key("Home", 36);
  await key("Escape", 27);
  assert.equal(await evaluate("document.querySelector('#source').value"), "c");
  assert.equal(await evaluate("document.activeElement === document.querySelector('#source + [data-mw-select-trigger]')"), true);

  await click("#reset");
  await waitFor("document.querySelector('#source + [data-mw-select-trigger]').textContent === '全部来源'");
  assert.deepEqual(await evaluate("({value:new FormData(document.querySelector('form')).get('source'),changes:window.changes})"), { value: "a", changes: ["b", "c"] });
  await evaluate("document.querySelector('#source').selectedIndex = 4");
  assert.equal(await evaluate("document.querySelector('#source + [data-mw-select-trigger]').textContent"), "网页查询");
  await click(trigger);
  await evaluate("document.querySelector('#source').setAttribute('aria-invalid','true')");
  await waitFor("document.querySelector('#source + [data-mw-select-trigger]').getAttribute('aria-invalid') === 'true'");
  assert.equal(await evaluate("document.activeElement.dataset.value"), "c", "field status changes do not replace the focused option");
  await evaluate("document.querySelector('optgroup').disabled = false");
  await waitFor("!document.querySelector('[data-value=blocked]').disabled");
  await key("Home", 36);
  await key("ArrowDown", 40);
  await key("Enter", 13);
  assert.equal(await evaluate("new FormData(document.querySelector('form')).get('source')"), "blocked");
});

test("select menu stays anchored and inside a narrow low viewport during scroll and resize", { timeout: 60_000 }, async t => {
  const options = Array.from({ length: 20 }, (_, index) => `<option value="${index}">来源 ${index} · 用于核对窄屏边缘的长名称</option>`).join("");
  const b = await openSelectPage(t, `<div id="scroller" style="height:260px;overflow:auto"><div style="height:130px"></div><label style="display:block;width:600px">来源<select id="source">${options}</select></label><div style="height:500px"></div></div>`, 390, 340);
  if (!b) return;
  const { evaluate, click, waitFor, command, sessionId, key } = b;
  const bounds = () => evaluate<{ left: number; right: number; top: number; bottom: number; height: number; scroll: number; triggerTop: number; triggerBottom: number }>("(() => { const menu=document.querySelector('[role=listbox]'); const r=menu.getBoundingClientRect(); const t=document.querySelector('[data-mw-select-trigger]').getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:menu.clientHeight,scroll:menu.scrollHeight,triggerTop:t.top,triggerBottom:t.bottom}; })()");
  await click("[data-mw-select-trigger]");
  let box = await bounds();
  assert.ok(box.left >= 8 && box.right <= 382 && box.top >= 8 && box.bottom <= 332, JSON.stringify(box));
  assert.ok(box.scroll > box.height, "long menus scroll internally");
  const touch = await evaluate<{ trigger: number; option: number; triggerFont: number; optionFont: number }>("(() => { const trigger=document.querySelector('[data-mw-select-trigger]'); const option=document.querySelector('[data-mw-select-option]'); return {trigger:trigger.getBoundingClientRect().height,option:option.getBoundingClientRect().height,triggerFont:parseFloat(getComputedStyle(trigger).fontSize),optionFont:parseFloat(getComputedStyle(option).fontSize)}; })()");
  assert.ok(touch.trigger >= 44 && touch.option >= 44 && touch.triggerFont >= 16 && touch.optionFont >= 14, JSON.stringify(touch));
  await evaluate("document.querySelector('#scroller').scrollTop = 70");
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  box = await bounds();
  assert.ok(Math.min(Math.abs(box.top - box.triggerBottom - 4), Math.abs(box.bottom - box.triggerTop + 4)) < 2, JSON.stringify(box));
  assert.ok(box.top >= 8 && box.bottom <= 332, JSON.stringify(box));
  await command("Emulation.setDeviceMetricsOverride", { width: 320, height: 280, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("innerWidth === 320 && document.querySelector('[role=listbox]').getBoundingClientRect().right <= 312");
  box = await bounds();
  assert.ok(box.left >= 8 && box.right <= 312 && box.top >= 8 && box.bottom <= 272, JSON.stringify(box));
  await key("End", 35);
  await key("Enter", 13);
  assert.equal(await evaluate("document.querySelector('#source').value"), "19");
  assert.equal(await evaluate("document.activeElement === document.querySelector('[data-mw-select-trigger]')"), true);
  assert.deepEqual(await evaluate("window.selectErrors"), []);
});
