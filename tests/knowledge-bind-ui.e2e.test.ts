import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { bindSearchEntriesHandler, defineSearchEntriesAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { KnowledgeBindPreviewResponse, KnowledgeBindRequest, KnowledgeCardRecord, KnowledgeCardsResponse, KnowledgeSearchResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

const reviewDirectory = process.env.MOLIS_WORK_UI_REVIEW_DIR;
async function screenshot(browser: NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>, name: string) {
  if (!reviewDirectory) return;
  await mkdir(reviewDirectory, { recursive: true });
  await browser.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  const shot = await browser.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, browser.sessionId);
  await writeFile(join(reviewDirectory, name + ".png"), Buffer.from(shot.data, "base64"));
}

// Only the old card is a fixture: the page, directory, current source, SQLite and binding action are production code.
test("MEM-40 old Coding cards require a visible decision; a lost response retries that exact decision without organizing", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, "user", undefined, null); if (!browser) return;
  const { homeDirectory, projectId, origin, controlToken, command, sessionId, navigate, evaluate, waitFor, click, setViewport } = browser;
  assert.ok(projectId);
  const prefix = `/projects/${projectId}`;
  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(origin + prefix + path, { method: body === undefined ? "GET" : "POST",
      headers: { origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.text(); assert.ok(response.ok, `${path}: ${response.status} ${value}`); return JSON.parse(value) as T;
  };
  await withMolisWorkProjectCatalog({ homeDirectory }, catalog => catalog.addProjectPlugin({ project_id: projectId, plugin_id: "coding", actor_id: "web-user" }));
  const created = await call<{ session: { session_id: string } }>("/api/plugins/io.molis.work.coding/sessions", { title: "关联真实来源的项目说明" });
  const subject = { kind: "coding_session", id: created.session.session_id };
  let current: KnowledgeCardRecord | undefined;
  for (const deadline = Date.now() + 20_000; !current;) {
    current = (await call<KnowledgeCardsResponse>("/api/knowledge/overview")).cards.find(card => card.subject.id === subject.id);
    assert.ok(Date.now() < deadline, "the real Coding source is indexed");
    if (!current) await new Promise(resolve => setTimeout(resolve, 30));
  }
  const retained: KnowledgeCardRecord = { ...current, title: "本人保留的旧卡片", brief: "旧简介仍保留", keywords: ["本人关键词"], edited: ["title", "keywords"],
    outline: [{ anchor: "old", title: "旧分节", summary: "旧分节摘要" }], suggestion: { brief: "旧建议" },
    state: "ready", organized_revision: "historical", retention: { source_identity: null, restoration_operation_id: null } };
  const orphan = { ...retained, subject: { ...subject, id: "missing-old-source" }, title: "来源已经不在的旧卡片" };
  const cards = openKnowledgeCards({ homeDirectory });
  try { cards.put(retained); cards.put(orphan); } finally { cards.close(); }
  assert.ok(!(await call<KnowledgeSearchResponse>("/api/knowledge/search?q=" + encodeURIComponent("关联真实来源"))).cards.some(card => card.subject.id === subject.id));
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.bindRequests=[];window.previewCount=0;window.organizeCount=0;window.loseBind=true;
    const originalFetch=window.fetch;window.fetch=async(input,init)=>{
      const path=new URL(String(input?.url||input),location.href).pathname;
      if(path.endsWith('/knowledge/bind-preview'))window.previewCount++;
      if(path.endsWith('/knowledge/organize'))window.organizeCount++;
      if(path.endsWith('/knowledge/bind'))window.bindRequests.push(JSON.parse(init.body));
      const response=await originalFetch(input,init);
      if(path.endsWith('/knowledge/bind')&&response.ok&&window.loseBind){window.loseBind=false;await new Promise(resolve=>window.releaseBind=resolve);throw new TypeError('Lost binding response');}
      return response;
    };` }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/knowledge" }, sessionId));
  const row = `[data-knowledge-subject=${JSON.stringify(subject.kind + ":" + subject.id)}]`;
  const missing = `[data-knowledge-subject=${JSON.stringify(orphan.subject.kind + ":" + orphan.subject.id)}]`;
  const dialog = "[data-knowledge-bind-dialog]";
  await waitFor(`document.querySelector(${JSON.stringify(row)})?.textContent.includes('待关联来源')`);
  await click(missing + " .knowledge-title"); await click(missing + " [data-knowledge-bind]");
  await waitFor(`document.querySelector('${dialog}')?.open`);
  assert.match(await evaluate<string>(`document.querySelector('${dialog}').textContent`), /暂无可关联来源，请确认资料或插件可用。/);
  await screenshot(browser, "no-candidate");
  assert.equal(await evaluate(`document.querySelector('[data-knowledge-bind-confirm]').disabled`), true);
  await click("[data-knowledge-bind-cancel]");
  await click(row + " .knowledge-title");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(row + " .knowledge-detail-actions > button[type=button]")}).hidden`), true);
  await click(row + " [data-knowledge-bind]");
  await waitFor(`document.querySelector('${dialog}')?.open && document.querySelector('[data-knowledge-bind-source]')`);
  assert.match(await evaluate<string>(`document.querySelector('${dialog}').textContent`), /本人保留的旧卡片.*关联真实来源的项目说明/s);
  assert.equal(await evaluate("window.bindRequests.length"), 0, "preview and opening the confirmation do not write");
  await click("[data-knowledge-bind-cancel]");
  const persisted = () => {
    const db = new DatabaseSync(join(homeDirectory, "knowledge", "knowledge.db"), { readOnly: true });
    try { return JSON.parse(String(db.prepare("SELECT body FROM knowledge_cards WHERE project_id=? AND kind=? AND object_id=?").get(projectId, subject.kind, subject.id)!.body)) as KnowledgeCardRecord; }
    finally { db.close(); }
  };
  assert.deepEqual(persisted(), retained, "cancelling preserves every old field and creates no adoption");
  await click(row + " [data-knowledge-bind]"); await waitFor(`document.querySelector('${dialog}')?.open`);
  for (const width of [1440, 1024, 390]) {
    await setViewport(width, width === 390 ? 500 : 600, width === 390);
    assert.equal(await evaluate(`(() => {const d=document.querySelector('${dialog}'),b=d.querySelector('[data-knowledge-bind-confirm]'),r=b.getBoundingClientRect();
      return r.x>=0&&r.right<=innerWidth&&r.y>=0&&r.bottom<=innerHeight&&b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})()`), true, "confirmation is reachable in its initial viewport");
    for (const theme of ["light", "dark"]) {
      await evaluate(`document.documentElement.dataset.theme=document.documentElement.dataset.resolvedTheme=${JSON.stringify(theme)}`);
      await screenshot(browser, "confirmation-" + width + "-" + theme);
    }
  }
  await click("[data-knowledge-bind-confirm]");
  await waitFor("window.bindRequests.length===1 && typeof window.releaseBind==='function'");
  await evaluate("document.querySelector('[data-knowledge-bind-confirm]').click()");
  assert.equal(await evaluate("window.bindRequests.length"), 1, "a second press during the request does not dispatch twice");
  assert.equal(await evaluate("document.querySelector('[data-knowledge-bind-cancel]').disabled"), true);
  await evaluate("window.releaseBind()");
  await waitFor("document.querySelector('[data-knowledge-bind-error]').hidden===false");
  await screenshot(browser, "lost-response-original-retry");
  assert.equal(await evaluate("document.querySelector('[data-knowledge-bind-candidates]').disabled"), true, "a failed decision cannot silently change source");
  const previews = await evaluate<number>("window.previewCount");
  await click("[data-knowledge-bind-cancel]");
  await waitFor(`document.querySelector(${JSON.stringify(row + " [data-knowledge-bind]")})?.textContent==='重试这次关联'`);
  await click(row + " [data-knowledge-bind]");
  await waitFor(`!document.querySelector(${JSON.stringify(row + " [data-knowledge-bind]")})`);
  const requests = await evaluate<KnowledgeBindRequest[]>("window.bindRequests");
  assert.equal(requests.length, 2); assert.deepEqual(requests[1], requests[0]);
  assert.equal(await evaluate("window.previewCount"), previews, "retry keeps the original body without a new confirmation or preview");
  assert.equal(await evaluate("window.organizeCount"), 0);
  const adopted = persisted(); assert.equal(adopted.adoption?.operation_id, requests[0]!.operation_id); assert.equal(adopted.state, "listed");
  await screenshot(browser, "linked-current-source");
  for (const field of ["title", "brief", "keywords", "edited", "outline", "suggestion"] as const) assert.deepEqual(adopted[field], retained[field]);
  assert.ok((await call<KnowledgeSearchResponse>("/api/knowledge/search?q=" + encodeURIComponent("关联真实来源"))).cards.some(card => card.subject.id === subject.id));
  await browser.reloadPage(); await waitFor(`document.querySelector(${JSON.stringify(row)})`);
  await click(row + " .knowledge-title"); assert.equal(await evaluate(`!!document.querySelector(${JSON.stringify(row + " [data-knowledge-bind]")})`), false);
});

