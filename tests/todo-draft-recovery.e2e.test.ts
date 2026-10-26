import assert from "node:assert/strict";
import test from "node:test";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("W2-18-TODO-DRAFT-01: failed save and empty title preserve every field and block navigation or follow-up writes; retry and explicit discard recover", { timeout: 120_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "todo");
  const { evaluate, waitFor, click } = child;
  const access = { actor: "user" as const, actorId: "web-user", projectId: projectId!, projectIds: [] };
  const setup = openTodoStore(homeDirectory);
  const [first, second] = (() => { try { return [setup.create({ title: "保存原件", notes: "原说明", placement: "project" }, access).item, setup.create({ title: "另一件", placement: "project" }, access).item]; } finally { setup.close(); } })();
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=todo` }, sessionId));
  await waitFor("document.querySelector('[data-todo=workbench]') && document.querySelector('[data-todo-loading]').hidden", 10_000);
  await click('[data-todo-view="all"]');
  await waitFor(`document.querySelector('[data-todo-id="${first!.id}"]') && document.querySelector('[data-todo-id="${second!.id}"]')`);
  await click(`[data-todo-id="${first!.id}"]`);
  await waitFor("document.querySelector('[data-todo-field=title]')?.value === '保存原件'", 10_000);
  await evaluate(`(() => { window.todoRequest = window.molisWorkRequest; window.todoWrites = []; window.todoFailures = []; window.todoErrors = []; window.todoMode = '500';
    addEventListener('unhandledrejection', event => window.todoErrors.push(String(event.reason)));
    window.molisWorkRequest = Object.assign(async (url, options) => {
      if (options?.method === 'POST' && String(url).includes('/api/plugins/io.molis.work.todo/')) {
        window.todoWrites.push({ url: String(url), body: options.body || {} });
        if (String(url).endsWith('/items/' + ${JSON.stringify(first!.id)})) {
          if (window.todoMode === 'network') { window.todoFailures.push('network'); throw new TypeError('fixture offline'); }
          if (window.todoMode === '500') { window.todoFailures.push('500'); throw Object.assign(new Error('fixture save refused'), { code: 'fixture.save_refused', status: 500 }); }
          try { return await window.todoRequest(url, options); }
          catch (error) { window.todoFailures.push(String(error.status)); throw error; }
        }
      }
      return window.todoRequest(url, options);
    }, window.todoRequest);
    for (const [key,value] of [['title','保留输入'],['notes','尚未保存的说明'],['due_date','2026-10-30'],['due_time','11:00']]) {
      const control = document.querySelector('[data-todo-field="' + key + '"]'); control.value = value; control.dispatchEvent(new Event(control.type === 'date' || control.type === 'time' ? 'change' : 'input', { bubbles: true }));
    }
  })()`);
  await waitFor("document.querySelector('[data-todo-detail-note]')?.textContent.includes('fixture save refused')", 10_000);
  const fields = () => evaluate(`['title','notes','due_date','due_time'].map(key => document.querySelector('[data-todo-field="' + key + '"]').value)`);
  const retained = ["保留输入", "尚未保存的说明", "2026-10-30", "11:00"];
  for (const mode of ["500", "network"]) for (const operation of ["back", "other", "placement", "complete", "link", "search", "batch", "quick"]) {
    await evaluate(`window.todoMode = ${JSON.stringify(mode)}`);
    const before = await evaluate<number>("window.todoWrites.length");
    await evaluate(`(() => {
      if (${JSON.stringify(operation)} === 'quick') { const input = document.querySelector('[data-todo-quick-input]'); input.value = '不应创建'; input.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-todo-quick]').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return; }
      if (${JSON.stringify(operation)} === 'search' || ${JSON.stringify(operation)} === 'batch') {
        document.querySelector('[data-todo=workbench]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(operation === "batch" ? "batch:unrelated" : second!.id)} } })); return;
      }
      if (${JSON.stringify(operation)} === 'link') document.querySelector('[data-todo-link-target]').value = ${JSON.stringify(second!.id)};
      const selector = ${JSON.stringify(operation === "back" ? "[data-todo-back]" : operation === "other" ? `[data-todo-id="${second!.id}"]` : operation === "placement" ? '[data-todo-placement="personal"]' : operation === "link" ? "[data-todo-link-add]" : '[data-todo-status="done"]')};
      const button = document.querySelector(selector); if (!button) throw new Error('Missing Todo target: ' + selector); button.click();
    })()`);
    await waitFor(`window.todoWrites.length > ${before} && !document.querySelector('[data-todo-save-status]').textContent.includes('保存中')`);
    assert.deepEqual(await fields(), retained, operation);
    assert.equal(await evaluate("document.querySelector('[data-todo-stage-workspace]').hidden"), false, operation);
    assert.equal(await evaluate(`window.todoWrites.every(row => row.url.endsWith('/items/' + ${JSON.stringify(first!.id)}))`), true, operation);
  }
  const failed = openTodoStore(homeDirectory);
  try { assert.deepEqual([failed.get(first!.id, access).title, failed.get(first!.id, access).notes, failed.get(first!.id, access).revision], [first!.title, first!.notes, first!.revision]); } finally { failed.close(); }
  await evaluate("window.todoMode = 'normal'; document.querySelector('[data-todo-back]').click()");
  await waitFor("document.querySelector('[data-todo-stage-workspace]').hidden", 10_000);
  const saved = openTodoStore(homeDirectory);
  try { const item = saved.get(first!.id, access); assert.deepEqual([item.title,item.notes,item.due_date,item.due_time], retained); } finally { saved.close(); }
  await evaluate(`document.querySelector('[data-todo-id="${first!.id}"]').click()`);
  // Closing the detail only hides it and leaves the old values in the fields: wait until the reopen has read the item again.
  await waitFor("!document.querySelector('[data-todo-stage-workspace]').hidden && document.querySelector('[data-todo-field=title]').value === '保留输入'");
  const concurrent = openTodoStore(homeDirectory);
  try { concurrent.update(first!.id, { notes: "另一入口保存的说明" }, undefined, access); } finally { concurrent.close(); }
  await evaluate("const notes = document.querySelector('[data-todo-field=notes]'); notes.value = '冲突时保留的输入'; notes.dispatchEvent(new Event('input', { bubbles: true }));");
  await waitFor("window.todoFailures.includes('409') && document.querySelector('[data-todo-detail-note]').textContent.length > 0", 10_000);
  for (const operation of ["back", "other", "placement", "link", "search"]) {
    const before = await evaluate<number>("window.todoWrites.length");
    await evaluate(`(() => {
      if (${JSON.stringify(operation)} === 'search') { document.querySelector('[data-todo=workbench]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(second!.id)} } })); return; }
      if (${JSON.stringify(operation)} === 'link') document.querySelector('[data-todo-link-target]').value = ${JSON.stringify(second!.id)};
      document.querySelector(${JSON.stringify(operation === "back" ? "[data-todo-back]" : operation === "other" ? `[data-todo-id="${second!.id}"]` : operation === "placement" ? '[data-todo-placement="personal"]' : "[data-todo-link-add]")}).click();
    })()`);
    await waitFor(`window.todoWrites.length > ${before} && !document.querySelector('[data-todo-save-status]').textContent.includes('保存中')`);
    assert.deepEqual(await fields(), ["保留输入", "冲突时保留的输入", "2026-10-30", "11:00"]);
  }
  const protectedOwner = openTodoStore(homeDirectory);
  try { const item = protectedOwner.get(first!.id, access); assert.equal(item.notes, "另一入口保存的说明"); assert.deepEqual(item.links, []); assert.equal(item.placement, "project"); } finally { protectedOwner.close(); }
  await evaluate("document.querySelector('[data-todo-reload]').closest('details').open = true");
  await click("[data-todo-reload]"); await waitFor("document.querySelector('[data-todo-confirm]').open");
  await click("[data-todo-confirm] [data-confirm-ok]");
  await waitFor("document.querySelector('[data-todo-field=notes]').value === '另一入口保存的说明'");
  await evaluate("const title = document.querySelector('[data-todo-field=title]'); title.value = ''; title.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('[data-todo-back]').click()");
  await waitFor("document.querySelector('[data-todo-detail-note]').textContent.includes('标题不能是空的')");
  assert.equal(await evaluate("document.querySelector('[data-todo-field=title]').value"), "");
  assert.equal(await evaluate("document.querySelector('[data-todo-stage-workspace]').hidden"), false);
  await evaluate("document.querySelector('[data-todo-reload]').closest('details').open = true");
  await click("[data-todo-reload]");
  await waitFor("document.querySelector('[data-todo-confirm]').open");
  assert.equal(await evaluate("document.querySelector('[data-todo-field=title]').value"), "");
  await click('[data-todo-confirm] [value="cancel"]');
  await waitFor("!document.querySelector('[data-todo-confirm]').open");
  assert.equal(await evaluate("document.querySelector('[data-todo-field=title]').value"), "");
  await evaluate("document.querySelector('[data-todo-reload]').closest('details').open = true");
  await click("[data-todo-reload]");
  await waitFor("document.querySelector('[data-todo-confirm]').open");
  await click("[data-todo-confirm] [data-confirm-ok]");
  await waitFor("document.querySelector('[data-todo-field=title]').value === '保留输入'");
  assert.deepEqual(await evaluate("window.todoErrors"), []);
  // Explicit delete waits for the already-dispatched save to settle, even when that save fails.
  await evaluate(`(() => { window.deleteOrder = []; window.molisWorkRequest = Object.assign(async (url, options) => {
    if (options?.method === 'POST' && String(url).endsWith('/items/' + ${JSON.stringify(first!.id)})) {
      window.deleteOrder.push('save-start'); await new Promise(resolve => { window.deleteSaveRelease = resolve; });
      window.deleteOrder.push('save-end'); throw Object.assign(new Error('fixture pending save failed'), { code: 'fixture.save_refused', status: 500 });
    }
    if (options?.method === 'POST' && String(url).endsWith('/delete')) window.deleteOrder.push('delete');
    return window.todoRequest(url, options);
  }, window.todoRequest); const notes = document.querySelector('[data-todo-field=notes]'); notes.value = '明确删除的草稿'; notes.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await waitFor("typeof window.deleteSaveRelease === 'function'", 10_000);
  await evaluate("document.querySelector('[data-todo-delete]').closest('details').open = true");
  await click("[data-todo-delete]"); await waitFor("document.querySelector('[data-todo-confirm]').open");
  await click("[data-todo-confirm] [data-confirm-ok]");
  assert.deepEqual(await evaluate("window.deleteOrder"), ["save-start"]);
  await evaluate("window.deleteSaveRelease()");
  await waitFor("document.querySelector('[data-todo-stage-workspace]').hidden", 10_000);
  assert.deepEqual(await evaluate("window.deleteOrder"), ["save-start", "save-end", "delete"]);
  const deletedOwner = openTodoStore(homeDirectory);
  try { assert.throws(() => deletedOwner.get(first!.id, access), { code: "todo.not_found" }); assert.equal(deletedOwner.get(second!.id, access).status, "open"); } finally { deletedOwner.close(); }
  assert.deepEqual(await evaluate("window.todoErrors"), []);
  await evaluate("window.molisWorkRequest = window.todoRequest");
});
