import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { openMolisWorkProjectCatalog } from '@molis-ai/molis-work-app-desktop';
import { DEMO_BOARD_ID, GoalProjectApplication } from '@molis-ai/molis-work-app-local-host';
import { openGoalBrowser } from './fixtures/goal-browser.js';

test('Reduced motion updates Goal detail geometry together with its expanded state', async t => {
  const b = await openGoalBrowser(t); if (!b) return;
  const { command, sessionId, origin, navigate, click, evaluate } = b;
  await command('Emulation.setDeviceMetricsOverride', { width: 1024, height: 400, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }, sessionId);
  await navigate(() => command('Page.navigate', { url: origin + '/goals/CORE' }, sessionId));
  await click('[data-frame-goal-work]');
  const geometry = await evaluate<{ collapsed: number; expanded: number; content: number; recollapsed: number; hidden: boolean }>(`(() => {
    const toggle = document.querySelector('[data-goal-details-toggle]');
    const aside = document.querySelector('[data-goal-details-aside]');
    const pane = aside.querySelector('[data-document-pane]');
    if (toggle.getAttribute('aria-expanded') === 'true') toggle.click();
    const collapsed = aside.getBoundingClientRect().width;
    toggle.click();
    const expanded = aside.getBoundingClientRect().width;
    const content = pane.getBoundingClientRect().width;
    toggle.click();
    return { collapsed, expanded, content, recollapsed: aside.getBoundingClientRect().width, hidden: pane.hidden };
  })()`);
  assert.equal(geometry.collapsed, 32);
  assert.ok(geometry.expanded > 200 && geometry.content > 200, 'Expanded content is immediately usable: ' + JSON.stringify(geometry));
  assert.equal(geometry.recollapsed, 32);
  assert.equal(geometry.hidden, true);
});

