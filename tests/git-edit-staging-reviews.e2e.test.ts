import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gitEditor, chooseConflict, edit, decide } from "./fixtures/git-edit-drafts.js";
import test from "node:test";

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
