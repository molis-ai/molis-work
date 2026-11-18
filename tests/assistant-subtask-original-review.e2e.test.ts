import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { recordingTextModel } from "./fixtures/recording-text-model.js";
import { cogniaScriptedResponse as reply } from "./fixtures/cognia-model-response.js";

test("SAI-06/08/09: taking back the original Work child before its float approval reaches the owner prevents the effect", { timeout: 120_000 }, async t => {
  let parentCalls = 0, childCalls = 0;
  const b = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, { prepareHome: async home => {
    await recordingTextModel(t, home, body => {
      const first = JSON.stringify(body.messages.find(message => message.role === "user")?.content);
      if (first.includes("SAI_REVIEW_CHILD")) {
        if (++childCalls === 1) return reply({ name: "change-capability", input: { capability_id: "todo.items.create", version: 1,
          provider_id: "io.molis.work.todo", input: { title: "SAI_MUST_NOT_WRITE_AFTER_TAKEBACK" } } });
        return reply(undefined, "Child ended.");
      }
      if (first.includes("SAI_REVIEW_PARENT") && ++parentCalls === 1) return reply({ name: "delegate-work", input: {
        title: "Original review child", brief: "SAI_REVIEW_CHILD: propose a Todo and await the original review.", acceptance: "Todo reviewed" } });
      return reply(undefined, "Parent keeps its own conversation.");
    });
  } }); assert.ok(b);
  await b.setViewport(1440, 960);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/` }, b.sessionId));
  const base = `/projects/${b.projectId}/api/assistant`;
  const todo = `/projects/${b.projectId}/api/plugins/io.molis.work.todo/items`;
  const before = await b.web.get<{ items: unknown[] }>(todo);
  const sent = await b.web.post<AssistantSendResult>(base + "/send", { text: "SAI_REVIEW_PARENT", request_id: "sai-review-parent" });
  let child: AssistantWorkView | undefined;
  for (const end = Date.now() + 20_000; Date.now() < end;) {
    const parent = await b.web.get<AssistantWorkView>(base + "/works/" + sent.work.work_id);
    if (parent.delegated?.[0]) child = await b.web.get<AssistantWorkView>(base + "/works/" + parent.delegated[0].work_id);
    if (child?.reviews.length) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(child?.reviews.length, JSON.stringify(child));
  await b.evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open',{detail:{work_id:${JSON.stringify(sent.work.work_id)}}}))`);
  await b.waitFor("document.querySelector('.assistant-subtask-name')");
  if (!await b.evaluate("document.querySelector('.assistant-subtask-name').getBoundingClientRect().width>0")) await b.click("[data-assistant-side-toggle]");
  await b.click(".assistant-subtask-name");
  const approve = "[data-work-task-float] [data-assistant-decision=approve]";
  await b.waitFor(`document.querySelector(${JSON.stringify(approve)})`);
  const reviewPath = base + "/works/" + encodeURIComponent(child.work.work_id) + "/reviews/" + encodeURIComponent(child.reviews[0]!.review_id);
  const arrived = Promise.withResolvers<{ requestId: string; session?: string; path: string; body: Record<string, unknown> }>();
  const off = b.on("Fetch.requestPaused", (event, session) => {
    const request = event.request as { url: string; method: string; postData?: string };
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === reviewPath)
      arrived.resolve({ requestId: String(event.requestId), session, path, body: JSON.parse(request.postData!) });
    else void b.command("Fetch.continueRequest", { requestId: String(event.requestId) }, session);
  }); t.after(off);
  await b.command("Fetch.enable", { patterns: [{ urlPattern: "*api/assistant/works/*/reviews/*", requestStage: "Request" }] }, b.sessionId);
  await b.click(approve);
  let timer: ReturnType<typeof setTimeout>;
  const original = await Promise.race([arrived.promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("the original review request was not intercepted")), 15_000); })]).catch(async error => {
    t.diagnostic(JSON.stringify(await b.evaluate("({hidden:document.hidden,review:document.querySelector('[data-work-task-float] .assistant-review')?.outerHTML,errors:document.querySelector('[data-work-task-float]')?.innerText})"))); throw error;
  }).finally(() => clearTimeout(timer));
  assert.equal(original.body.version, child.reviews[0]!.version);
  assert.ok(original.body.subtask, "the real float freezes its original child execution in the review request");
  await b.web.post(base + "/works/" + child.work.work_id + "/take-back", {});
  // Deliver the retained original decision to the real owner after take-back; it cannot commit under a new authority.
  await assert.rejects(b.web.post(original.path, original.body), (error: { status?: number }) => error.status === 403 || error.status === 409);
  await b.command("Fetch.failRequest", { requestId: original.requestId, errorReason: "Aborted" }, original.session).catch(() => undefined);
  await b.command("Fetch.disable", {}, b.sessionId); off();
  const after = await b.web.get<{ items: unknown[] }>(todo);
  assert.deepEqual(after.items, before.items, "the original Todo owner has no post-take-back write");
  assert.equal(childCalls, 1, "refused approval never resumes the child model");
});
