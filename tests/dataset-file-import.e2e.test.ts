import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openDatasetStore } from "@molis-ai/molis-work-plugin-dataset";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

const csv = '名称,说明\n导入行,来自真实文件';
async function openImport(t: TestContext) {
  const browser = await openGoalBrowser(t, true, undefined, null);
  if (!browser) return null;
  const { homeDirectory, projectId, command, sessionId, navigate, origin } = browser;
  const child = await pluginFrameBrowser(t, browser, "dataset");
  const { evaluate, waitFor, click } = child;
  const store = openDatasetStore(homeDirectory);
  const a = store.importCsv(store.create({ project_id: projectId!, title: '表 A' }).id, '名称\nA 原内容', projectId!);
  const b = store.importCsv(store.create({ project_id: projectId!, title: '表 B' }).id, '名称\nB 原内容', projectId!);
  store.close();
  const read = (id: string) => {
    const db = openDatasetStore(homeDirectory);
    try { return db.get(id, projectId!)!; } finally { db.close(); }
  };
  const path = join(homeDirectory, 'import.csv');
  await writeFile(path, csv);
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command('Page.navigate', { url: `${origin}/projects/${projectId}/?openPlugin=dataset` }, sessionId));
  await browser.waitFor("document.querySelector('[data-plugin-id=dataset]')");
  if (await browser.evaluate('document.body.dataset.desktopSurface') !== 'dataset') await browser.click('[data-plugin-strip] [data-plugin-id=dataset]');
  await click(`[data-dataset-id="${a.id}"]`);
  const idle = () => waitFor("document.querySelector('[data-dataset=workbench]').getAttribute('aria-busy') === 'false'");
  await idle();
  await child.frameCommand('Page.setInterceptFileChooserDialog', { enabled: true });
  await evaluate(`(() => {
    const text = File.prototype.text, original = window.molisWorkRequest;
    window.importRequests = []; window.readCount = 0;
    File.prototype.text = async function() {
      window.readCount++;
      if (window.pauseRead) await new Promise((resolve, reject) => { window.releaseRead = resolve; window.failRead = reject; });
      return text.call(this);
    };
    // The page asks through molisWorkRequest: the body is the object it sends, a refusal is a thrown failure carrying the status.
    window.molisWorkRequest = Object.assign(async (url, init) => {
      const path = new URL(url, ${JSON.stringify(origin)}).pathname;
      const importing = init?.method === 'POST' && path.endsWith('/import-csv');
      const entry = importing ? { path, body: init.body } : null;
      if (entry) window.importRequests.push(entry);
      let result, failure = null;
      try { result = await original(url, init); } catch (error) { failure = error; }
      if (entry) {
        entry.status = failure ? failure.status : 200;
        if (window.pauseResponse) await new Promise(resolve => { window.releaseResponse = resolve; });
      }
      if (failure) throw failure;
      return result;
    }, original);
  })()`);
  const choose = async (confirm = true) => {
    await evaluate("delete window.releaseRead; delete window.failRead; delete window.releaseResponse");
    await click('[data-dataset-stage-workspace] .dataset-panel [data-dataset-import-file]');
    await child.setFiles('[data-dataset-import-input]', [path]);
    await waitFor("document.querySelector('[data-dataset-confirm]').open");
    await click(confirm ? '[data-dataset-confirm] [data-confirm-ok]' : '[data-dataset-confirm] button[value=cancel]');
  };
  const hold = async (phase: string) => {
    await evaluate(`window.pauseRead = true; window.pauseResponse = ${phase === 'Response'}`);
    await choose(); await waitFor("typeof window.releaseRead === 'function'");
    // Native file selection dispatches input as well as change. Observe the
    // actual saved version at File.text entry, before allowing an import write.
    const confirmed = read(a.id);
    if (phase === 'Response') {
      await evaluate('window.releaseRead()');
      await waitFor("typeof window.releaseResponse === 'function'");
    }
    return confirmed;
  };
  const trySwitch = async () => {
    await click('[data-dataset-back]'); await idle();
    await click(`[data-dataset-id="${b.id}"]`);
  };
  const attemptSwitch = async () => {
    // A real pointer click still lands while the fixed editor is inert. The old
    // client accepts Back, so the directory opens and a person can select B.
    const point = await evaluate<{ x: number; y: number }>(`(() => {
      const r = document.querySelector('[data-dataset-back]').getBoundingClientRect();
      return {x:r.x+r.width/2,y:r.y+r.height/2};
    })()`);
    const offset = await browser.evaluate<{ x: number; y: number }>("(() => { const r=document.querySelector('iframe[data-plugin-frame=dataset]').getBoundingClientRect();return{x:r.x,y:r.y};})()");
    point.x += offset.x; point.y += offset.y;
    for (const type of ['mousePressed', 'mouseReleased']) await command('Input.dispatchMouseEvent', { type, ...point, button:'left', clickCount:1 }, sessionId);
    await waitFor("document.querySelector('[data-dataset-stage-workspace]').hidden || document.querySelector('[data-dataset-stage-workspace]').inert");
    if (await evaluate("document.querySelector('[data-dataset-stage-workspace]').hidden")) {
      await idle(); await click(`[data-dataset-id="${b.id}"]`); await idle();
    }
  };
  const values = (id: string) => read(id).rows.map(row => Object.values(row.cells));
  return { ...browser, evaluate, waitFor, click, a, b, read, idle, choose, hold, trySwitch, attemptSwitch, values };
}

