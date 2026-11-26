import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addProjectInputFolder, setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { CODING_OPEN, codingAdd } from "./fixtures/coding-composer.js";
import { gitEditor, chooseConflict, edit, decide } from "./fixtures/git-edit-drafts.js";
import test from "node:test";

for (const surface of ["git", "coding"] as const) test(`QEA-34 QEA-77: ${surface} failed conflict draft read retries that file, and changed disk content requires explicit review`, { timeout: 120_000 }, async t => {
  const ctx = await gitEditor(t, surface, true); if (!ctx) return;
  const { browser, frame, root, show } = ctx;
  const open = async () => { await chooseConflict(frame, 1); await frame.waitFor("!document.querySelector('[data-git-conflict-text]').disabled"); };
  await open(); await edit(ctx, "conflict-text", "My resolution stays intact\n");
  const original = await readFile(join(root, "one.txt"), "utf8");
  await browser.reloadPage(); await show();
  await browser.evaluate(`{
    const match = Cache.prototype.match;
    Cache.prototype.match = function(key, options) {
      if (String(typeof key === 'string' ? key : key.url).includes('git.conflict.v1')) return Promise.reject(Error('controlled conflict cache read failure'));
      return match.call(this, key, options);
    };
    window.restoreDraftReads = () => { Cache.prototype.match = match; };
  }`);
  await chooseConflict(frame, 1);
  await frame.waitFor("document.querySelector('[data-git-draft-status]').dataset.state === 'failed'");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-text]').disabled"), true);
  await browser.evaluate("restoreDraftReads()"); await frame.click("[data-git-draft-retry]");
  await frame.waitFor("!document.querySelector('[data-git-conflict-text]').disabled && document.querySelector('[data-git-conflict-text]').value === 'My resolution stays intact\\n'");
  const changed = original.replace("current one.txt", "edited outside this page");
  await writeFile(join(root, "one.txt"), changed);
  await browser.reloadPage(); await show(); await open();
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-text]').value"), "My resolution stays intact\n");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-resolve]').disabled"), true);
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-changed]').hidden"), false);
  await frame.click("[data-git-conflict-current] summary");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-disk]').value"), changed);
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-disk]').readOnly"), true);
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-text]').value"), "My resolution stays intact\n", "reading current disk does not replace the manual edit");
  const screenshots = join(process.cwd(), ".impeccable/qa/review/quality-audit-git"); await mkdir(screenshots, { recursive: true });
  for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
    await browser.evaluate(`localStorage.setItem('molis-work:theme',${JSON.stringify(theme)}); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:${JSON.stringify(theme)}}))`);
    await frame.waitFor(`document.documentElement.dataset.resolvedTheme === ${JSON.stringify(theme)}`);
    await browser.command("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: false }, browser.sessionId);
    await frame.evaluate("document.querySelector('[data-git-conflict-current]').scrollIntoView({ block: 'center' })");
    const bounds = await frame.evaluate<{ width: number; right: number; left: number }>("(() => {const box=document.querySelector('[data-git-conflict-disk]').getBoundingClientRect();return {width:innerWidth,right:box.right,left:box.left};})()");
    assert.ok(bounds.left >= 0 && bounds.right <= bounds.width, JSON.stringify(bounds));
    const shot = await browser.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, browser.sessionId);
    await writeFile(join(screenshots, `current-conflict-${surface}-${theme}-${width}.png`), Buffer.from(shot.data, "base64"));
  }
  await frame.click("[data-git-conflict-keep-edit]");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-resolve]').disabled"), false);
  assert.equal(await readFile(join(root, "one.txt"), "utf8"), changed, "acknowledging the new base still does not write the repository");
});

test("QEA-34: a conflict read survives same-directory refresh but cannot return after switching files or resolving the merge", { timeout: 120_000 }, async t => {
  const ctx = await gitEditor(t, "git", true); if (!ctx) return;
  const { frame, git } = ctx;
  await ctx.browser.setViewport(1440, 1000);
  // Hold the actual owner response at the page's request boundary; the Host has read the real file.
  await frame.evaluate(`{
    const request = molisWorkRequest;
    window.holdNextConflict = false;
    window.molisWorkRequest = async (url, options) => {
      const value = await request(url, options);
      if (window.holdNextConflict && String(url).includes('/conflict?')) {
        window.holdNextConflict = false; window.conflictReadHeld = true;
        await new Promise(resolve => { window.releaseConflictRead = resolve; });
      }
      return value;
    };
  }`);
  const holdFirst = async () => {
    await frame.evaluate("holdNextConflict = true; conflictReadHeld = false");
    await chooseConflict(frame, 1);
    await frame.waitFor("window.conflictReadHeld === true");
  };
  const release = () => frame.evaluate("releaseConflictRead(); new Promise(resolve => requestAnimationFrame(() => resolve(true)))");
  await holdFirst(); await frame.click("[data-git-refresh]");
  await frame.waitFor("!document.querySelector('[data-git-refresh]').disabled"); await release();
  await frame.waitFor("!document.querySelector('[data-git-conflict-text]').disabled");
  assert.match(await frame.evaluate<string>("document.querySelector('[data-git-conflict-text]').value"), /current one.txt/u);
  await holdFirst(); await chooseConflict(frame, 2);
  await frame.waitFor("document.querySelector('[data-git-conflict-text]').value.includes('current two.txt')"); await release();
  assert.match(await frame.evaluate<string>("document.querySelector('[data-git-conflict-text]').value"), /current two.txt/u);
  await holdFirst(); git("merge", "--abort"); await frame.click("[data-git-refresh]");
  await frame.waitFor("!document.querySelector('[data-git-refresh]').disabled && document.querySelector('[data-git-conflicts]').hidden"); await release();
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-editor]').hidden && document.querySelector('[data-git-conflict-text]').disabled"), true);
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-text]').value"), "", "the old file response cannot repopulate a closed editor");
});

