import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { addProjectInputFolder, setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { CODING_TAKEN, codingAdd } from "./fixtures/coding-composer.js";

async function gitEditor(t: TestContext, surface: "git" | "coding", conflicts = false) {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return null;
  assert.ok(browser.projectId);
  const root = join(browser.homeDirectory, "editable-repository");
  await mkdir(root);
  const options = { cwd: root, encoding: "utf8" as const,
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" } };
  const args = ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null"];
  const git = (...command: string[]) => execFileSync("git", [...args, ...command], options).trim();
  git("init", "-q", "-b", "main");
  for (const file of ["one.txt", "two.txt"]) await writeFile(join(root, file), `base ${file}\n`);
  git("add", "."); git("commit", "-qm", "Initial");
  if (conflicts) {
    git("checkout", "-qb", "incoming");
    for (const file of ["one.txt", "two.txt"]) await writeFile(join(root, file), `incoming ${file}\n`);
    git("commit", "-qam", "Incoming changes");
    git("checkout", "-q", "main");
    for (const file of ["one.txt", "two.txt"]) await writeFile(join(root, file), `current ${file}\n`);
    git("commit", "-qam", "Current changes");
    const merge = spawnSync("git", [...args, "merge", "incoming"], options);
    assert.equal(merge.status, 1, merge.stderr);
    assert.equal(git("diff", "--name-only", "--diff-filter=U").split("\n").length, 2);
  }
  const workspace = await setProjectOutputFolder(browser.web, browser.projectId, root);
  const frame = await pluginFrameBrowser(t, browser, surface);
  const show = async () => {
    if (surface === "coding") {
      await frame.waitFor("Boolean(document.querySelector('[data-coding-face=files]'))");
      await frame.click("[data-coding-face=files]");
    }
    await frame.waitFor("document.querySelector('[data-git-sc]')?.checkVisibility() && !document.querySelector('[data-git-refresh]').disabled");
  };
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=${surface}` }, browser.sessionId));
  await show();
  return { browser, frame, root, show, git, workspace };
}

/** Use the visible Back control when the compact result covers the directory. */
async function chooseConflict(frame: NonNullable<Awaited<ReturnType<typeof gitEditor>>>["frame"], position: number) {
  const selector = `[data-git-conflict-list] li:nth-child(${position}) button`;
  if (!await frame.evaluate(`document.querySelector(${JSON.stringify(selector)}).checkVisibility()`)) await frame.click("[data-git-close]");
  await frame.click(selector);
}

for (const surface of ["git", "coding"] as const) {
  test(`QEA-33: ${surface} preserves a manually typed commit message after the real page reloads`, { timeout: 120_000 }, async t => {
    const ctx = await gitEditor(t, surface);
    if (!ctx) return;
    const message = "Keep the person's edited commit description\n\nThis is not a generated Coding handoff.";
    await ctx.frame.evaluate(`(() => { const editor = document.querySelector('[data-git-commit-message]'); editor.value = ${JSON.stringify(message)}; editor.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await ctx.frame.waitFor("document.querySelector('[data-git-draft-status]')?.dataset.state === 'ready'");
    await ctx.browser.reloadPage();
    await ctx.show();
    assert.equal(await ctx.frame.evaluate("document.querySelector('[data-git-commit-message]').value"), message);
    assert.equal(ctx.git("log", "-1", "--format=%s"), "Initial", "saving a draft never creates a commit");
  });

  test(`QEA-34: ${surface} keeps a long manual conflict edit across files and reload without touching Git`, { timeout: 120_000 }, async t => {
    const ctx = await gitEditor(t, surface, true);
    if (!ctx) return;
    const { frame, browser, root, show, git } = ctx;
    const before = await readFile(join(root, "one.txt"), "utf8"), head = git("rev-parse", "HEAD");
    const manual = "Manually resolved line\n".repeat(300) + "The full final line must survive.\n";
    assert.ok(manual.length > 4096);
    await chooseConflict(frame, 1);
    await frame.waitFor("document.querySelector('[data-git-conflict-text]').value.includes('current one.txt')");
    await frame.evaluate(`(() => { const editor = document.querySelector('[data-git-conflict-text]'); editor.value = ${JSON.stringify(manual)}; editor.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await chooseConflict(frame, 2);
    await frame.waitFor("document.querySelector('[data-git-conflict-text]').value.includes('current two.txt')");
    await chooseConflict(frame, 1);
    await frame.waitFor("document.querySelector('[data-git-conflict-file]').textContent.includes('one.txt')");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-text]').value"), manual);
    await frame.waitFor("document.querySelector('[data-git-draft-status]')?.dataset.state === 'ready'");
    await browser.reloadPage(); await show();
    await chooseConflict(frame, 1);
    await frame.waitFor("document.querySelector('[data-git-conflict-file]').textContent.includes('one.txt')");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-text]').value"), manual);
    assert.equal(await readFile(join(root, "one.txt"), "utf8"), before, "editing and restoring a draft does not resolve the file on disk");
    assert.equal(git("rev-parse", "HEAD"), head);
    assert.equal(git("diff", "--name-only", "--diff-filter=U").split("\n").length, 2);
  });
}

async function edit(ctx: NonNullable<Awaited<ReturnType<typeof gitEditor>>>, field: string, text: string, saved = true) {
  await ctx.frame.evaluate(`(() => { const editor = document.querySelector('[data-git-${field}]'); editor.value = ${JSON.stringify(text)}; editor.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  if (saved) await ctx.frame.waitFor("document.querySelector('[data-git-draft-status]').dataset.state === 'ready'");
}
async function decide(ctx: NonNullable<Awaited<ReturnType<typeof gitEditor>>>, decision: "approve" | "reject") {
  const selector = `[data-host-review-slot] [data-agent-review-${decision}]`;
  await ctx.browser.waitFor(`document.querySelector(${JSON.stringify(selector)})?.checkVisibility()`);
  await ctx.browser.click(selector);
  await ctx.browser.click("[data-page-dialog=confirm] [type=submit]");
}

for (const surface of ["git", "coding"] as const) {
  test(`QEA-33: ${surface} restores each directory's own form through actual directory switching`, { timeout: 150_000 }, async t => {
    const ctx = await gitEditor(t, surface); if (!ctx) return;
    const { browser, frame, workspace, root } = ctx;
    const otherRoot = join(browser.homeDirectory, "second-repository");
    await mkdir(otherRoot);
    execFileSync("git", ["init", "-q", "-b", "other-branch", otherRoot]);
    await addProjectInputFolder(browser.web, browser.projectId!, root);
    const other = await addProjectInputFolder(browser.web, browser.projectId!, otherRoot);
    await browser.reloadPage(); await ctx.show();
    if (surface === "coding") {
      await frame.click("[data-coding-new]"); await browser.waitFor(CODING_TAKEN);
    }
    const select = async (id: string, path: string, branch: string) => {
      if (surface === "git") {
        await setProjectOutputFolder(browser.web, browser.projectId!, path);
        await frame.click("[data-git-refresh]");
      } else {
        if (await frame.evaluate("document.querySelector('.coding-context').hidden")) await browser.evaluate(codingAdd("context"));
        await frame.click("[data-coding-workspace-open]");
        await frame.evaluate(`document.querySelector('[data-coding-workspace-choice]').value = ${JSON.stringify(id)}`);
        await frame.click("[data-coding-workspace-form] [type=submit]");
        await frame.waitFor("!document.querySelector('[data-coding-workspace-dialog]').open");
        await ctx.show();
      }
      await frame.waitFor(`document.querySelector('[data-git-branch]').textContent === ${JSON.stringify(branch)} && !document.querySelector('[data-git-commit-message]').disabled && !document.querySelector('[data-git-refresh]').disabled`);
    };
    await select(workspace.workspace_id, root, "main");
    await edit(ctx, "commit-message", "First directory commit");
    await frame.click("[data-git-branch-toggle]");
    await edit(ctx, "branch-name", "first-topic");
    await select(other.workspace_id, otherRoot, "other-branch");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-branch-name]').value"), "");
    await edit(ctx, "commit-message", "Second directory commit");
    await edit(ctx, "branch-name", "second-topic");
    await select(workspace.workspace_id, root, "main");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "First directory commit");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-branch-name]').value"), "first-topic");
    await select(other.workspace_id, otherRoot, "other-branch");
    await browser.reloadPage(); await ctx.show();
    await frame.waitFor("document.querySelector('[data-git-branch]').textContent === 'other-branch'");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "Second directory commit");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-branch-name]').value"), "second-topic");
    assert.equal(ctx.git("log", "-1", "--format=%s"), "Initial");
    assert.equal(execFileSync("git", ["-C", otherRoot, "rev-list", "--all"], { encoding: "utf8" }), "", "drafts create no commits in either directory");
  });
}

for (const surface of ["git", "coding"] as const) {
  test(`QEA-33 QEA-34 QEA-133: ${surface} keeps rejected and later edits, and clears only the successful snapshot after reload`, { timeout: 150_000 }, async t => {
    const ctx = await gitEditor(t, surface); if (!ctx) return;
    const { browser, frame, root, git, show } = ctx;
    git("config", "user.name", "Fixture"); git("config", "user.email", "fixture@example.test");
    git("config", "commit.gpgsign", "false"); git("config", "core.hooksPath", "/dev/null");
    await writeFile(join(root, "one.txt"), "changed\n"); git("add", "one.txt");
    await frame.click("[data-git-refresh]"); await show();
    const originalHead = git("rev-parse", "HEAD");
    await edit(ctx, "commit-message", "First proposed commit");
    await frame.click("[data-git-commit]");
    if (surface === "coding") {
      const reject = "[data-host-review-slot] [data-agent-review-reject]";
      await browser.waitFor(`document.querySelector(${JSON.stringify(reject)})?.checkVisibility()`);
      const reviewId = await browser.evaluate<string>(`document.querySelector(${JSON.stringify(reject)}).dataset.agentReviewReject`);
      const sameReview = `[data-host-review-slot] [data-agent-review-reject=${JSON.stringify(reviewId)}]`;
      const canReject = `(() => {
        const control = document.querySelector(${JSON.stringify(sameReview)});
        if (!control || control.disabled) return false;
        const rect = control.getBoundingClientRect();
        return control.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })()`;
      await frame.waitFor("document.querySelector('[data-git-reviews]').offsetHeight > 50");
      const point = await frame.point("[data-git-notice]", "start");
      await browser.command("Input.dispatchMouseEvent", { type: "mouseWheel", ...point, deltaX: 0, deltaY: 600 }, browser.sessionId);
      await browser.waitFor(canReject);
      await browser.click(".navigator-project-settings");
      await frame.waitFor("document.body.hidden");
      await browser.click("[data-cover-close]");
      await browser.waitFor(canReject);
    }
    await decide(ctx, "reject");
    await frame.waitFor("document.querySelector('[data-git-operations] [data-outcome=denied]') && !document.querySelector('[data-git-refresh]').disabled");
    await browser.reloadPage(); await show();
    assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "First proposed commit");
    assert.equal(git("rev-parse", "HEAD"), originalHead);
    await frame.click("[data-git-commit]");
    await browser.waitFor("document.querySelector('[data-host-review-slot] [data-agent-review-approve]')?.checkVisibility()");
    await edit(ctx, "commit-message", "Later work is still a draft");
    await browser.reloadPage(); await show();
    await frame.click("[data-git-path]");
    await decide(ctx, "approve");
    await frame.waitFor("document.querySelector('[data-git-operations] [data-outcome=succeeded]') && !document.querySelector('[data-git-refresh]').disabled");
    assert.equal(git("log", "-1", "--format=%s"), "First proposed commit");
    await browser.reloadPage(); await show();
    assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "Later work is still a draft");
    await writeFile(join(root, "two.txt"), "next change\n"); git("add", "two.txt");
    await frame.click("[data-git-refresh]"); await show();
    await frame.click("[data-git-commit]");
    await browser.waitFor("document.querySelector('[data-host-review-slot] [data-agent-review-approve]')?.checkVisibility()");
    await browser.reloadPage(); await show(); await frame.click("[data-git-path]"); await decide(ctx, "approve");
    await frame.waitFor("document.querySelector('[data-git-commit-message]').value === '' && document.querySelector('[data-git-draft-status]').dataset.state === 'ready'");
    assert.equal(git("log", "-1", "--format=%s"), "Later work is still a draft");
    await browser.reloadPage(); await show();
    assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "");
    assert.equal(Number(git("rev-list", "--count", "HEAD")), 3, "reload and receipt handling never repeat a commit");
  });
}

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
  await frame.click("[data-coding-new]"); await browser.waitFor(CODING_TAKEN);
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

