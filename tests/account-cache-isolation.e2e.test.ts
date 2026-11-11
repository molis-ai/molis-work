import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {ServerResponse} from 'node:http';
import {createDesktopWebHost} from '@molis-ai/molis-work-app-desktop';
import {ChromeHarness} from '@molis-ai/molis-work-test-kit/browser';
import {v2AccountPeer} from './fixtures/v2-account-peer.js';
import {completeInstallationLogin} from './fixtures/installation-login.js';

async function until(check: () => boolean | Promise<boolean>) {
  const end = Date.now()+15_000;
  while (!await check()) { assert.ok(Date.now()<end,'condition did not recover within 15 seconds'); await new Promise(resolve=>setTimeout(resolve,50)); }
}

test('WUA-32 logout clears account browser caches while preserving unrelated local data', {timeout:90_000}, async () => {
  const home=mkdtempSync(join(tmpdir(),'molis-account-cache-'));
  const previous=process.env.MOLIS_WORK_ACCOUNT_CONFIG,auth=v2AccountPeer();
  await new Promise<void>(resolve=>auth.server.listen(0,'127.0.0.1',resolve));
  const server=createDesktopWebHost({ptyClientFilePath:()=>join(process.cwd(),'dist/web/pty-client.js')})({homeDirectory:home,controlToken:'synthetic-reconnect-owner-control'});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address==='object');
  const origin='http://127.0.0.1:'+address.port;
  process.env.MOLIS_WORK_ACCOUNT_CONFIG=auth.configure(origin);
  let cookie='',browser: ChromeHarness | undefined,opened=0,entries=0,cookieCleared=false;
  const streams=new Map<string,ServerResponse>(),pageIds=new Set<string>();
  server.prependListener('request',(request,response)=>{
    const url=new URL(request.url??'/',origin);
    if(url.pathname==='/')entries++;
    if(url.pathname==='/api/personal/logout')response.once('finish',()=>{cookieCleared=String(response.getHeader('set-cookie')).includes('molis-work-session=;')&&String(response.getHeader('set-cookie')).includes('Max-Age=0');});
    if(url.pathname!=='/api/personal/events')return;
    const id=url.searchParams.get('page')!;opened++;pageIds.add(id);streams.set(id,response);
    response.once('close',()=>{if(streams.get(id)===response)streams.delete(id);});
  });
  const request=async(path:string,init:RequestInit={})=>{
    const response=await fetch(origin+path,{...init,headers:{Cookie:cookie,Origin:origin,'x-molis-work-control-token':'synthetic-reconnect-owner-control','x-molis-work-idempotency-key':crypto.randomUUID(),'content-type':'application/json',...init.headers}});
    const set=response.headers.get('set-cookie');if(set?.startsWith('molis-work-session='))cookie=set.split(';')[0]!;
    return response;
  };
  let stage='installation login';
  try {
    const login=await request('/api/personal/login?returnTo=%2F',{method:'POST',body:'{}'});assert.equal(login.status,200);
    const {loginUrl,loginAttempt}=await login.json();assert.equal((await completeInstallationLogin(request,loginUrl)).status,200);
    const status=await (await request('/api/personal/status?attempt='+loginAttempt)).json();assert.ok(status.identity);
    browser=await ChromeHarness.start(home);const page=await browser.page();await page.command('Page.enable');await page.viewport(1440,900);
    const staleCookie=cookie,equals=cookie.indexOf('=');await page.command('Network.setCookie',{name:cookie.slice(0,equals),value:cookie.slice(equals+1),url:origin,httpOnly:true,sameSite:'Lax'});
    stage='open personal workspace';
    await page.command('Page.navigate',{url:origin+'/projects/personal/'});
    await page.wait("Boolean(document.querySelector('#mw-account-menu')) && document.querySelector('[data-personal-action=logout]')?.hidden===false");
    await page.wait("[...document.querySelectorAll('iframe')].some(f=>{try{return Boolean(f.contentWindow?.molisWorkAccountTransition)&&!f.contentDocument.body.hasAttribute('data-account-registering');}catch{return false;}})");
    assert.equal(streams.size,1,'the embedded carrier saves through its parent instead of opening an account stream');
    const originalPage=[...pageIds][0];assert.ok(originalPage);
    // WUA-32: a draft inventory already in flight must finish before clearing its physical cache.
    const racePage=await browser.page();await racePage.command('Page.enable');
    await racePage.command('Page.navigate',{url:origin+'/projects/personal/'});
    await racePage.wait("Boolean(window.molisWorkAccountTransition) && !document.body.hasAttribute('data-account-registering')");
    const race=await racePage.evaluate<{waited:boolean;names:string[]}>(`(async()=>{
      const name='molis-plugin-page:inventory-race:drafts';
      await caches.open(name);
      const keys=caches.keys.bind(caches);
      let entered,release;
      const reached=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
      let first=true;
      caches.keys=async()=>{const names=await keys();if(first){first=false;entered();await gate;}return names;};
      const inventory=molisWorkAccountTransition.hasDrafts();
      await reached;
      let cleared=false;
      const cleanup=molisWorkAccountTransition.invalidate().then(()=>{cleared=true;});
      await new Promise(resolve=>setTimeout(resolve,50));
      const waited=!cleared;
      release();await inventory;await cleanup;
      caches.keys=keys;
      return {waited,names:await keys()};
    })()`);
    assert.equal(race.waited,true,'clear must drain the draft inventory before deleting its caches');
    assert.ok(!race.names.some(name=>name.endsWith('molis-plugin-page:inventory-race:drafts')),'inventory must not recreate a deleted empty cache');
    await browser.command('Target.closeTarget',{targetId:racePage.targetId});
    await until(()=>streams.size===1);
    const openedBeforeReconnect=opened,knownPages=pageIds.size;
    stage='reconnect stream';
    streams.get(originalPage)!.destroy();
    await until(()=>opened===openedBeforeReconnect+1&&streams.size===1);
    assert.equal(pageIds.size,knownPages,'reconnection retains the original page rather than creating a phantom participant');
    await page.evaluate(`{
      window.reconnectDraftSaved=false;
      const frame=[...document.querySelectorAll('iframe')].find(f=>{try{return Boolean(f.contentWindow?.molisWorkAccountTransition);}catch{return false;}});
      frame.contentWindow.molisWorkAccountTransition.page(frame.contentDocument.body,async()=>{throw new Error('synthetic unsaved draft');},()=>{},()=>{});
      const links=[...document.querySelectorAll('[data-account-link]')];
      document.querySelector('[data-project-menu]')?.setAttribute('open','');links.find(e=>e.getClientRects().length).click();
    }`);
    stage='logout with draft checks';
    await page.click('[data-personal-action=logout]');
    await page.wait("!document.querySelector('[data-personal-action=logout]').disabled && Boolean(document.querySelector('#mw-account-menu [role=alert]')?.textContent)");
    assert.ok((await (await request('/api/personal/status')).json()).identity,'an embedded draft save refusal prevents logout');
    await page.evaluate(`{
      const frame=[...document.querySelectorAll('iframe')].find(f=>{try{return Boolean(f.contentWindow?.molisWorkAccountTransition);}catch{return false;}});
      frame.contentWindow.molisWorkAccountTransition.page(frame.contentDocument.body,()=>new Promise(resolve=>{window.finishOldDraft=resolve;}),()=>{},()=>{});
    }`);
    stage='logout with draft checks';
    await page.click('[data-personal-action=logout]');
    await page.wait("Boolean(window.finishOldDraft) && molisWorkAccountTransition.preparing");
    await page.evaluate(`{
      const frame=[...document.querySelectorAll('iframe')].find(f=>{try{return Boolean(f.contentWindow?.molisWorkAccountTransition);}catch{return false;}});
      const root=frame.contentDocument.createElement('div');frame.contentDocument.body.append(root);
      frame.contentWindow.molisWorkAccountTransition.page(root,async()=>{},()=>{},()=>{});
    }`);
    await page.wait("!document.querySelector('[data-personal-action=logout]').disabled && !molisWorkAccountTransition.preparing");
    await page.evaluate("window.finishOldDraft()");
    assert.ok((await (await request('/api/personal/status')).json()).identity,'a nested participant change cancels the preparation and a late draft result cannot log out');
    const second=await browser.page();await second.command('Page.enable');await second.viewport(1440,900);
    await second.command('Page.navigate',{url:origin+'/projects/personal/'});
    await second.wait("Boolean(window.molisWorkAccountTransition) && !document.body.hasAttribute('data-account-registering')");
    const storageEvents=await second.evaluate(`new Promise(resolve=>{
      const scope=document.querySelector('meta[name="molis-work-page-session"]').content.split('.')[1];
      const key='molis-review-feedback:storage-event',seen=[];
      const writer=document.createElement('iframe');document.body.append(writer);
      const listener=event=>{
        seen.push({key:event.key,trusted:event.isTrusted,value:event.newValue});
        if(event.key!==key)return;
        removeEventListener('storage',listener);writer.remove();resolve(seen);
      };
      addEventListener('storage',listener);
      writer.contentWindow.localStorage.setItem('molis-account-cache:another-lease:'+key,'other');
      writer.contentWindow.localStorage.setItem('molis-account-cache:'+encodeURIComponent(scope)+':'+key,'own');
    })`);
    assert.deepEqual(storageEvents,[{key:'molis-review-feedback:storage-event',trusted:true,value:'own'}],
      'WUA-32: native cache events expose only this account logical keys and retain their trusted marker');
    await second.evaluate(`sessionStorage.setItem('molis-review-feedback:/api/agent/reviews:second','account-A-second')`);
    await page.command('Page.bringToFront');
    await page.evaluate(`(async()=>{
      localStorage.setItem('molis-work-plugin-records:board', JSON.stringify({secret:'account-A-only'}));
      sessionStorage.setItem('molis-review-feedback:/api/agent/reviews:synthetic', 'account-A-feedback');
      localStorage.setItem('unrelated-test-data', 'preserve');
      localStorage.setItem('molis-account-cache:another-lease:molis-review-feedback:test','other-account-copy');
      await caches.open('molis-account-cache:another-lease:molis-plugin-page:test:drafts');
      sessionStorage.setItem('unrelated-test-data', 'preserve');
      const cache=await caches.open('molis-plugin-page:synthetic-account-A:drafts');
      await cache.put('/.molis-draft/synthetic',new Response('account-A-draft'));
      await caches.open('unrelated-test-cache');
    })()`);
    // The fact is also recorded outside the document, so successful logout navigation cannot erase the assertion.
    let saved=false,arrived=false;
    const stopNavigation=browser.on('Page.frameNavigated',(params,session)=>{
      const frame=params.frame as {parentId?:string;url:string};
      if(session===page.sessionId&&!frame.parentId&&new URL(frame.url).searchParams.get('accountEntry')==='1')arrived=true;
    });
    await page.command('Runtime.addBinding',{name:'recordAccountDraftSaved'});
    const unlisten=browser.on('Runtime.bindingCalled',params=>{if(params.name==='recordAccountDraftSaved')saved=true;});
    await page.evaluate(`{
      const frame=[...document.querySelectorAll('iframe')].find(f=>{try{return Boolean(f.contentWindow?.molisWorkAccountTransition);}catch{return false;}});
      frame.contentWindow.molisWorkAccountTransition.page(frame.contentDocument.body,async()=>{recordAccountDraftSaved('saved');},()=>new Promise(resolve=>setTimeout(()=>{localStorage.setItem('molis-work-plugin-records:board','late-account-A-write');resolve();},25)),()=>{});
    }`);
    await second.evaluate(`{window.confirm=()=>true;for(const f of document.querySelectorAll('iframe')){try{f.contentWindow.confirm=window.confirm;}catch{/* Opaque plugin frames cannot access the top-level dialog. */}}}`);
    await page.evaluate(`window.draftConfirmations=0;window.confirm=()=>{window.draftConfirmations++;return false;};for(const f of document.querySelectorAll('iframe')){try{f.contentWindow.confirm=window.confirm;}catch{/* Opaque plugin frames cannot access the top-level dialog. */}}`);
    stage='cancel logout preserves browser-only drafts';
    await page.click('[data-personal-action=logout]');
    await page.wait("window.draftConfirmations>0 && !molisWorkAccountTransition.preparing && !document.querySelector('[data-personal-action=logout]').disabled");
    assert.ok((await (await request('/api/personal/status')).json()).identity,'cancel preserves the current account');
    assert.equal(await page.evaluate(`sessionStorage.getItem('molis-review-feedback:/api/agent/reviews:synthetic')`),'account-A-feedback');
    assert.equal(await page.evaluate(`(async()=>{const cache=await caches.open('molis-plugin-page:synthetic-account-A:drafts');return await(await cache.match('/.molis-draft/synthetic')).text();})()`),'account-A-draft');
    await page.evaluate(`window.confirm=()=>{window.draftConfirmations++;return true;};for(const f of document.querySelectorAll('iframe')){try{f.contentWindow.confirm=window.confirm;}catch{/* Opaque plugin frames cannot access the top-level dialog. */}}`);
    stage='confirmed logout discards browser-only drafts';
    await page.click('[data-personal-action=logout]');
    await until(async()=>!(await (await request('/api/personal/status')).json()).identity);
    await until(()=>saved);
    assert.equal(saved,true,'embedded draft flush finished before logout');
    stage='logout navigation';
    await until(()=>arrived);stopNavigation();
    await second.wait("Boolean(document.querySelector('.account-dialog input[name=address]'))");
    assert.equal(await page.evaluate('location.href'),await second.evaluate('location.href'),'both tabs resume the same anonymous login instead of competing for its cookie');
    await page.wait("Boolean(document.querySelector('.account-dialog input[name=address]'))");
    const retained=await page.evaluate<{local:string|null;session:string|null;caches:string[];unrelated:string|null;other:string|null;accountKeys:string[]}>(`(async()=>({
      local:localStorage.getItem('molis-work-plugin-records:board'),
      session:sessionStorage.getItem('molis-review-feedback:/api/agent/reviews:synthetic'),
      other:localStorage.getItem('molis-account-cache:another-lease:molis-review-feedback:test'),accountKeys:[...Object.keys(localStorage),...Object.keys(sessionStorage)].filter(key=>key.startsWith('molis-account-cache:')&&!key.startsWith('molis-account-cache:another-lease:')),caches:await caches.keys(),unrelated:localStorage.getItem('unrelated-test-data')
    }))()`);
    assert.deepEqual(retained.accountKeys,[],'physical account cache must be deleted, not only hidden');
    assert.ok(!retained.caches.some(name=>name.startsWith('molis-account-cache:')&&!name.startsWith('molis-account-cache:another-lease:')),'physical draft cache must be deleted');
    assert.equal(retained.local,null,'old account record cache must be removed on logout');
    assert.equal(retained.session,null,'old account feedback must be removed on logout');
    assert.ok(!retained.caches.includes('molis-plugin-page:synthetic-account-A:drafts'),'old account draft cache must be removed');
    assert.equal(retained.unrelated,'preserve');
    assert.equal(retained.other,'other-account-copy','old scope cleanup cannot delete a newer account scope');
    assert.ok(retained.caches.includes('molis-account-cache:another-lease:molis-plugin-page:test:drafts'));
    await until(async()=>await second.evaluate(`!Object.keys(sessionStorage).some(key=>key.startsWith('molis-account-cache:'))`));
    await until(()=>streams.size===0);

    assert.ok(retained.caches.includes('unrelated-test-cache'));
    assert.equal(cookieCleared,true,'revocation must not abort the response that clears the authenticated browser cookie');
    // Cancel this anonymous attempt as its owner before simulating an unrelated stale cookie.
    const pendingCookies=await page.command<{cookies:{name:string;value:string}[]}>('Network.getCookies',{urls:[origin]});
    cookie=pendingCookies.cookies.filter(c=>c.name==='molis-work-session').map(c=>c.name+'='+c.value).join('; ');
    const pending=await (await request('/api/personal/login',{method:'POST',body:'{}'})).json();
    assert.equal((await request('/api/personal/login-cancel?attempt='+pending.loginAttempt,{method:'POST',body:'{}'})).status,200);

    // A stale cookie from another tab or a previous Host process still must not make the sign-in entry reload forever.
    await page.command('Network.setCookie',{name:staleCookie.slice(0,equals),value:staleCookie.slice(equals+1),url:origin,httpOnly:true,sameSite:'Lax'});
    stage='stale cookie entry';
    const before=entries;
    let reopened=false;const stopReopen=browser.on('Page.frameNavigated',(params,session)=>{const frame=params.frame as {parentId?:string;url:string};if(session===page.sessionId&&!frame.parentId&&new URL(frame.url).searchParams.get('accountEntry')==='1')reopened=true;});
    await page.command('Page.navigate',{url:origin+'/'});await until(()=>reopened);stopReopen();
    await page.wait("Boolean(document.querySelector('.account-dialog input[name=address]'))");
    await new Promise(resolve=>setTimeout(resolve,1000));
    assert.equal(entries,before+2,'a stale-cookie entry opens the login form once and remains stable');
    unlisten();
  } catch(error) {
    throw new Error('Account reconnect stage: '+stage,{cause:error});
  } finally {
    await browser?.close();server.closeAllConnections();
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
    await new Promise<void>((resolve,reject)=>auth.server.close(error=>error?reject(error):resolve()));
    if(previous===undefined)delete process.env.MOLIS_WORK_ACCOUNT_CONFIG;else process.env.MOLIS_WORK_ACCOUNT_CONFIG=previous;
    rmSync(home,{recursive:true,force:true});
  }
});
