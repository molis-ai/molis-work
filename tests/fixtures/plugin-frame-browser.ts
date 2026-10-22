import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { openGoalBrowser } from "./goal-browser.js";

type Browser = Pick<NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>, "command" | "on" | "evaluate" | "sessionId">;
type Context = { id: number; auxData?: { frameId?: string; isDefault?: boolean } };

/** Operate the real child execution context through DevTools; never pierce it through the owner's DOM. */
export async function pluginFrameBrowser(t: TestContext, browser: Browser, surface?: string) {
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
  async function context() {
    const object = await browser.command<{ result: { objectId?: string } }>("Runtime.evaluate", {
      expression: `document.querySelector(${JSON.stringify(selector)})`, returnByValue: false,
    }, browser.sessionId);
    assert.ok(object.result.objectId, `Missing frame: ${surface}`);
    const { node } = await browser.command<{ node: { frameId?: string } }>("DOM.describeNode", { objectId: object.result.objectId }, browser.sessionId);
    await browser.command("Runtime.releaseObject", { objectId: object.result.objectId }, browser.sessionId);
    assert.ok(node.frameId, "frame owner must identify a real child");
    const current = contexts.get(node.frameId);
    assert.ok(current, `Missing child execution context: ${node.frameId}`);
    return current;
  }
  async function evaluate<T = unknown>(expression: string): Promise<T> {
    const current = await context();
    const result = await browser.command<{ result: { value: T }; exceptionDetails?: unknown }>("Runtime.evaluate", {
      expression, contextId: current.id, returnByValue: true, awaitPromise: true,
    }, current.session);
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression: string, timeoutMs = 10000): Promise<void> {
    const end = Date.now() + timeoutMs; let failure: unknown;
    while (Date.now() < end) {
      try { if (await evaluate(`Boolean(${expression})`)) return; } catch (error) { failure = error; }
      await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error(expression, { cause: failure });
  }
  async function click(target: string): Promise<void> {
    const point = await evaluate<{ x: number; y: number }>(`(async()=>{const element=[...document.querySelectorAll(${JSON.stringify(target)})].find(node=>node.getClientRects().length);
      if(!element)throw Error('Missing target');element.scrollIntoView({block:'center',behavior:'instant'});
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const box=element.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
      if(!box.width||!box.height||element.disabled||!element.contains(document.elementFromPoint(x,y)))throw Error('Target is hidden, disabled or covered: '+JSON.stringify({target:element.outerHTML,box:box.toJSON(),cover:document.elementFromPoint(x,y)?.outerHTML}));return{x,y};})()`);
    const frame = await browser.evaluate<{ x: number; y: number }>(`(()=>{const frame=document.querySelector(${JSON.stringify(selector)}), box=frame.getBoundingClientRect();
      if(document.elementFromPoint(box.x+${point.x},box.y+${point.y})!==frame)throw Error('Frame is covered');return{x:box.x,y:box.y};})()`);
    for (const type of ["mousePressed", "mouseReleased"]) await browser.command("Input.dispatchMouseEvent", { type, x: frame.x + point.x, y: frame.y + point.y, button: "left", clickCount: 1 }, browser.sessionId);
  }
  return { evaluate, waitFor, click };
}