for (const surface of ["git", "coding"] as const) for (const reply of ["success", "failure"] as const) test(`QEA-78 ${surface} keeps the later file's diff and action when an earlier staging review ${reply} arrives`,{timeout:120_000},async t=>{
  const ctx=await gitEditor(t,surface);if(!ctx)return;
  const {frame,root,git}=ctx;
  await writeFile(join(root,"one.txt"),"changed one\n");await writeFile(join(root,"two.txt"),"changed two\n");
  await frame.click('[data-git-refresh]');await ctx.show();
  const row=(name:string)=>'[data-git-path='+JSON.stringify(JSON.stringify([[name],"worktree"]))+']';
  await frame.click(row("one.txt"));
  await frame.waitFor("document.querySelector('[data-git-title]').textContent==='one.txt' && !document.querySelector('[data-git-index-action]').hidden");
  await frame.evaluate(`{const request=molisWorkRequest;window.molisWorkRequest=Object.assign(async(url,options)=>{const value=await request(url,options);if(String(url).endsWith('/prepare-index')||options?.body?.reference?.capability_id==='git.prepare-index'){window.reviewReplyHeld=true;await new Promise(resolve=>window.releaseReviewReply=resolve);window.reviewReplyDelivered=true;if(${JSON.stringify(reply)}==="failure")throw new Error("qea-old-index-reply");}return value;},request);}`);
  await frame.click('[data-git-index-action]');await frame.waitFor("window.reviewReplyHeld===true");
  try {
    await frame.click("[data-git-close]");
    await frame.click(row("two.txt"));
    await frame.waitFor("document.querySelector('[data-git-title]').textContent==='two.txt' && !document.querySelector('[data-git-index-action]').hidden && document.querySelector('[data-git-results]').getAttribute('aria-busy')==='false'");
    assert.equal(git("diff","--cached","--name-only"),"","preparing a review never stages the file by itself");
  } finally {await frame.evaluate("releaseReviewReply()");}
  await frame.waitFor("!document.querySelector('[data-git-index-action]').disabled");
  await frame.waitFor("window.reviewReplyDelivered===true");
  assert.deepEqual(await frame.evaluate("[document.querySelector('[data-git-title]').textContent,document.querySelector('[data-git-index-action]').hidden]"),["two.txt",false],"the earlier reply does not take away the later file's action");
  await decide(ctx, "approve");
  await frame.waitFor("document.querySelector('[data-git-group=staged]')?.textContent.includes('one.txt')");
  assert.equal(git("diff", "--cached", "--name-only"), "one.txt", "the accepted old review still writes only its original file");
  assert.deepEqual(await frame.evaluate("[document.querySelector('[data-git-title]').textContent,document.querySelector('[data-git-index-action]').hidden]"), ["two.txt", false]);
});