test("QEA-34: making a read-only conflict directory writable reopens current disk instead of resubmitting an old resolution", { timeout: 150_000 }, async t => {
  const ctx = await gitEditor(t, "coding", true); if (!ctx) return;
  const { browser, frame, root, workspace } = ctx;
  await addProjectInputFolder(browser.web, browser.projectId!, root);
  const other = join(browser.homeDirectory, "other-output"); await mkdir(other);
  execFileSync("git", ["init", "-q", "-b", "other-output", other]);
  await setProjectOutputFolder(browser.web, browser.projectId!, other);
  await browser.reloadPage(); await ctx.show();
  await ctx.startCodingSession();
  // QEA-192: the bar can belong to Coding before its first draft is ready for input.
  await browser.waitFor(CODING_OPEN);
  if (await frame.evaluate("document.querySelector('.coding-context').hidden")) await browser.evaluate(codingAdd("context"));
  await frame.click("[data-coding-workspace-open]");
  await frame.evaluate(`document.querySelector('[data-coding-workspace-choice]').value = ${JSON.stringify(workspace.workspace_id)}`);
  await frame.click("[data-coding-workspace-form] [type=submit]");
  await frame.waitFor("!document.querySelector('[data-coding-workspace-dialog]').open"); await ctx.show();
  await chooseConflict(frame, 1);
  await frame.waitFor("!document.querySelector('[data-git-conflict-text]').disabled");
  await edit(ctx, "conflict-text", "Resolution against the old file\n");
  const original = await readFile(join(root, "one.txt"), "utf8");
  await frame.click("[data-git-conflict-resolve]");
  await frame.waitFor("document.querySelector('[data-git-conflict-state] .git-set-output')?.checkVisibility()");
  assert.equal(await readFile(join(root, "one.txt"), "utf8"), original, "input-only rejection writes no file");
  const associations = await browser.evaluate<number[]>(`(async () => {
    const counts = [], key = new URL('/.molis-draft/' + encodeURIComponent(${JSON.stringify(`git.edit.v1:${workspace.workspace_id}`)}), location.origin).href;
    for (const name of await caches.keys()) {
      const response = await (await caches.open(name)).match(key);
      if (response) counts.push((await response.json()).prepared.length);
    }
    return counts;
  })()`);
  assert.deepEqual(associations, [0], "a definitive pre-review refusal leaves no operation association to wait for forever");
  const changed = original.replace("current one.txt", "edited while changing directory permissions");
  await writeFile(join(root, "one.txt"), changed);
  await frame.click("[data-git-conflict-state] .git-set-output");
  await browser.waitFor("document.querySelector('[data-page-dialog=confirm]')?.checkVisibility()");
  await browser.click("[data-page-dialog=confirm] [type=submit]");
  await frame.waitFor("!document.querySelector('[data-git-conflict-changed]').hidden").catch(async error => {
    throw new Error(JSON.stringify(await frame.evaluate(`({
      editorHidden: document.querySelector('[data-git-conflict-editor]').hidden,
      text: document.querySelector('[data-git-conflict-text]').value,
      disabled: document.querySelector('[data-git-conflict-text]').disabled,
      state: document.querySelector('[data-git-conflict-state]').textContent,
      status: document.querySelector('[data-git-sc-status]').textContent,
      draft: document.querySelector('[data-git-draft-status]').textContent,
      refresh: document.querySelector('[data-git-refresh]').disabled
    })`)), { cause: error });
  });
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-text]').value"), "Resolution against the old file\n");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-resolve]').disabled"), true);
  const reviews = await browser.web.get<{ reviews: Array<{ request: { operation?: { kind: string } } }> }>(`/projects/${browser.projectId}/api/agent/reviews?status=pending`);
  assert.equal(reviews.reviews.filter(row => row.request.operation?.kind === "git-operation").length, 0, "changing output never prepares a new review using the old body and a new revision");
  assert.equal(await readFile(join(root, "one.txt"), "utf8"), changed);
  await frame.click("[data-git-conflict-keep-edit]"); await frame.click("[data-git-conflict-resolve]");
  await decide(ctx, "approve");
  await frame.waitFor("document.querySelector('[data-git-operations] [data-outcome=succeeded]') && !document.querySelector('[data-git-refresh]').disabled");
  assert.equal(await readFile(join(root, "one.txt"), "utf8"), "Resolution against the old file\n", "only the person's later review commits the retained edit");
});

