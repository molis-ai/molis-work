import assert from "node:assert/strict";
import test from "node:test";
import { openWorkflowsBrowser } from "./fixtures/workflows-browser.js";

type Browser = Awaited<ReturnType<typeof openWorkflowsBrowser>>;

async function searchWorkflow(browser: Browser, workflow: Browser["a"]) {
  await browser.click("[data-global-search-open]");
  await browser.waitFor("document.querySelector('[data-global-search-dialog]').open");
  await browser.evaluate(`(() => {
    const input = document.querySelector('[data-global-search]');
    input.value = ${JSON.stringify(workflow.title)}; input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  const hit = `[data-global-search-kind=workflow][data-global-search-id="${workflow.workflow_id}"]`;
  await browser.waitFor(`document.querySelector(${JSON.stringify(hit)})`, 12_000);
  await browser.click(hit);
  await browser.waitFor("!document.querySelector('[data-global-search-dialog]').open");
}

async function assertOpen(browser: Browser, workflow: Browser["a"]) {
  await browser.waitFor(`document.querySelector('.wf-editor')?.dataset.id === '${workflow.workflow_id}'`);
  const visible = await browser.evaluate<{ title: string; stations: string[]; context: { object: { id: string; title: string; version: string } } }>(`(() => ({
    title: document.querySelector('[data-wf-title]').value,
    stations: [...document.querySelectorAll('[data-wf-chain] [data-station-id]')].map(station => station.dataset.stationId),
    context: JSON.parse(document.querySelector('[data-workflows=workbench]').dataset.assistantContext),
  }))()`);
  assert.equal(visible.title, workflow.title);
  assert.deepEqual(visible.stations, workflow.stations.map(station => station.station_id));
  assert.deepEqual(visible.context.object, { kind: "workflow", id: workflow.workflow_id, title: workflow.title, version: String(workflow.revision) });
}

test("W2-18-WF-OPEN-01: real search replaces B with A, object tabs reopen A, and the no-ID request returns to the directory", { timeout: 90_000 }, async t => {
  const browser = await openWorkflowsBrowser(t);
  await browser.click(`[data-wf-open="${browser.b.workflow_id}"]`);
  await assertOpen(browser, browser.b);
  await searchWorkflow(browser, browser.a);
  await assertOpen(browser, browser.a);
  const tab = `.tab-item[data-plugin=workflows][data-item-id="${browser.a.workflow_id}"] .tab-item-trigger`;
  await browser.waitFor(`document.querySelector(${JSON.stringify(tab)})`);
  await searchWorkflow(browser, browser.b);
  await assertOpen(browser, browser.b);
  await browser.click(tab);
  await assertOpen(browser, browser.a);
  await browser.click("[data-plugin-strip] [data-plugin-id=workflows]");
  await browser.waitFor("document.querySelector('[data-workflows=workbench]').dataset.wfMode === 'list'");
  assert.equal(await browser.evaluate("JSON.parse(document.querySelector('[data-workflows=workbench]').dataset.assistantContext).object"), undefined);
  await browser.click(tab);
  await assertOpen(browser, browser.a);
  // The restored Workbench object tab must beat older plugin-local navigation memory.
  await browser.evaluate(`sessionStorage.setItem('molis-workflows:/projects/${browser.projectId}/', JSON.stringify({ workflow: '${browser.b.workflow_id}', instance: null, step: 0 }))`);
  await browser.reloadPage();
  await assertOpen(browser, browser.a);
  assert.deepEqual(browser.saved(browser.a.workflow_id), browser.a);
  assert.deepEqual(browser.saved(browser.b.workflow_id), browser.b);
});

test("W2-18-WF-OPEN-01: the first search selection waits for the real lazy client/list and overrides remembered B", { timeout: 90_000 }, async t => {
  const browser = await openWorkflowsBrowser(t, { open: false });
  assert.equal(await browser.evaluate("document.querySelector('[data-work-surface=workflows]').hasAttribute('data-deferred-surface')"), true);
  await browser.evaluate(`(() => {
    sessionStorage.setItem('molis-workflows:/projects/${browser.projectId}/', JSON.stringify({ workflow: '${browser.b.workflow_id}', instance: null, step: 0 }));
    const original = window.fetch.bind(window); let first = true;
    window.__wfListHeld = false; window.__wfOpened = [];
    window.fetch = async (input, init) => {
      const url = new URL(String(input), location.origin);
      const response = await original(input, init);
      if (first && url.pathname === '/projects/${browser.projectId}/api/workflows' && init?.method === 'GET') {
        first = false; await response.clone().text(); window.__wfListHeld = true;
        await new Promise(resolve => { window.__wfReleaseList = resolve; });
      } else if (url.pathname.includes('/api/workflows/') && init?.method === 'GET') window.__wfOpened.push(url.pathname.split('/').at(-1));
      return response;
    };
  })()`);
  await searchWorkflow(browser, browser.a);
  await browser.waitFor("window.__wfListHeld === true && document.querySelector('[data-work-surface=workflows]').dataset.uiClientState === 'ready'");
  assert.equal(await browser.evaluate("document.querySelector('.wf-editor')"), null, "object loading waits for the initial directory metadata");
  await browser.evaluate("window.__wfReleaseList()");
  await assertOpen(browser, browser.a);
  assert.deepEqual(await browser.evaluate("window.__wfOpened"), [browser.a.workflow_id], "the older B memory never gets opened");
  assert.equal(await browser.evaluate("document.querySelectorAll('[data-wf-action=append][data-wf-plugin]').length > 0"), true, "the first object has the loaded station palette");
  assert.deepEqual(browser.saved(browser.a.workflow_id), browser.a);
  assert.deepEqual(browser.saved(browser.b.workflow_id), browser.b);
});
