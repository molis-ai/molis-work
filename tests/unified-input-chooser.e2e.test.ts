import assert from "node:assert/strict";
import test from "node:test";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openWork, seedWork, sendBrowser } from "./fixtures/assistant-send-journey.js";

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
  const pick = async (id: string) => {
    await waitFor("(() => {const bar=document.querySelector('.workbench-bar').getBoundingClientRect(),center=document.querySelector('.bar-center').getBoundingClientRect();return Math.abs(parseFloat(document.body.style.getPropertyValue('--uiv-dock-height'))-Math.max(bar.height,bar.bottom-center.top+6))<1;})()");
    await click(`.chooser-dir [data-id="${id}"]`); await waitFor(`document.querySelector('.chooser').dataset.selected === ${JSON.stringify(id)}`); };
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

// UIV-01/02/11: user acceptance requires a fixed dock; only the composer grows upward.
test("UIV-01/11 多行正文向上展开，底栏左右入口和操作行位置不变", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t);
  if (!browser) return;
  const { command, sessionId, click, evaluate, waitFor, navigate, origin, projectId } = browser;
  await openWork(browser, await seedWork(browser, "底栏向上展开复验"));
  const geometry = () => evaluate<{ dock:number; bottom:number; top:number; fieldWidth:number; formWidth:number; fieldHeight:number; scrollHeight:number; fieldBottom:number; actionTop:number; targetVisible:boolean; fixed:number[]; reachable:boolean }>(`(() => {
    const form=document.querySelector('[data-assistant-composer]'),field=form.querySelector('[data-assistant-input]'),r=field.getBoundingClientRect(),f=form.getBoundingClientRect();
    const actions=['[data-assistant-attach]','[data-uiv-mic]','[data-assistant-send]'].map(s=>form.querySelector(s));
    const fixed=[...document.querySelectorAll('.workbench-bar > .bar-start,.workbench-bar > .bar-end'),...actions];
    return {dock:document.querySelector('.workbench-bar').getBoundingClientRect().height,bottom:f.bottom,top:f.top,fieldWidth:r.width,formWidth:f.width,
      fieldHeight:field.clientHeight,scrollHeight:field.scrollHeight,fieldBottom:r.bottom,actionTop:Math.min(...actions.map(b=>b.getBoundingClientRect().top)),
      targetVisible:!!form.querySelector('[data-assistant-target-wrap]').getClientRects().length,
      fixed:fixed.flatMap(b=>{const x=b.getBoundingClientRect();return [x.top,x.bottom];}),
      reachable:actions.every(b=>{const x=b.getBoundingClientRect();return x.bottom<=innerHeight&&x.right<=innerWidth&&b.contains(document.elementFromPoint(x.left+x.width/2,x.top+x.height/2));})};
  })()`);
  const type = async (text:string) => {
    await click('[data-assistant-input]');
    await evaluate("document.querySelector('[data-assistant-input]').select()");
    if (text) await command('Input.insertText',{text},sessionId);
    else {
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);
      await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8},sessionId);
    }
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  };
  for (const path of ['/',`/projects/${projectId}/`]) {
    await navigate(()=>command('Page.navigate',{url:origin+path},sessionId));
    await waitFor("document.querySelector('[data-assistant-composer]')?.dataset.uivBound==='1'");
    if (await evaluate("!document.querySelector('[data-assistant-panel]').hidden")) await click('[data-assistant-panel-close]');
    for (const [width,height] of [[1440,900],[1180,760],[640,393],[390,844],[320,640]]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
      await type('');
      const base=await geometry();
      for (const text of ['1\nd','发动机是不会\n等会\n大家那你\n几点睡觉那是的\n',Array(30).fill('长文保持可编辑，不影响左右入口的位置。').join('\n'),'']) {
        await type(text);
        const g=await geometry(),label=`${path} ${width}x${height}: ${JSON.stringify(g)}`;
        assert.ok(Math.abs(g.dock-base.dock)<1,`dock height stays fixed: ${label}`);
        assert.ok(Math.abs(g.bottom-base.bottom)<1,`composer grows upward from the same bottom: ${label}`);
        assert.ok(g.fixed.every((v,i)=>Math.abs(v-base.fixed[i]!)<1),`side entrances and actions stay anchored: ${label}`);
        assert.ok(g.reachable,`every action stays clickable: ${label}`);
        if (width>=1180) assert.ok(g.targetVisible,'continuation target stays available');
        if (text) {
          assert.ok(g.top<base.top,`only the composer extends upward: ${label}`);
          assert.ok(g.fieldWidth>=g.formWidth*.85,`multiline writing uses the full surface: ${label}`);
          assert.ok(g.fieldBottom<=g.actionTop,`context and controls stay below the text: ${label}`);
          if (text==='1\nd') assert.equal(g.fieldHeight,g.scrollHeight,'two lines remain readable');
        } else assert.ok(Math.abs(g.top-base.top)<1,'clearing returns to the compact form');
      }
    }
  }
});
