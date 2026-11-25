import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {openGoalBrowser} from './fixtures/goal-browser.js';
import {seedBoard} from './fixtures/goal-application.js';

test('PCSYNC-27 sync progress distinguishes unfinished work from a past successful connection',{timeout:60000},async t=>{
  const b=await openGoalBrowser(t,'empty',seedBoard);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window),selection={plugin_id:'io.example.notes',publisher_id:'example',publisher_signature:'fixed',collection_id:'notes',schema_version:1};
    window.syncProgress={selected:1,pending:2,conflicts:1,waiting:1,failures:1,unavailable:1,complete:false};
    window.fetch=async(url,init)=>{
      if(new URL(String(url),location.href).pathname!=='/api/sync')return original(url,init);
      if(window.failSyncStatus)return Response.json({error:'synthetic status unavailable'},{status:503});
      return Response.json({available:true,device_label:'测试Mac',device:{automatic:false},policy:{spaceId:window.syncSpace||'progress-space',revision:1,selections:[selection]},running:false,error:null,lastSuccess:'2026-10-19T00:00:00.000Z',progress:window.syncProgress,collections:[{selection,title:'文档与文件夹',pending:2,decisionCount:0,waitingCount:0,conflicts:[],failures:[]}],unavailable:[]});
    };
  })();`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));
  await b.waitFor("document.querySelector('[data-sync-status]')?.textContent.includes('不可用集合 1')");
  assert.match(await b.evaluate<string>("document.querySelector('[data-sync-identity]').textContent"), /progress-space.*测试Mac/);
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
  await b.evaluate("window.syncSpace='other-space';window.syncProgress={selected:1,pending:0,conflicts:0,waiting:0,failures:0,unavailable:0,complete:true}");
  await b.click('[data-sync-reload]');await b.waitFor("document.querySelector('[data-sync-status]').dataset.syncComplete==='true'");
  assert.ok((await b.evaluate<string>("document.querySelector('[data-sync-status]').textContent")).includes('所选内容已同步至上次检查'));
  assert.match(await b.evaluate<string>("document.querySelector('[data-sync-identity]').textContent"), /other-space.*测试Mac/);
  await b.evaluate('window.failSyncStatus=true');await b.click('[data-sync-reload]');
  await b.waitFor("!document.querySelector('[data-sync-error]').hidden");
  assert.equal(await b.evaluate("document.querySelector('[data-sync-status]').dataset.syncComplete"),'false','a failed status refresh must remove the old completed claim');
  assert.equal(await b.evaluate("document.querySelector('[data-sync-status]').textContent"),'同步暂时不可用');
});

test('sync settings: local space stays off and narrow layout remains usable',{timeout:60000},async t=>{
  const b=await openGoalBrowser(t,'empty',seedBoard);if(!b)return;
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
  const b=await openGoalBrowser(t,'empty',seedBoard);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window);
    const selection={plugin_id:'io.molis.work.pages',publisher_id:'molis',publisher_signature:'official-pages-binding',collection_id:'documents',schema_version:1};
    let policy={spaceId:'synthetic-only',revision:0,selections:[]},automatic=false;
    window.fetch=async(url,init)=>{
      if(!new URL(String(url),location.href).pathname.startsWith('/api/sync'))return original(url,init);
      if(String(url).endsWith('/run'))window.syncRuns=(window.syncRuns||0)+1;
      if(String(url).endsWith('/policy')){
        if(window.failSyncSave)return Response.json({error:'synthetic save failure'},{status:503});
        policy={...JSON.parse(init.body),revision:policy.revision+1};window.savedSyncPolicy=policy;
      }
      if(String(url).endsWith('/device'))automatic=JSON.parse(init.body).automatic;
      const extra=[['goals','project_goals','目标、关系与工作记录'],['artifacts','versions','成果及固定版本'],['form','forms','问卷与答卷'],['dataset','datasets','数据表与保存版本'],['ppt','presentations','演示稿'],['lingguang','ideas','灵光与对话']].map(([id,collection_id,title])=>({selection:{plugin_id:'io.molis.work.'+id,publisher_id:'molis',publisher_signature:'official-'+id+'-binding',collection_id,schema_version:1},title,pending:0,decisionCount:0,waitingCount:0,conflicts:[]}));
      return Response.json({available:true,device:{automatic},policy,running:false,error:null,lastSuccess:null,progress:{selected:policy.selections.length,pending:0,conflicts:0,waiting:0,failures:0,unavailable:0,complete:false},collections:[{selection,title:'文档与文件夹',pending:0,decisionCount:0,waitingCount:0,conflicts:[]},...extra],unavailable:[]});
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
  // D0350: unsaved choices must neither start the old server policy nor be discarded.
  await b.click('[data-sync-run]');
  assert.equal(await b.evaluate('window.syncRuns||0'),0);
  assert.equal(await b.evaluate("document.querySelector('[data-sync-fields] input').checked"),true);
  assert.match(await b.evaluate<string>("document.querySelector('[data-sync-error]').textContent"),/请先保存/);
  await b.evaluate('window.failSyncSave=true');
  await b.click('[data-sync-form] button[type=submit]');
  await b.waitFor("!document.querySelector('[data-sync-error]').hidden");
  assert.equal(await b.evaluate("document.querySelector('[data-sync-fields] input').checked"),true);
  await b.evaluate('window.failSyncSave=false');
  await b.click('[data-sync-retry]');
  await b.waitFor('window.savedSyncPolicy?.selections.length===1');
  assert.equal(await b.evaluate("document.querySelector('[data-sync-error]').hidden"),true);
  await b.click('[data-sync-run]');await b.waitFor('window.syncRuns===1');
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
  const b=await openGoalBrowser(t,'empty',seedBoard);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window);let waiting=true;
    const selection={plugin_id:'io.molis.work.pages',publisher_id:'molis',publisher_signature:'official-pages-binding',collection_id:'documents',schema_version:1};
    window.fetch=async(url,init)=>{
      if(!new URL(String(url),location.href).pathname.startsWith('/api/sync'))return original(url,init);
      if(String(url).endsWith('/run'))waiting=false;
      return Response.json({available:true,device:{automatic:false},policy:{spaceId:'synthetic-only',revision:1,selections:[selection]},running:false,error:null,lastSuccess:null,progress:{selected:1,pending:0,conflicts:0,waiting:waiting?1:0,failures:0,unavailable:0,complete:false},collections:[{selection,title:'文档与文件夹',pending:0,decisionCount:0,waitingCount:waiting?1:0,conflicts:waiting?[{key:'["project","document","page"]',reason:'关联成果版本尚未到达',waiting:true}]:[]}],unavailable:[]});
    };
  })();`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));
  await b.waitFor("document.querySelector('[data-sync-conflicts] h2')?.textContent.startsWith('文档与文件夹 · 对象 ')");
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

