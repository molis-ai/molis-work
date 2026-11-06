import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openGoalBrowser} from './fixtures/goal-browser.js';

test('PCSYNC-27 sync progress distinguishes unfinished work from a past successful connection',{timeout:60000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window),selection={plugin_id:'io.example.notes',publisher_id:'example',publisher_signature:'fixed',collection_id:'notes',schema_version:1};
    window.syncProgress={selected:1,pending:2,conflicts:1,waiting:1,failures:1,unavailable:1,complete:false};
    window.fetch=async(url,init)=>{
      if(new URL(String(url),location.href).pathname!=='/api/sync')return original(url,init);
      if(window.failSyncStatus)return Response.json({error:'synthetic status unavailable'},{status:503});
      return Response.json({available:true,device:{automatic:false},policy:{spaceId:'progress-space',revision:1,selections:[selection]},running:false,error:null,lastSuccess:'2026-10-19T00:00:00.000Z',progress:window.syncProgress,collections:[{selection,title:'文档与文件夹',pending:2,conflicts:[],failures:[]}],unavailable:[]});
    };
  })();`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));
  await b.waitFor("document.querySelector('[data-sync-status]')?.textContent.includes('不可用集合 1')");
  const text=await b.evaluate<string>("document.querySelector('[data-sync-status]').textContent");
  for(const label of ['同步尚未完成','待上传 2','冲突 1','等待关联资产 1','需要处理的资产 1','不可用集合 1','上次完成'])assert.ok(text.includes(label),label);
  assert.equal(await b.evaluate("document.querySelector('[data-sync-status]').dataset.syncComplete"),'false');
  await mkdir('.impeccable/qa/review',{recursive:true});
  for(const width of [1440,1024,390])for(const theme of ['light','dark']){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},b.sessionId);
    await b.evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(theme)});dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(theme)}}));document.querySelector('[data-sync-settings]').scrollIntoView({block:'start'})`);
    await b.waitFor(`document.documentElement.dataset.resolvedTheme===${JSON.stringify(theme)}`);
    assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    const shot=await b.command<{data:string}>('Page.captureScreenshot',{format:'png'},b.sessionId);await writeFile('.impeccable/qa/review/sync-progress-'+width+'-'+theme+'.png',Buffer.from(shot.data,'base64'));
  }
  await b.evaluate("window.syncProgress={selected:1,pending:0,conflicts:0,waiting:0,failures:0,unavailable:0,complete:true}");
  await b.click('[data-sync-reload]');await b.waitFor("document.querySelector('[data-sync-status]').dataset.syncComplete==='true'");
  assert.ok((await b.evaluate<string>("document.querySelector('[data-sync-status]').textContent")).includes('所选内容已同步至上次检查'));
  await b.evaluate('window.failSyncStatus=true');await b.click('[data-sync-reload]');
  await b.waitFor("!document.querySelector('[data-sync-error]').hidden");
  assert.equal(await b.evaluate("document.querySelector('[data-sync-status]').dataset.syncComplete"),'false','a failed status refresh must remove the old completed claim');
  assert.equal(await b.evaluate("document.querySelector('[data-sync-status]').textContent"),'同步暂时不可用');
});

