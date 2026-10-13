import assert from "node:assert/strict";
import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import type { AgentReviewRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { armResponse, clickBrowserPoint, openAuditBrowser, openSideBrowser, releaseResponse, setPickerFiles, until, waitHeld, type AuditBrowser } from "./fixtures/workbench-audit-browser.js";

async function site(t: TestContext, title: string) {
  const uploads: Array<Array<{ name: string; text: string }>> = [];
  let effects = 0;
  const server = createServer((request, response) => {
    void (async () => {
      if (request.url === "/receive") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        uploads.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        response.writeHead(200, { "content-type": "application/json" }); response.end("{}"); return;
      }
      if (request.url === "/effect") { effects++; response.end("applied"); return; }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><title>${title}</title><body style="margin:0">
        <input id="files" type="file" multiple hidden>
        <button style="position:absolute;left:40px;top:40px;width:120px;height:40px" onclick="files.click()">Choose files</button>
        <button style="position:absolute;left:40px;top:140px;width:120px;height:40px" onclick="fetch('/effect',{method:'POST'}).then(()=>result.textContent='Applied')">Apply</button><p id="result"></p>
        <script>files.onchange=async()=>{const picked=await Promise.all([...files.files].map(async file=>({name:file.name,text:await file.text()})));
          await fetch('/receive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(picked)});result.textContent='Files received';};</script>`);
    })().catch(error => { response.writeHead(500); response.end(String(error)); });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  t.after(() => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }));
  return { origin: `http://127.0.0.1:${address.port}`, uploads, effects: () => effects };
}

async function chooser(browser: AuditBrowser) {
  await clickBrowserPoint(browser, 100, 60);
  await browser.waitFor("!document.querySelector('[data-browser-sheet]').hidden && !!document.querySelector('[data-browser-action=file-pick]')", 15_000);
  return browser.evaluate<string>("document.querySelector('[data-browser-sheet]').dataset.id");
}

function review(browser: AuditBrowser, id: string, scope: string): AgentReviewRequest {
  return { review_id: id, run: { run_id: "audit-browser-run", session_id: "audit-browser-session" }, project_id: browser.projectId!,
    plugin_id: "io.molis.work.coding", kind: "tool-operation", requested_at: new Date().toISOString(), expires_at: null,
    document: { kind: "tool-operation", tool: "surface-act", summary: id, fields: [{ label: "网站", value: scope }] } };
}

function queueOf(browser: AuditBrowser) {
  assert.ok(browser.localHost);
  return browser.localHost.ensureAgentService(browser.homeDirectory, () => { throw new Error("The real web composition must already own the Agent service"); }).agentHost.reviews;
}

test("W2-18-BROWSER-UPLOAD-01 / W2-18-BROWSER-UPLOAD-02: a delayed FileReader for A cannot give its bytes to B's real file input; multiple files, cancel and reselect work", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  const a = await site(t, "File site A"), b = await site(t, "File site B");
  const files = ["A.txt", "B1.txt", "B2.txt"].map(name => join(browser.homeDirectory, name));
  await Promise.all(files.map((path, index) => writeFile(path, ["A private fixture bytes", "B first fixture bytes", "B second fixture bytes"][index])));
  await browser.command("Page.setInterceptFileChooserDialog", { enabled: true }, browser.sessionId);
  await browser.evaluate(`(() => { const read = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function(file) {
      if (file.name !== 'A.txt') return read.call(this,file);
      window.__auditReaderWaiting = true;
      window.__auditReleaseReader = () => { read.call(this,file); };
    }; })()`);
  await openSideBrowser(browser, a.origin + "/");
  const chooserA = await chooser(browser);
  await browser.click("[data-browser-action=file-pick]"); await setPickerFiles(browser, [files[0]!]);
  await browser.waitFor("window.__auditReaderWaiting === true");
  await openSideBrowser(browser, b.origin + "/");
  const chooserB = await chooser(browser); assert.notEqual(chooserB, chooserA);
  await browser.click("[data-browser-action=file-pick]");
  await browser.evaluate("window.__auditReleaseReader()");
  await browser.waitFor("document.querySelector('[data-browser-live]').textContent.includes('文件没有交给网页')");
  assert.deepEqual(b.uploads, [], "B's receiver got no A bytes");
  assert.equal(await browser.evaluate("document.querySelector('[data-browser-sheet]').dataset.id"), chooserB, "B is still waiting on its own chooser");
  assert.equal(await browser.evaluate("window.__auditRequests.filter(row=>row.path.endsWith('/api/browser/upload')).length"), 0);
  await setPickerFiles(browser, [files[1]!, files[2]!]);
  await until(() => b.uploads, rows => rows.length === 1, "B receives its chosen files");
  assert.deepEqual(b.uploads[0], [{ name: "B1.txt", text: "B first fixture bytes" }, { name: "B2.txt", text: "B second fixture bytes" }]);
  await chooser(browser); await browser.click("[data-browser-action=file-cancel]");
  await browser.waitFor("document.querySelector('[data-browser-sheet]').hidden");
  assert.equal(b.uploads.length, 1);
  await chooser(browser); await browser.click("[data-browser-action=file-pick]"); await setPickerFiles(browser, [files[1]!]);
  await until(() => b.uploads, rows => rows.length === 2, "the same file can be selected again");
  assert.deepEqual(b.uploads[1], [{ name: "B1.txt", text: "B first fixture bytes" }]);
  assert.deepEqual(a.uploads, []);
});

test("W2-18-BROWSER-GRANT-01 / W2-18-BROWSER-GRANT-02: A's delayed site grant decides only A; B stays pending with no page effect, and a displayed site's button retains its origin", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  const a = await site(t, "Review A"), b = await site(t, "Review B"), queue = queueOf(browser);
  queue.request(review(browser, "review-A", a.origin));
  queue.registerDecisionHandler("review-A", async input => queue.decide(input));
  await browser.reloadPage();
  await openSideBrowser(browser, a.origin + "/");
  await browser.waitFor("document.querySelector('[data-browser-approval]').textContent.includes('review-A')", 15_000);
  await armResponse(browser, "grant-A", "/api/browser/sites", "POST");
  await browser.click("[data-browser-action=approve-site]"); await waitHeld(browser, "grant-A");
  // The original operation settles through another legitimate Host entry while its site's response is delayed.
  await queue.respond({ review_id: "review-A", decision: "reject", actor_id: "web-user" });
  queue.request(review(browser, "review-B", b.origin));
  queue.registerDecisionHandler("review-B", async input => {
    const receipt = queue.decide(input);
    if (input.decision !== "approve") return receipt;
    queue.consumeApproval("review-B");
    await clickBrowserPoint(browser, 100, 160);
    await until(b.effects, value => value === 1, "B's reviewed effect");
    return queue.settle("review-B", { ok: true });
  });
  await openSideBrowser(browser, b.origin + "/");
  await browser.waitFor("document.querySelector('[data-browser-approval]').textContent.includes('review-B')", 15_000);
  await armResponse(browser, "decision", "/api/agent/reviews/decide", "POST");
  await releaseResponse(browser, "grant-A"); await waitHeld(browser, "decision");
  assert.equal(queue.receipt("review-B")?.status, "pending");
  assert.equal(b.effects(), 0, "no B page effect was authorized by the click for A");
  const bodies = await browser.evaluate<string[]>("window.__auditRequests.filter(row=>row.path.endsWith('/api/agent/reviews/decide')).map(row=>row.body)");
  assert.deepEqual(bodies.map(body => JSON.parse(body).review_id), ["review-A"]);
  await releaseResponse(browser, "decision");
  assert.equal(await browser.evaluate("document.querySelector('[data-browser-approval]').hidden"), false);
  const decisions = await (await fetch(browser.origin + "/api/browser/sites")).json() as { sites: Array<{ scope: string; decision: string }> };
  assert.deepEqual(decisions.sites.map(row => [row.scope, row.decision]), [[a.origin, "allow"]]);
  await queue.respond({ review_id: "review-B", decision: "reject", actor_id: "web-user" });
  await browser.click("[data-browser-action=sites]");
  await browser.waitFor(`document.querySelector('[data-browser-action=site-block]')?.dataset.scope === ${JSON.stringify(b.origin)}`);
  await openSideBrowser(browser, a.origin + "/");
  await browser.click("[data-browser-action=site-block]");
  await until(async () => (await (await fetch(browser.origin + "/api/browser/sites")).json()).sites as Array<{ scope: string; decision: string }>,
    rows => rows.some(row => row.scope === b.origin && row.decision === "block"), "the displayed B scope is blocked");
  const final = await (await fetch(browser.origin + "/api/browser/sites")).json() as typeof decisions;
  assert.deepEqual(final.sites.map(row => [row.scope, row.decision]).sort(), [[a.origin, "allow"], [b.origin, "block"]].sort());
});