test('PCSYNC-14/16/18, PCSYNC-OPT-18 and SCKP-03 sync comparison, transfer progress, item retry, retained recovery and confirmed trash controls',{timeout:60000},async t=>{
  const b=await openGoalBrowser(t,'empty',seedBoard);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=fetch.bind(window),selection={plugin_id:'io.example.notes',publisher_id:'example',publisher_signature:'test',collection_id:'notes',schema_version:1};let conflict=true,failed=true,trash=true;
    const image=color=>{const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const context=canvas.getContext('2d');context.fillStyle=color;context.fillRect(0,0,1,1);const data=canvas.toDataURL().split(',')[1];return{id:'image1',mime_type:'image/png',byte_length:atob(data).length,data_base64:data};};
    const state=()=>({available:true,device:{automatic:false},policy:{spaceId:'test-space',revision:1,selections:[selection]},quota:{usedBytes:1250000,limitBytes:100000000},running:false,error:null,lastSuccess:null,progress:{selected:1,pending:0,conflicts:conflict?1:0,waiting:0,failures:failed?1:0,unavailable:0,complete:false},collections:[{selection,title:'文档与文件夹',pending:0,decisionCount:conflict?1:0,waitingCount:0,conflicts:conflict?[{key:'asset',reason:'两台设备修改了同一项',waiting:false}]:[],failures:failed?[{key:'broken',direction:'upload',reason:'源内容需要修复',revision:0}]:[]}],unavailable:[]});
    window.syncResolutionRequests=0;
    window.fetch=async(input,init={})=>{const url=new URL(String(input),location.href),path=url.pathname;if(!path.startsWith('/api/sync'))return original(input,init);
      if(path==='/api/sync/conflict')return Response.json({key:'asset',revision:7,state:'a'.repeat(64),location:'/projects/source/?openPlugin=pages&openItem=asset',local:{title:'本机正文',markdown:'same\\nlocal only',images:[image('red')]},remote:{title:'云端正文',markdown:'same\\ncloud only',images:[image('blue')]}});
      if(path==='/api/sync/resolve'){
        window.syncResolutionRequests++;
        window.syncDecision=JSON.parse(init.body);
        window.syncSpaceHeader=init.headers['x-molis-sync-space'];
        window.syncConflictTransfer={done:3,total:10};
        await new Promise(resolve=>window.finishSyncConflict=resolve);
        window.syncConflictTransfer=null;
        conflict=false;
      }
      if(url.searchParams.get('view')==='indicator')return Response.json({...state(),running:!!window.syncConflictTransfer,transfer:window.syncConflictTransfer});
      if(path==='/api/sync/retry-item')failed=false;
      if(path==='/api/sync/recoveries')return Response.json({items:[{id:'1',key:'asset',choice:'remote',revision:8}]});
      if(path==='/api/sync/recovery')return Response.json({id:'1',key:'asset',revision:8,local:{title:'保留的正文'},remote:{title:'采用的正文'}});
      if(path==='/api/sync/restore-recovery')window.syncRecovery=JSON.parse(init.body);
      if(path==='/api/sync/trash')return Response.json({items:trash?[{namespace:JSON.stringify([selection.plugin_id,selection.publisher_id,selection.publisher_signature,selection.collection_id,1]),key:'deleted',revision:11,expiresAt:Date.now()+86400000}]:[],more:false,next:null,permanentCleanup:window.allowSyncPurge===true});
      if(path==='/api/sync/quota')return Response.json({currentBytes:500000,trashBytes:250000,historyBytes:500000,reservedAttachmentBytes:0});
      if(path==='/api/sync/purge-trash'){window.syncPurge=JSON.parse(init.body);trash=false;}
      return Response.json(state());
    };
  })();`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));await b.waitFor("document.querySelector('[data-sync-quota]')?.textContent.includes('1.25 / 100 MB')");
  await b.click('[data-sync-conflicts] section:first-child button');await b.waitFor("document.querySelector('[data-sync-dialog][open] pre')?.textContent.includes('本机正文')");
  await b.waitFor("document.querySelector('[data-sync-dialog][open] table')?.textContent.includes('标题')");assert.equal(await b.evaluate("document.querySelector('[data-sync-dialog][open] a')?.getAttribute('href')"),'/projects/source/?openPlugin=pages&openItem=asset');
  assert.equal(await b.evaluate("document.querySelector('[data-sync-dialog][open] del')?.textContent.trim()"),'− local only');
  assert.equal(await b.evaluate("document.querySelector('[data-sync-dialog][open] ins')?.textContent.trim()"),'+ cloud only');
  await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open] table img')].filter(img=>img.complete&&img.naturalWidth===1).length===2");
  await mkdir('.impeccable/qa/review',{recursive:true});
  for(const width of [1440,390]){await b.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},b.sessionId);const shot=await b.command<{data:string}>('Page.captureScreenshot',{format:'png'},b.sessionId);await writeFile('.impeccable/qa/review/personal-sync-compare-'+width+'.png',Buffer.from(shot.data,'base64'));}
  await b.click('[data-sync-dialog][open] footer button:nth-child(2)');
  const progress="document.querySelector('[data-sync-dialog][open] [data-sync-conflict-progress]')";
  await b.waitFor(progress+"?.textContent.includes('30%')");
  assert.equal(await b.evaluate(progress+".hidden"),false);
  assert.equal(await b.evaluate('window.syncDecision.choice'),'remote');
  assert.equal(await b.evaluate('window.syncDecision.revision'),7);
  assert.equal(await b.evaluate('window.syncDecision.state'),'a'.repeat(64));
  assert.equal(await b.evaluate('window.syncSpaceHeader'),'test-space');
  await b.evaluate('window.syncConflictTransfer.done=7');
  await b.waitFor(progress+"?.textContent.includes('70%')");
  assert.equal(await b.evaluate('window.syncResolutionRequests'),1);
  await b.evaluate('window.finishSyncConflict()');
  await b.waitFor("!document.querySelector('[data-sync-dialog][open]')");await b.click('[data-sync-conflicts] button');await b.waitFor("!document.querySelector('[data-sync-conflicts]').children.length");
  await b.click('[data-sync-history] summary');await b.evaluate("[...document.querySelectorAll('[data-sync-history] button')].find(button=>button.textContent==='本机保留版本').click()");await b.waitFor("document.querySelector('[data-sync-dialog][open] .mw-form__body button')");
  await b.evaluate("document.querySelector('[data-sync-dialog][open] .mw-form__body button').click()");await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open] pre')].some(pre=>pre.textContent.includes('保留的正文'))");
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open]')].at(-1).querySelector('footer button').click()");await b.waitFor('window.syncRecovery?.revision===8');
  await b.evaluate("document.querySelectorAll('[data-sync-dialog][open]').forEach(dialog=>dialog.close())");await b.click('[data-sync-trash]');await b.waitFor("document.querySelector('[data-sync-dialog][open] .mw-form__body')?.textContent.includes('deleted')");
  assert.equal(await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] button')].some(button=>button.textContent==='永久删除')"),false);
  assert.equal(await b.evaluate("document.querySelector('[data-sync-dialog][open]').textContent.includes('永久清理暂未开放')"),true);
  for(const [width,theme] of [[1440,'light'],[1024,'dark'],[390,'light']] as const){await b.command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false},b.sessionId);await b.evaluate("localStorage.setItem('molis-work:theme',"+JSON.stringify(theme)+");dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:"+JSON.stringify(theme)+"}))");assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);}
  assert.equal(await b.evaluate('window.syncPurge===undefined'),true,'PTR-01 the UI cannot request permanent cleanup');
  await b.evaluate("document.querySelectorAll('[data-sync-dialog][open]').forEach(dialog=>dialog.close());window.allowSyncPurge=true");
  await b.click('[data-sync-quota-details] summary');
  await b.waitFor("document.querySelector('[data-sync-quota-rows]').textContent.includes('0.25 MB')");
  await b.click('[data-sync-trash]');
  await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open] button')].some(button=>button.textContent==='永久删除')");
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] button')].find(button=>button.textContent==='永久删除').click()");
  assert.equal(await b.evaluate('window.syncPurge===undefined'),true,'PCSYNC-OPT-12 opening confirmation performs no deletion');
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] button')].find(button=>button.textContent==='确认永久删除').click()");
  await b.waitFor("window.syncPurge?.confirm===true&&window.syncPurge.revision===11&&window.syncPurge.key==='deleted'");
});

test('PCSYNC-16 cloud history is discoverable without local history, paginated and restored with one retry identity',{timeout:90000},async t=>{
  const b=await openGoalBrowser(t,'empty',seedBoard);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window),selection={plugin_id:'io.example.history',publisher_id:'example',publisher_signature:'test',collection_id:'records',schema_version:1};
    let keyReads=0,current=8;window.historyRestores=[];window.historyPurges=[];
    const state=()=>({available:true,device:{automatic:false},policy:{spaceId:'history-space',revision:1,selections:[selection]},running:false,error:null,lastSuccess:null,progress:{selected:1,pending:0,conflicts:0,waiting:0,failures:0,unavailable:0,complete:false},collections:[{selection,title:'文档与文件夹',pending:0,decisionCount:0,waitingCount:0,conflicts:[],failures:[]}],unavailable:[]});
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
  await b.click('[data-sync-dialog][open] .sync-row button');await b.waitFor("document.querySelectorAll('[data-sync-dialog][open]').length===2");
  await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open]')].at(-1)?.querySelector('.mw-form__body .sync-row button')");
  await b.click('[data-sync-dialog][open]:last-of-type .sync-row button');await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open] pre')].some(pre=>pre.textContent.includes('云端保留正文'))");
  assert.equal(await b.evaluate('window.historyInjected===undefined'),true);
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open]')].at(-1).querySelector('footer button').click()");await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open] [role=alert]')].some(p=>p.textContent.includes('synthetic restore failure'))");
  assert.equal(await b.evaluate("document.querySelectorAll('[data-sync-dialog][open]').length"),3,'failed restore keeps the inspected preview');
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open]')].at(-1).querySelector('footer button').click()");await b.waitFor("window.historyRestores.length===2&&!document.querySelector('[data-sync-dialog][open]')");
  assert.deepEqual(await b.evaluate('window.historyRestores[0]'),await b.evaluate('window.historyRestores[1]'));assert.equal(await b.evaluate('window.historyRestores[0].revision'),8);assert.equal(await b.evaluate('window.historyRestores[0].sourceRevision'),7);
  await b.evaluate("[...document.querySelectorAll('[data-sync-history] button')].find(button=>button.textContent==='云端保留版本').click()");await b.waitFor("document.querySelector('[data-sync-dialog][open] code')?.textContent==='asset'");
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] button')].find(button=>button.textContent==='查看版本').click()");await b.waitFor("document.querySelectorAll('[data-sync-dialog][open]').length===2");
  await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open]')].at(-1)?.querySelector('.mw-form__body .sync-row button')");
  await b.click('[data-sync-dialog][open]:last-of-type .sync-row button');await b.waitFor("document.querySelectorAll('[data-sync-dialog][open]').length===3");
  assert.equal(await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] button')].some(button=>button.textContent==='删除云端版本')"),false);
  assert.equal(await b.evaluate('window.historyPurges.length'),0,'PTR-01 retained cloud versions cannot be purged by the trial UI');
});

test('PCSYNC-20 personal project recycle UI binds confirmation to the observed state and reuses its operation identity',{timeout:60000},async t=>{
 const b=await openGoalBrowser(t,'empty',seedBoard);if(!b)return;
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
 const b=await openGoalBrowser(t,'user',seedBoard);if(!b)return;
 await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{const original=fetch.bind(window);window.fetch=async(input,init)=>new URL(String(input),location.href).pathname==='/api/sync'?Response.json({available:true,running:false,lastSuccess:null,error:null,progress:{selected:1,pending:0,conflicts:1,waiting:0,failures:0,unavailable:0,complete:false}}):original(input,init);})();`},b.sessionId);
 await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/projects/'+b.projectId},b.sessionId));
 await b.waitFor("document.querySelector('.bar-account-sync[data-sync-indicator]')?.dataset.syncPhase==='conflict'&&document.querySelector('a[data-sync-indicator]')?.dataset.syncPhase==='conflict'");
 assert.equal(await b.evaluate("document.querySelector('a[data-sync-indicator]').getAttribute('href')"),'/settings/sync');
 await b.evaluate("dispatchEvent(new Event('offline'))");
 await b.waitFor("document.querySelector('.bar-account-sync[data-sync-indicator]')?.dataset.syncPhase==='offline'&&document.querySelector('a[data-sync-indicator]')?.dataset.syncPhase==='offline'");
 assert.equal(await b.evaluate("[...document.querySelectorAll('[data-sync-indicator]')].some(el=>el.textContent.includes('已同步'))"),false);
});
test('PCSYNC-OPT-18 grouped collections, transfer progress, and local project structure copy discloses what stays in the original',{timeout:60000},async t=>{
  const b=await openGoalBrowser(t,'empty',seedBoard);if(!b)return;
  await b.command('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{
    const original=window.fetch.bind(window);
    const platformSel={plugin_id:'io.molis.work.module.projects',publisher_id:'molis',publisher_signature:'official-projects-binding',collection_id:'projects',schema_version:1};
    const pluginSel={plugin_id:'io.molis.work.pages',publisher_id:'molis',publisher_signature:'official-pages-binding',collection_id:'documents',schema_version:1};
    window.copyExecCalls=[];
    window.fetch=async(url,init={})=>{
      const path=new URL(String(url),location.href).pathname;
      if(!path.startsWith('/api/sync'))return original(url,init);
      if(path==='/api/sync/copy/projects')return Response.json({projects:[{project_id:'p1',display_name:'Local Alpha'},{project_id:'p2',display_name:'Local Beta'}]});
      if(path==='/api/sync/copy/preview')return Response.json({projects:[{project_id:'p1',display_name:'Local Alpha'},{project_id:'p2',display_name:'Local Beta'}],preview:{assetCount:2,savedBytes:330,fingerprint:'f'.repeat(64)}});
      if(path==='/api/sync/copy/execute'){window.copyExecCalls.push(JSON.parse(init.body));return Response.json({copied:true});}
      return Response.json({
        available:true,device:{automatic:true},policy:{spaceId:'opt18-space',revision:1,selections:[platformSel,pluginSel]},
        running:true,transfer:{done:2500000,total:10000000},error:null,lastSuccess:null,
        progress:{selected:2,pending:1,conflicts:0,waiting:0,failures:0,unavailable:0,complete:false},
        collections:[{selection:platformSel,title:'项目目录',group:'platform',pending:0,decisionCount:0,waitingCount:0,conflicts:[],failures:[]},{selection:pluginSel,title:'文档与文件夹',group:'plugin',pending:1,decisionCount:0,waitingCount:0,conflicts:[],failures:[]}],
        unavailable:[],
      });
    };
  })();`},b.sessionId);
  await b.navigate(()=>b.command('Page.navigate',{url:b.origin+'/settings/sync'},b.sessionId));
  await b.waitFor("document.querySelector('[data-sync-status]')?.textContent.includes('2.5/10.0 MB')");
  const fieldsText=await b.evaluate<string>("document.querySelector('[data-sync-fields]').textContent");
  assert.ok(fieldsText.includes('平台与项目'),fieldsText);
  assert.ok(fieldsText.includes('插件内容'),fieldsText);
  assert.equal(await b.evaluate("document.querySelector('[data-sync-copy-local]').textContent"),'从本地复制项目结构');
  await b.click('[data-sync-copy-local]');
  await b.waitFor("document.querySelectorAll('[data-sync-dialog][open] input[type=checkbox]').length===2");
  await b.evaluate("document.querySelectorAll('[data-sync-dialog][open] input[type=checkbox]').forEach(el=>el.click())");
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] footer button')].find(el=>el.textContent==='预览项目结构').click()");
  await b.waitFor("[...document.querySelectorAll('[data-sync-dialog][open] p')].some(el=>el.textContent.includes('2 个项目')&&el.textContent.includes('文档、附件和其他插件内容仍留在本地原项目'))");
  for(const [width,theme] of [[1440,'light'],[1024,'dark'],[390,'light']] as const){
    await b.command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false},b.sessionId);
    await b.evaluate("localStorage.setItem('molis-work:theme',"+JSON.stringify(theme)+");dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:"+JSON.stringify(theme)+"}))");
    assert.equal(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
  }
  assert.equal(await b.evaluate('window.copyExecCalls.length'),0,'preview must not execute copy before confirmation');
  await b.evaluate("[...document.querySelectorAll('[data-sync-dialog][open] footer button')].find(el=>el.textContent==='确认复制项目结构').click()");
  await b.waitFor('window.copyExecCalls.length===1');
  const exec=await b.evaluate<{projectIds:string[];fingerprint:string;operationId:string}>('window.copyExecCalls[0]');
  assert.deepEqual(exec.projectIds,['p1','p2']);
  assert.equal(exec.fingerprint,'f'.repeat(64));
  assert.ok(exec.operationId.length>10);
});
