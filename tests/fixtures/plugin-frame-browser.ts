import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { Server } from "node:http";
import { renderPluginFrameClientScript } from "@molis-ai/molis-work-app-workbench";
import type { openGoalBrowser } from "./goal-browser.js";

type Browser = Pick<NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>, "command" | "on" | "evaluate" | "sessionId">;
type Context = { id: number; auxData?: { frameId?: string; isDefault?: boolean } };

/** Serve observation before the unmodified production bridge. Opaque srcdoc targets can attach after their scripts ran. */
export function observePluginFrames(server: Server): (source: string) => void {
  let source = "";
  const handlers = server.listeners("request"); server.removeAllListeners("request");
  server.on("request", (request, response) => {
    if (source && request.method === "GET" && request.url === "/assets/molis-work-plugin-frame.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
      response.end("(()=>{\n" + source + "\n})();\n" + renderPluginFrameClientScript());
    } else for (const handler of handlers) handler.call(server, request, response);
  });
  return value => { source = value; };
}

/** Observe the public factory in every actual opaque document, keeping its sandbox and CSP unchanged. */
export async function pluginFrameInitScript(t: TestContext, browser: Browser & { setFrameInitScript(source: string): void }, source: string, prepare?: (session: string) => Promise<void>): Promise<void> {
  browser.setFrameInitScript(source);
  if (!prepare) return;
  const pending: Promise<void>[] = [], failures: unknown[] = [];
  t.after(browser.on("Target.attachedToTarget", params => {
    if ((params.targetInfo as { type: string }).type === "iframe") {
      pending.push(prepare(String(params.sessionId)).catch(error => { failures.push(error); }));
    }
  }));
  t.after(async () => { await Promise.all(pending); if (failures.length) throw new AggregateError(failures, "Plugin frame observation failed"); });
  await prepare(browser.sessionId);
}