for (const phase of ['Read', 'Response']) {
  test(`W5-01-DATASET-04 / W2-18-DATASET-01/02: file ${phase} barrier keeps confirmed A target and rejects competing B selection`, { timeout: 45_000 }, async t => {
    const f = await openImport(t); if (!f) return;
    const { evaluate, waitFor, a, b, read, idle, attemptSwitch, values } = f;
    const confirmed = await f.hold(phase);
    assert.deepEqual(confirmed.rows, a.rows);
    assert.deepEqual(confirmed.columns, a.columns);
    if (phase === 'Read') assert.deepEqual(read(a.id), confirmed);
    else assert.deepEqual(values(a.id), [['导入行', '来自真实文件']]);
    assert.deepEqual(read(b.id), b);
    await attemptSwitch();
    const titleWhilePending = await evaluate("document.querySelector('[data-dataset-title]').value");
    await evaluate(`window.release${phase}()`);
    await waitFor("document.querySelector('[data-dataset-import-input]').value === ''");
    await idle();
    const requests = await evaluate<Array<{ path: string; body: { csv: string; expected_version: number }; status: number }>>('window.importRequests');
    t.diagnostic(JSON.stringify({ phase, titleWhilePending, requests, a: values(a.id), b: values(b.id), title: await evaluate("document.querySelector('[data-dataset-title]').value") }));
    assert.deepEqual(read(b.id), b, 'B and its persisted version must remain untouched');
    assert.equal(titleWhilePending, '表 A', 'selection cannot change while the confirmed import is pending');
    assert.deepEqual(values(a.id), [['导入行', '来自真实文件']]);
    assert.equal(requests.length, 1);
    assert.ok(requests[0]!.path.endsWith(`/api/plugins/io.molis.work.dataset/datasets/${a.id}/import-csv`), requests[0]!.path);
    assert.equal(requests[0]!.body.expected_version, confirmed.version);
    assert.equal(requests[0]!.body.csv, csv);
    assert.equal(requests[0]!.status, 200);
    assert.equal(await evaluate("document.querySelector('[data-dataset-title]').value"), '表 A');
    await f.trySwitch(); await idle();
    assert.equal(await evaluate("document.querySelector('[data-dataset-title]').value"), '表 B');
    assert.equal(await evaluate("document.querySelector('[data-cell]').value"), 'B 原内容');
  });
}

