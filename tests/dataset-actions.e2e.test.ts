import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { openDatasetStore, parseCsv, toCsv } from "@molis-ai/molis-work-plugin-dataset";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

for (const width of [1440, 390]) test(`Dataset ${width}px: edit, CSV, save ordering, conflict, versions, explicit AI and publication`, { timeout: 90_000 }, async t => {
  let modelCalls = 0;
  const browser = await openGoalBrowser(t, true, undefined, async prompt => { modelCalls++; assert.match(prompt, /截止时间/); return "截止日期"; }); if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, reloadPage, origin, projectId, homeDirectory } = browser;
  const read = () => { const store = openDatasetStore(homeDirectory); try { return store.list(projectId!); } finally { store.close(); } };
  const idle = () => waitFor("document.querySelector('[data-dataset=workbench]').getAttribute('aria-busy') === 'false'");
  const input = async (selector: string, value: string) => {
    await evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.value = ${JSON.stringify(value)}; node.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  };
  const saved = () => waitFor("document.querySelector('[data-dataset-editor-status]').textContent === '已保存'");
  const open = async () => {
    await waitFor("document.querySelector('[data-plugin-id=dataset]')");
    if (await evaluate("document.body.dataset.desktopSurface") !== "dataset") {
      if (width === 390) await click('.workspace-chrome [data-directory-show]');
      await click('[data-plugin-strip] [data-plugin-id=dataset]');
    }
    await waitFor("document.body.dataset.desktopSurface === 'dataset'");
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
  await evaluate(`(() => { const original = window.fetch; window.datasetSaveRequests = 0;
    window.fetch = async (url, init) => {
      const response = await original(url, init);
      if (init?.method === 'POST' && new URL(url, location.href).pathname === '/api/plugins/dataset/${id}') {
        window.datasetSaveRequests++;
        if (window.datasetSaveRequests === 1) await new Promise(resolve => { window.releaseDatasetSave = resolve; });
      }
      return response;
    }; window.restoreDatasetFetch = () => { window.fetch = original; };
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
  assert.deepEqual(parseCsv(await exportedFile('第二笔.csv', toCsv(read()[0]!))).rows.map(row => Object.values(row.cells)), read()[0]!.rows.map(row => Object.values(row.cells)));
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
  const output = new URL('../.impeccable/review/action-service/', import.meta.url); await mkdir(output, { recursive: true });
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL(`dataset-conflict-${width}.png`, output), Buffer.from((await command<{data:string}>('Page.captureScreenshot', {format:'png'}, sessionId)).data, 'base64'));
  await moreClick('[data-dataset-reload]'); await waitFor("document.querySelector('[data-dataset-confirm]').open");
  await click('[data-dataset-confirm] [data-confirm-ok]'); await idle();
  assert.equal(await evaluate("document.querySelector('[data-dataset-title]').value"), '另一客户端修改');
  // Interrupted Artifact association is visible and can be resumed after fresh reading.
  const db = openHomeSqliteDatabase(homeDirectory, 'dataset');
  try {
    db.exec("CREATE TRIGGER fail_dataset_ui_publication BEFORE UPDATE OF artifact_version ON datasets WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
    await click('[data-dataset-artifact-bar]'); await idle(); assert.equal(read()[0]!.publication_pending!.version, 1);
    assert.equal(await evaluate("document.querySelector('[data-dataset-artifact-bar]').textContent"), '恢复发布');
    db.exec('DROP TRIGGER fail_dataset_ui_publication');
  } finally { db.close(); }
  await moreClick('[data-dataset-reload]'); await idle();
  assert.equal(await evaluate("document.querySelector('[data-dataset-artifact-bar]').textContent"), '恢复发布');
  await input('[data-dataset-description]', '发布中继续编辑'); await saved();
  await evaluate("document.querySelector('[data-dataset-publication-note]').scrollIntoView({block:'nearest'})");
  assert.equal(await evaluate("document.querySelector('[data-dataset-title]').value"), '另一客户端修改');
  assert.equal(await evaluate("document.querySelector('[data-dataset-description]').value"), '发布中继续编辑');
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL(`dataset-recovery-${width}.png`, output), Buffer.from((await command<{data:string}>('Page.captureScreenshot', {format:'png'}, sessionId)).data, 'base64'));
  await click('[data-dataset-artifact-bar]'); await idle();
  assert.equal(read()[0]!.publication_pending, undefined); assert.equal(read()[0]!.artifact_version, 1);
  assert.equal(read()[0]!.description, '发布中继续编辑');
  assert.equal(await evaluate("document.querySelector('[data-dataset-stage-workspace]').scrollLeft"), 0, 'toolbar scrolling must not shift the editor');
  // Scope spoofing is rejected by the real HTTP adapter, before any business mutation.
  const denied = await evaluate<{status:number}>(`fetch('/api/plugins/dataset?project_id=${projectId}', {method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify({project_id:'other-project', title:'must not exist'})}).then(r=>({status:r.status}))`);
  assert.equal(denied.status, 403); assert.equal(read().length, 1);
  await reloadPage(); await open(); await waitFor("document.querySelector('[data-dataset-id]')");
  await click('[data-dataset-id]'); await idle(); assert.equal(read()[0]!.artifact_version, 1);
  assert.equal(await evaluate("document.querySelectorAll('[data-dataset-row]').length"), 2);
  assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
  assert.ok(await evaluate("document.querySelector('.dataset-table-wrap').getBoundingClientRect().height > 100"), 'table rows must not collapse in the flex workspace');
  assert.ok(await evaluate("document.querySelector('[data-column-name]').getBoundingClientRect().width >= 100"), 'column names remain readable on narrow screens');
  await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await writeFile(new URL(`dataset-editor-${width}.png`, output), Buffer.from((await command<{data:string}>('Page.captureScreenshot', {format:'png'}, sessionId)).data, 'base64'));
});

test('Dataset without a model disables AI while local creation and column edits still work', {timeout:45_000}, async t => {
  const browser = await openGoalBrowser(t, true, undefined, null); if (!browser) return;
  const {command, sessionId, navigate, waitFor, evaluate, click, origin, projectId} = browser;
  await command('Emulation.setDeviceMetricsOverride', {width:1440, height:950, deviceScaleFactor:1, mobile:false}, sessionId);
  await navigate(() => command('Page.navigate', {url:`${origin}/projects/${projectId}/?openPlugin=dataset`}, sessionId));
  await waitFor("document.querySelector('[data-plugin-id=dataset]')");
  if (await evaluate('document.body.dataset.desktopSurface') !== 'dataset') await click('[data-plugin-strip] [data-plugin-id=dataset]');
  await click('[data-dataset-new]'); await waitFor("document.querySelector('[data-dataset=workbench]').getAttribute('aria-busy') === 'false'");
  await click('.dataset-assist > summary');
  assert.equal(await evaluate("document.querySelector('[data-dataset-generate-ai]').disabled"), true);
  assert.match(await evaluate<string>("document.querySelector('[data-dataset-ai-reason]').textContent"), /模型/);
  await evaluate("document.querySelector('[data-dataset-ai-prompt]').value='手工列'"); await click('[data-dataset-generate]');
  await waitFor("document.querySelector('[data-column-name]')?.value === '手工列'");
});
