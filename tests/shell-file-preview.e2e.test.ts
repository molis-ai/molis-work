import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { readProjectDirectories, setProjectOutputFolder } from "./fixtures/project-directories-http.js";

// Files open inside the workbench (specs/artifact-positioning S5): a Shelf file in the side panel's file tab, a project
// reference in the workbench's overlay. Neither opens a new browser page.
test("a Shelf file and a project reference open inside the workbench, not in a new tab", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t,browser,"shelf",'[data-side-body="plugin:shelf/side"] iframe');
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await evaluate("window.__opened = []; window.open = (...args) => { window.__opened.push(String(args[0])); return null; }");

  // Shelf is the side panel's first tab; its rows live in the tab's frame.
  const shelf = "document";
  // 07-1 S4b: the bar's side button is gone; the side opens from its current glyph in the titlebar.
  await click("[data-side-tabs] [data-side-tab][aria-selected=true]");
  await child.waitFor(`[...(${shelf}?.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]') ?? [])].some(row => row.dataset.shelfName === '试用示例.pdf')`, 10_000);
  const address = await evaluate<string>("location.href");
  // A double click on the row (the first click opens the row's preview and moves the layout, so dispatch it on the row).
  await child.evaluate(`(() => { const doc = ${shelf}; doc.querySelector('[data-shelf-list=materials] [data-shelf-item][data-shelf-name="试用示例.pdf"] .shelf-name').dispatchEvent(new doc.defaultView.MouseEvent('dblclick', { bubbles: true, cancelable: true, detail: 2 })); })()`);
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

// Files retirement S4: a project-folder file the side panel lists opens in the main area's reader (design A「展开到主区」), not in
// the Files plugin's page; the person's open still keeps where they were reading.
test("RAC-84 PG-060 side-panel open selects the exact project-folder file on cold and already open readers", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) {
    t.skip("RAC-84 not verified: test Chrome is unavailable; the project-folder selection journey did not run.");
    return;
  }
  const { web, origin, projectId, homeDirectory, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  const prefix = `/projects/${projectId}`;
  const directory = join(homeDirectory, "object-open");
  const targets = [
    { path: ["first", "note.txt"], text: "Cold target: the first folder.\n" },
    { path: ["second", "note.txt"], text: "Already open target: the second folder.\n" },
  ];
  for (const target of targets) {
    await mkdir(join(directory, target.path[0]), { recursive: true });
    await writeFile(join(directory, ...target.path), target.text);
  }
  // The folder is the project's output, set in its settings as the person does: the side panel lists the output's files (SSC-17).
  const workspaceId = (await setProjectOutputFolder(web, projectId, directory)).workspace_id;
  assert.equal((await readProjectDirectories(web, projectId)).directories.length, 1, "the output is the project's one folder");
  const position = () => web.get<{ position: { workspace_id: string; path: string[] } | null }>(`${prefix}/api/materials/position`);
  assert.equal((await position()).position, null);

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/" }, sessionId));
  await click("[data-side-tabs] [data-side-tab][aria-selected=true]");
  await click("[data-side-tab=files]");
  // Only the output is listed. Equal basenames at distinct paths must retain their full IDs.
  // The reader has never been opened in this page; the second iteration uses the reader the first one opened.
  for (const [index, target] of targets.entries()) {
    t.diagnostic(index === 0 ? "cold reader open" : "already open reader changes to another same-name file");
    const objectId = `${workspaceId}:${target.path.join("/")}`;
    const row = `[data-side-file][data-kind="workspace_file"][data-id=${JSON.stringify(objectId)}]`;
    await waitFor(`Boolean(document.querySelector(${JSON.stringify(row)}))`);
    await click(row);
    await waitFor(`document.querySelector('[data-side-files-body]')?.textContent === ${JSON.stringify(target.text)}`);
    assert.equal(await evaluate("document.querySelector('[data-side-files-action=open]').dataset.id"), objectId);
    await click('[data-side-files-action="open"]');

    await waitFor(`document.querySelector('[data-tab-kind=item][data-plugin=materials][aria-current=page]')?.dataset.itemId === ${JSON.stringify(objectId)}`);
    await waitFor(`document.querySelector('[data-stage-materials-window]')?.textContent === ${JSON.stringify(target.text)} && !document.querySelector('[data-work-surface=materials]').closest('[hidden]')`);
    assert.deepEqual(await evaluate("[document.querySelector('[data-materials-stage-title]').textContent, document.querySelector('[data-materials-stage-meta]').textContent]"),
      [target.path.at(-1), target.path.slice(0, -1).join(" / ")]);
    assert.deepEqual((await position()).position, { workspace_id: workspaceId, path: target.path });
    if (index === 0) await click('[data-side-files-action="back"]');
  }
  assert.deepEqual(await evaluate("[...document.querySelectorAll('[data-tab-kind=item][data-plugin=materials]')].map(tab => tab.dataset.itemId)"),
    targets.map(target => `${workspaceId}:${target.path.join("/")}`));
});
