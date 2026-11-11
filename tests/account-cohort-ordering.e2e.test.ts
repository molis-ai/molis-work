import assert from 'node:assert/strict';
import test from 'node:test';
import {openGoalBrowser} from './fixtures/goal-browser.js';

for (const delivery of ['resolve','reject'] as const) test(`ASR-04 a delayed start ${delivery} cannot revive an old preparation or cancel a newer one`, {timeout:90_000}, async t => {
  const browser=await openGoalBrowser(t,true);if(!browser)return;
  const {command,sessionId,navigate,origin,projectId,evaluate,waitFor,click}=browser;
  // Exercise the real bundled account controller; only HTTP/SSE delivery ordering is controlled here.
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`{
    const original=window.fetch.bind(window),Source=window.EventSource;
    const probe=window.cohortOrdering={acks:[],cancels:0,logins:0,popupClosed:false,current:null};
    window.open=()=>({closed:false,opener:null,location:{replace(){}},close(){this.closed=true;probe.popupClosed=true;}});
    window.EventSource=function(url,options){
      if(new URL(url,location.href).pathname==='/api/personal/events')return probe.events={close(){}};
      return new Source(url,options);
    };
    window.fetch=(input,init)=>{
      const url=new URL(String(input),location.href);
      if(url.pathname==='/api/personal/status')return Promise.resolve(Response.json({configured:true,identity:{userId:'alice',displayName:'Alice',email:null},pageBinding:'synthetic-page-binding',accountGeneration:1,ready:true,space:'account'}));
      if(url.pathname==='/api/personal/prepare'){
        const action=url.searchParams.get('action');
        if(action==='start'){
          const old={id:'old-preparation',ownerPageId:url.searchParams.get('page'),intent:'switch',ready:false};
          probe.current=old;
          setTimeout(()=>probe.events.onmessage({data:JSON.stringify({type:'prepare',preparation:old})}),0);
          return new Promise((resolve,reject)=>{probe.releaseOldStart=delivery=>delivery==='reject'?reject(new Error('delayed start failed')):resolve(Response.json(old));});
        }
        if(action==='ack')probe.acks.push(url.searchParams.get('id'));
        if(action==='cancel')probe.cancels++;
        return Promise.resolve(Response.json(probe.current||{preparation:null}));
      }
      if(url.pathname==='/api/personal/switch'){probe.logins++;return Promise.resolve(Response.json({loginUrl:location.origin+'/health',loginAttempt:'unexpected'}));}
      return original(input,init);
    };
  }`},sessionId);
  await navigate(()=>command('Page.navigate',{url:origin+'/projects/'+projectId+'/'},sessionId));
  await waitFor("document.querySelector('[data-personal-name]')?.textContent==='Alice' && window.cohortOrdering.events");
  await click('[data-project-menu] > summary');await click('[data-personal-menu] [data-account-link]');
  await click('[data-personal-action=switch]');
  await waitFor("window.cohortOrdering.acks.includes('old-preparation')");
  await evaluate(`{
    const probe=window.cohortOrdering;
    probe.current=null;probe.events.onmessage({data:JSON.stringify({type:'cancelled',preparation:null})});
    probe.current={id:'new-preparation',ownerPageId:'another-page',intent:'switch',ready:false};
    probe.events.onmessage({data:JSON.stringify({type:'prepare',preparation:probe.current})});
  }`);
  await waitFor("window.cohortOrdering.acks.includes('new-preparation') && molisWorkAccountTransition.preparing");
  await evaluate(`window.cohortOrdering.releaseOldStart(${JSON.stringify(delivery)})`);
  await waitFor("!document.querySelector('[data-personal-action=switch]').disabled");
  assert.equal(await evaluate('window.cohortOrdering.logins'),0,'a cancelled start response cannot start authentication');
  assert.equal(await evaluate('window.cohortOrdering.cancels'),0,'cleanup for the old click must not cancel another page’s newer preparation');
  assert.equal(await evaluate('molisWorkAccountTransition.preparing'),true,'the newer preparation keeps its editing freeze');
  assert.equal(await evaluate('window.cohortOrdering.popupClosed'),true,'the abandoned click closes its unused login window');
});

test('ASR-04 a current start failure still reports its original error and does not authenticate', {timeout:90_000}, async t => {
  const browser=await openGoalBrowser(t,true);if(!browser)return;
  const {command,sessionId,navigate,origin,projectId,evaluate,waitFor,click}=browser;
  await command('Page.addScriptToEvaluateOnNewDocument',{source:`{
    const original=window.fetch.bind(window),Source=window.EventSource;
    const probe=window.currentStartFailure={logins:0,popupClosed:false};
    window.open=()=>({closed:false,opener:null,location:{replace(){}},close(){this.closed=true;probe.popupClosed=true;}});
    window.EventSource=function(url,options){
      if(new URL(url,location.href).pathname==='/api/personal/events')return {close(){}};
      return new Source(url,options);
    };
    window.fetch=(input,init)=>{
      const url=new URL(String(input),location.href);
      if(url.pathname==='/api/personal/status')return Promise.resolve(Response.json({configured:true,identity:{userId:'alice',displayName:'Alice',email:null},pageBinding:'synthetic-page-binding',accountGeneration:1,ready:true,space:'account'}));
      if(url.pathname==='/api/personal/prepare' && url.searchParams.get('action')==='start')return Promise.reject(new Error('current start failed'));
      if(url.pathname==='/api/personal/prepare')return Promise.resolve(Response.json({preparation:null}));
      if(url.pathname==='/api/personal/switch'){probe.logins++;return Promise.resolve(Response.json({}));}
      return original(input,init);
    };
  }`},sessionId);
  await navigate(()=>command('Page.navigate',{url:origin+'/projects/'+projectId+'/'},sessionId));
  await waitFor("document.querySelector('[data-personal-name]')?.textContent==='Alice'");
  await click('[data-project-menu] > summary');await click('[data-personal-menu] [data-account-link]');
  await click('[data-personal-action=switch]');
  // The existing request owner turns a failed POST delivery into this outcome-unknown error; begin must propagate it unchanged.
  await waitFor("document.querySelector('#mw-account-menu [role=alert]')?.textContent===L('不知道这次操作有没有完成，请刷新后核对') && !document.querySelector('[data-personal-action=switch]').disabled");
  assert.equal(await evaluate('window.currentStartFailure.logins'),0);
  assert.equal(await evaluate('window.currentStartFailure.popupClosed'),true);
  assert.equal(await evaluate('molisWorkAccountTransition.preparing'),false,'an unchanged failed start keeps the original error and leaves editing available');
});