for (const surface of ["git", "coding"] as const) test(`QEA-78 ${surface} retries an unknown staging response with the original operation and writes only once`, { timeout: 120_000 }, async t => {
  const ctx = await gitEditor(t, surface); if (!ctx) return;
  const { frame, root, browser, git } = ctx;
  await writeFile(join(root, "one.txt"), "retry original staging review\n");
  await frame.click("[data-git-refresh]"); await ctx.show();
  await frame.click("[data-git-path]");
  await frame.waitFor("!document.querySelector('[data-git-index-action]').hidden");
  await frame.evaluate(`{
    const request = molisWorkRequest; window.preparedOperations = [];
    window.molisWorkRequest = async (url, options) => {
      const preparing = String(url).endsWith('/prepare-index') || options?.body?.reference?.capability_id === 'git.prepare-index';
      if (preparing) preparedOperations.push((options.body.input ?? options.body).operation_id);
      const value = await request(url, options);
      if (preparing && preparedOperations.length === 1) throw new Error('qea-staging-reply-lost');
      return value;
    };
  }`);
  await frame.click("[data-git-index-action]");
  await frame.waitFor("document.querySelector('[data-git-notice]').textContent.includes('qea-staging-reply-lost') && !document.querySelector('[data-git-index-action]').disabled");
  await frame.click("[data-git-index-action]");
  await frame.waitFor("document.querySelector('[data-git-index-action]').hidden");
  const ids = await frame.evaluate<string[]>("preparedOperations");
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1], "an explicit retry uses the original identity");
  const reviews = await browser.web.get<{ reviews: Array<{ request: { operation?: { kind: string } } }> }>(`/projects/${browser.projectId}/api/agent/reviews?status=pending`);
  assert.equal(reviews.reviews.filter(row => row.request.operation?.kind === "git-index").length, 1);
  assert.equal(git("diff", "--cached", "--name-only"), "");
  await decide(ctx, "approve");
  await frame.waitFor("document.querySelector('[data-git-group=staged]')?.textContent.includes('one.txt')");
  assert.equal(git("show", ":one.txt"), "retry original staging review");
});