for (const [width,height] of [[1440,900],[1024,400],[390,640]]) {
  test(`Continuous workspace and edge editors at ${width}×${height}`, {timeout:60000}, async t=>{
    const b=await openGoalBrowser(t,true); if(!b)return;
    const {command,sessionId,navigate,origin,projectId,evaluate,click,waitFor}=b;
    const catalog=await openMolisWorkProjectCatalog({homeDirectory:b.homeDirectory});
    for(const plugin_id of ['feed','sessions']) catalog.addProjectPlugin({project_id:projectId!,plugin_id,actor_id:'surface-test'});
    catalog.close();
    const app=new GoalProjectApplication(b.store);
    const id=app.goalEvents.createIntent({board_id:DEMO_BOARD_ID,title:'让项目的下一步清晰可见',outcome:'目标、记录与执行共享一个连续工作区',actor_id:'web-user',actor_kind:'user',idempotency_key:'surface-goal'}).goal.goal_id;
    const before=app.goalEvents.readState(DEMO_BOARD_ID,id).goal_event_cursor;
    const prefix=`${origin}/projects/${projectId}`;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]},sessionId);
    const capture=async(name:string)=>{
      await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
      const dir=process.env.MOLIS_CONTENT_CAPTURE || '.impeccable/review/continuous-v11';await mkdir(dir,{recursive:true});
      const {data}=await command<{data:string}>('Page.captureScreenshot',{format:'png'},sessionId);
      await writeFile(`${dir}/${name}-${width}.png`,Buffer.from(data,'base64'));
    };
    const showDirectory=async()=>{if(width<760&&await evaluate("!document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"))await click('[data-directory-show]');};
    const openPlugin=async(plugin:string)=>{await showDirectory();await click(`[data-plugin-id="${plugin}"]`);if(width<760&&await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"))await click('[data-directory-toggle]');};
    /** Creating or picking an item is a centred modal sized to its content, not an edge sheet. */
    const checkEditor=async(selector:string)=>{
      await waitFor(`document.querySelector('${selector}').open`);
      const r=await evaluate<any>(`(()=>{const e=document.querySelector('${selector}'),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,w:r.width,h:r.height,radius:s.borderRadius,shadow:s.boxShadow}})()`);
      assert.ok(Math.abs((r.left+r.w/2)-width/2)<2,'horizontally centred');
      assert.ok(Math.abs((r.top+r.h/2)-height/2)<2,'vertically centred');
      assert.ok(r.top>=0&&r.bottom<=height,'inside the viewport');
      assert.ok(r.h<height,'sized to content, not the full viewport');
      assert.notEqual(r.radius,'0px');assert.notEqual(r.shadow,'none');
    };
    await navigate(()=>command('Page.navigate',{url:prefix+'/goals/'+id},sessionId));
    await waitFor("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width>0");
    await capture('goal-frame');
    await click('[data-frame-empty] [data-frame-add-content]');
    await checkEditor('[data-frame-picker]');await capture('frame-picker');
    await click('[data-frame-picker] footer [data-frame-picker-close]');
    // Creating a Goal starts from the Goals surface: an open Goal pools that directory chrome away.
    await openPlugin('goals');
    // Returning from a Goal used to leave data-expanded set with nothing expanded, which hid this
    // whole toolbar; the canvas now asks whether a Goal actually covers it.
    await waitFor("(()=>{const b=document.querySelector('[data-open-create]');return b && getComputedStyle(b).visibility === 'visible' && b.getBoundingClientRect().width > 0})()");
    await click('[data-open-create]');
    await checkEditor('[data-create-dialog]');await capture('goal-create');
    const inner=await evaluate<any>("(()=>{const s=getComputedStyle(document.querySelector('[data-create-form]'));return {radius:s.borderRadius,shadow:s.boxShadow,border:s.borderTopWidth}})()");
    assert.deepEqual(inner,{radius:'0px',shadow:'none',border:'0px'},'the modal carries the frame; its form stays one continuous surface');
    const compactHeight=width>760?400:500;
    await command('Emulation.setDeviceMetricsOverride',{width,height:compactHeight,deviceScaleFactor:1,mobile:false},sessionId);
    await click('[data-create-dialog] .form-disclosure > summary');
    const createLayout=()=>evaluate<any>("(()=>{const f=document.querySelector('[data-create-form]'),b=f.querySelector('.dialog-body'),h=f.querySelector('header').getBoundingClientRect(),r=f.querySelector('footer').getBoundingClientRect(),q=b.getBoundingClientRect();return {header:h.bottom,footer:r.top,bottom:r.bottom,x:q.x+20,y:q.y+20,bodyHeight:b.clientHeight,bodyScroll:b.scrollHeight}})()");
    const compact=await createLayout();assert.ok(compact.bodyScroll>compact.bodyHeight&&compact.bodyHeight>60);
    await command('Input.dispatchMouseEvent',{type:'mouseWheel',x:compact.x,y:compact.y,deltaX:0,deltaY:420},sessionId);
    await waitFor("document.querySelector('[data-create-dialog] .dialog-body').scrollTop>0");
    const scrolled=await createLayout();assert.equal(scrolled.header,compact.header);assert.equal(scrolled.footer,compact.footer);assert.ok(scrolled.bottom<=compactHeight);
    await capture('goal-create-expanded-low');
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false},sessionId);
    await click('[data-create-dialog] footer [data-close-create]');
    if(width<760&&await evaluate("document.querySelector('[data-workspace]').classList.contains('is-directory-drawer-open')"))await click('[data-directory-toggle]');
    await navigate(()=>command('Page.navigate',{url:prefix+'/goals/'+id},sessionId));
    await waitFor("document.querySelector('[data-frame-goal-work]')?.getBoundingClientRect().width>0");
    await click('[data-frame-goal-work]');
    await waitFor("!document.querySelector('[data-goal-node-workspace]').hidden");
    const fillsPane=await evaluate<any>(`(()=>{const e=document.querySelector('[data-goal-node-workspace]'),r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect(),s=getComputedStyle(e),list=document.querySelector('[data-goal-stage-list]'),listBox=list?.getBoundingClientRect(),listShown=${width}>=761 && getComputedStyle(list||document.body).display==='block' && listBox && listBox.width>0;return {gap:[r.top-p.top,p.bottom-r.bottom,r.left-p.left,p.right-r.right],radius:s.borderRadius,shadow:s.boxShadow,listWidth:listShown?Math.round(listBox.width):0}})()`);
    if (width >= 761) {
      assert.ok(Math.abs(fillsPane.gap[0]) < 1 && Math.abs(fillsPane.gap[1]) < 1 && Math.abs(fillsPane.gap[3]) < 1);
      assert.ok(Math.abs(fillsPane.gap[2] - fillsPane.listWidth) <= 2, "Workspace sits beside the list rail " + JSON.stringify(fillsPane));
      const toolbar = await evaluate<{bottom:number;listTop:number;right:number;railRight:number}>("(() => { const t=document.querySelector('[data-goal-stage-chrome]').getBoundingClientRect(),l=document.querySelector('.goal-stage-list').getBoundingClientRect(); return {bottom:t.bottom,listTop:l.top,right:t.right,railRight:l.right}; })()");
      assert.ok(toolbar.bottom <= toolbar.listTop && toolbar.right <= toolbar.railRight, 'Toolbar remains above its list and inside its rail: ' + JSON.stringify(toolbar));
    } else {
      assert.deepEqual(fillsPane.gap,[0,0,0,0]);
    }
    assert.equal(fillsPane.radius,'0px');assert.equal(fillsPane.shadow,'none');
    if(await evaluate("document.querySelector('[data-goal-details-toggle]').getAttribute('aria-expanded')==='false'"))await click('[data-goal-details-toggle]');
    await click('[data-record-menu] > summary');await click('[data-record-menu] [data-event-form-open=note]');
    await waitFor("document.activeElement.name==='note'");
    await command('Input.insertText',{text:'让内容接上工作区，阅读和操作留在原处。'},sessionId);
    await capture('goal-note');
    await evaluate("localStorage.setItem('molis-work:theme','dark');dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'dark'}))");
    await capture('goal-note-dark');
    await click('[data-event-form=note] footer [data-event-back]');
    await click('[data-goal-collapse]');
    await waitFor("document.querySelector('[data-goal-frame-surface]')?.hidden===false");
    assert.ok(await evaluate<number>("document.querySelector('[data-titlebar-tabs]').getBoundingClientRect().height")>0);
    await evaluate("localStorage.setItem('molis-work:theme','light');dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'light'}))");
    await openPlugin('feed');await capture('feed');
    await click('[data-feed-add-toggle]');
    await checkEditor('[data-feed-sources-dialog]');await click('[data-feed-choose-kind=custom_rss]');await capture('feed-editor');
    const focusEvidence=[];
    for(const theme of ['light','dark']){
      await evaluate(`localStorage.setItem('molis-work:theme','${theme}');dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${theme}'}))`);
      await evaluate("document.querySelector('[data-feed-source-value=custom_rss]').focus()");
      for(const kind of ['input','select']){
        if(kind==='select'){
          await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sessionId);
          await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9},sessionId);
        }
        const focus=await evaluate<any>(`(()=>{const e=document.activeElement,s=getComputedStyle(e),bg=getComputedStyle(e.closest('dialog')).backgroundColor,c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d');x.fillStyle=bg;x.fillRect(0,0,1,1);const a=[...x.getImageData(0,0,1,1).data];x.fillStyle=s.outlineColor;x.fillRect(0,0,1,1);const b=[...x.getImageData(0,0,1,1).data];const lum=v=>v.slice(0,3).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((t,n,i)=>t+n*[.2126,.7152,.0722][i],0),l=lum(a),m=lum(b);return {tag:e.tagName,visible:e.matches(':focus-visible'),outline:s.outline,shadow:s.boxShadow,contrast:(Math.max(l,m)+.05)/(Math.min(l,m)+.05)}})()`);
        assert.equal(focus.tag,kind==='select'?'BUTTON':'INPUT');assert.equal(focus.visible,true);assert.match(focus.outline,/solid 1px/);assert.equal(focus.shadow,'none');assert.ok(focus.contrast>=3,JSON.stringify(focus));
        if(kind==='select') assert.equal(await evaluate("document.activeElement.matches('[data-mw-select-trigger]')"),true);
        focusEvidence.push({theme,kind,...focus});
      }
      await evaluate("document.querySelector('[data-feed-source-value=custom_rss]').focus()");
      if(theme==='dark')await capture('feed-editor-dark');
    }
    await writeFile(`${process.env.MOLIS_CONTENT_CAPTURE || '.impeccable/review/continuous-v11'}/feed-focus-${width}.json`,JSON.stringify(focusEvidence,null,2));
    await evaluate("localStorage.setItem('molis-work:theme','light');dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'light'}))");
    await click('[data-feed-sources-dialog] footer [data-feed-sources-close]');
    await openPlugin('sessions');
    await click('[data-work-surface=sessions] [data-open-session-add]');
    await checkEditor('[data-session-add-dialog]');await click('[data-session-add-toggle]');await capture('session-editor');
    await click('[data-session-add-form] > footer [data-dialog-close]');
    await navigate(()=>command('Page.navigate',{url:prefix+'/settings/general'},sessionId));await capture('settings');
    assert.equal(await evaluate('document.scrollingElement.scrollHeight<=innerHeight+1'),true);
    assert.equal(app.goalEvents.readState(DEMO_BOARD_ID,id).goal_event_cursor,before,'cancelled note is not written');
  });
}