test("W2-18-BROWSER-GRANT-01: a real Host rejection of the site save does not approve the operation", { timeout: 90_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  const a = await site(t, "Denied grant"), queue = queueOf(browser);
  queue.request(review(browser, "save-rejected", a.origin));
  queue.registerDecisionHandler("save-rejected", async input => queue.decide(input));
  await browser.reloadPage();
  await openSideBrowser(browser, a.origin + "/");
  await browser.waitFor("!!document.querySelector('[data-browser-action=approve-site]')", 15_000);
  await browser.evaluate(`(() => { const send=window.fetch;
    window.fetch=(input,init={})=>{if(String(input).endsWith('/api/browser/sites')&&init.method==='POST') {
      init={...init,headers:{...init.headers,'x-molis-work-control-token':'fixture-invalid-control'}};
    } return send(input,init);}; })()`);
  await armResponse(browser, "denied-grant", "/api/browser/sites", "POST");
  await browser.click("[data-browser-action=approve-site]"); await waitHeld(browser, "denied-grant");
  await releaseResponse(browser, "denied-grant");
  await browser.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.equal(await browser.evaluate("document.querySelector('[data-browser-live]').getAttribute('role')"), "alert");
  assert.equal(queue.receipt("save-rejected")?.status, "pending");
  assert.equal(await browser.evaluate("window.__auditRequests.filter(row=>row.path.endsWith('/api/agent/reviews/decide')).length"), 0);
  assert.deepEqual((await (await fetch(browser.origin + "/api/browser/sites")).json()).sites, []);
});