test('sync settings: local space stays off and narrow layout remains usable',{timeout:60000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));
  await b.waitFor("document.querySelector('[data-sync-status]')?.textContent.includes('本地空间')");
  assert.equal(await b.evaluate("document.querySelector('[data-sync-form]').hidden"),true);
  assert.equal(await b.evaluate("document.querySelector('[data-sync-tools]').hidden"),true,'local space exposes no cloud trash controls');
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
    let policy={spaceId:'synthetic-only',revision:0,selections:[]},automatic=false;
    window.fetch=async(url,init)=>{
      if(!new URL(String(url),location.href).pathname.startsWith('/api/sync'))return original(url,init);
      if(String(url).endsWith('/policy')){
        if(window.failSyncSave)return Response.json({error:'synthetic save failure'},{status:503});
        policy={...JSON.parse(init.body),revision:policy.revision+1};window.savedSyncPolicy=policy;
      }
      if(String(url).endsWith('/device'))automatic=JSON.parse(init.body).automatic;
      const extra=[['goals','project_goals','目标、关系与工作记录'],['artifacts','versions','成果及固定版本'],['form','forms','问卷与答卷'],['dataset','datasets','数据表与保存版本'],['ppt','presentations','演示稿'],['lingguang','ideas','灵光与对话']].map(([id,collection_id,title])=>({selection:{plugin_id:'io.molis.work.'+id,publisher_id:'molis',publisher_signature:'official-'+id+'-binding',collection_id,schema_version:1},title,pending:0,conflicts:[]}));
      return Response.json({available:true,device:{automatic},policy,running:false,error:null,lastSuccess:null,progress:{selected:policy.selections.length,pending:0,conflicts:0,waiting:0,failures:0,unavailable:0,complete:false},collections:[{selection,title:'文档与文件夹',pending:0,conflicts:[]},...extra],unavailable:[]});
    };
  })();`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));
  await b.waitFor("document.querySelector('[data-sync-fields] input')");
  assert.equal(await b.evaluate("document.querySelectorAll('[data-sync-fields] input').length"),7);
  assert.equal(await b.evaluate("document.querySelector('[data-sync-fields]').textContent.includes('目标、关系与工作记录')"),true);
  await b.click('[data-sync-fields] input');
  await b.click('[data-sync-automatic]');
  await b.waitFor("!document.querySelector('[data-sync-automatic]').disabled");
  assert.equal(await b.evaluate("document.querySelector('[data-sync-fields] input').checked"),true,'PCSYNC-03 device choice keeps unsaved collection selections');
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
      return Response.json({available:true,device:{automatic:false},policy:{spaceId:'synthetic-only',revision:1,selections:[selection]},running:false,error:null,lastSuccess:null,progress:{selected:1,pending:0,conflicts:0,waiting:waiting?1:0,failures:0,unavailable:0,complete:false},collections:[{selection,title:'文档与文件夹',pending:0,conflicts:waiting?[{key:'["project","document","page"]',reason:'关联成果版本尚未到达',waiting:true}]:[]}],unavailable:[]});
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

test('PCSYNC-14/16/18 sync comparison, item retry, retained recovery and confirmed trash controls',{timeout:60000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=fetch.bind(window),selection={plugin_id:'io.example.notes',publisher_id:'example',publisher_signature:'test',collection_id:'notes',schema_version:1};let conflict=true,failed=true,trash=true;
    const state=()=>({available:true,device:{automatic:false},policy:{spaceId:'test-space',revision:1,selections:[selection]},quota:{usedBytes:1250000,limitBytes:100000000},running:false,error:null,lastSuccess:null,progress:{selected:1,pending:0,conflicts:conflict?1:0,waiting:0,failures:failed?1:0,unavailable:0,complete:false},collections:[{selection,title:'文档与文件夹',pending:0,conflicts:conflict?[{key:'asset',reason:'两台设备修改了同一项',waiting:false}]:[],failures:failed?[{key:'broken',direction:'upload',reason:'源内容需要修复',revision:0}]:[]}],unavailable:[]});
    window.fetch=async(url,init={})=>{const path=new URL(String(url),location.href).pathname;if(!path.startsWith('/api/sync'))return original(url,init);
      if(path==='/api/sync/conflict')return Response.json({key:'asset',revision:7,state:'a'.repeat(64),location:'/projects/source/?openPlugin=pages&openItem=asset',local:{title:'本机正文'},remote:{title:'云端正文'}});
      if(path==='/api/sync/resolve'){window.syncDecision=JSON.parse(init.body);window.syncSpaceHeader=init.headers['x-molis-sync-space'];conflict=false;}
      if(path==='/api/sync/retry-item')failed=false;
      if(path==='/api/sync/recoveries')return Response.json({items:[{id:'1',key:'asset',choice:'remote',revision:8}]});
      if(path==='/api/sync/recovery')return Response.json({id:'1',key:'asset',revision:8,local:{title:'保留的正文'},remote:{title:'采用的正文'}});
      if(path==='/api/sync/restore-recovery')window.syncRecovery=JSON.parse(init.body);
      if(path==='/api/sync/trash')return Response.json({items:trash?[{namespace:JSON.stringify([selection.plugin_id,selection.publisher_id,selection.publisher_signature,selection.collection_id,1]),key:'deleted',revision:11,expiresAt:Date.now()+86400000}]:[],more:false,next:null});
      if(path==='/api/sync/purge-trash'){window.syncPurge=JSON.parse(init.body);trash=false;}
      return Response.json(state());
    };
  })();`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));await b.waitFor("document.querySelector('[data-sync-quota]')?.textContent.includes('1.25 / 100 MB')");
  await b.click('[data-sync-conflicts] section:first-child button');await b.waitFor("document.querySelector('[data-sync-dialog][open] pre')?.textContent.includes('本机正文')");
  await b.waitFor("document.querySelector('[data-sync-dialog][open] table')?.textContent.includes('标题')");assert.equal(await b.evaluate("document.querySelector('[data-sync-dialog][open] a')?.getAttribute('href')"),'/projects/source/?openPlugin=pages&openItem=asset');
  await mkdir('.impeccable/qa/review',{recursive:true});
  for(const width of [1440,390]){await b.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},b.sessionId);const shot=await b.command<{data:string}>('Page.captureScreenshot',{format:'png'},b.sessionId);await writeFile('.impeccable/qa/review/personal-sync-compare-'+width+'.png',Buffer.from(shot.data,'base64'));}
  await b.evaluate("document.querySelector('[data-sync-dialog][open] footer button').click()");await b.waitFor('window.syncDecision?.revision===7');assert.equal(await b.evaluate('window.syncSpaceHeader'),'test-space');assert.equal(await b.evaluate('window.syncDecision.state'),'a'.repeat(64));
  await b.waitFor("!document.querySelector('[data-sync-dialog][open]')");await b.click('[data-sync-conflicts] button');await b.waitFor("!document.querySelector('[data-sync-conflicts]').children.length");
  await b.click('[data-sync-history] summary');await b.evaluate("[...document.querySelectorAll('[data-sync-history] button')].find(button=>button.textContent==='本机保留版本').click()");await b.waitFor("document.querySelector('[data-sync-dialog][open] .mw-form__body button')");
  await b.evaluate("document.querySelector('[data-sync-dialog][open] .mw-form__body button').click()");await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open] pre')].some(pre=>pre.textContent.includes('保留的正文'))");
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open]')].at(-1).querySelector('footer button').click()");await b.waitFor('window.syncRecovery?.revision===8');
  await b.evaluate("document.querySelectorAll('[data-sync-dialog][open]').forEach(dialog=>dialog.close())");await b.click('[data-sync-trash]');await b.waitFor("document.querySelector('[data-sync-dialog][open] .mw-form__body')?.textContent.includes('deleted')");
  assert.equal(await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] button')].some(button=>button.textContent==='永久删除')"),false);
  assert.equal(await b.evaluate("document.querySelector('[data-sync-dialog][open]').textContent.includes('永久清理暂未开放')"),true);
  for(const [width,theme] of [[1440,'light'],[1024,'dark'],[390,'light']] as const){await b.command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},b.sessionId);await b.evaluate("localStorage.setItem('molis-work:theme',"+JSON.stringify(theme)+");dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:"+JSON.stringify(theme)+"}))");assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
  assert.equal(await b.evaluate('window.syncPurge===undefined'),true,'PTR-01 the UI cannot request permanent cleanup');
});

