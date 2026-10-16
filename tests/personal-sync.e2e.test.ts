import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openGoalBrowser} from './fixtures/goal-browser.js';

test('sync settings: local space stays off and narrow layout remains usable',{timeout:60000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));
  await b.waitFor("document.querySelector('[data-sync-status]')?.textContent.includes('本地空间')");
  assert.equal(await b.evaluate("document.querySelector('[data-sync-form]').hidden"),true);
  await mkdir('.impeccable/qa/review',{recursive:true});
  for(const width of [1440,390]){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},b.sessionId);
    assert.equal(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
    const shot=await b.command<{data:string}>('Page.captureScreenshot',{format:'png'},b.sessionId);
    await writeFile('.impeccable/qa/review/personal-sync-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
});

test('sync settings: failed save retains selection and retry saves it',{timeout:60000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window);
    const selection={plugin_id:'io.molis.work.pages',publisher_id:'molis',publisher_signature:'official-pages-binding',collection_id:'documents',schema_version:1};
    let policy={spaceId:'synthetic-only',revision:0,selections:[]};
    window.fetch=async(url,init)=>{
      if(!new URL(String(url),location.href).pathname.startsWith('/api/sync'))return original(url,init);
      if(String(url).endsWith('/policy')){
        if(window.failSyncSave)return Response.json({error:'synthetic save failure'},{status:503});
        policy={...JSON.parse(init.body),revision:policy.revision+1};window.savedSyncPolicy=policy;
      }
      const extra=[['goals','project_goals','目标、关系与工作记录'],['artifacts','versions','成果及固定版本'],['form','forms','问卷与答卷'],['dataset','datasets','数据表与保存版本'],['ppt','presentations','演示稿'],['lingguang','ideas','灵光与对话']].map(([id,collection_id,title])=>({selection:{plugin_id:'io.molis.work.'+id,publisher_id:'molis',publisher_signature:'official-'+id+'-binding',collection_id,schema_version:1},title,pending:0,conflicts:[]}));
      return Response.json({available:true,policy,running:false,error:null,lastSuccess:null,collections:[{selection,title:'文档与文件夹',pending:0,conflicts:[]},...extra],unavailable:[]});
    };
  })();`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));
  await b.waitFor("document.querySelector('[data-sync-fields] input')");
  assert.equal(await b.evaluate("document.querySelectorAll('[data-sync-fields] input').length"),7);
  assert.equal(await b.evaluate("document.querySelector('[data-sync-fields]').textContent.includes('目标、关系与工作记录')"),true);
  await b.click('[data-sync-fields] input');
  await b.evaluate('window.failSyncSave=true');
  await b.click('[data-sync-form] button[type=submit]');
  await b.waitFor("!document.querySelector('[data-sync-error]').hidden");
  assert.equal(await b.evaluate("document.querySelector('[data-sync-fields] input').checked"),true);
  await b.evaluate('window.failSyncSave=false');
  await b.click('[data-sync-retry]');
  await b.waitFor('window.savedSyncPolicy?.selections.length===1');
  assert.equal(await b.evaluate("document.querySelector('[data-sync-error]').hidden"),true);
  await mkdir('.impeccable/qa/review',{recursive:true});
  for(const [width,theme] of [[1440,'light'],[390,'dark']] as const){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},b.sessionId);
    await b.evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(theme)});dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(theme)}}));document.querySelector('[data-sync-settings]').scrollIntoView({block:'start'})`);
    assert.equal(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
    const shot=await b.command<{data:string}>('Page.captureScreenshot',{format:'png'},b.sessionId);
    await writeFile('.impeccable/qa/review/plugin-sync-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
});

test('waiting linked assets offers retry, not destructive conflict choices',{timeout:60000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window);let waiting=true;
    const selection={plugin_id:'io.molis.work.pages',publisher_id:'molis',publisher_signature:'official-pages-binding',collection_id:'documents',schema_version:1};
    window.fetch=async(url,init)=>{
      if(!new URL(String(url),location.href).pathname.startsWith('/api/sync'))return original(url,init);
      if(String(url).endsWith('/run'))waiting=false;
      return Response.json({available:true,policy:{spaceId:'synthetic-only',revision:1,selections:[selection]},running:false,error:null,lastSuccess:null,collections:[{selection,title:'文档与文件夹',pending:0,conflicts:waiting?[{key:'["project","document","page"]',reason:'关联成果版本尚未到达',waiting:true}]:[]}],unavailable:[]});
    };
  })();`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));
  await b.waitFor("document.querySelector('[data-sync-conflicts] h2')?.textContent==='等待关联资产'");
  assert.equal(await b.evaluate("[...document.querySelectorAll('[data-sync-conflicts] button')].map(b=>b.textContent).join(',')"),'重试同步');
  await mkdir('.impeccable/qa/review',{recursive:true});
  for(const [width,theme] of [[1440,'light'],[390,'dark']] as const){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},b.sessionId);
    await b.evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(theme)});dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(theme)}}))`);
    await b.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert.equal(await b.evaluate('document.documentElement.scrollWidth <= innerWidth'),true);
    const shot=await b.command<{data:string}>('Page.captureScreenshot',{format:'png'},b.sessionId);
    await writeFile('.impeccable/qa/review/linked-sync-'+width+'.png',Buffer.from(shot.data,'base64'));
  }
  await b.click('[data-sync-conflicts] button');await b.waitFor("document.querySelector('[data-sync-conflicts]').children.length===0");
});
