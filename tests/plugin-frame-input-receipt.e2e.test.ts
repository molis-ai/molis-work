import assert from "node:assert/strict";
import test from "node:test";
import { openLingguangStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

type Child = Awaited<ReturnType<typeof pluginFrameBrowser>>;
const capture = "[data-lingguang-capture]";

// Inspect the real document's listeners independently of the fixture's receipt implementation.
async function pointerListeners(child: Child, receiptOnly = false) {
  const { result } = await child.frameCommand<{result:{objectId:string}}>("Runtime.evaluate", {expression:"document"});
  try {
    const { listeners } = await child.frameCommand<{listeners:Array<{type:string;useCapture:boolean;passive:boolean}>}>("DOMDebugger.getEventListeners", {objectId:result.objectId});
    // The product lazily adds bubbling pointerdown listeners. Receipt listeners are capture + passive;
    // count all three input types for layout regressions without conflating product lifecycle with leaks.
    return listeners.filter(listener => receiptOnly
      ? ["pointermove", "pointerdown", "pointerup"].includes(listener.type) && listener.useCapture && listener.passive
      : listener.type === "pointermove").length;
  } finally { await child.frameCommand("Runtime.releaseObject", {objectId:result.objectId}); }
}

for (const fault of ["wrong frame", "synthetic after a previous trusted move", "none"] as const) {
  test(`plugin frame input receipt: ${fault}`, {timeout:60_000}, async t => {
    const b = await openGoalBrowser(t, true); if (!b) return;
    let child: Child, inject = false, presses = 0, releases = 0, posts = 0, synthetic = 0;
    const moves: Array<{x:unknown;y:unknown}> = [];
    const command: typeof b.command = async (method, params = {}, session, timeout) => {
      if (method === "Input.dispatchMouseEvent") {
        if (params.type === "mousePressed") presses++;
        if (params.type === "mouseReleased") releases++;
        if (params.type === "mouseMoved") {
          moves.push({x:params.x,y:params.y});
          if (inject) {
            if (fault === "synthetic after a previous trusted move") {
              assert.equal(await child.evaluate(`(() => {
                const target=document.querySelector(${JSON.stringify(capture)}), box=target.getBoundingClientRect();
                const event=new PointerEvent('pointermove',{bubbles:true,pointerType:'mouse',buttons:0,clientX:box.x+box.width/2,clientY:box.y+box.height/2});
                target.dispatchEvent(event); return event.isTrusted;
              })()`), false);
              synthetic++;
            }
            // Real protocol input, deliberately routed outside the opaque child; do not fake an acknowledgement.
            return b.command(method, {...params,x:1,y:1}, session, timeout);
          }
        }
      }
      return b.command(method, params, session, timeout);
    };
    child = await pluginFrameBrowser(t, {...b,command}, "lingguang");
    b.server.on("request", request => { if (request.method === "POST" && request.url?.endsWith("/api/plugins/io.molis.work.lingguang/sparks")) posts++; });
    const count = () => { const store=openLingguangStore(b.homeDirectory); try { return store.list(b.projectId!).length; } finally { store.close(); } };
    // Keep the emulation-only geometry of plugin-small-ux; no native resize or Chrome configuration workaround.
    await b.command("Emulation.setDeviceMetricsOverride", {width:1280,height:900,deviceScaleFactor:1,mobile:false}, b.sessionId);
    await b.navigate(() => b.command("Page.navigate", {url:`${b.origin}/projects/${b.projectId}/`}, b.sessionId));
    await b.waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')",20_000);
    await b.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
    await child.waitFor("document.querySelector('[data-lingguang-capture]')",20_000);
    assert.equal(count(),0);
    const listenersBefore=await pointerListeners(child);
    if (fault === "synthetic after a previous trusted move") await child.point(capture);
    if (fault !== "none") {
      inject=true;
      const start=Date.now();
      await assert.rejects(child.click(capture), /Input was not delivered to plugin frame/);
      assert.ok(Date.now()-start < 12_000, "one 10s delivery deadline, not a fresh timeout per move");
      assert.equal(presses,0); assert.equal(releases,0); assert.equal(posts,0); assert.equal(count(),0);
      assert.equal(await child.evaluate("document.querySelector('[data-lingguang=workbench]').dataset.expanded"),"false");
      assert.ok(moves.length>0);
      if (fault === "synthetic after a previous trusted move") assert.ok(synthetic>0);
    } else {
      await child.evaluate(`window.receiptTestMoves=[];document.addEventListener('pointermove',event=>{
        if(document.querySelector(${JSON.stringify(capture)}).contains(event.target))window.receiptTestMoves.push({trusted:event.isTrusted,x:event.clientX,y:event.clientY});
      },{capture:true,passive:true});`);
      const first=await child.point(capture), firstEvents=await child.evaluate<number>("window.receiptTestMoves.length");
      const second=await child.point(capture);
      assert.deepEqual(second,first);
      const events=await child.evaluate<Array<{trusted:boolean;x:number;y:number}>>("window.receiptTestMoves");
      assert.ok(firstEvents>0 && events.length>firstEvents,"the same-coordinate second move really reaches the child");
      assert.ok(events.every(event=>event.trusted));
      assert.deepEqual(events[firstEvents],events[firstEvents-1]);
      assert.equal(presses,0); assert.equal(releases,0); assert.equal(count(),0);
      t.diagnostic(`same-coordinate trusted moves: ${JSON.stringify(events)}`);
      await child.click(capture);
      await child.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'",20_000);
      assert.equal(presses,1,"one real press"); assert.equal(releases,1,"one real release"); assert.equal(posts,1,"one creation request"); assert.equal(count(),1,"one stored item");
      // The one listener installed by this test remains; the fixture's temporary listener does not.
      assert.equal(await pointerListeners(child),listenersBefore+1);
      return;
    }
    assert.equal(await pointerListeners(child),listenersBefore,"timeout removed the temporary pointer listener");
  });
}

// Controlled layout changes on a real Lingguang button exercise the helper contract;
// they do not claim to replay Coding's historical scroll-follow failure.
for (const fault of ["before final guard", "immediately before press"] as const) {
  test(`plugin frame input receipt rejects stale geometry: ${fault}`, {timeout:60_000}, async t => {
    const b = await openGoalBrowser(t, true); if (!b) return;
    let child: Child, inject = false, displaced = false, presses = 0, releases = 0, posts = 0;
    let movesAfterDisplacement = 0;
    const displace = async () => {
      displaced = true;
      assert.equal(await child.evaluate(`(() => {
        const target=document.querySelector(${JSON.stringify(capture)}), before=target.getBoundingClientRect();
        target.style.transform='translateY(96px)';
        const after=target.getBoundingClientRect();
        return after.y-before.y === 96 && !target.contains(document.elementFromPoint(before.x+before.width/2,before.y+before.height/2));
      })()`), true, "layout actually moved the button away from the sampled point");
    };
    const command: typeof b.command = async (method, params = {}, session, timeout) => {
      if (inject && !displaced && fault === "before final guard" && method === "Runtime.callFunctionOn"
        && String(params.functionDeclaration).includes("this.arrived(")) await displace();
      if (method === "Input.dispatchMouseEvent") {
        if (params.type === "mousePressed") {
          presses++;
          // This is after the helper's last guard, exactly at the CDP dispatch boundary.
          if (inject && !displaced && fault === "immediately before press") await displace();
        }
        if (params.type === "mouseReleased") releases++;
        if (params.type === "mouseMoved" && displaced) movesAfterDisplacement++;
      }
      return b.command(method, params, session, timeout);
    };
    child = await pluginFrameBrowser(t, {...b,command}, "lingguang");
    b.server.on("request", request => { if (request.method === "POST" && request.url?.endsWith("/api/plugins/io.molis.work.lingguang/sparks")) posts++; });
    const count = () => { const store=openLingguangStore(b.homeDirectory); try { return store.list(b.projectId!).length; } finally { store.close(); } };
    await b.command("Emulation.setDeviceMetricsOverride", {width:1280,height:900,deviceScaleFactor:1,mobile:false}, b.sessionId);
    await b.navigate(() => b.command("Page.navigate", {url:`${b.origin}/projects/${b.projectId}/`}, b.sessionId));
    await b.waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')",20_000);
    await b.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
    await child.waitFor("document.querySelector('[data-lingguang-capture]')",20_000);
    assert.equal(count(),0);
    await child.evaluate(`window.receiptTestButtons=[];for(const type of ['pointerdown','pointerup'])document.addEventListener(type,event=>{
      window.receiptTestButtons.push({type,trusted:event.isTrusted,target:!!event.target.closest(${JSON.stringify(capture)})});
    },{capture:true,passive:true});`);
    const listenersBefore=await pointerListeners(child,true);
    inject = true;
    if (fault === "before final guard") {
      await child.click(capture);
      await child.waitFor("document.querySelector('[data-lingguang=workbench]').dataset.expanded === 'true'");
      assert.ok(movesAfterDisplacement>0,"a stale guard must re-locate before the only press");
      assert.equal(posts,1); assert.equal(count(),1);
    } else {
      await assert.rejects(child.click(capture), /Input was not delivered to plugin frame/);
      assert.equal(movesAfterDisplacement,0,"never retry input after a press");
      assert.equal(await child.evaluate("document.querySelector('[data-lingguang=workbench]').dataset.expanded"),"false");
      assert.equal(posts,0); assert.equal(count(),0);
    }
    assert.equal(displaced,true); assert.equal(presses,1); assert.equal(releases,1);
    assert.deepEqual(await child.evaluate("window.receiptTestButtons"),[
      {type:"pointerdown",trusted:true,target:fault === "before final guard"},
      {type:"pointerup",trusted:true,target:fault === "before final guard"},
    ]);
    assert.equal(await pointerListeners(child,true),listenersBefore,"success and rejection both remove all temporary receipt listeners");
  });
}

test("plugin frame input receipt keeps its ordinary CDP budget for a delayed real disposal acknowledgement", {timeout:60_000}, async t => {
  const b = await openGoalBrowser(t, true); if (!b) return;
  let armed = false, receipt: { objectId: string; session?: string } | undefined;
  let presses = 0, releases = 0, posts = 0, disposalAcknowledgements = 0;
  const command: typeof b.command = async <T>(method: string, params: Record<string, unknown> = {}, session?: string, timeout?: number): Promise<T> => {
    if (armed && method === "Input.dispatchMouseEvent") {
      if (params.type === "mousePressed") presses++;
      if (params.type === "mouseReleased") releases++;
    }
    if (armed && receipt && params.objectId === receipt.objectId && session === receipt.session
      && method === "Runtime.callFunctionOn" && params.functionDeclaration === "function(){this.dispose();}") {
      disposalAcknowledgements++;
      // Dispose this same real receipt immediately; only its actual protocol acknowledgement waits.
      // Forward the helper's budget unchanged, so an isolated 1s override fails this case.
      return b.command<T>(method, { ...params, functionDeclaration: "async function(){this.dispose();await new Promise(resolve=>setTimeout(resolve,1100));}", awaitPromise: true }, session, timeout);
    }
    const result = await b.command<T>(method, params, session, timeout);
    if (armed && method === "Runtime.evaluate" && params.contextId !== undefined && params.returnByValue === false) {
      const objectId = (result as { result?: { objectId?: string } }).result?.objectId;
      if (objectId) receipt = { objectId, session };
    }
    return result;
  };
  const child = await pluginFrameBrowser(t, { ...b, command }, "lingguang");
  b.server.on("request", request => { if (request.method === "POST" && request.url?.endsWith("/api/plugins/io.molis.work.lingguang/sparks")) posts++; });
  await b.command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
  await b.waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')", 20_000);
  await b.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await child.waitFor("document.querySelector('[data-lingguang-capture]')", 20_000);
  const listenersBefore = await pointerListeners(child, true);
  armed = true;
  await child.click(capture);
  armed = false;
  assert.equal(disposalAcknowledgements, 1);
  assert.equal(presses, 1); assert.equal(releases, 1); assert.equal(posts, 1);
  assert.equal(await pointerListeners(child, true), listenersBefore, "the original real receipt's listeners were disposed");
  assert.equal(await child.evaluate("document.querySelector('[data-lingguang=workbench]').dataset.expanded"), "true");
  const store = openLingguangStore(b.homeDirectory);
  try { assert.equal(store.list(b.projectId!).length, 1, "one input made one real item"); } finally { store.close(); }
});

test("plugin frame input receipt preserves input and both cleanup failures", {timeout:60_000}, async t => {
  let modelCalls = 0;
  const b = await openGoalBrowser(t, true, undefined, async () => { modelCalls++; throw new Error("Unexpected model call"); }); if (!b) return;
  const inputFailure = new Error("Input command failed"), disposeFailure = new Error("Dispose failed after completion"), releaseFailure = new Error("Release failed after completion");
  let armed = false, inputFailed = false, receipt: {objectId: string; session?: string} | undefined, inputCommands = 0, posts = 0;
  const cleaned: string[] = [];
  const command: typeof b.command = async <T>(method: string, params: Record<string, unknown> = {}, session?: string, timeout?: number): Promise<T> => {
    if (armed && method === "Input.dispatchMouseEvent") {
      inputCommands++;
      assert.ok(receipt, "the real child receipt exists before input");
      assert.equal(params.type, "mouseMoved", "the first input fails before any press or release");
      inputFailed = true;
      throw inputFailure;
    }
    const result = await b.command<T>(method, params, session, timeout);
    if (armed && !inputFailed && method === "Runtime.evaluate" && params.contextId !== undefined && params.returnByValue === false) {
      const objectId = (result as { result?: { objectId?: string } }).result?.objectId;
      if (objectId) receipt = {objectId, session};
    }
    // After the input rejects, these are the same receipt's actual disposal and release acknowledgements.
    if (armed && inputFailed && receipt && params.objectId === receipt.objectId && session === receipt.session && method === "Runtime.callFunctionOn") {
      assert.equal((result as { exceptionDetails?: unknown }).exceptionDetails, undefined);
      cleaned.push(method);
      throw disposeFailure;
    }
    if (armed && inputFailed && receipt && params.objectId === receipt.objectId && session === receipt.session && method === "Runtime.releaseObject") {
      cleaned.push(method);
      throw releaseFailure;
    }
    return result;
  };
  const child = await pluginFrameBrowser(t, {...b, command}, "lingguang");
  b.server.on("request", request => { if (request.method === "POST" && request.url?.endsWith("/api/plugins/io.molis.work.lingguang/sparks")) posts++; });
  await b.command("Emulation.setDeviceMetricsOverride", {width:1280,height:900,deviceScaleFactor:1,mobile:false}, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", {url:`${b.origin}/projects/${b.projectId}/`}, b.sessionId));
  await b.waitFor("document.querySelector('[data-plugin-picker-popover] [data-plugin-id=lingguang]')",20_000);
  await b.click("[data-plugin-picker-popover] [data-plugin-id=lingguang]");
  await child.waitFor("document.querySelector('[data-lingguang-capture]')",20_000);
  const listenersBefore = await pointerListeners(child, true);
  armed = true;
  await assert.rejects(child.click(capture), (error: unknown) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [inputFailure, disposeFailure, releaseFailure]);
    assert.equal(error.cause, inputFailure);
    return true;
  });
  armed = false;
  assert.equal(inputCommands, 1, "no input retry or actual click after the failure");
  assert.deepEqual(cleaned, ["Runtime.callFunctionOn", "Runtime.releaseObject"]);
  assert.equal(await pointerListeners(child, true), listenersBefore, "disposal removed the real receipt listeners");
  assert.equal(await child.evaluate("document.querySelector('[data-lingguang=workbench]').dataset.expanded"), "false");
  assert.equal(posts, 0); assert.equal(modelCalls, 0);
  const store = openLingguangStore(b.homeDirectory);
  try { assert.equal(store.list(b.projectId!).length, 0); } finally { store.close(); }
});