test('PCSYNC-16 cloud history is discoverable without local history, paginated and restored with one retry identity',{timeout:90000},async t=>{
  const b=await openGoalBrowser(t,true);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window),selection={plugin_id:'io.example.history',publisher_id:'example',publisher_signature:'test',collection_id:'records',schema_version:1};
    let keyReads=0,current=8;window.historyRestores=[];window.historyPurges=[];
    const state=()=>({available:true,device:{automatic:false},policy:{spaceId:'history-space',revision:1,selections:[selection]},running:false,error:null,lastSuccess:null,progress:{selected:1,pending:0,conflicts:0,waiting:0,failures:0,unavailable:0,complete:false},collections:[{selection,title:'文档与文件夹',pending:0,conflicts:[],failures:[]}],unavailable:[]});
    window.fetch=async(input,init={})=>{const url=new URL(String(input),location.href),path=url.pathname;if(!path.startsWith('/api/sync'))return original(input,init);
      if(path==='/api/sync/history/keys'){
        keyReads++;if(keyReads===1)return Response.json({error:'synthetic history read failure'},{status:503});
        return Response.json({items:[{key:url.searchParams.has('after')?'long-'+('x'.repeat(300)):'asset',currentRevision:current,versions:1,retainedAt:1000}],more:!url.searchParams.has('after'),next:'asset'});
      }
      if(path==='/api/sync/recoveries')return Response.json({items:[]});
      if(path==='/api/sync/history')return Response.json({items:[{revision:7,createdAt:1000,current:false,retained:true,action:'archive'}],more:false,next:null,currentRevision:current});
      if(path==='/api/sync/history/version')return Response.json({key:'asset',revision:7,createdAt:1000,currentRevision:current,retained:true,value:{title:'云端保留正文',literal:'<img src=x onerror=window.historyInjected=true>'}});
      if(path==='/api/sync/history/restore'){window.historyRestores.push(JSON.parse(init.body));if(window.historyRestores.length===1)return Response.json({error:'synthetic restore failure'},{status:503});current=9;}
      if(path==='/api/sync/history/purge')window.historyPurges.push(JSON.parse(init.body));
      return Response.json(state());
    };
  })();`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));await b.waitFor("document.querySelector('[data-sync-history] summary')");
  await b.click('[data-sync-history] summary');await b.evaluate("[...document.querySelectorAll('[data-sync-history] button')].find(button=>button.textContent==='云端保留版本').click()");
  await b.waitFor("document.querySelector('[data-sync-history-problem]')?.textContent.includes('synthetic history read failure')");
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] button')].find(button=>button.textContent==='重试').click()");
  await b.waitFor("document.querySelector('[data-sync-dialog][open] code')?.textContent==='asset'");
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] button')].find(button=>button.textContent==='加载更多').click()");await b.waitFor("document.querySelectorAll('[data-sync-dialog][open] code').length===2");
  await mkdir('.impeccable/qa/review',{recursive:true});
  for(const width of [1440,1024,390])for(const theme of ['light','dark']){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},b.sessionId);
    await b.evaluate("localStorage.setItem('molis-work:theme',"+JSON.stringify(theme)+");dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:"+JSON.stringify(theme)+"}))");
    assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
    assert.equal(await b.evaluate("(()=>{const r=document.querySelector('[data-sync-dialog][open]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()"),true);
    assert.equal(await b.evaluate("(()=>{const dialog=document.querySelector('[data-sync-dialog][open]'),outer=dialog.getBoundingClientRect();return [...dialog.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect();return r.left>=outer.left&&r.right<=outer.right&&r.top>=outer.top&&r.bottom<=outer.bottom})})()"),true,'long identifiers must never push visible actions outside the modal');
    const shot=await b.command<{data:string}>('Page.captureScreenshot',{format:'png'},b.sessionId);await writeFile('.impeccable/qa/review/cloud-history-'+width+'-'+theme+'.png',Buffer.from(shot.data,'base64'));
  }
  await b.click('[data-sync-dialog][open] .settings-setting-row button');await b.waitFor("document.querySelectorAll('[data-sync-dialog][open]').length===2");
  await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open]')].at(-1)?.querySelector('.mw-form__body .settings-setting-row button')");
  await b.click('[data-sync-dialog][open]:last-of-type .settings-setting-row button');await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open] pre')].some(pre=>pre.textContent.includes('云端保留正文'))");
  assert.equal(await b.evaluate('window.historyInjected===undefined'),true);
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open]')].at(-1).querySelector('footer button').click()");await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open] [role=alert]')].some(p=>p.textContent.includes('synthetic restore failure'))");
  assert.equal(await b.evaluate("document.querySelectorAll('[data-sync-dialog][open]').length"),3,'failed restore keeps the inspected preview');
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open]')].at(-1).querySelector('footer button').click()");await b.waitFor("window.historyRestores.length===2&&!document.querySelector('[data-sync-dialog][open]')");
  assert.deepEqual(await b.evaluate('window.historyRestores[0]'),await b.evaluate('window.historyRestores[1]'));assert.equal(await b.evaluate('window.historyRestores[0].revision'),8);assert.equal(await b.evaluate('window.historyRestores[0].sourceRevision'),7);
  await b.evaluate("[...document.querySelectorAll('[data-sync-history] button')].find(button=>button.textContent==='云端保留版本').click()");await b.waitFor("document.querySelector('[data-sync-dialog][open] code')?.textContent==='asset'");
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] button')].find(button=>button.textContent==='查看版本').click()");await b.waitFor("document.querySelectorAll('[data-sync-dialog][open]').length===2");
  await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open]')].at(-1)?.querySelector('.mw-form__body .settings-setting-row button')");
  await b.click('[data-sync-dialog][open]:last-of-type .settings-setting-row button');await b.waitFor("document.querySelectorAll('[data-sync-dialog][open]').length===3");
  assert.equal(await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] button')].some(button=>button.textContent==='删除云端版本')"),false);
  assert.equal(await b.evaluate('window.historyPurges.length'),0,'PTR-01 retained cloud versions cannot be purged by the trial UI');
});

test('PCSYNC-20 personal project recycle UI binds confirmation to the observed state and reuses its operation identity',{timeout:60000},async t=>{
 const b=await openGoalBrowser(t,true);if(!b)return;
 await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=fetch.bind(window);window.recycleCalls=[];window.fetch=async(input,init={})=>{const path=new URL(String(input),location.href).pathname;
 if(path==='/api/sync')return Response.json({available:true,policy:{spaceId:'personal-test',revision:1,selections:[]},device:{automatic:false},collections:[],unavailable:[],progress:{selected:0,pending:0,conflicts:0,waiting:0,failures:0,unavailable:0,complete:false}});
 if(path==='/api/settings/projects/recycle')return Response.json({items:[{project_id:'p',display_name:'Project original',recycled:false,state:'a'.repeat(64)}]});
 if(path==='/api/settings/projects/p/recycle'){window.recycleCalls.push(JSON.parse(init.body));if(window.recycleCalls.length===1)return Response.json({error:'retry this operation'},{status:503});return Response.json({recycled:true});}
 return original(input,init);};})();`},b.sessionId);
 await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));await b.waitFor("document.querySelector('[data-sync-projects]')?.hidden===false");
 await b.click('[data-sync-projects]');await b.waitFor("[...document.querySelectorAll('dialog[open] h3')].some(el=>el.textContent==='Project original')");
 await b.evaluate("[...document.querySelectorAll('dialog[open] button')].find(el=>el.textContent==='移入回收站').click()");await b.waitFor("document.querySelectorAll('dialog[open]').length===2");assert.equal(await b.evaluate('window.recycleCalls.length'),0);
 await b.evaluate("[...document.querySelectorAll('dialog[open]')].at(-1).querySelector('footer button').click()");await b.waitFor('window.recycleCalls.length===1');
 await b.waitFor("[...document.querySelectorAll('dialog[open]')].at(-1).querySelector('[role=alert]')?.textContent.includes('retry this operation')");
 await b.evaluate("[...document.querySelectorAll('dialog[open]')].at(-1).querySelector('footer button').click()");await b.waitFor('window.recycleCalls.length===2');
 const calls=await b.evaluate<Array<{operation_id:string;expected_state:string;confirmed:boolean}>>('window.recycleCalls');assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0]!.expected_state,'a'.repeat(64));assert.equal(calls[0]!.confirmed,true);
});

test('PCSYNC-27 resident indicator reports conflict and offline states without showing a completed claim',{timeout:60000},async t=>{
 const b=await openGoalBrowser(t,'user');if(!b)return;
 await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=fetch.bind(window);window.fetch=async(input,init)=>new URL(String(input),location.href).pathname==='/api/sync'?Response.json({available:true,running:false,lastSuccess:null,error:null,progress:{selected:1,pending:0,conflicts:1,waiting:0,failures:0,unavailable:0,complete:false}}):original(input,init);})();`},b.sessionId);
 await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/projects/'+b.projectId},b.sessionId));await b.waitFor("document.querySelector('[data-sync-indicator]')?.dataset.syncPhase==='conflict'");
 assert.equal(await b.evaluate("document.querySelector('[data-sync-indicator]').getAttribute('href')"),'/settings/sync');
 await b.evaluate("dispatchEvent(new Event('offline'))");await b.waitFor("document.querySelector('[data-sync-indicator]').dataset.syncPhase==='offline'");
 assert.equal(await b.evaluate("document.querySelector('[data-sync-indicator]').textContent.includes('已同步')"),false);
});
