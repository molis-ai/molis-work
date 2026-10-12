import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { issueModel } from "./fixtures/issue-model.js";

test("ISSUE-28 feedback follows progress, failed confirmation, committed save and delete, and refresh recovery", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "empty", undefined, null); if (!b) return;
  await issueModel(t, b.homeDirectory);
  const { origin, command, sessionId, navigate, evaluate, click, waitFor } = b;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/plugins/issues` }, sessionId));
  await waitFor("document.querySelector('[data-issues=workbench]')?.dataset.ready==='true'");
  const db = new DatabaseSync(join(b.homeDirectory, "issues", "issues.db"), { readOnly: true }); t.after(() => db.close());
  const count = () => db.prepare("SELECT count(*) AS n FROM issues").get()!.n;
  await evaluate(`window.issueStatusFetch=fetch;window.issueStatusFault='prepare';window.fetch=async(url,options)=>{
    const path=new URL(String(url),location.href).pathname;
    if(path.endsWith('/io.molis.work.issues/prepare') && window.issueStatusFault==='prepare') await new Promise(resolve=>{window.issueResumePrepare=resolve});
    if(path.includes('/cards/') && path.endsWith('/run')) {
      if(window.issueStatusFault==='result') return new Response(JSON.stringify({status:'failed',outcome:'确认操作未完成。'}),{headers:{'content-type':'application/json'}});
      const response=await issueStatusFetch(url,options);
      if(window.issueStatusFault==='read') window.issueBlockDetails=true;
      return response;
    }
    if(window.issueBlockDetails && path.endsWith('/io.molis.work.issues/read')) { window.issueReadFailures=(window.issueReadFailures||0)+1; throw new Error('test detail offline'); }
    if(window.issueStatusFault==='list' && path.endsWith('/io.molis.work.issues/list')) throw new Error('test list offline');
    return issueStatusFetch(url,options);
  }`);
  await click("[data-issue-new]"); await click("[name=description]");
  await command("Input.insertText", { text: "切换页面后，输入的问题描述消失。" }, sessionId);
  await click("[data-issue-organize]");
  await waitFor("Boolean(window.issueResumePrepare)");
  assert.equal(await evaluate("document.querySelector('[data-issue-assistant-note]').textContent"), "助理正在整理问题…", "Text-only input must not claim that images were submitted");
  assert.equal(await evaluate("document.querySelector('[data-issue-revise]').textContent"), "停止整理");
  assert.equal(count(), 0);
  await evaluate("window.issueStatusFault='result';window.issueResumePrepare()");
  await waitFor("!document.querySelector('[data-issue-save]').hidden && document.querySelector('[data-issue-save]').textContent==='确认并保存'", 15000);
  assert.equal(await evaluate("document.querySelector('[data-issue-assistant-note]').textContent"), "请核对标题和类型，确认后保存。");
  assert.equal(count(), 0, "A confirmation card is not a persisted issue");
  await click("[data-issue-save]");
  await waitFor("document.querySelector('[data-issue-note]').textContent==='确认操作未完成。'");
  assert.equal(await evaluate("document.querySelector('[data-issue-assistant-note]').textContent"), "", "A failed card must not retain the ready-to-save guidance");
  assert.equal(await evaluate("document.querySelector('[data-issue-save]').hidden"), true);
  assert.equal(await evaluate("document.querySelector('[data-issue-revise]').textContent"), "核对保存结果");
  assert.equal(count(), 0);

  await evaluate("window.issueStatusFault='read'"); await click("[data-issue-revise]");
  await waitFor("!document.querySelector('[data-issue-organize]').hidden");
  await click("[data-issue-organize]");
  await waitFor("!document.querySelector('[data-issue-save]').hidden && document.querySelector('[data-issue-save]').textContent==='确认并保存'", 15000);
  await click("[data-issue-save]");
  await waitFor("document.querySelector('[data-issue-note]').textContent==='已保存，详情读取失败。请刷新列表查看。'");
  assert.equal(count(), 1, "The save actually committed despite the detail failure");
  assert.equal(db.prepare("SELECT description FROM issues").get()!.description, "切换页面后，输入的问题描述消失。");
  assert.equal(await evaluate("document.querySelector('[data-issue-assistant-note]').textContent"), "");
  assert.equal(await evaluate("document.querySelector('[data-issue-save]').hidden"), true);
  assert.equal(await evaluate("(()=>{const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented})()"), false, "A confirmed write must not be described as unsaved");
  // Even receipt reconciliation can fail to read: keep the safe recovery action and known save result.
  const readsBefore = await evaluate<number>("window.issueReadFailures");
  await click("[data-issue-revise]");
  await waitFor(`window.issueReadFailures>${readsBefore}`);
  await waitFor("document.querySelector('[data-issue-note]').textContent==='已保存，详情读取失败。请刷新列表查看。'");
  assert.equal(await evaluate("document.querySelector('[data-issue-revise]').textContent"), "核对保存结果");
  await evaluate("window.issueBlockDetails=false;window.issueStatusFault=''");
  await click("[data-issue-revise]"); await waitFor("!document.querySelector('[data-issue-view]').hidden");
  assert.equal(await evaluate("document.querySelector('[data-issue-inputs]').disabled"), true, "The receipt returns to viewing, not a new editable duplicate");
  assert.equal(await evaluate("document.querySelector('[data-issue-note]').textContent"), "已保存");
  assert.equal(count(), 1);

  const saved = db.prepare("SELECT id, version FROM issues").get()!;
  await evaluate(`fetch('/api/plugins/io.molis.work.issues/update',{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({id:${JSON.stringify(saved.id)},expected_version:${saved.version},title:'其他窗口已改标题'})}).then(r=>{if(!r.ok)throw Error(r.status)})`);
  await click("[data-issue-delete]"); await click("[data-issue-dialog-ok]");
  await waitFor("document.querySelector('[data-issue-note]').textContent.includes('请刷新详情后再确认删除')");
  assert.equal(count(), 1, "A stale delete preserves the issue and names the available recovery action");
  await click("[data-issue-reread]");
  await waitFor("document.querySelector('[data-issue-view-title]').textContent==='其他窗口已改标题'");
  assert.equal(await evaluate("document.querySelector('[data-issue-note]').hidden"), true);
  await evaluate("window.issueStatusFault='list'");
  await click("[data-issue-delete]"); await click("[data-issue-dialog-ok]");
  await waitFor("document.querySelector('[data-issue-list-note]').textContent==='已删除，列表刷新失败，请重试。'");
  assert.equal(count(), 0);
  await evaluate("window.issueStatusFault=''"); await click("[data-issue-refresh]");
  await waitFor("document.querySelector('[data-issue-list-note]').textContent==='列表已刷新'");
  assert.equal(await evaluate("document.querySelector('[data-issue-list-note]').classList.contains('is-error')"), false);
  assert.equal(await evaluate("document.querySelector('[data-issue-list]').textContent.includes('还没有问题记录')"), true);
  assert.equal(count(), 0);
});