for (const surface of ["git", "coding"] as const) test(`QEA-77 QEA-78 ${surface} returns to a usable directory after switching away from a conflict and a fixed diff`, { timeout: 120_000 }, async t => {
  const ctx = await gitEditor(t, surface, true); if (!ctx) return;
  const { frame, browser } = ctx;
  await browser.setViewport(1440, 1000);
  const roundTrip = async () => {
    await browser.click('[data-plugin-strip] [data-plugin-id=goals]');
    await browser.waitFor("document.body.dataset.desktopSurface === 'goals'");
    await browser.click(`[data-plugin-strip] [data-plugin-id=${surface}]`);
    await browser.waitFor(`document.body.dataset.desktopSurface === ${JSON.stringify(surface)}`);
    await ctx.show();
    assert.equal(await frame.evaluate("document.querySelector('[data-git-results]').hidden"), true, "no abandoned heading or disabled result remains after re-entry");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-browser]').checkVisibility()"), true);
  };
  await chooseConflict(frame, 1); await frame.waitFor("!document.querySelector('[data-git-conflict-text]').disabled");
  await edit(ctx, "conflict-text", "Draft retained through actual navigation\n");
  await roundTrip();
  await chooseConflict(frame, 1); await frame.waitFor("!document.querySelector('[data-git-conflict-text]').disabled");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-conflict-text]').value"), "Draft retained through actual navigation\n");
  await frame.click("[data-git-close]");
  ctx.git("merge", "--abort");
  await writeFile(join(ctx.root, "one.txt"), "Changed after the merge was aborted\n");
  await frame.click("[data-git-refresh]"); await ctx.show();
  await frame.click("[data-git-path]"); await frame.waitFor("!document.querySelector('[data-git-index-action]').hidden");
  await roundTrip();
  await frame.click("[data-git-reopen]");
  await frame.waitFor("!document.querySelector('[data-git-index-action]').hidden");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-title]').textContent"), "one.txt");
  assert.equal(ctx.git("diff", "--cached", "--name-only"), "", "navigation and reopening do not stage the file");
});

