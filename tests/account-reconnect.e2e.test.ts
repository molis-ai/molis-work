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

test('ASR-09 real browser reconnects its original page, saves embedded drafts, then logs out', {timeout:90_000}, async () => {
  const home=mkdtempSync(join(tmpdir(),'molis-account-reconnect-'));
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
    stage='reconnect stream';
    streams.get(originalPage)!.destroy();
    await until(()=>opened===2&&streams.size===1);
    assert.equal(pageIds.size,1,'reconnection retains the original page rather than creating a phantom participant');
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
      frame.contentWindow.molisWorkAccountTransition.page(frame.contentDocument.body,async()=>{recordAccountDraftSaved('saved');},()=>{},()=>{});
    }`);
    stage='logout with draft checks';
    await page.click('[data-personal-action=logout]');
    await until(async()=>!(await (await request('/api/personal/status')).json()).identity);
    assert.equal(saved,true,'embedded draft flush finished before logout');
    stage='logout navigation';
    await until(()=>arrived);stopNavigation();
    await page.wait("Boolean(document.querySelector('.account-dialog input[name=address]'))");
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
