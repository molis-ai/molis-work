import assert from "node:assert/strict";
import test from "node:test";
import { ensureSystemAgentService } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assistantTextModel } from "./fixtures/assistant-text-model.js";
import { openWork, seedWork, waitWork } from "./fixtures/assistant-send-journey.js";

// BL-360: actual Assistant read/HTML/client paths, with a controlled execution owner alongside a real held SDK effect.
test("BL-360: an Assistant card updates same-id decisions without replacing expanded content or losing focus", { timeout: 120_000 }, async t => {
  let model!: Awaited<ReturnType<typeof assistantTextModel>>;
  const browser = await openGoalBrowser(t, true, undefined, null, undefined, undefined, {
    prepareHome: async home => { model = await assistantTextModel(t, home, "准备好了。"); model.finish(); },
  });
  if (!browser) return;
  assert.ok(browser.localHost);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/` }, browser.sessionId));
  const workId = await seedWork(browser, "准备一项待确认的工作");
  const queue = ensureSystemAgentService(browser.localHost, browser.homeDirectory).agentHost.reviews;
  let live = true, calls = 0, originalId = "";
  const id = "presenter-same-review";
  const stop = queue.observe(request => {
    if (request.review_id === id || request.document.kind !== "tool-operation" || request.document.tool !== "change-capability") return;
    originalId = request.review_id;
    const presented = queue.list(request.project_id).find(row => row.review_id === request.review_id);
    assert.ok(presented);
    queue.request({ ...presented, review_id: id });
    queue.registerDecisionHandler(id, async (_input, commit) => { calls++; return commit(); }, async () => () => live);
  });
  t.after(stop);
  model.review("保持待审，不创建这条待办");
  const sent = await browser.evaluate<{ work?: { work_id: string }; error?: string }>(`fetch(${JSON.stringify(`/projects/${browser.projectId}/api/assistant/send`)}, {
    method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({work_id:${JSON.stringify(workId)},text:'请准备这项改动',request_id:crypto.randomUUID()})}).then(r=>r.json())`);
  assert.equal(sent.work?.work_id, workId, sent.error);
  await waitWork(browser, workId, view => view.reviews.some(review => review.review_id === id));
  await openWork(browser, workId);
  await browser.waitFor(`document.querySelector('[data-review="${id}"] [data-assistant-decision=approve]')`, 15_000);
  await browser.evaluate(`(() => {const card=document.querySelector('[data-review="${id}"]');window.originalReviewContent=card.querySelector('.assistant-exact');
    if(!window.originalReviewContent)throw new Error('the real review must carry exact parameters');window.originalReviewContent.open=true;
    card.querySelector('[data-assistant-decision=approve]').focus();})()`);
  live = false;
  // The existing window-focus refresh reads the real Host projection without a navigation's composer focus.
  await browser.evaluate("window.dispatchEvent(new Event('focus'))");
  await browser.waitFor(`!document.querySelector('[data-review="${id}"] [data-assistant-decision]')`, 15_000);
  assert.deepEqual(await browser.evaluate(`(() => {const card=document.querySelector('[data-review="${id}"]');return [card.querySelector('.assistant-exact')===window.originalReviewContent,window.originalReviewContent.open,document.activeElement===card.querySelector('.assistant-card-title')];})()`), [true, true, true]);
  assert.equal(calls, 0); assert.equal(queue.receipt(originalId)?.status, "pending");
});

// The native desktop picture/control feed is a fixture; review reads and the shipped sidebar client use the real Host.
test("BL-360: the computer sidebar withdraws same-id choices and preserves keyboard focus", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  assert.ok(browser.localHost);
  const queue = ensureSystemAgentService(browser.localHost, browser.homeDirectory).agentHost.reviews;
  let live = true, calls = 0;
  queue.request({ review_id: "computer-choices", project_id: browser.projectId!, plugin_id: "io.molis.work.coding", run: { session_id: "desktop-session", run_id: "desktop-run" },
    kind: "tool-operation", document: { kind: "tool-operation", tool: "surface-act", summary: "在测试应用中填写内容", fields: [{ label: "应用", value: "Test App" }],
      round_allow: { app: "test.app", label: "Test App" } }, requested_at: new Date().toISOString(), expires_at: null });
  queue.registerDecisionHandler("computer-choices", async (_input, commit) => { calls++; return commit(); }, async () => () => live);
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: `{
    const Original=WebSocket;
    class Desktop extends EventTarget { readyState=1; constructor(){super();queueMicrotask(()=>this.dispatchEvent(new Event('open')));}
      send(raw){if(JSON.parse(raw).type!=='auth')return;for(const message of [{type:'ready'},{type:'state',state:{enabled:false,control:{mode:'assistant',work_id:'desktop-session'}}}])this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(message)}));}
      close(){this.readyState=3;}
    }
    window.WebSocket=class extends Original {constructor(url,protocol){if(new URL(url).pathname==='/computer')return new Desktop();super(url,protocol);}};
  }` }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/` }, browser.sessionId));
  await browser.click("[data-side-tab=computer]");
  await browser.waitFor("document.querySelector('[data-computer-review=approve-round]')?.getClientRects().length", 15_000);
  await browser.evaluate("document.querySelector('[data-computer-review=approve]').focus()");
  assert.equal(await browser.evaluate("document.activeElement.dataset.computerReview"), "approve");
  live = false;
  await browser.waitFor("!document.querySelector('[data-computer-review]')", 10_000);
  assert.equal(await browser.evaluate("document.activeElement===document.querySelector('[data-computer-approval] h2')"), true);
  assert.equal(calls, 0); assert.equal(queue.receipt("computer-choices")?.status, "pending");
});
