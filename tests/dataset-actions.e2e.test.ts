import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseCsv, toCsv } from "@molis-ai/molis-work-plugin-dataset";
import { openDatasetStore } from "./fixtures/plugin-home-stores.js";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

for (const width of [1440, 390]) test(`W5-01-DATASET-03: Dataset ${width}px: edit, CSV, save ordering, conflict, versions, explicit AI and publication`, { timeout: 90_000 }, async t => {
  let modelCalls = 0;
  const browser = await openGoalBrowser(t, true, undefined, async prompt => { modelCalls++; assert.match(prompt, /截止时间/); return "截止日期"; }); if (!browser) return;
  const { command, sessionId, navigate, reloadPage, origin, projectId, homeDirectory } = browser;
  const child = await pluginFrameBrowser(t, browser, "dataset");
  const { evaluate, waitFor, click } = child;
  const read = () => { const store = openDatasetStore(homeDirectory); try { return store.list(projectId!); } finally { store.close(); } };
  const idle = () => waitFor("document.querySelector('[data-dataset=workbench]').getAttribute('aria-busy') === 'false'");
  const input = async (selector: string, value: string) => {
    await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  };
  const saved = () => waitFor("document.querySelector('[data-dataset-editor-status]').textContent === '已保存'");
  const open = async () => {
    await browser.waitFor("document.querySelector('[data-plugin-id=dataset]')");
    if (await browser.evaluate("document.body.dataset.desktopSurface") !== "dataset") {
      await browser.click('[data-plugin-strip] [data-plugin-id=dataset]');
    }
    await browser.waitFor("document.body.dataset.desktopSurface === 'dataset'");
  };
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=dataset` }, sessionId)); await open();
  await click('[data-dataset-new]'); await idle();
  assert.equal(read().length, 1); const id = read()[0]!.id;
  await input('[data-dataset-title]', '项目数据'); await saved();
  await click('.dataset-panel > summary');
  const csv = '姓名,说明\r\n一骏,"first\r\nsecond, ""quote"""\r\n小陈,隐藏行';
  await input('[data-dataset-csv]', csv); await click('[data-dataset-import]');
  await waitFor("document.querySelector('[data-dataset-confirm]').open"); await click('[data-dataset-confirm] [data-confirm-ok]'); await idle();
  assert.equal(read()[0]!.rows.length, 2); const descriptionColumn = read()[0]!.columns[1]!.id;
  assert.equal(read()[0]!.rows[0]!.cells[descriptionColumn], 'first\nsecond, "quote"'); // pasted textarea normalizes CRLF
  await input('[data-dataset-description]', '导入后的说明'); await saved();
  assert.equal(read()[0]!.rows[0]!.cells[descriptionColumn], 'first\nsecond, "quote"');
  // Filtered editing keeps invisible rows in the original table.
  await input('[data-dataset-filter]', '一骏'); await input('[data-dataset-row] [data-cell]', '一骏改'); await saved();
  assert.equal(read()[0]!.rows.length, 2); assert.equal(read()[0]!.rows[1]!.cells[descriptionColumn], '隐藏行');
  await input('[data-dataset-filter]', '');
  // Delay the first real HTTP response while a second edit is made.
  await evaluate(`(() => { const original = window.molisWorkRequest; window.datasetSaveRequests = 0;
    window.molisWorkRequest = Object.assign(async (url, init) => {
      const response = await original(url, init);
      if (init?.method === 'POST' && new URL(url, ${JSON.stringify(origin)}).pathname.endsWith('/api/plugins/io.molis.work.dataset/datasets/${id}')) {
        window.datasetSaveRequests++;
        if (window.datasetSaveRequests === 1) await new Promise(resolve => { window.releaseDatasetSave = resolve; });
      }
      return response;
    }, original); window.restoreDatasetFetch = () => { window.molisWorkRequest = original; };
  })()`);
  await input('[data-dataset-title]', '第一笔'); await waitFor("typeof window.releaseDatasetSave === 'function'");
  await input('[data-dataset-title]', '第二笔'); assert.equal(read()[0]!.title, '第一笔');
  await evaluate('window.releaseDatasetSave()'); await saved();
  assert.equal(read()[0]!.title, '第二笔'); assert.equal(await evaluate('window.datasetSaveRequests'), 2);
  await evaluate('window.restoreDatasetFetch()');
  await input('[data-dataset-version-note]', '两行快照'); await click('[data-dataset-snapshot]'); await idle();
  const snapshotColumns = read()[0]!.columns.length;
  await click('.dataset-assist > summary');
  await input('[data-dataset-ai-prompt]', '本地列'); await click('[data-dataset-generate]'); await idle();
  assert.equal(modelCalls, 0); assert.equal(read()[0]!.columns.at(-1)!.name, '本地列');
  await input('[data-dataset-ai-prompt]', '截止时间'); await click('[data-dataset-generate-ai]'); await idle();
  assert.equal(modelCalls, 1); assert.equal(read()[0]!.columns.at(-1)!.name, '截止日期');
  await evaluate("(() => { const select = [...document.querySelectorAll('[data-column-type]')].at(-1); select.value = 'date'; select.dispatchEvent(new Event('change', {bubbles:true})); })()");
  await saved(); assert.equal(read()[0]!.columns.at(-1)!.type, 'date');
  assert.equal(await evaluate("document.querySelectorAll('[data-cell][type=date]').length"), 2);
  await click('[data-dataset-rollback]'); await idle(); assert.equal(read()[0]!.columns.length, snapshotColumns);
  const downloads = join(homeDirectory, 'exports'); await mkdir(downloads);
  await command('Browser.setDownloadBehavior', {behavior:'allow', downloadPath:downloads});
  const exportedFile = async (name: string, expected: string) => {
    const deadline = Date.now() + 4000;
    while (true) {
      try { const content = await readFile(join(downloads, name), 'utf8'); if (content === expected) return content; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (Date.now() > deadline) throw new Error('Downloaded file does not match the complete saved table: ' + name);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const moreClick = async (selector: string) => {
    if (!await evaluate("document.querySelector('[data-dataset-stage-workspace] .plugin-stage-more').open")) await click('[data-dataset-stage-workspace] .plugin-stage-more > summary');
    await click(selector);
  };
  await moreClick('[data-dataset-export-csv]'); await idle();
  // The download carries a byte-order mark so spreadsheet apps read the text as UTF-8.
  assert.deepEqual(parseCsv(await exportedFile('第二笔.csv', '\ufeff' + toCsv(read()[0]!))).rows.map(row => Object.values(row.cells)), read()[0]!.rows.map(row => Object.values(row.cells)));
  await moreClick('[data-dataset-export-json]'); await idle();
  assert.deepEqual(JSON.parse(await exportedFile('第二笔.json', JSON.stringify(read()[0]!, null, 2))).rows, read()[0]!.rows);
  // An external writer changes the version. A stale publish must retain input and do nothing.
  const other = openDatasetStore(homeDirectory);
  try { other.update(id, { title: '另一客户端修改' }, projectId!); } finally { other.close(); }
  await input('[data-dataset-title]', '待保留输入'); await click('[data-dataset-artifact-bar]'); await idle();
  await waitFor("document.querySelector('[data-dataset-editor-status]').textContent === '保存失败'");
  assert.equal(await evaluate("document.querySelector('[data-dataset-title]').value"), '待保留输入');
  assert.equal(read()[0]!.title, '另一客户端修改'); assert.equal(read()[0]!.artifact_version, 0);
  await click('[data-dataset-back]'); await idle();
  assert.equal(await evaluate("document.querySelector('[data-dataset-stage-workspace]').hidden"), false);
  const output = reviewEvidenceUrl("action-service/"); await mkdir(output, { recursive: true });
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL(`dataset-conflict-${width}.png`, output), Buffer.from((await command<{data:string}>('Page.captureScreenshot', {format:'png'}, sessionId)).data, 'base64'));
  await moreClick('[data-dataset-reload]'); await waitFor("document.querySelector('[data-dataset-confirm]').open");
  await click('[data-dataset-confirm] [data-confirm-ok]'); await idle();
  assert.equal(await evaluate("document.querySelector('[data-dataset-title]').value"), '另一客户端修改');
  // An undeclared trigger is refused before publication. The page keeps the draft and offers an explicit new attempt.
  const db = openHomeSqliteDatabase(homeDirectory, 'dataset');
  try {
    db.exec("CREATE TRIGGER fail_dataset_ui_publication BEFORE UPDATE OF artifact_version ON datasets WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
    await click('[data-dataset-artifact-bar]'); await idle(); assert.equal(read()[0]!.publication_pending, undefined); assert.equal(read()[0]!.artifact_version, 0);
    assert.equal(await evaluate("document.querySelector('[data-dataset-artifact-bar]').textContent"), '存为固定版本');
    db.exec('DROP TRIGGER fail_dataset_ui_publication');
  } finally { db.close(); }
  await moreClick('[data-dataset-reload]'); await idle();
  assert.equal(await evaluate("document.querySelector('[data-dataset-artifact-bar]').textContent"), '存为固定版本');
  await input('[data-dataset-description]', '发布中继续编辑'); await saved();
  assert.equal(await evaluate("document.querySelector('[data-dataset-title]').value"), '另一客户端修改');
  assert.equal(await evaluate("document.querySelector('[data-dataset-description]').value"), '发布中继续编辑');
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL(`dataset-recovery-${width}.png`, output), Buffer.from((await command<{data:string}>('Page.captureScreenshot', {format:'png'}, sessionId)).data, 'base64'));
  await click('[data-dataset-artifact-bar]'); await idle();
  assert.equal(read()[0]!.publication_pending, undefined); assert.equal(read()[0]!.artifact_version, 1);
  assert.equal(read()[0]!.description, '发布中继续编辑');
  assert.equal(await evaluate("document.querySelector('[data-dataset-stage-workspace]').scrollLeft"), 0, 'toolbar scrolling must not shift the editor');
  // Scope spoofing is rejected by the real HTTP adapter, before any business mutation.
  const denied = await browser.evaluate<{status:number}>(`fetch((document.body.dataset.routePrefix||'') + '/api/plugins/io.molis.work.dataset/datasets?project_id=${projectId}', {method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({project_id:'other-project', title:'must not exist'})}).then(r=>({status:r.status}))`);
  assert.equal(denied.status, 403); assert.equal(read().length, 1);
  // The short native route is gone, with no compatibility alias: the Runtime route is the only one.
  const oldRoute = await browser.evaluate<{status:number}>(`fetch((document.body.dataset.routePrefix||'') + '/api/dataset?project_id=${projectId}').then(r=>({status:r.status}))`);
  assert.equal(oldRoute.status, 404);
  // The dataset being edited comes back by itself (specs/archive/page-interaction-flow: a plugin's page reopens the record that was open in it after a reload).
  await reloadPage(); await open(); await waitFor("document.querySelector('[data-dataset-title]')?.getClientRects().length > 0");
  await idle(); assert.equal(read()[0]!.artifact_version, 1);
  assert.equal(await evaluate("document.querySelectorAll('[data-dataset-row]').length"), 2);
  assert.ok((await browser.evaluate('document.documentElement.scrollWidth <= window.innerWidth') && await evaluate('document.documentElement.scrollWidth <= window.innerWidth')));
  assert.ok(await evaluate("document.querySelector('.dataset-table-wrap').getBoundingClientRect().height > 100"), 'table rows must not collapse in the flex workspace');
  assert.ok(await evaluate("document.querySelector('[data-column-name]').getBoundingClientRect().width >= 100"), 'column names remain readable on narrow screens');
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL(`dataset-editor-${width}.png`, output), Buffer.from((await command<{data:string}>('Page.captureScreenshot', {format:'png'}, sessionId)).data, 'base64'));
});

test('W5-01-DATASET-03: Dataset without a model disables AI while local creation and column edits still work', {timeout:45_000}, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId } = browser;
  const child = await pluginFrameBrowser(t, browser, "dataset");
  const { evaluate, waitFor, click } = child;
  await command('Emulation.setDeviceMetricsOverride', {width:1440, height:950, deviceScaleFactor:1, mobile:false}, sessionId);
  await navigate(() => command('Page.navigate', {url:`${origin}/projects/${projectId}/?openPlugin=dataset`}, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-id=dataset]')");
  if (await browser.evaluate('document.body.dataset.desktopSurface') !== 'dataset') await browser.click('[data-plugin-strip] [data-plugin-id=dataset]');
  await click('[data-dataset-new]'); await waitFor("document.querySelector('[data-dataset=workbench]').getAttribute('aria-busy') === 'false'");
  await click('.dataset-assist > summary');
  assert.equal(await evaluate("document.querySelector('[data-dataset-generate-ai]').disabled"), true);
  assert.match(await evaluate<string>("document.querySelector('[data-dataset-ai-reason]').textContent"), /模型/);
  await evaluate("document.querySelector('[data-dataset-ai-prompt]').value='手工列'"); await click('[data-dataset-generate]');
  await waitFor("document.querySelector('[data-column-name]')?.value === '手工列'");
});

for (const phase of ["transport", "body", "save"] as const) test(`BSH-09 BL-1033: Dataset unmount during ${phase}`, { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const { command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  assert.ok(projectId);
  const child = await pluginFrameBrowser(t, browser, "dataset");
  const createTable = (title: string) => {
    const store = openDatasetStore(homeDirectory);
    try { return store.create({ project_id: projectId, title }); } finally { store.close(); }
  };
  const original = createTable("请求前的表");
  browser.setFrameInitScript(`
    const state = window.datasetRead = { deny: ${phase === "transport"}, hold: null, confirmations: 0 };
    const urlOf = url => new URL(url, ${JSON.stringify(origin)});
    const isList = (url, init) => init?.method === "GET" && url.pathname.endsWith("/api/plugins/io.molis.work.dataset/datasets");
    const isSave = (url, init) => init?.method === "POST" && url.pathname.includes("/api/plugins/io.molis.work.dataset/datasets/")
      && url.pathname.split("/").at(-2) === "datasets";
    window.molisWorkbenchPluginFactories = new Proxy({}, { set(target, key, factory) {
      target[key] = key !== "dataset" ? factory : host => {
        const request = window.molisWorkRequest, fetch = window.fetch;
        window.molisWorkRequest = Object.assign(async (url, init) => {
          const link = urlOf(url);
          if (!isList(link, init) && !(state.hold === "save" && isSave(link, init))) return request(url, init);
          if (state.deny) { state.deny = false; link.searchParams.set("project_id", "other-project"); }
          state.scoped = Boolean(init.scope);
          state.settled = false;
          state.error = null;
          state.delivered = false;
          try { const result = await request(link.href, init); state.delivered = true; return result; }
          catch (error) { state.error = error; throw error; }
          finally { state.settled = true; }
        }, request);
        window.fetch = async (url, init) => {
          const response = await fetch(url, init);
          if (state.hold && (state.hold === "save" ? isSave(urlOf(url), init) : isList(urlOf(url), init))) {
            state.signal = init.signal;
            state.status = response.status;
            if (state.hold === "body") {
              const text = await response.text();
              response.text = () => new Promise(resolve => {
                state.release = () => { resolve(text); queueMicrotask(() => state.root.remove()); };
              });
            } else await new Promise(resolve => { state.release = resolve; });
          }
          return response;
        };
        return factory(host);
      };
      return true;
    } });
  `);
  await browser.setViewport(1440, 950);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=dataset` }, sessionId));
  await browser.waitFor("document.body.dataset.desktopSurface === 'dataset'");
  if (phase === "transport") {
    const failure = "[data-dataset-rows] [role=alert]";
    await child.waitFor(`document.querySelector('${failure} p')`);
    assert.deepEqual(await child.evaluate("({ status: datasetRead.error.status, code: datasetRead.error.code })"), {
      status: 403, code: "actions.scope_mismatch",
    });
    assert.match(await child.evaluate<string>(`document.querySelector('${failure} p').textContent`), /没有权限读取这里的内容/);
    await child.click(`${failure} button`);
  }
  await child.waitFor(`document.querySelector('[data-dataset-id="${original.id}"]')`);

  if (phase === "save") {
    await child.click(`[data-dataset-id="${original.id}"]`);
    await child.waitFor("document.querySelector('[data-dataset=workbench]').getAttribute('aria-busy') === 'false'");
  }
  const late = phase === "save" ? null : createTable("离开后才送达的表");
  await child.evaluate(`(() => {
    datasetRead.hold = ${JSON.stringify(phase)};
    datasetRead.settled = false;
    datasetRead.root = document.querySelector('[data-dataset=workbench]');
    datasetRead.note = datasetRead.root.querySelector('[data-dataset-note]').textContent;
    if (datasetRead.hold === "save") {
      const dialog = datasetRead.root.querySelector('[data-dataset-confirm]');
      const show = dialog.showModal.bind(dialog);
      dialog.showModal = () => { datasetRead.confirmations++; show(); };
      const title = datasetRead.root.querySelector('[data-dataset-title]');
      title.value = '取消回执时有未确认的编辑';
      title.dispatchEvent(new Event('input', { bubbles: true }));
    } else document.dispatchEvent(new Event('molis-work:model-ready'));
  })()`);
  await child.waitFor("datasetRead.release || datasetRead.settled");
  assert.equal(await child.evaluate("datasetRead.scoped"), true);
  assert.equal(await child.evaluate("datasetRead.status"), 200);
  if (phase === "save") {
    await child.click("[data-dataset-reload]");
    await child.waitFor("datasetRead.root.getAttribute('aria-busy') === 'true'");
  }
  if (phase !== "body") {
    await child.evaluate("datasetRead.root.remove()");
    await child.waitFor("datasetRead.signal.aborted");
  }
  await child.evaluate("datasetRead.release()");
  await child.waitFor("datasetRead.settled");
  await child.evaluate("new Promise(resolve => setTimeout(resolve, 0))");
  if (phase === "body") {
    assert.equal(await child.evaluate("datasetRead.delivered"), true, "the transport passed its last scope check before unmount");
    assert.equal(await child.evaluate("datasetRead.signal.aborted"), true);
  } else assert.equal(await child.evaluate("datasetRead.error.name"), "AbortError");
  if (late) assert.equal(await child.evaluate(`Boolean(datasetRead.root.querySelector('[data-dataset-id="${late.id}"]'))`), false, "the detached directory did not receive the late row");
  if (phase === "save") assert.equal(await child.evaluate("datasetRead.confirmations"), 0, "the reload did not open a dialog after its save was cancelled");
  assert.equal(await child.evaluate("datasetRead.root.querySelector('[data-dataset-note]').textContent === datasetRead.note"), true);
});
