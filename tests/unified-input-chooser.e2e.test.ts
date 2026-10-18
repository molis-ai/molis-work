import assert from "node:assert/strict";
import test from "node:test";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// UIV-01/02/04/10/11: the Assistant on the project chooser is the same input, before entering any project.
test("UIV-01/04 项目选择页挂载统一输入，长文、项目草稿和权限失败均保持可用", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return;
  const other = await createProject(browser.web, "选择页乙项目");
  const { command, sessionId, origin, projectId, navigate, evaluate, waitFor, click, reloadPage } = browser;
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('fixture permission denied', 'NotAllowedError'); }; window.chooserErrors=[]; addEventListener('error', e=>window.chooserErrors.push(e.message));" }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor("!!document.querySelector('.chooser')");
  assert.equal(await evaluate("document.querySelector('[data-assistant-composer]').dataset.uivBound"), "1", "the delivered chooser mounts the shared input without entering a project");
  const field = "[data-assistant-input]", mic = "[data-uiv-mic]";
  const value = () => evaluate<string>(`document.querySelector('${field}').value`);
  const pick = async (id: string) => { await click(`.chooser-dir [data-id="${id}"]`); await waitFor(`document.querySelector('.chooser').dataset.selected === ${JSON.stringify(id)}`); };
  const type = async (text: string) => { await click(field); await command("Input.insertText", { text }, sessionId); };
  await pick(projectId!);
  const long = Array.from({ length: 20 }, (_, n) => `第 ${n + 1} 行：选择页草稿只属于甲项目。`).join("\n");
  await type(long);
  assert.equal(await value(), long);
  await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }, sessionId);
  assert.equal(await value(), long + "\n", "Enter adds a newline and does not send");
  await pick(other.project_id);
  assert.equal(await value(), "", "a new project's draft starts empty");
  await type("乙项目只留这一句");
  await pick(projectId!);
  await waitFor(`document.querySelector('${field}').value === ${JSON.stringify(long + "\n")}`);
  await reloadPage();
  await pick(projectId!);
  await waitFor(`document.querySelector('${field}').value === ${JSON.stringify(long + "\n")}`);
  await click(mic);
  await waitFor("document.querySelector('[data-uiv-voice-status]').textContent.includes('系统设置')");
  assert.equal(await value(), long + "\n", "permission rejection preserves the whole draft");
  await pick(other.project_id);
  assert.equal(await value(), "乙项目只留这一句");
  await pick(projectId!);
  for (const width of [1440, 390, 320]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitFor("Math.abs(parseFloat(getComputedStyle(document.body).getPropertyValue('--dock-h'))-document.querySelector('.workbench-bar').getBoundingClientRect().height)<1");
    const geometry = await evaluate<{ fieldHeight: number; scrollHeight: number; controls: Array<{ visible: boolean; hit: boolean }> }>(`(() => {
      const field=document.querySelector('${field}'); return {fieldHeight:field.clientHeight,scrollHeight:field.scrollHeight,controls:['${mic}','[data-assistant-send]'].map(selector=>{
        const button=document.querySelector(selector),r=button.getBoundingClientRect(); return {visible:r.width>=32&&r.height>=32&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,
        hit:[[.1,.1],[.9,.1],[.5,.5],[.1,.9],[.9,.9]].every(([x,y])=>button.contains(document.elementFromPoint(r.left+r.width*x,r.top+r.height*y)))};
      })}; })()`);
    assert.ok(geometry.fieldHeight > 44 && geometry.scrollHeight > geometry.fieldHeight, `${width}: long text grows then scrolls inside the field`);
    assert.ok(geometry.controls.every(c => c.visible && c.hit), `${width}: microphone and send stay visible and clickable: ${JSON.stringify(geometry)}`);
  }
  assert.deepEqual(await evaluate("window.chooserErrors"), []);
});


// UIV-01/11: ordinary input must remain a compact dock, not a permanently expanded form.
test("UIV-01/11 首页短输入保持单层紧凑底栏，只有可操作的状态占用反馈区", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return;
  const { command, sessionId, origin, navigate, evaluate, waitFor, click } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('fixture permission denied', 'NotAllowedError'); };" }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor("document.querySelector('[data-assistant-composer]')?.dataset.uivBound === '1'");
  const geometry = () => evaluate<{ height: number; border: string; shadow: string; fieldStatusVisible: boolean; fieldWidth: number; micIcon: boolean }>(`(() => {
    const form=document.querySelector('[data-assistant-composer]'),field=form.querySelector('[data-assistant-input]'),state=form.querySelector('[data-uiv-field-state]');
    const style=getComputedStyle(field);
    return {height:form.getBoundingClientRect().height,border:style.borderTopWidth,shadow:style.boxShadow,fieldWidth:field.getBoundingClientRect().width,
      fieldStatusVisible:state.getClientRects().length>0,micIcon:!!form.querySelector('[data-uiv-mic] svg')};
  })()`);
  for (const text of ['', '今天检查底栏']) {
    await evaluate(`(() => {const field=document.querySelector('[data-assistant-input]');field.value=${JSON.stringify(text)};field.dispatchEvent(new Event('input',{bubbles:true}));field.blur();})()`);
    const g=await geometry();
    assert.ok(g.height<=56, `short input stays one row, got ${JSON.stringify(g)}`);
    assert.equal(g.border,'0px','the existing composer owns the single outer edge');
    assert.equal(g.shadow,'none','the writing field has no nested focus frame');
    assert.equal(g.fieldStatusVisible,false,'empty/draft implementation states must not become extra visible rows');
    assert.ok(g.fieldWidth>=160,'compact controls leave real writing room');
    assert.equal(g.micIcon,true,'recording uses the common icon control with its accessible name');
  }
  await click('[data-uiv-mic]');
  await waitFor("document.querySelector('[data-uiv-voice-status]').textContent.includes('系统设置')");
  assert.equal(await evaluate("document.querySelector('[data-uiv-voice-status]').getClientRects().length>0"),true,'permission recovery remains visible');
  assert.equal(await evaluate("document.querySelector('[data-assistant-input]').value"),'今天检查底栏');
});