test("QEA-78 history refresh and save receipts preserve the chosen result and settle the original stored artifact", { timeout: 150_000 }, async t => {
  const ctx = await gitEditor(t, "git"); if (!ctx) return;
  const { frame, browser, root } = ctx;
  await browser.setViewport(1440, 1000);
  for (const file of ["one.txt", "two.txt"]) {
    await writeFile(join(root, file), "history " + file + "\n");
    await frame.click("[data-git-refresh]"); await ctx.show();
    await frame.click('[data-git-path=' + JSON.stringify(JSON.stringify([[file], "worktree"])) + ']');
    await frame.waitFor("!document.querySelector('[data-git-index-action]').hidden");
    await frame.click("[data-git-index-action]"); await decide(ctx, "approve");
    await frame.waitFor(`document.querySelector('[data-git-group=staged]')?.textContent.includes(${JSON.stringify(file)}) && !document.querySelector('[data-git-refresh]').disabled`);
    await frame.click("[data-git-close]");
  }
  await frame.click("[data-git-history]");
  await frame.waitFor("document.querySelector('[data-git-result-choice]').options.length === 2");
  const ids = await frame.evaluate<string[]>("[...document.querySelector('[data-git-result-choice]').options].map(o => o.value)");
  const choose = (id: string) => frame.evaluate(`{ const select = document.querySelector('[data-git-result-choice]'); select.value = ${JSON.stringify(id)}; select.dispatchEvent(new Event('change', { bubbles: true })); }`);
  await choose(ids[0]!);
  await frame.evaluate(`{
    const request = molisWorkRequest;
    window.historyMode = ''; window.historyHeld = false;
    window.molisWorkRequest = async (url, options) => {
      const match = String(url).includes('/results') && ((options?.method === 'POST') === (historyMode !== 'read'));
      if (!historyMode || !match) return request(url, options);
      const mode = historyMode; historyMode = '';
      if (mode === 'fail') { await new Promise(resolve => { window.releaseHistory = resolve; historyHeld = true; }); throw new Error('qea-old-save-failure'); }
      const value = await request(url, options);
      await new Promise(resolve => { window.releaseHistory = resolve; historyHeld = true; }); return value;
    };
  }`);
  await frame.click("[data-git-close]");
  await frame.evaluate("historyMode = 'read'; historyHeld = false");
  await frame.click("[data-git-history]"); await frame.waitFor("historyHeld");
  await choose(ids[1]!); await frame.evaluate("releaseHistory()");
  await frame.waitFor("!document.querySelector('[data-git-result-save]').disabled");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-result-choice]').value"), ids[1]);
  await frame.evaluate("historyMode = 'save'; historyHeld = false");
  await frame.click("[data-git-result-save]"); await frame.waitFor("historyHeld && typeof releaseHistory === 'function'");
  await frame.click("[data-git-refresh]"); await ctx.show();
  await frame.evaluate("releaseHistory()");
  await frame.waitFor("document.querySelector('[data-git-result-status]').textContent.includes('已保存')");
  const readResults = () => browser.web.get<{ results: Array<{ result: { review: { review_id: string } }; saved?: { reference: { artifact_id: string; version: number } } }> }>(`/projects/${browser.projectId}/api/plugins/io.molis.work.git/results?workspace_id=${ctx.workspace.workspace_id}`);
  const stored = (await readResults()).results.find(row => row.result.review.review_id === ids[1]);
  assert.ok(stored?.saved?.reference.artifact_id, "the original save produced an actual fixed artifact");
  await choose(ids[0]!);
  await frame.evaluate("historyMode = 'fail'; historyHeld = false");
  await frame.click("[data-git-result-save]"); await frame.waitFor("historyHeld");
  await choose(ids[1]!); await frame.evaluate("releaseHistory()");
  await frame.waitFor("document.querySelector('[data-git-result-save]').disabled");
  assert.doesNotMatch(await frame.evaluate<string>("document.querySelector('[data-git-result-status]').textContent"), /qea-old-save-failure/u);
  assert.deepEqual((await readResults()).results.find(row => row.result.review.review_id === ids[1])?.saved?.reference, stored.saved.reference);
  await choose(ids[0]!); await frame.waitFor("!document.querySelector('[data-git-result-save]').disabled");
  await frame.click("[data-git-result-save]");
  await frame.waitFor("document.querySelector('[data-git-result-status]').textContent.includes('已保存')");
  assert.equal((await readResults()).results.filter(row => row.saved).length, 2);
});

