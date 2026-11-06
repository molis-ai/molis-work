import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openGoalBrowser} from './fixtures/goal-browser.js';

test('PCSYNC-02 new-device consent is accessible, retains errors and saves only an explicit choice',{timeout:90000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`{
    const original=window.fetch.bind(window);let automatic=null;
    window.syncDeviceWrites=0;window.failSyncDevice=true;
    window.fetch=async(input,init)=>{
      const path=new URL(String(input),location.href).pathname;
      if(path==='/api/personal/status')return Response.json({configured:true,identity:{userId:'test-alice'},space:'account'});
      if(path==='/api/sync/device'){
        window.syncDeviceWrites++;
        if(window.failSyncDevice)return Response.json({error:'synthetic device failure'},{status:503});
        automatic=JSON.parse(init.body).automatic;
      }else if(path!=='/api/sync')return original(input,init);
      return Response.json({available:true,device:{automatic}});
    };
  }`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/projects/'+b.projectId+'/'},b.sessionId));
  await b.waitFor("document.querySelector('[data-sync-consent]')?.open");
  assert.equal(await b.evaluate('window.syncDeviceWrites'),0,'opening the page is not consent');
  assert.equal(await b.evaluate("document.activeElement?.textContent"),'暂不启用');
  await mkdir('.impeccable/qa/review',{recursive:true});
  for(const [width,theme] of [[1440,'light'],[1024,'dark'],[390,'dark']] as const){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},b.sessionId);
    await b.evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(theme)});dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(theme)}}))`);
    assert.equal(await b.evaluate("(()=>{const r=document.querySelector('[data-sync-consent]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"),true);
    const shot=await b.command<{data:string}>('Page.captureScreenshot',{format:'png'},b.sessionId);
    await writeFile('.impeccable/qa/review/sync-consent-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
  await b.click('[data-sync-consent] button');
  await b.waitFor("!document.querySelector('[data-sync-consent] [role=alert]').hidden");
  assert.equal(await b.evaluate("document.querySelector('[data-sync-consent]').open"),true);
  await b.evaluate('window.failSyncDevice=false');
  await b.command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},b.sessionId);
  await b.command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27},b.sessionId);
  await b.waitFor("!document.querySelector('[data-sync-consent]')");
  await b.evaluate("dispatchEvent(new Event('focus'))");
  await b.waitFor('window.syncDeviceWrites===2');
  assert.equal(await b.evaluate("!!document.querySelector('[data-sync-consent]')"),false);
});
