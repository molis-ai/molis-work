import assert from 'node:assert/strict';
import test from 'node:test';
import {openGoalBrowser} from './fixtures/goal-browser.js';
import {pluginFrameBrowser} from './fixtures/plugin-frame-browser.js';
import {accountRefreshFixture} from './fixtures/account-refresh.js';
import {createSingleHomeTestWebServer} from './fixtures/local-web-core.js';
import {createLocalWebAssets,createLocalHostWorkbenchRenderer} from '@molis-ai/molis-work-app-local-host';
import {desktopWorkbenchRendererPorts} from '@molis-ai/molis-work-app-desktop';

test('ASR-04 first installation page stays inert until registration, while its real plugin frame can mount', {timeout:90_000}, async t => {
  const browser = await openGoalBrowser(t,true); if (!browser) return;
  // The existing installation fixture owns real Auth, cookie leases and page registration.
  // Its callback exposes only the selected Home, so supply the production presentation flag explicitly.
  const f = await accountRefreshFixture(t,home => createSingleHomeTestWebServer({homeDirectory:home,accountRegistration:true}));
  // The HTTP-only fixture deliberately has no entry asset handler. Production serves these public bundles
  // before account selection: opaque srcdoc script requests cannot depend on the business Cookie.
  const assets=createLocalWebAssets({ptyClientFilePath:()=>'/unused',renderer:createLocalHostWorkbenchRenderer(desktopWorkbenchRendererPorts)});
  const handlers=f.server.listeners('request');f.server.removeAllListeners('request');
  f.server.on('request',(request,response)=>{
    if(assets.serveWorkbenchAsset(request,response,new URL(request.url??'/',f.origin).pathname))return;
    for(const handler of handlers)handler.call(f.server,request,response);
  });
  const network:unknown[]=[],consoleErrors:unknown[]=[];
  t.after(browser.on('Network.responseReceived',params=>{
    const response=params.response as {url?:string;status?:number;mimeType?:string};
    if(response.url?.startsWith(f.origin+'/assets/'))network.push({url:response.url,status:response.status,mimeType:response.mimeType});
  }));
  t.after(browser.on('Runtime.exceptionThrown',params=>{consoleErrors.push(params.exceptionDetails);}));
  try {
    await f.login('alice');
    const html = await (await f.request('/plugins/cognia')).text();
    assert.match(html, /<body[^>]*\binert\b[^>]*data-account-registering/u, 'the interaction gate is present in SSR, before browser scripts run');
    await browser.command('Network.enable',{},browser.sessionId);
    await browser.command('Network.setCookie',{name:'molis-work-session',value:f.cookie.slice(f.cookie.indexOf('=')+1),url:f.origin},browser.sessionId);
    await browser.command('Page.addScriptToEvaluateOnNewDocument',{source:`{
      const original=window.fetch.bind(window);
      window.registrationProbe={held:false};
      window.fetch=(input,init)=>{
        const url=new URL(String(input),location.href),probe=window.registrationProbe;
        if(url.pathname==='/api/personal/status' && url.searchParams.has('page') && !probe.held){
          probe.held=true;
          return new Promise((resolve,reject)=>{probe.release=()=>original(input,init).then(resolve,reject);});
        }
        return original(input,init);
      };
    }`},browser.sessionId);
    const child = await pluginFrameBrowser(t,browser,'cognia');
    await browser.navigate(()=>browser.command('Page.navigate',{url:f.origin+'/plugins/cognia'},browser.sessionId));
    await browser.waitFor('window.registrationProbe?.held && document.body.inert');
    await child.waitFor("document.querySelector('[data-cognia-search]')");
    await browser.waitFor("Boolean(document.querySelector('iframe[data-plugin-frame=cognia]')) && !document.querySelector('iframe[data-plugin-frame=cognia]').closest('[data-ui-client-state=loading]')");
    assert.equal(await browser.evaluate('molisWorkAccountTransition.preparing'),false,'initial input registration must not freeze the frame mounting lifecycle');
    const pressSearch = async (text:string) => {
      const inner = await child.evaluate<{x:number;y:number}>("(()=>{const r=document.querySelector('[data-cognia-search]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
      const outer = await browser.evaluate<{x:number;y:number}>("(()=>{const r=document.querySelector('iframe[data-plugin-frame=cognia]').getBoundingClientRect();return{x:r.x,y:r.y}})()");
      const point={x:inner.x+outer.x,y:inner.y+outer.y};
      await browser.command('Input.dispatchMouseEvent',{type:'mouseMoved',...point},browser.sessionId);
      await browser.command('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},browser.sessionId);
      await browser.command('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},browser.sessionId);
      await browser.command('Input.insertText',{text},browser.sessionId);
    };
    await pressSearch('must-not-edit');
    assert.equal(await child.evaluate("document.querySelector('[data-cognia-search]').value"),'','trusted pointer and text input cannot edit an unregistered page');
    await browser.evaluate('window.registrationProbe.release()');
    await browser.waitFor("!document.body.inert && !document.body.hasAttribute('data-account-registering')");
    const inputState = async () => ({
      owner:await browser.evaluate("(()=>{const frame=document.querySelector('iframe[data-plugin-frame=cognia]');return{bodyInert:document.body.inert,registration:document.body.hasAttribute('data-account-registering'),preparing:molisWorkAccountTransition.preparing,active:document.activeElement?.outerHTML.slice(0,300),inertAncestor:frame.closest('[inert]')?.outerHTML.slice(0,300),mount:frame.closest('[data-ui-client-state]')?.dataset.uiClientState,rect:frame.getBoundingClientRect().toJSON()}})()"),
      child:await child.evaluate("({bodyInert:document.body.inert,active:document.activeElement?.outerHTML.slice(0,300),search:document.querySelector('[data-cognia-search]').getBoundingClientRect().toJSON()})"),
    });
    assert.equal(await child.evaluate('document.body.inert'),false,'initial registration must not leave the child frozen: '+JSON.stringify(await inputState()));
    // Use the existing frame fixture's trusted pointer receipt and hit-test warmup; a parsed child input alone does not mean Chrome has routed input to it.
    try { await child.click('[data-cognia-search]'); }
    catch(error) { t.diagnostic(JSON.stringify(await inputState())); throw error; }
    assert.equal(await child.evaluate("document.activeElement?.matches('[data-cognia-search]')"),true,'the real click must focus the input: '+JSON.stringify(await inputState()));
    await browser.command('Input.insertText',{text:'registered-edit'},browser.sessionId);
    assert.equal(await child.evaluate("document.querySelector('[data-cognia-search]').value"),'registered-edit','the same mounted frame accepts real input once the Host has registered its document: '+JSON.stringify(await inputState()));
    await t.test('ASR-04 a delayed null status snapshot cannot resume a newer real Host SSE preparation', async () => {
      await browser.evaluate(`{
        const original=window.fetch.bind(window),probe=window.registrationProbe;
        probe.acks=0;probe.holdNextStatus=true;
        window.fetch=async(input,init)=>{
          const url=new URL(String(input),location.href);
          if(url.pathname==='/api/personal/prepare' && url.searchParams.get('action')==='ack')probe.acks++;
          const response=await original(input,init);
          if(url.pathname==='/api/personal/status' && url.searchParams.has('page') && probe.holdNextStatus){
            probe.holdNextStatus=false;probe.oldStatus=await response.clone().json();probe.oldCaptured=true;
            return new Promise(resolve=>{probe.releaseOld=()=>resolve(response);});
          }
          return response;
        };
        window.dispatchEvent(new Event('focus'));
      }`);
      await browser.waitFor('window.registrationProbe.oldCaptured');
      assert.equal(await browser.evaluate('window.registrationProbe.oldStatus.preparation'),null,'capture a real older Host status before a preparation exists');
      const started = await f.request('/api/personal/prepare?action=start&page=account-refresh-page&intent=switch','POST');
      assert.equal(started.status,200,await started.clone().text());
      const preparation = await started.json() as {id:string};
      await browser.waitFor('window.registrationProbe.acks > 0 && molisWorkAccountTransition.preparing');
      await browser.evaluate('window.registrationProbe.releaseOld()');
      await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      assert.equal(await browser.evaluate('molisWorkAccountTransition.preparing'),true,'the older HTTP null cannot thaw a page already prepared through the live Host stream');
      assert.equal(await child.evaluate('document.body.inert'),true,'the actual opaque frame remains frozen after the stale status is delivered');
      const cancelled = await f.request('/api/personal/prepare?action=cancel&page=account-refresh-page&id='+encodeURIComponent(preparation.id),'POST');
      assert.equal(cancelled.status,200);
      await browser.waitFor('!molisWorkAccountTransition.preparing');
      await child.waitFor('!document.body.inert');
    });
  } catch(error) {
    t.diagnostic(JSON.stringify({network,consoleErrors,owner:await browser.evaluate("({url:location.pathname,bodyInert:document.body.inert,registration:document.body.hasAttribute('data-account-registering'),roots:[...document.querySelectorAll('[data-ui-client-state]')].map(node=>({state:node.dataset.uiClientState,inert:node.inert,busy:node.getAttribute('aria-busy')})),alerts:[...document.querySelectorAll('[role=alert]')].map(node=>node.textContent)})").catch(()=>null)}));
    throw error;
  } finally {
    await browser.navigate(()=>browser.command('Page.navigate',{url:'about:blank'},browser.sessionId));
    await f.close();
  }
});