test("MEM-40 multiple live summary sources require a person's choice and preserve the retained card", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "user", undefined, null); if (!browser) return;
  const { localHost: host, projectId, databasePath, homeDirectory, origin, controlToken, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  assert.ok(host); assert.ok(projectId);
  const reference = molisWorkHostProjectReference({ databasePath, projectId });
  await host.withProject(reference, () => undefined);
  const subject = { kind: "bind_summary", id: "original" };
  const removals: Array<() => void> = [];
  t.after(() => { for (const remove of removals) remove(); });
  let revision = "original";
  const register = (provider: string) => {
    const entries = defineSearchEntriesAction("binding." + provider, [{ kind: subject.kind, title: "本人资料", surface: "coding" }], "本人资料", []);
    const remove = host.actionRegistry(reference).registerProvider({ provider: { provider_id: "binding." + provider, title: provider, kind: "plugin", plugin_id: "binding." + provider, plugin_installation_generation: provider + "-generation" },
      definitions: [entries], handlers: [bindSearchEntriesHandler(entries, () => [{ subject, title: provider + " 当前来源", summary: provider + " 本人可确认的摘要", revision, content: "summary", updated_at: null, open: null }])] });
    removals.push(remove); return remove;
  };
  register("first"); let removeSecond = register("second");
  const caller = await host.localPersonContext(reference);
  assert.ok(host.search); await host.search.service.rebuild({ client: host.actionClient(reference), caller }, {});
  const prefix = `/projects/${projectId}`;
  const call = async <T>(path: string, body?: unknown): Promise<T> => {
    const response = await fetch(origin + prefix + "/api/knowledge" + path, { method: body === undefined ? "GET" : "POST",
      headers: { origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await response.text(); assert.ok(response.ok, `${response.status} ${value}`); return JSON.parse(value) as T;
  };
  const current = (await call<KnowledgeCardsResponse>("/overview")).cards.find(card => card.subject.kind === subject.kind && card.subject.id === subject.id);
  assert.ok(current);
  const retained: KnowledgeCardRecord = { ...current, title: "本人选择前完整保留", brief: "完整保留的简介", state: "ready", retention: { source_identity: null, restoration_operation_id: null } };
  const cards = openKnowledgeCards({ homeDirectory }); try { cards.put(retained); } finally { cards.close(); }
  const preview = await call<KnowledgeBindPreviewResponse>("/bind-preview", { subject });
  assert.equal(preview.candidates.length, 2, "two real registered summary sources are both live candidates");
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `window.bindRequests=[];window.bindFailures=[];window.previewCount=0;window.loseBind=true;const original=window.fetch;window.fetch=async(input,init)=>{
    const path=new URL(String(input?.url||input),location.href).pathname;
    if(path.endsWith('/knowledge/bind-preview'))window.previewCount++;
    if(path.endsWith('/knowledge/bind'))window.bindRequests.push(JSON.parse(init.body));
    const response=await original(input,init);if(path.endsWith('/knowledge/bind')&&!response.ok)window.bindFailures.push(await response.clone().json());
    if(path.endsWith('/knowledge/bind')&&response.ok&&window.loseBind){window.loseBind=false;throw new TypeError('Lost successful binding response');}return response;};` }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/knowledge" }, sessionId));
  const row = `[data-knowledge-subject=${JSON.stringify(subject.kind + ":" + subject.id)}]`;
  await waitFor(`document.querySelector(${JSON.stringify(row)})`); await click(row + " .knowledge-title"); await click(row + " [data-knowledge-bind]");
  await waitFor("document.querySelector('[data-knowledge-bind-dialog]').open");
  assert.equal(await evaluate("document.querySelectorAll('[data-knowledge-bind-source]:checked').length"), 0);
  assert.equal(await evaluate("document.querySelector('[data-knowledge-bind-confirm]').disabled"), true);
  await screenshot(browser, "multiple-candidates-no-default");
  await click("[data-knowledge-bind-source='1']");
  await click("[data-knowledge-bind-cancel]"); assert.equal(await evaluate("window.bindRequests.length"), 0);
  await click(row + " [data-knowledge-bind]"); await waitFor("document.querySelector('[data-knowledge-bind-dialog]').open");
  assert.equal(await evaluate("document.querySelectorAll('[data-knowledge-bind-source]:checked').length"), 0, "cancelling leaves no decision or default choice");
  await click("[data-knowledge-bind-source='1']");
  revision = "changed-after-preview"; await host.search.service.rebuild({ client: host.actionClient(reference), caller }, {});
  await click("[data-knowledge-bind-confirm]");
  await waitFor("document.querySelector('[data-knowledge-bind-review]').hidden===false");
  await screenshot(browser, "source-conflict-review");
  const originalDecision = (await evaluate<KnowledgeBindRequest[]>("window.bindRequests"))[0]!;
  assert.equal((await call<KnowledgeCardsResponse>("/overview")).cards.find(card => card.subject.kind === subject.kind)?.adoption, undefined);
  await click("[data-knowledge-bind-review]"); await waitFor("document.querySelectorAll('[data-knowledge-bind-source]:checked').length===0 && !document.querySelector('[data-knowledge-bind-candidates]').disabled");
  await click("[data-knowledge-bind-cancel]"); await click(row + " [data-knowledge-bind]");
  await waitFor("window.bindRequests.length===2 && document.querySelector('[data-knowledge-bind-dialog] form').getAttribute('aria-busy')==='false'");
  const retried = await evaluate<KnowledgeBindRequest[]>("window.bindRequests"); assert.equal(retried.length, 2); assert.deepEqual(retried[1], originalDecision, "cancelling a new preview preserves the old request");
  await waitFor("!document.querySelector('[data-settings-toast].is-visible')");
  await click(row + " [data-knowledge-bind-review-card]"); await waitFor("document.querySelector('[data-knowledge-bind-dialog]').open");
  const refreshed = await call<KnowledgeBindPreviewResponse>("/bind-preview", { subject });
  await click("[data-knowledge-bind-source='1']"); await click("[data-knowledge-bind-confirm]");
  await waitFor("document.querySelector('[data-knowledge-bind-error]').hidden===false && window.bindRequests.length===3");
  const decision = (await evaluate<KnowledgeBindRequest[]>("window.bindRequests"))[2]!;
  assert.notEqual(decision.operation_id, originalDecision.operation_id, "only a new explicit confirmation replaces the old pending decision");
  const selected = refreshed.candidates[1]!;
  for (const field of ["provider_id", "source_key", "source_identity", "source_revision"] as const) assert.deepEqual(decision[field], selected[field]);
  await click("[data-knowledge-bind-cancel]"); removeSecond();
  await click(row + " [data-knowledge-bind]");
  await waitFor("window.bindRequests.length===4 && document.querySelector('[data-knowledge-bind-dialog] form').getAttribute('aria-busy')==='false'");
  const afterUnavailable = await evaluate<KnowledgeBindRequest[]>("window.bindRequests");
  assert.equal(afterUnavailable.length, 4); assert.deepEqual(afterUnavailable[3], decision);
  t.diagnostic("binding refusals: " + JSON.stringify(await evaluate("window.bindFailures")));
  await screenshot(browser, "source-unavailable-refusal");
  const previewCount = await evaluate<number>("window.previewCount");
  await waitFor("!document.querySelector('[data-settings-toast].is-visible')");
  await click(row + " [data-knowledge-bind-review-card]");
  await waitFor("document.querySelector('[data-knowledge-error]').textContent.includes('无法确认旧卡片现状')");
  await screenshot(browser, "unavailable-source-retains-original-decision");
  assert.equal(await evaluate("window.previewCount"), previewCount, "an unreadable current card never proves that the first binding did not commit");
  removeSecond = register("second"); await host.search.service.rebuild({ client: host.actionClient(reference), caller }, {});
  await waitFor("!document.querySelector('[data-settings-toast].is-visible')");
  await click(row + " [data-knowledge-bind-review-card]");
  await waitFor(`!document.querySelector(${JSON.stringify(row + " [data-knowledge-bind]")})`);
  assert.equal(await evaluate("window.previewCount"), previewCount, "a management read of the committed adoption clears the old pending request without a new preview");
  assert.equal(await evaluate("window.bindRequests.length"), 4);
  const saved = (await call<KnowledgeCardsResponse>("/overview")).cards.find(card => card.subject.kind === subject.kind && card.subject.id === subject.id)!;
  assert.equal(saved.adoption?.operation_id, decision.operation_id); assert.equal(saved.title, retained.title); assert.equal(saved.brief, retained.brief); assert.equal(saved.can_organize, false);
});