for (const surface of ["git", "coding"] as const) test(`QEA-78 ${surface} returning to the directory does not revive an older commit review response`, { timeout: 120_000 }, async t => {
  const ctx = await gitEditor(t, surface); if (!ctx) return;
  const { frame, browser, git, root } = ctx;
  await browser.setViewport(1440, 1000);
  await writeFile(join(root, "one.txt"), "ready to commit\n"); git("add", "one.txt");
  await frame.click("[data-git-refresh]"); await ctx.show();
  await edit(ctx, "commit-message", "Original reviewed commit");
  await frame.evaluate(`{const request=molisWorkRequest;window.molisWorkRequest=async(url,options)=>{
    const value=await request(url,options);
    if ((String(url).endsWith('/operations') && options?.method === 'POST') || options?.body?.reference?.capability_id === 'git.prepare-operation') {
      await new Promise(resolve=>{window.releaseCommitReply=resolve;window.commitReplyHeld=true;}); window.commitReplyDelivered=true;
    }return value;
  };}`);
  await frame.click("[data-git-commit]"); await frame.waitFor("window.commitReplyHeld");
  await frame.click("[data-git-history]"); await frame.waitFor("!document.querySelector('[data-git-saved-results]').hidden");
  await frame.click("[data-git-close]"); await frame.evaluate("releaseCommitReply()");
  await frame.waitFor("window.commitReplyDelivered");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-results]').hidden"), true, "returning to the directory is a new choice, not the old null selection");
  assert.equal(git("log", "-1", "--format=%s"), "Initial");
  const pending = await browser.web.get<{ reviews: Array<{ request: { operation?: { kind: string } } }> }>(`/projects/${browser.projectId}/api/agent/reviews?status=pending`);
  assert.equal(pending.reviews.filter(row => row.request.operation?.kind === "git-operation").length, 1);
  await frame.click("[data-git-history]"); await decide(ctx, "approve");
  await frame.waitFor("document.querySelector('[data-git-operations] [data-outcome=succeeded]')");
  assert.equal(git("log", "-1", "--format=%s"), "Original reviewed commit");
});

