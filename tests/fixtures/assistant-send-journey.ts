import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { openGoalBrowser } from "./goal-browser.js";
import { issueModel } from "./issue-model.js";

export type SendBrowser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
export async function sendBrowser(t: TestContext, modelAvailable = true) {
  const browser = await openGoalBrowser(t, "user");
  if (!browser) return null;
  const model = modelAvailable ? await issueModel(t, browser.homeDirectory, { replyText: "收到本次发送。" }) : null;
  await browser.command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
  await browser.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, browser.sessionId);
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + "/" }, browser.sessionId));
  await browser.waitFor(`document.querySelector('.chooser')?.dataset.selected === ${JSON.stringify(browser.projectId)}`);
  return { ...browser, model };
}

export async function seedWork(browser: SendBrowser, text: string, kind: "project" | "personal" = "project") {
  const route = kind === "project" ? `/projects/${browser.projectId}/api/assistant/send` : "/api/assistant/send";
  const scope = kind === "project" ? { kind, project_id: browser.projectId } : { kind };
  const result = await browser.evaluate<AssistantSendResult | { error: string; code: string; details?: { work?: AssistantWorkView["work"] } }>(`fetch(${JSON.stringify(route)}, {
    method: 'POST', headers: molisWorkControlHeaders(), body: JSON.stringify({ text: ${JSON.stringify(text)}, request_id: crypto.randomUUID(), scope: ${JSON.stringify(scope)} })
  }).then(r => r.json())`);
  const failed = "error" in result, work = failed ? result.details?.work : result.work;
  assert.ok(work, JSON.stringify(result));
  if (!failed) await waitWork(browser, work.work_id, view => view.work.state === "completed");
  return work.work_id;
}

export const readWork = (browser: SendBrowser, id: string) => browser.evaluate<AssistantWorkView>(`fetch('/api/assistant/works/${id}').then(r => r.json())`);
export async function waitWork(browser: SendBrowser, id: string, ready: (view: AssistantWorkView) => boolean) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const view = await readWork(browser, id);
    if (ready(view)) return view;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail(`Assistant work did not reach the expected persisted state: ${JSON.stringify(await readWork(browser, id))}`);
}
export async function openWork(browser: SendBrowser, id: string) {
  await browser.evaluate(`document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { work_id: '${id}' } }))`);
  await browser.waitFor(`localStorage.getItem('molis.assistant.current') === '${id}' && document.querySelector('[data-assistant-target-label]').textContent.includes('：')`);
}
export async function putInput(browser: SendBrowser, text: string, material?: string) {
  await browser.evaluate(`(() => { const input = document.querySelector('[data-assistant-input]'); input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true }));
    ${material ? `document.dispatchEvent(new CustomEvent('molis:assistant-open', { detail: { materials: [{ title: ${JSON.stringify(material)}, text: ${JSON.stringify(material + "的正文")} }] } }));` : ""}
  })()`);
}

export interface PausedSend { requestId: string; networkId?: string; request: { url: string; postData?: string }; responseStatusCode?: number }
/** Chrome holds the actual HTTP request/response; no fetch or Host result is mocked. */
export async function sendBarrier(browser: SendBrowser, patterns: Array<{ urlPattern: string; requestStage: string }>) {
  const queue: PausedSend[] = [];
  let take: ((event: PausedSend) => void) | undefined;
  const off = browser.on("Fetch.requestPaused", (event, session) => {
    if (session !== browser.sessionId) return;
    const paused: PausedSend = { requestId: String(event.requestId), request: event.request as PausedSend["request"],
      ...(typeof event.networkId === "string" ? { networkId: event.networkId } : {}),
      ...(typeof event.responseStatusCode === "number" ? { responseStatusCode: event.responseStatusCode } : {}) };
    if (take) { const resolve = take; take = undefined; resolve(paused); } else queue.push(paused);
  });
  await browser.command("Fetch.enable", { patterns }, browser.sessionId);
  return {
    next: () => queue.length ? Promise.resolve(queue.shift()!) : new Promise<PausedSend>((resolve, reject) => {
      const timer = setTimeout(() => { take = undefined; reject(new Error("Expected Assistant HTTP barrier was not reached")); }, 5_000);
      take = event => { clearTimeout(timer); resolve(event); };
    }),
    release: (paused: PausedSend) => browser.command("Fetch.continueRequest", { requestId: paused.requestId }, browser.sessionId),
    drop: (paused: PausedSend) => browser.command("Fetch.failRequest", { requestId: paused.requestId, errorReason: "ConnectionClosed" }, browser.sessionId),
    close: async () => { off(); await browser.command("Fetch.disable", {}, browser.sessionId); },
  };
}