/** Operate the real child execution context through DevTools; never pierce it through the owner's DOM. */
export async function pluginFrameBrowser(t: TestContext, browser: Browser, surface?: string, ownerFrame?: string) {
  const contexts = new Map<string, { id: number; session: string }>();
  t.after(browser.on("Runtime.executionContextCreated", (params, session) => {
    const context = params.context as Context;
    if (context.auxData?.isDefault && context.auxData.frameId && session) contexts.set(context.auxData.frameId, { id: context.id, session });
  }));
  t.after(browser.on("Target.attachedToTarget", params => {
    const info = params.targetInfo as { type?: string };
    if (info.type === "iframe") void browser.command("Runtime.enable", {}, String(params.sessionId)).catch(() => {});
  }));
  await browser.command("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, browser.sessionId);
  await browser.command("Runtime.enable", {}, browser.sessionId);
  const selector = surface ? `iframe[data-plugin-frame=${JSON.stringify(surface)}]` : "iframe[data-plugin-frame]";
  // A side view or split pane has a trusted owner document around its opaque plugin frame. Only that owner is
  // reached through the parent's DOM; all plugin inspection still runs in its own DevTools execution context.
  const owner = `const owner = ${ownerFrame ? `document.querySelector(${JSON.stringify(ownerFrame)})` : "null"};
    const doc = owner ? owner.contentDocument : document;
    if (!doc) throw Error('Missing trusted owner document');`;
  async function context() {
    const object = await browser.command<{ result: { objectId?: string } }>("Runtime.evaluate", {
      expression: `(()=>{${owner}return doc.querySelector(${JSON.stringify(selector)});})()`, returnByValue: false,
    }, browser.sessionId);
    assert.ok(object.result.objectId, `Missing frame: ${surface}`);
    const { node } = await browser.command<{ node: { frameId?: string } }>("DOM.describeNode", { objectId: object.result.objectId }, browser.sessionId);
    await browser.command("Runtime.releaseObject", { objectId: object.result.objectId }, browser.sessionId);
    assert.ok(node.frameId, "frame owner must identify a real child");
    const current = contexts.get(node.frameId);
    assert.ok(current, `Missing child execution context: ${node.frameId}`);
    return { ...current, frameId: node.frameId };
  }
  async function evaluate<T = unknown>(expression: string, timeoutMs?: number): Promise<T> {
    const current = await context();
    const result = await browser.command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
      expression, contextId: current.id, returnByValue: true, awaitPromise: true,
    }, current.session, timeoutMs);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression: string, timeoutMs = 10000): Promise<void> {
    const end = Date.now() + timeoutMs; let failure: unknown;
    while (Date.now() < end) {
      try { if (await evaluate(`Boolean(${expression})`)) return; } catch (error) { failure = error; }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    const hostState = await browser.evaluate(`(()=>{${owner}const root=doc.querySelector('[data-work-surface='+${JSON.stringify(JSON.stringify(surface))}+']');return {surface:document.body.dataset.desktopSurface,root:root?{...root.dataset}:null,hidden:root?.hidden,parent:root?.parentElement?.className,text:root?.innerText?.slice(-400),frames:[...doc.querySelectorAll('iframe[data-plugin-frame]')].map(frame=>frame.dataset.pluginFrame)}})()`).catch(() => null);
    throw new Error(expression + " " + JSON.stringify(hostState), { cause: failure });
  }
  async function withPoint<T>(target: string, consume: (position: {x:number; y:number}, delivered: () => Promise<boolean>) => Promise<T>): Promise<T> {
    const deadline = Date.now() + 10000;
    const remaining = () => Math.max(1, deadline - Date.now());
    await waitFor(`document.querySelector(${JSON.stringify(target)})`, remaining());
    const current = await context();
    // The DOM hit can be ready before Chromium routes input to the opaque child. Keep the receipt in a
    // temporary remote object, never on window; a previous move or another document cannot satisfy it.
    const receipt = await browser.command<{ result: { objectId?: string }; exceptionDetails?: unknown }>("Runtime.evaluate", {
      expression: `(() => {
        let expected = null, received = null, pressed = null, released = null;
        const matches = target => [...document.querySelectorAll(${JSON.stringify(target)})].find(element => element.contains(target));
        const listener = event => {
          if (!expected || !event.isTrusted || event.pointerType !== 'mouse') return;
          const element = matches(event.target);
          if (event.type !== 'pointermove') {
            const receipt = {element, x:event.clientX, y:event.clientY, button:event.button, buttons:event.buttons};
            if (event.type === 'pointerdown') pressed = receipt; else released = receipt;
            return;
          }
          if (event.buttons !== 0) return;
          // CSS coordinates can be fractional; the input event may round them to a pixel.
          if (element && Math.abs(event.clientX - expected.x) < 1 && Math.abs(event.clientY - expected.y) < 1)
            received = {element, x: expected.x, y: expected.y};
        };
        const types = ['pointermove', 'pointerdown', 'pointerup'];
        for (const type of types) document.addEventListener(type, listener, {capture:true, passive:true});
        const remove = () => { for (const type of types) document.removeEventListener(type, listener, true); };
        // Bound the listeners even if the protocol response carrying their object handle is lost.
        const expiry = setTimeout(remove, ${remaining()});
        return {
          arm(x, y) { expected = {x, y}; received = pressed = released = null; },
          arrived(x, y) {
            if (!received || received.x !== x || received.y !== y) return false;
            const element = received.element, box = element.getBoundingClientRect();
            return element.isConnected && !element.disabled && box.width > 0 && box.height > 0
              && x >= box.left && x < box.right && y >= box.top && y < box.bottom
              && [...document.querySelectorAll(${JSON.stringify(target)})].includes(element)
              && element.contains(document.elementFromPoint(x, y));
          },
          delivered(x, y) {
            return Boolean(received && [pressed, released].every(event => event && event.element === received.element
              && event.button === 0 && Math.abs(event.x - x) < 1 && Math.abs(event.y - y) < 1)
              && pressed.buttons === 1 && released.buttons === 0);
          },
          dispose() { clearTimeout(expiry); remove(); expected = received = pressed = released = null; }
        };
      })()`, contextId: current.id, returnByValue: false,
    }, current.session, remaining());
    assert.equal(receipt.exceptionDetails, undefined, JSON.stringify(receipt.exceptionDetails));
    assert.ok(receipt.result.objectId, 'Missing child input receipt');
    const objectId = receipt.result.objectId;
    const callReceipt = async (functionDeclaration: string, point: {x:number; y:number}) => {
      const result = await browser.command<{result:{value: boolean}; exceptionDetails?: unknown}>("Runtime.callFunctionOn", {
        objectId, functionDeclaration, arguments: [{value:point.x}, {value:point.y}], returnByValue:true,
      }, current.session, remaining());
      assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    let movedTo: {x:number; y:number} | undefined;
    const move = async (point: {x:number; y:number}, offset: {x:number; y:number}) => {
      await callReceipt('function(x,y){this.arm(x,y);}', point);
      const position = {x:offset.x + point.x, y:offset.y + point.y};
      await browser.command("Input.dispatchMouseEvent", { type: "mouseMoved", ...position }, browser.sessionId, remaining());
      movedTo = position;
    };
    try {
      // Open the containing menu and hover the actual row before checking the final hit target.
      const hover = await evaluate<{ x: number; y: number } | null>(`(()=>{
        const element=document.querySelector(${JSON.stringify(target)});if(!element)return null;
        const menu=element.closest('details:not([open])');
        if(menu&&!menu.querySelector(':scope > summary')?.contains(element))menu.querySelector(':scope > summary')?.click();
        element.scrollIntoView({block:'center',behavior:'instant'});const box=element.getBoundingClientRect();
        return box.width&&box.height?{x:box.x+box.width/2,y:box.y+box.height/2}:null;
      })()`, remaining());
      if (hover) {
        const offset = await browser.evaluate<{ x: number; y: number }>(`(()=>{${owner}
          const box=doc.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(),outer=owner?.getBoundingClientRect()??{x:0,y:0};
          return{x:outer.x+box.x,y:outer.y+box.y};})()`);
        await move(hover, offset);
      }
      let covered: unknown;
      while (Date.now() < deadline) {
        const point = await evaluate<{ x: number; y: number }>(`(async()=>{const deadline=Date.now()+${remaining()};let last='Missing target';
          while(Date.now()<deadline){const element=[...document.querySelectorAll(${JSON.stringify(target)})].find(node=>node.getClientRects().length);
            if(element){element.scrollIntoView({block:'center',behavior:'instant'});
              await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
              const box=element.getBoundingClientRect(),x=box.x+box.width/2;
              const y=[box.y+box.height/2,box.top+8,box.bottom-8].find(y=>element.contains(document.elementFromPoint(x,y)));
              if(element.isConnected&&box.width&&box.height&&!element.disabled&&y!==undefined)return{x,y};
              last=JSON.stringify({target:element.outerHTML,box:box.toJSON()});}
            else {const item=document.querySelector(${JSON.stringify(target)});last=JSON.stringify({target:${JSON.stringify(target)},hidden:item?.hidden,ancestors:item?[item,...(()=>{const a=[];let n=item.parentElement;while(n&&a.length<5){a.push(n);n=n.parentElement}return a})()].map(n=>({tag:n.tagName,class:n.className,hidden:n.hidden,display:getComputedStyle(n).display})):[]});}
            await new Promise(resolve=>setTimeout(resolve,40));
          }throw Error('Target is hidden, disabled or covered: '+last);})()`, remaining());
        const frame = await browser.evaluate<{ x: number; y: number; covered?: unknown }>(`(()=>{${owner}
          const frame=doc.querySelector(${JSON.stringify(selector)}), box=frame.getBoundingClientRect(), outer=owner?.getBoundingClientRect()??{x:0,y:0};
          const hit=doc.elementFromPoint(box.x+${point.x},box.y+${point.y});
          if(hit!==frame)return{covered:{target:${JSON.stringify(target)},point:${JSON.stringify(point)},frame:box.toJSON(),hit:hit?.outerHTML.slice(0,600),viewport:[doc.defaultView.innerWidth,doc.defaultView.innerHeight]}};
          const ownerHit=owner&&document.elementFromPoint(outer.x+box.x+${point.x},outer.y+box.y+${point.y});
          if(owner&&ownerHit!==owner)return{covered:{owner:outer.toJSON(),hit:ownerHit?.outerHTML.slice(0,600)}};
          return{x:outer.x+box.x,y:outer.y+box.y};})()`);
        if (Date.now() >= deadline) break;
        if (!frame.covered) {
          const position = {x:frame.x + point.x, y:frame.y + point.y};
          if (movedTo?.x === position.x && movedTo.y === position.y
            && await callReceipt('function(x,y){return this.arrived(x,y);}', point) && Date.now() < deadline) {
            // Consume the guarded point before cleanup yields to another layout. CDP dispatch itself is
            // not atomic with this guard; the trusted down/up receipt detects that remaining gap.
            return await consume(position, () => callReceipt('function(x,y){return this.delivered(x,y);}', point));
          }
          await move(point, frame);
        }
        covered = frame.covered;
        // The child can be ready before its owner finishes a tab switch or resize. Never dispatch through an overlay.
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      throw new Error("Input was not delivered to plugin frame: " + target + "; covered=" + JSON.stringify(covered));
    } catch (error) {
      if (Date.now() >= deadline) throw new Error("Input was not delivered to plugin frame within 10000ms: " + target, {cause:error});
      throw error;
    } finally {
      // A destroyed context has already removed its listener. Always release the remote handle as well.
      const cleanup = async (method: string, params: Record<string, unknown>) => {
        try { await browser.command(method, params, current.session, 1000); }
        catch (error) { if (!/Cannot find context|Cannot find object|Could not find object|Session with given id not found|Target closed/.test(String(error))) throw error; }
      };
      try { await cleanup("Runtime.callFunctionOn", {objectId, functionDeclaration:'function(){this.dispose();}'}); }
      finally { await cleanup("Runtime.releaseObject", {objectId}); }
    }
  }
  // Public coordinates are only a snapshot; click keeps its receipt alive while consuming them.
  async function point(target: string): Promise<{ x: number; y: number }> {
    return withPoint(target, async position => position);
  }
  async function click(target: string, clickCount = 1): Promise<void> {
    for (let count = 1; count <= clickCount; count++) {
      await withPoint(target, async (position, delivered) => {
        const input = {...position, button: "left", clickCount: count};
        try { await browser.command("Input.dispatchMouseEvent", {type:"mousePressed", ...input}, browser.sessionId); }
        finally { await browser.command("Input.dispatchMouseEvent", {type:"mouseReleased", ...input}, browser.sessionId); }
        // Never retry after a press: a side effect may already have happened on the wrong element.
        if (!await delivered()) throw new Error("Input was not delivered to plugin frame: " + target + "; pointerdown/pointerup target mismatch");
      });
    }
  }
  async function command<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const current = await context();
    return browser.command<T>(method, params, current.session);
  }
  async function setFiles(selector: string, files: readonly string[]): Promise<void> {
    const current = await context();
    const { result } = await browser.command<{ result: { objectId?: string } }>("Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(selector)})`, contextId: current.id, returnByValue: false,
    }, current.session);
    assert.ok(result.objectId, `Missing file input: ${selector}`);
    try { await browser.command("DOM.setFileInputFiles", { objectId: result.objectId, files }, current.session); }
    finally { await browser.command("Runtime.releaseObject", { objectId: result.objectId }, current.session); }
  }
  return { evaluate, waitFor, click, point, setFiles, frameCommand: command, frameId: async () => (await context()).frameId };
}
