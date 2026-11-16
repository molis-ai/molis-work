import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// QEA-21: both real side-panel clients consume the same Host projection. Computer transport is a fixture only;
// no OS permissions, applications or native input are exercised. Reviews and decisions use the real Host HTTP and queue.
for (const surface of ["browser", "computer"] as const) test(`QEA-21 ${surface} redraws the same review when its execution owner connects`, { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const url = b.origin + `/projects/${b.projectId}/`;
  await b.navigate(() => b.command("Page.navigate", { url }, b.sessionId));
  const queue = b.localHost!.ensureAgentService(b.homeDirectory, () => { throw new Error("The web composition owns the Agent service"); }).agentHost.reviews;
  const id = `availability-${surface}`;
  queue.request({ review_id: id, run: { run_id: "review-run", session_id: "review-session" }, project_id: b.projectId!,
    plugin_id: "io.molis.work.coding", kind: "tool-operation", requested_at: new Date().toISOString(), expires_at: null,
    document: { kind: "tool-operation", tool: "surface-act", summary: "Review availability",
      fields: [{ label: surface === "browser" ? "网站" : "应用", value: surface === "browser" ? "https://fixture.invalid" : "Fixture App" }] } });
  if (surface === "computer") await b.command("Page.addScriptToEvaluateOnNewDocument", { source: `(() => {
    const Original=WebSocket;
    window.WebSocket=class extends Original {
      constructor(url,...args) {
        if(!String(url).endsWith('/computer')) { super(url,...args);return; }
        const socket=new EventTarget();socket.readyState=1;socket.close=()=>{};
        socket.send=value=>{const message=JSON.parse(value);
          if(message.type==='auth')queueMicrotask(()=>socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'ready'})})));
          if(message.type==='watch')queueMicrotask(()=>socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'state',state:{enabled:false,control:{mode:'assistant',work_id:'review-session'}}})})));
        };
        setTimeout(()=>socket.dispatchEvent(new Event('open')),0);return socket;
      }
    };
  })()` }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url }, b.sessionId));
  const panel = `[data-${surface}-approval]`;
  await b.waitFor(`document.querySelector('${panel}')?.textContent.includes('执行方尚未接通')`, 15_000);
  const approve = surface === "browser" ? "[data-browser-action=approve-once]" : "[data-computer-review=approve]";
  const reject = surface === "browser" ? "[data-browser-action=reject]" : "[data-computer-review=reject]";
  assert.equal(await b.evaluate(`Boolean(document.querySelector('${panel} ${approve}'))`), false);
  assert.equal(await b.evaluate(`Boolean(document.querySelector('${panel} ${reject}'))`), false);
  assert.equal(queue.receipt(id)?.status, "pending");
  let decisions = 0;
  queue.registerDecisionHandler(id, async input => { decisions++; return queue.decide(input); });
  await b.waitFor(`document.querySelector('${panel} ${approve}')?.getClientRects().length`, 15_000);
  assert.equal(await b.evaluate(`document.querySelector('${panel}').textContent.includes('执行方尚未接通')`), false);
  await b.click(`${panel} ${reject}`);
  await b.waitFor(`document.querySelector('${panel}').hidden`, 15_000);
  assert.equal(queue.receipt(id)?.status, "rejected");
  assert.equal(decisions, 1);
});