for (const kind of ["index", "conflict"] as const) test(`QEA-78 a late output-directory response cannot reopen or prepare the later ${kind} selection`, { timeout: 150_000 }, async t => {
  const ctx = await gitEditor(t, "coding", kind === "conflict"); if (!ctx) return;
  const { browser, frame, root, workspace } = ctx;
  await browser.setViewport(1440, 1000);
  if (kind === "index") for (const file of ["one.txt", "two.txt"]) await writeFile(join(root, file), "modified " + file + "\n");
  await addProjectInputFolder(browser.web, browser.projectId!, root);
  const other = join(browser.homeDirectory, "output-for-permission"); await mkdir(other);
  execFileSync("git", ["init", "-q", "-b", "other-output", other]);
  await setProjectOutputFolder(browser.web, browser.projectId!, other);
  await browser.reloadPage(); await ctx.show();
  await frame.click("[data-coding-new]"); await browser.waitFor(CODING_TAKEN);
  if (await frame.evaluate("document.querySelector('.coding-context').hidden")) await browser.evaluate(codingAdd("context"));
  await frame.click("[data-coding-workspace-open]");
  await frame.evaluate(`document.querySelector('[data-coding-workspace-choice]').value = ${JSON.stringify(workspace.workspace_id)}`);
  await frame.click("[data-coding-workspace-form] [type=submit]");
  await frame.waitFor("!document.querySelector('[data-coding-workspace-dialog]').open"); await ctx.show();
  await frame.evaluate(`{const request=molisWorkRequest;window.preparationCalls=0;window.molisWorkRequest=async(url,options)=>{
    if(['git.prepare-index','git.prepare-operation'].includes(options?.body?.reference?.capability_id)) preparationCalls++;
    return request(url,options);
  };}`);
  const row = (file: string) => '[data-git-path=' + JSON.stringify(JSON.stringify([[file], "worktree"])) + ']';
  if (kind === "conflict") {
    await chooseConflict(frame, 1); await frame.waitFor("!document.querySelector('[data-git-conflict-text]').disabled");
    await edit(ctx, "conflict-text", "Resolve first only\n"); await frame.click("[data-git-conflict-resolve]");
  } else {
    await frame.click(row("one.txt")); await frame.waitFor("!document.querySelector('[data-git-index-action]').hidden");
    await frame.click("[data-git-index-action]");
  }
  const refusal = kind === "conflict" ? "[data-git-conflict-state] .git-set-output" : "[data-git-notice] .git-set-output";
  await frame.waitFor(`document.querySelector(${JSON.stringify(refusal)})?.checkVisibility()`);
  await browser.evaluate(`{const request=molisWorkRequest;window.molisWorkRequest=async(url,options)=>{
    const value=await request(url,options);
    if(String(url).endsWith('/api/host/plugin-page-workspaces')) await new Promise(resolve=>{window.releaseOutputReply=resolve;window.outputReplyHeld=true;});
    return value;
  };}`);
  await frame.click(refusal); await browser.waitFor("document.querySelector('[data-page-dialog=confirm]')?.checkVisibility()");
  await browser.click("[data-page-dialog=confirm] [type=submit]"); await browser.waitFor("window.outputReplyHeld");
  await frame.click("[data-git-close]");
  if (kind === "conflict") { await chooseConflict(frame, 2); await frame.waitFor("document.querySelector('[data-git-conflict-text]').value.includes('current two.txt')"); }
  else { await frame.click(row("two.txt")); await frame.waitFor("document.querySelector('[data-git-title]').textContent === 'two.txt' && !document.querySelector('[data-git-index-action]').hidden"); }
  await browser.evaluate("releaseOutputReply()");
  await frame.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-title]').textContent"), "two.txt");
  assert.equal(await frame.evaluate("preparationCalls"), 1, "the permission reply cannot submit a different file on the person's behalf");
  const reviews = await browser.web.get<{ reviews: Array<{ request: { operation?: { kind: string } } }> }>(`/projects/${browser.projectId}/api/agent/reviews?status=pending`);
  assert.equal(reviews.reviews.filter(row => ["git-index", "git-operation"].includes(row.request.operation?.kind ?? "")).length, 0);
});