for (const phase of ['Read', 'Response']) {
  test(`W5-01-DATASET-04 / W2-18-DATASET-02: editor invalidation during file ${phase} does not reopen a stale table`, { timeout: 45_000 }, async t => {
    const f = await openImport(t); if (!f) return;
    const { evaluate, waitFor, idle, a, b, read, values } = f;
    const confirmed = await f.hold(phase);
    // The production placement listener closes this editor when its object leaves the location.
    await evaluate(`window.dispatchEvent(new CustomEvent('molis:placement-changed', { detail: { mode:'move', from:{kind:'dataset',id:'${a.id}'}, to:{kind:'dataset'} } }))`);
    await waitFor("document.querySelector('[data-dataset-stage-workspace]').hidden");
    await evaluate(`window.release${phase}()`); await idle();
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    assert.equal(await evaluate("document.querySelector('[data-dataset-stage-workspace]').hidden"), true);
    assert.deepEqual(read(b.id), b);
    if (phase === 'Read') {
      assert.deepEqual(read(a.id), confirmed);
      assert.deepEqual(await evaluate('window.importRequests'), []);
    } else assert.deepEqual(values(a.id), [['导入行', '来自真实文件']]);
    await f.click(`[data-dataset-id="${b.id}"]`); await idle();
    assert.equal(await evaluate("document.querySelector('[data-dataset-title]').value"), '表 B');
  });
}

test('W2-18-DATASET-02: cancelled choice and failed file reading preserve input, editing and same-file retry', { timeout: 45_000 }, async t => {
  const f = await openImport(t); if (!f) return;
  const { evaluate, waitFor, choose, idle, a, b, read, values } = f;
  await choose(false); await idle();
  assert.equal(await evaluate('window.readCount'), 0);
  assert.deepEqual(await evaluate('window.importRequests'), []);
  await evaluate(`(() => { const el = document.querySelector('[data-dataset-description]'); el.value = '保留我的说明'; el.dispatchEvent(new Event('input',{bubbles:true})); window.pauseRead = true; })()`);
  await choose(); await waitFor("typeof window.failRead === 'function'");
  await evaluate("window.failRead(new Error('fixture file unreadable'))");
  await waitFor("document.querySelector('[data-dataset-note]').textContent.includes('fixture file unreadable')"); await idle();
  assert.deepEqual(read(a.id).rows, a.rows);
  assert.deepEqual(read(b.id), b);
  assert.equal(await evaluate("document.querySelector('[data-dataset-description]').value"), '保留我的说明');
  assert.deepEqual(await evaluate('window.importRequests'), []);
  await evaluate(`(() => { const el = document.querySelector('[data-dataset-title]'); el.value = '读取失败后继续编辑'; el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await waitFor("document.querySelector('[data-dataset-editor-status]').textContent === '已保存'");
  const beforeRetry = read(a.id);
  assert.equal(beforeRetry.title, '读取失败后继续编辑');
  assert.equal(beforeRetry.description, '保留我的说明');
  const retryTarget = await f.hold('Read');
  await evaluate('window.releaseRead()');
  await waitFor("document.querySelector('[data-dataset-import-input]').value === ''"); await idle();
  assert.deepEqual(values(a.id), [['导入行', '来自真实文件']]);
  assert.deepEqual(read(b.id), b);
  assert.equal(read(a.id).description, '保留我的说明');
  assert.equal(await evaluate('window.importRequests[0].body.expected_version'), retryTarget.version);
});

test('W2-18-DATASET-01/02: an external write during file reading conflicts against the confirmed version', { timeout: 45_000 }, async t => {
  const f = await openImport(t); if (!f) return;
  const { evaluate, waitFor, idle, a, b, read, homeDirectory, projectId } = f;
  const confirmed = await f.hold('Read');
  const other = openDatasetStore(homeDirectory);
  let updated;
  try { updated = other.importCsv(a.id, '名称\n其他客户端内容', projectId!, confirmed.version); } finally { other.close(); }
  await evaluate('window.releaseRead()');
  await waitFor("document.querySelector('[data-dataset-note]').textContent.includes('当前输入已保留')"); await idle();
  assert.deepEqual(read(a.id), updated);
  assert.deepEqual(read(b.id), b);
  assert.equal(await evaluate("document.querySelector('[data-cell]').value"), 'A 原内容');
  assert.equal(await evaluate('window.importRequests[0].status'), 409);
  assert.equal(await evaluate('window.importRequests[0].body.expected_version'), confirmed.version);
  assert.equal(await evaluate("document.querySelector('[data-dataset-import-input]').files.length"), 1);
  await evaluate(`document.querySelector('[data-dataset-id="${b.id}"]').click()`); await idle();
  assert.equal(await evaluate("document.querySelector('[data-dataset-title]').value"), '表 A');
});
