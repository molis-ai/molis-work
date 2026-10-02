import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// Files open inside the workbench (specs/artifact-positioning S5): a Shelf file in the side panel's file tab, a project
// reference in the workbench's overlay. Neither opens a new browser page.
test("a Shelf file and a project reference open inside the workbench, not in a new tab", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await evaluate("window.__opened = []; window.open = (...args) => { window.__opened.push(String(args[0])); return null; }");

  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=shelf]')");
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("[...document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]')].some(row => row.dataset.shelfName === '试用示例.pdf')", 10_000);
  const address = await evaluate<string>("location.href");
  // A double click on the row (the first click opens the row's preview and moves the layout, so dispatch it on the row).
  await evaluate(`document.querySelector('[data-shelf-list=materials] [data-shelf-item][data-shelf-name="试用示例.pdf"] .shelf-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 }))`);
  await waitFor("document.body.dataset.sideOpen === 'true' && document.querySelector('[data-side-tab=files]')?.getAttribute('aria-selected') === 'true'", 10_000);
  await waitFor("(document.querySelector('[data-side-files-title]')?.textContent ?? '').includes('试用示例.pdf')", 10_000);

  // A verified-evidence link as Goal history and 成果 render it; the made-up evidence is refused, and the overlay says so.
  await evaluate(`(() => { const link = document.createElement('a'); link.className = 'inline-ref'; link.dataset.projectReference = '';
    link.href = '/api/project-references/README.md?evidence_id=not-a-real-evidence'; link.textContent = 'README.md'; link.id = 'probe-reference';
    document.querySelector('[data-workspace]').append(link); })()`);
  await click("#probe-reference");
  await waitFor("document.querySelector('[data-project-reference-dialog]')?.open === true", 10_000);
  assert.equal(await evaluate("document.querySelector('#project-reference-title').textContent"), "README.md");
  await waitFor("(document.querySelector('[data-project-reference-body]')?.textContent ?? '') !== '正在读取…'", 10_000);
  assert.ok((await evaluate<string>("document.querySelector('[data-project-reference-body]').textContent")).length > 0, "the overlay shows the file or why it cannot be read");

  assert.equal(await evaluate("location.href"), address, "still the same workbench page");
  assert.deepEqual(await evaluate("window.__opened"), [], "no new browser page was opened");
});
