import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

test("图片完整HTTP链路：配置、本地生成、刷新、下载、失败后复用、窄屏", {timeout: 90_000}, async (t) => {
  let calls = 0;
  const provider = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request) raw += chunk.toString();
    calls++;
    assert.equal(request.url, "/v1/images/generations");
    const body = JSON.parse(raw);
    response.writeHead(body.prompt === "故障验证" ? 429 : 200, {"content-type":"application/json"});
    response.end(JSON.stringify(body.prompt === "故障验证" ? {error:{message:"fixture"}} : {data:[{b64_json:PNG}]}));
  });
  await new Promise<void>((r) => provider.listen(0,"127.0.0.1",r));
  t.after(() => new Promise<void>((r) => provider.close(() => r())));
  const address = provider.address();assert.ok(address && typeof address === "object");
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, reloadPage, origin, projectId } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "images");
  await command("Emulation.setDeviceMetricsOverride", {width:1360,height:960,deviceScaleFactor:1,mobile:false},sessionId);
  await navigate(() => command("Page.navigate", {url:`${origin}/projects/${projectId}/`},sessionId,20_000));
  await browser.waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=images]')");
  await browser.click('[data-plugin-strip] [data-plugin-id="images"]');
  await browser.waitFor("document.body.dataset.desktopSurface === 'images'");
  await waitFor("document.querySelector('[data-images-new]')");
  await click('[data-images-new]');
  await click('[data-images-connections]');
  await waitFor("document.querySelector('[data-images-dialog]').open");
  await click('[data-images-preset="custom"]');
  await evaluate(`(() => {
    document.querySelector('[data-images-connection-name]').value='本地链路验证';
    document.querySelector('[data-images-connection-url]').value='http://127.0.0.1:${address.port}/v1';
    document.querySelector('[data-images-connection-model]').value='fixture-image';
  })()`);
  await click('[data-images-save-connection]');
  await waitFor("(document.querySelector('[data-images-saved-connections]')?.textContent || '').includes('本地链路验证')");
  await waitFor("!document.querySelector('[data-images-dialog]').open");
  const prompt = async (value: string) => evaluate(`(() => {const e=document.querySelector('[data-images-prompt]');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await prompt("一张用于验证保存和下载的图片");
  await click('[data-images-generate]');
  await waitFor("document.querySelector('[data-images-result] img')?.complete && document.querySelector('[data-images-result] img')?.naturalWidth > 0",12_000);
  assert.equal(calls,1);
  const download = await evaluate<string>("document.querySelector('[data-images-result] a[download]').getAttribute('href')");
  const url = new URL(download.split("?")[0]!, origin).href;
  const bytes = Buffer.from(await (await fetch(url+"?download=1")).arrayBuffer());
  assert.deepEqual(bytes,Buffer.from(PNG,"base64"));
  await command('Network.enable', {}, sessionId);
  await command('Network.setBlockedURLs', { urls: [url] }, sessionId);
  await reloadPage();
  if(await browser.evaluate("document.body.dataset.desktopSurface") !== "images") await browser.click('[data-plugin-strip] [data-plugin-id="images"]');
  await waitFor("document.querySelectorAll('[data-images-job]').length > 0 || document.querySelectorAll('[data-images-id]').length > 0 || document.querySelectorAll('.images-history-row').length > 0");
  await click('.images-history-row');
  await waitFor("document.querySelector('[data-images-result]')?.textContent.includes('图片暂时无法读取')");
  await command('Network.setBlockedURLs', { urls: [] }, sessionId);
  await click('[data-images-refresh]');
  await waitFor("document.querySelector('[data-images-result] img')?.naturalWidth > 0");
  assert.equal(calls,1,"刷新或重新打开不会调用厂商");
  await click('[data-images-new]');
  await prompt("故障验证");
  await click('[data-images-generate]');
  await waitFor("(document.querySelector('[data-images-result]')?.textContent || '').includes('429')",12_000);
  assert.equal(calls,2);
  await click('[data-images-delete-job]');
  await click('[data-page-dialog=confirm] button[type=submit]');
  await waitFor("document.querySelectorAll('.images-history-row').length === 1");
  await click('.images-history-row');
  await click('[data-images-delete-job]');
  await click('[data-page-dialog=confirm] button[type=submit]');
  await waitFor("document.querySelectorAll('.images-history-row').length === 0");
  await click('[data-images-connections]');
  await click('[data-images-delete-connection]');
  await click('[data-page-dialog=confirm] button[type=submit]');
  await waitFor("document.querySelectorAll('[data-images-edit-connection]').length === 0");
  assert.equal(calls,2,"删除本机记录和连接不会再次调用厂商");
  await click('[data-images-dialog-close]');
  await command("Emulation.setDeviceMetricsOverride", {width:390,height:844,deviceScaleFactor:1,mobile:true},sessionId);
  assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"),true);
  await click('[data-images-back]');
  await waitFor("document.querySelector('[data-images=workbench]').dataset.expanded !== 'true'");
});


test("RAC-143: accepted Images POST with malformed JSON keeps its pending key; retry confirms one job and one provider call", { timeout: 90_000 }, async t => {
  let calls = 0;
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume the real provider request */ }
    calls++;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => provider.close(() => resolve())));
  const address = provider.address();
  assert.ok(address && typeof address === "object");
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const { evaluate, waitFor, click } = await pluginFrameBrowser(t, browser, "images");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId, 20_000));
  await browser.waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=images]')");
  await browser.click('[data-plugin-strip] [data-plugin-id="images"]');
  await waitFor("document.querySelector('[data-images-new]')");
  await click('[data-images-new]');
  await click('[data-images-connections]');
  await click('[data-images-preset="custom"]');
  await evaluate(`(() => {
    document.querySelector('[data-images-connection-name]').value = '坏答复验证';
    document.querySelector('[data-images-connection-url]').value = 'http://127.0.0.1:${address.port}/v1';
    document.querySelector('[data-images-connection-model]').value = 'fixture-image';
  })()`);
  await click('[data-images-save-connection]');
  await waitFor("!document.querySelector('[data-images-dialog]').open");
  const draftKey = JSON.stringify(`molis-work-images-draft:${projectId}`);
  await evaluate(`(() => {
    const realFetch = window.fetch.bind(window), realRequest = window.molisWorkRequest;
    const trace = window.__imagesSubmitTrace = { posts: [], accepted: [], failures: [] };
    window.fetch = async (input, init) => {
      const response = await realFetch(input, init);
      if (init?.method === 'POST' && String(input).endsWith('/jobs')) {
        trace.posts.push(JSON.parse(init.body));
        const payload = await response.clone().json();
        trace.accepted.push({ status: response.status, id: payload.job?.id });
        if (trace.posts.length === 1) return new Response('not-json', { status: 200, headers: response.headers });
      }
      return response;
    };
    window.molisWorkRequest = async (...args) => {
      try { return await realRequest(...args); }
      catch (error) { trace.failures.push({ code: error.code, status: error.status }); throw error; }
    };
    const prompt = document.querySelector('[data-images-prompt]');
    prompt.value = '同一个请求只生成一次';
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await click('[data-images-generate]');
  await waitFor("document.querySelector('[data-images-note]').textContent.includes('提交结果未确认')");
  const pending = await evaluate<{ request_id: string; fingerprint: string }>(`JSON.parse(sessionStorage.getItem(${draftKey})).pending`);
  assert.ok(pending.request_id && pending.fingerprint, "both retry credentials remain after the unreadable successful reply");
  assert.deepEqual(await evaluate("window.__imagesSubmitTrace.failures"), [{ code: "ui_host.invalid_response", status: 200 }], "the real shared JSON parser raises the failure");
  await waitFor("!document.querySelector('[data-images-generate]').disabled");
  await click('[data-images-generate]');
  await waitFor("document.querySelector('[data-images-result] img')?.naturalWidth > 0");
  const trace = await evaluate<{ posts: Array<{ request_id: string }>; accepted: Array<{ status: number; id: string }> }>("window.__imagesSubmitTrace");
  assert.equal(trace.posts.length, 2, "the person explicitly retries once");
  assert.deepEqual(trace.posts[1], trace.posts[0], "the retry keeps the original body and request id");
  assert.equal(trace.posts[0]!.request_id, pending.request_id);
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(trace.posts[0]!).filter(([key]) => key !== "request_id"))), pending.fingerprint);
  assert.equal(trace.accepted[0]!.status, 202, "the real asynchronous job route accepted the request before its reply was replaced");
  assert.ok(trace.accepted[0]!.id);
  assert.deepEqual(trace.accepted[1], trace.accepted[0], "both real POST responses identify the same persisted job");
  const jobs = await evaluate<Array<{ id: string }>>(`fetch('/projects/${projectId}/api/plugins/io.molis.work.images/jobs').then(response => response.json()).then(payload => payload.jobs)`);
  assert.deepEqual(jobs.map(job => job.id), [trace.accepted[0]!.id], "the server retains exactly one job");
  assert.equal(calls, 1, "the provider was called exactly once");
  assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem(${draftKey})).pending`), null, "confirmed success clears the pending request");
});
