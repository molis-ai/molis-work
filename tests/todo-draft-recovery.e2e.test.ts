import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
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

test("QA-034: two tabs refuse a stale Todo edit, then reload and save without a leftover conflict", { timeout: 240_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null);
  assert.ok(b?.projectId);
  const projectId = b.projectId;
  const primary = await pluginFrameBrowser(t, b, "todo");
  const other = await b.openPage();
  const secondary = await pluginFrameBrowser(t, { ...b, sessionId: other.sessionId, evaluate: other.evaluate.bind(other) }, "todo");
  await other.viewport(1440, 900);
  await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, b.sessionId);
  const access = { actor: "user" as const, actorId: "web-user", projectId, projectIds: [] };
  const store = openTodoStore(b.homeDirectory);
  const [id, neighbourId] = (() => {
    try {
      return [store.create({ title: "Two-tab Todo", notes: "Original notes", placement: "project" }, access).item.id,
        store.create({ title: "Another Todo", placement: "project" }, access).item.id];
    } finally { store.close(); }
  })();
  const read = () => {
    const owner = openTodoStore(b.homeDirectory);
    try { return owner.get(id!, access); } finally { owner.close(); }
  };
  const url = `${b.origin}/projects/${projectId}/?openPlugin=todo`;
  const row = `[data-todo-id="${id}"]`;
  const detail = "[data-todo-stage-workspace]";
  const detailNote = "[data-todo-detail-note]";
  const listNote = "[data-todo-note]";
  const title = "[data-todo-field=title]";
  const notes = "[data-todo-field=notes]";
  const quick = "[data-todo-quick-input]";
  const quickDraft = "Keep this quick entry";
  const ownerRoute = `/items/${id}`;
  const calls: { method: string; route: string }[] = [];
  const todoRoute = (url: string) => url.split("/api/plugins/io.molis.work.todo")[1];
  t.after(b.on("Network.requestWillBeSent", (event, session) => {
    if (session !== b.sessionId) return;
    const request = event.request as { url: string; method: string };
    const route = todoRoute(request.url);
    if (route) calls.push({ method: request.method, route });
  }));
  await b.command("Network.enable", {}, b.sessionId);
  const postsAfter = (index: number) => calls.slice(index).filter(call => call.method === "POST").map(call => call.route);
  const waitForSaveRefusal = async (status: number, attempt: () => Promise<unknown>) => {
    const seen = Promise.withResolvers<void>();
    const off = b.on("Network.responseReceived", (event, session) => {
      const response = event.response as { url: string; status: number };
      if (session === b.sessionId && todoRoute(response.url) === ownerRoute && response.status === status) seen.resolve();
    });
    const timer = setTimeout(() => seen.reject(new Error(`Expected the Host to refuse the draft with HTTP ${status}`)), 10_000);
    try { await Promise.all([attempt(), seen.promise]); }
    finally { clearTimeout(timer); off(); }
    await primary.waitFor(`document.querySelector('[data-todo-save-status]').dataset.mwState === 'unsaved' && !document.querySelector('${detailNote}').hidden`);
  };
  const selectFromHost = (itemId: string) => b.evaluate(`document.querySelector('[data-work-surface=todo]').dispatchEvent(new CustomEvent('molis-work:select-item', { detail: { itemId: ${JSON.stringify(itemId)} } }))`);
  const watchUnreadable = () => b.evaluate(`window.unreadableTodos = []; document.addEventListener('molis-work:item-unreadable', event => window.unreadableTodos.push(event.detail.itemId));`);
  const valueIs = (selector: string, value: string) => `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`;
  const detailOpen = (value: string) => `!document.querySelector('${detail}')?.hidden && ${valueIs(title, value)}`;
  const rowShows = (value: string) => `document.querySelector(${JSON.stringify(row)})?.querySelector('.todo-title')?.textContent === ${JSON.stringify(value)}`;
  const noError = (selector: string) => `(() => { const note = document.querySelector('${selector}');
    const message = note.querySelector('[data-todo-note-text]') ?? note;
    return note.hidden && !note.classList.contains('is-error') && !message.textContent.trim();
  })()`;
  const openItem = async (frame: typeof primary, expectedTitle: string, beforeOpen?: () => Promise<unknown>) => {
    await frame.waitFor("document.querySelector('[data-todo-loading]')?.hidden");
    await frame.click('[data-todo-view="unscheduled"]');
    await frame.waitFor(`document.querySelector(${JSON.stringify(row)})`);
    await beforeOpen?.();
    await frame.click(row);
    await frame.waitFor(detailOpen(expectedTitle));
  };
  const fillQuick = (value: string) => primary.evaluate(`(() => {
    const input = document.querySelector('${quick}');
    input.value = ${JSON.stringify(value)}; input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  })()`);
  const editFields = (frame: typeof primary, values: Record<string, string>) => frame.evaluate(`(() => {
    for (const [name,value] of Object.entries(${JSON.stringify(values)})) {
      const field = document.querySelector('[data-todo-field="' + name + '"]');
      field.value = value; field.dispatchEvent(new InputEvent('input', { bubbles: true }));
    }
  })()`);
  const askReload = async () => {
    await primary.click(`${detail} .plugin-stage-more > summary`);
    await primary.click("[data-todo-reload]");
    await primary.waitFor("document.querySelector('[data-todo-confirm]')?.open");
  };
  const shots = new URL("../.impeccable/qa/review/batch27-todo-recovery/", import.meta.url);
  await mkdir(shots, { recursive: true });
  const capture = async (name: string) => {
    const { data } = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, b.sessionId);
    await writeFile(new URL(`${name}.png`, shots), Buffer.from(data, "base64"));
  };
  const confirm = "[data-todo-confirm]";
  const confirmOk = `${confirm} [data-confirm-ok]`;
  const confirmCancel = `${confirm} [value="cancel"]`;
  const failConfirmedRead = async () => {
    const held = Promise.withResolvers<string>();
    const off = b.on("Fetch.requestPaused", (event, session) => {
      if (session === b.sessionId) held.resolve(String(event.requestId));
    });
    const failure = "Todo detail could not be read right now";
    await b.command("Fetch.enable", { patterns: [{ urlPattern: `*api/plugins/io.molis.work.todo${ownerRoute}`, requestStage: "Request" }] }, b.sessionId);
    const timer = setTimeout(() => held.reject(new Error("Confirmed Todo read did not reach the browser transport")), 10_000);
    try {
      const [, requestId] = await Promise.all([primary.click(confirmOk), held.promise]);
      assert.ok(await primary.evaluate(`(() => {
        const dialog = document.querySelector('${confirm}');
        const field = document.querySelector('${title}');
        const box = field.getBoundingClientRect();
        field.focus();
        return dialog.matches(':modal') && dialog.querySelector('form').getAttribute('aria-busy') === 'true'
          && document.activeElement !== field && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) !== field;
      })()`), "the pending confirmed read leaves the draft editor inert");
      await b.command("Fetch.fulfillRequest", { requestId, responseCode: 503,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify({ error: failure, code: "actions.unavailable" })).toString("base64"),
      }, b.sessionId);
      await primary.waitFor(`document.querySelector('${confirm}')?.open && !document.querySelector('${confirm} .mw-field__error')?.hidden && document.querySelector('${confirm} .mw-field__error')?.textContent === ${JSON.stringify(failure)}`);
    } finally {
      clearTimeout(timer);
      await b.command("Fetch.disable", {}, b.sessionId);
      off();
    }
  };
  await b.navigate(() => b.command("Page.navigate", { url }, b.sessionId));

  for (const locale of ["zh", "en"]) {
    await b.command("Network.setCookie", { name: "molis_work_locale", value: locale, url: b.origin, path: "/" }, b.sessionId);
    for (const [width, height] of [[1440, 900], [1024, 768], [390, 844]] as const) {
      await b.setViewport(width, height);
      for (const theme of ["light", "dark"]) {
        const variant = `${width}-${locale}-${theme}`;
        await t.test(variant, async () => {
          const extended = variant === "1440-zh-light";
          const before = read();
          await b.command("Page.bringToFront", {}, b.sessionId);
          await b.evaluate(`localStorage.setItem('molis-work:theme', '${theme}')`);
          await b.navigate(() => b.command("Page.navigate", { url }, b.sessionId));
          await openItem(primary, before.title, extended ? async () => {
            await primary.click(quick);
            await b.command("Input.insertText", { text: quickDraft }, b.sessionId);
          } : undefined);
          assert.equal(await b.evaluate("document.documentElement.dataset.resolvedTheme"), theme);
          await other.command("Page.bringToFront");
          await other.command("Page.navigate", { url });
          await openItem(secondary, before.title);
          const winner = `Other tab title ${before.revision + 1}`;
          const winnerNotes = "The other tab kept these notes.";
          await editFields(secondary, { title: winner, notes: winnerNotes });
          await secondary.waitFor(`document.querySelector('[data-todo-editor-heading]')?.textContent === ${JSON.stringify(winner)}`);
          const winning = read();
          assert.equal(winning.revision, before.revision + 1);
          assert.equal(winning.notes, winnerNotes);

          await b.command("Page.bringToFront", {}, b.sessionId);
          const draftTitle = "My unsaved title";
          const draftNotes = "Copy this unsaved draft before reloading.";
          await waitForSaveRefusal(409, () => editFields(primary, { title: draftTitle, notes: draftNotes }));
          const conflict = await primary.evaluate<string>(`document.querySelector('${detailNote}').textContent`);
          assert.match(conflict, locale === "en" ? /changed elsewhere.*Your input is kept/ : /已在别处修改.*你的输入还在/);
          assert.deepEqual(read(), winning);
          // At phone width the open detail takes the list's place, so Back is the available attempt to leave.
          const abandon = width === 390 ? "[data-todo-back]" : `[data-todo-id="${neighbourId}"]`;
          const navigation = calls.length;
          await waitForSaveRefusal(409, () => primary.click(abandon));
          assert.deepEqual(postsAfter(navigation), [ownerRoute]);
          assert.equal(calls.slice(navigation).some(call => call.route === `/items/${neighbourId}`), false);
          assert.ok(await primary.evaluate(`${detailOpen(draftTitle)} && ${valueIs(notes, draftNotes)}`), "blocked navigation kept the open draft");
          assert.ok(await primary.evaluate(`(() => {
            const note = document.querySelector('${detailNote}'); const box = note.getBoundingClientRect();
            return box.width > 0 && box.top >= 0 && box.bottom <= innerHeight && note.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
          })()`), "the draft failure is visible in the actual detail");
          await capture(`${variant}-conflict`);
          if (extended) {
            await watchUnreadable();
            const select = calls.length;
            await waitForSaveRefusal(409, () => selectFromHost(neighbourId!));
            assert.deepEqual(postsAfter(select), [ownerRoute]);
            assert.equal(calls.slice(select).some(call => call.route === `/items/${neighbourId}`), false);
            assert.deepEqual(await b.evaluate("window.unreadableTodos"), []);

            // Opening a detail hides the quick form. Deliver its real submit event to test the handler with a draft still open.
            const create = calls.length;
            await waitForSaveRefusal(409, () => primary.evaluate("document.querySelector('[data-todo-quick]').requestSubmit()"));
            await primary.waitFor("document.querySelector('[data-todo=workbench]').getAttribute('aria-busy') === 'false'");
            assert.deepEqual(postsAfter(create), [ownerRoute], "only the rejected draft write reached the Host");
            assert.ok(await primary.evaluate(`${valueIs(quick, quickDraft)} && ${detailOpen(draftTitle)} && ${valueIs(notes, draftNotes)}`));
            assert.deepEqual(read(), winning);
          }
          const cancelStart = calls.length;
          await askReload();
          await primary.click(confirmCancel);
          await primary.waitFor("!document.querySelector('[data-todo-confirm]').open");
          assert.ok(await primary.evaluate(`${detailOpen(draftTitle)} && ${valueIs(notes, draftNotes)} && !document.querySelector('${detailNote}').hidden`));
          const afterCancel = await primary.evaluate<string>(`document.querySelector('${detailNote}').textContent`);
          assert.deepEqual(calls.slice(cancelStart), [], "cancel does not read or write the draft");
          assert.deepEqual(read(), winning);

          await askReload();
          if (extended) {
            const failedRead = calls.length;
            await failConfirmedRead();
            assert.ok(await primary.evaluate(`${detailOpen(draftTitle)} && ${valueIs(notes, draftNotes)} && document.querySelector('[data-todo-save-status]').dataset.mwState === 'unsaved'`));
            assert.equal(await primary.evaluate(`JSON.parse(document.querySelector('[data-todo=workbench]').dataset.assistantContext).object.version`), before.revision);
            assert.deepEqual(postsAfter(failedRead), []);
            assert.equal(calls.slice(failedRead).filter(call => call.route === ownerRoute).length, 1);
            assert.deepEqual(read(), winning);
            await capture(`${variant}-read-failed`);
            await primary.click(confirmCancel);
            await primary.waitFor(`!document.querySelector('${confirm}').open`);
            assert.ok(await primary.evaluate(`${detailOpen(draftTitle)} && ${valueIs(notes, draftNotes)} && ${valueIs(quick, quickDraft)}`));
            await askReload();
          }
          const reloadStart = calls.length;
          await primary.click(confirmOk);
          await primary.waitFor(`${detailOpen(winner)} && ${valueIs(notes, winnerNotes)} && ${rowShows(winner)}`);
          await primary.waitFor(`!document.querySelector('${confirm}').open`);
          assert.deepEqual(postsAfter(reloadStart), [], "recovery is read-only");
          assert.deepEqual(calls.slice(reloadStart).filter(call => [ownerRoute, "/items?view=all", "/items?view=unscheduled"].includes(call.route)), [
            { method: "GET", route: ownerRoute }, { method: "GET", route: "/items?view=all" }, { method: "GET", route: "/items?view=unscheduled" },
          ]);
          const afterReload = await primary.evaluate(`({list: ${noError(listNote)}, detail: ${noError(detailNote)}})`);
          await capture(`${variant}-reloaded`);
          const corrected = `Corrected title ${winning.revision + 1}`;
          await editFields(primary, { title: corrected });
          await primary.waitFor(`document.querySelector('[data-todo-editor-heading]')?.textContent === ${JSON.stringify(corrected)} && document.querySelector('[data-todo-save-status]').dataset.mwState === 'idle'`);
          await primary.click("[data-todo-back]");
          await primary.waitFor(`document.querySelector('${detail}').hidden && ${rowShows(corrected)}`);
          const afterSave = await primary.evaluate(`({list: ${noError(listNote)}, detail: ${noError(detailNote)}})`);
          await capture(`${variant}-saved-list`);
          if (extended) {
            assert.ok(await primary.evaluate(valueIs(quick, quickDraft)));
            await fillQuick("X".repeat(201));
            await primary.click("[data-todo-quick-submit]");
            await primary.waitFor(`document.querySelector('${listNote}')?.classList.contains('is-error') && !document.querySelector('${listNote}').hidden`);
            assert.ok(await primary.evaluate(valueIs(quick, "X".repeat(201))), "a real create refusal stays in the list and preserves its own input");
            await fillQuick(quickDraft);
            const recoveredCreate = calls.length;
            await primary.click("[data-todo-quick-submit]");
            await primary.waitFor(`document.querySelector('${listNote}').textContent.includes(${JSON.stringify(quickDraft)}) && !document.querySelector('${listNote}').classList.contains('is-error')`);
            assert.deepEqual(postsAfter(recoveredCreate), ["/items"]);
            const owner = openTodoStore(b.homeDirectory);
            try { assert.equal(owner.list(access).filter(item => item.title === quickDraft).length, 1); } finally { owner.close(); }
            const missing = crypto.randomUUID();
            await selectFromHost(missing);
            await b.waitFor(`window.unreadableTodos.includes(${JSON.stringify(missing)})`);
            await primary.waitFor(`document.querySelector('${listNote}').classList.contains('is-error') && !document.querySelector('${listNote}').hidden`);
          }
          await primary.click(row);
          await primary.waitFor(`${detailOpen(corrected)} && ${valueIs(notes, winnerNotes)}`);
          const saved = read();
          assert.deepEqual([saved.title, saved.notes, saved.revision], [corrected, winnerNotes, winning.revision + 1]);
          assert.deepEqual([afterReload, afterSave], [{ list: true, detail: true }, { list: true, detail: true }], "recovery cleared both surfaces' old conflict state");
          assert.equal(afterCancel, conflict, "the existing recovery guidance survives the blocked attempt and cancellation");
        });
      }
    }
  }

  await t.test("a real missing draft cannot mark a different selected record unreadable", async () => {
    const titleBefore = read().title;
    await other.command("Page.bringToFront");
    await other.command("Page.navigate", { url });
    await openItem(secondary, titleBefore);
    await secondary.click(`${detail} .plugin-stage-more > summary`);
    await secondary.click("[data-todo-delete]");
    await secondary.waitFor(`document.querySelector('${confirm}')?.open`);
    await secondary.click(confirmOk);
    await secondary.waitFor(`document.querySelector('${detail}')?.hidden`);

    await b.command("Page.bringToFront", {}, b.sessionId);
    await waitForSaveRefusal(404, () => editFields(primary, { title: "Keep my removed draft" }));
    await watchUnreadable();
    const refused = calls.length;
    await waitForSaveRefusal(404, () => selectFromHost(neighbourId!));
    assert.deepEqual(postsAfter(refused), [ownerRoute]);
    assert.equal(calls.slice(refused).some(call => call.route === `/items/${neighbourId}`), false);
    assert.deepEqual(await b.evaluate("window.unreadableTodos"), []);
    assert.ok(await primary.evaluate(`${detailOpen("Keep my removed draft")} && ${noError(listNote)}`));
  });
});