test("QEA-34: an edit during a blocked save survives the older resolution; successful cleanup closes its editor before deleting", { timeout: 150_000 }, async t => {
  const ctx = await gitEditor(t, "git", true); if (!ctx) return;
  const { browser, frame, root, show, git } = ctx;
  const open = async () => { await chooseConflict(frame, 1); await frame.waitFor("!document.querySelector('[data-git-conflict-text]').disabled"); };
  await open();
  await browser.evaluate(`{
    const put = Cache.prototype.put;
    Cache.prototype.put = function(key, response) {
      if (String(typeof key === 'string' ? key : key.url).includes('git.conflict.v1')) {
        Cache.prototype.put = put; window.conflictSaveHeld = true;
        return new Promise(resolve => { window.releaseConflictSave = resolve; }).then(() => put.call(this, key, response));
      }
      return put.call(this, key, response);
    };
  }`);
  await edit(ctx, "conflict-text", "Submitted resolution\n", false);
  await browser.waitFor("window.conflictSaveHeld === true");
  await frame.click("[data-git-conflict-resolve]");
  await edit(ctx, "conflict-text", "Newer resolution typed while saving\n", false);
  await browser.evaluate("releaseConflictSave()");
  await decide(ctx, "approve");
  await frame.waitFor("document.querySelector('[data-git-operations] [data-outcome=succeeded]') && !document.querySelector('[data-git-refresh]').disabled");
  assert.equal(await readFile(join(root, "one.txt"), "utf8"), "Submitted resolution\n", "the reviewed body is the click-time snapshot");
  git("merge", "--abort"); assert.throws(() => git("merge", "incoming"));
  await browser.reloadPage(); await show(); await open();
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-text]').value"), "Newer resolution typed while saving\n", "success must preserve the edit made after submission");
  await frame.click("[data-git-conflict-resolve]");
  await browser.waitFor("document.querySelector('[data-host-review-slot] [data-agent-review-approve]')?.checkVisibility()");
  await browser.evaluate(`{
    const remove = Cache.prototype.delete;
    Cache.prototype.delete = function(key, options) {
      if (String(typeof key === 'string' ? key : key.url).includes('git.conflict.v1')) {
        Cache.prototype.delete = remove; window.conflictDeleteHeld = true;
        return new Promise(resolve => { window.releaseConflictDelete = resolve; }).then(() => remove.call(this, key, options));
      }
      return remove.call(this, key, options);
    };
  }`);
  await decide(ctx, "approve"); await browser.waitFor("window.conflictDeleteHeld === true");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-editor]').hidden && document.querySelector('[data-git-conflict-text]').disabled"), true,
    "there is no editable but unsaved window while deletion waits");
  await browser.evaluate("releaseConflictDelete()");
  await frame.waitFor("document.querySelector('[data-git-draft-status]').dataset.state === 'ready' && !document.querySelector('[data-git-refresh]').disabled");
  assert.equal(await readFile(join(root, "one.txt"), "utf8"), "Newer resolution typed while saving\n");
  git("merge", "--abort"); assert.throws(() => git("merge", "incoming"));
  await browser.reloadPage(); await show(); await open();
  assert.match(await frame.evaluate<string>("document.querySelector('[data-git-conflict-text]').value"), /<<<<<<< HEAD/u, "a successfully submitted snapshot does not return as a draft");
});

test("F-plugins-rest-w2-12: conflict parser preserves 8+ equals lines inside ours and recognizes tab-delimited conflict markers", { timeout: 120_000 }, async t => {
  const ctx = await gitEditor(t, "git", true); if (!ctx) return;
  const { frame } = ctx;
  await chooseConflict(frame, 1);
  await frame.waitFor("!document.querySelector('[data-git-conflict-text]').disabled");
  const conflictWithRule = [
    "<<<<<<< HEAD",
    "Heading",
    "==========",
    "ours body",
    "=======",
    "theirs body",
    ">>>>>>> incoming",
    "",
  ].join("\n");
  await edit(ctx, "conflict-text", conflictWithRule);
  assert.equal(await frame.evaluate("document.querySelectorAll('[data-git-conflict-picks] .git-sc-pick').length"), 1);
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-resolve]').disabled"), true);
  await frame.click("[data-git-conflict-picks] .git-sc-pick button:first-of-type");
  assert.equal(
    await frame.evaluate<string>("document.querySelector('[data-git-conflict-text]').value"),
    "Heading\n==========\nours body\n",
    "picking ours must keep the 10-equals line and body intact without leaving real markers",
  );
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-resolve]').disabled"), false, "10-equals line is not a conflict marker");
  await edit(ctx, "conflict-text", "=======\t\n");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-resolve]').disabled"), true, "tab after 7 equals is still recognized as a conflict marker");
});
