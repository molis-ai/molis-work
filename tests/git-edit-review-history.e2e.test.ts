import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addProjectInputFolder, setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { codingAdd } from "./fixtures/coding-composer.js";
import { gitEditor, chooseConflict, edit, decide } from "./fixtures/git-edit-drafts.js";
import test from "node:test";

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

for (const surface of ["git", "coding"] as const) test(`QEA-78 QEA-170 ${surface} returning to the directory does not revive an older commit review response`, { timeout: 120_000 }, async t => {
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
  await ctx.startCodingSession();
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
