import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

// GITREF-02: keep this real Host confirmation, refusal, index and commit flow unchanged in both controlled refresh orders.
for (const holdLayout of [false, true]) test(`SYS-15-U10 S-47 Git reviews remain Host-owned and require a real Host confirmation${holdLayout ? " (T405-GIT-04 show before layout)" : ""}`, { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "git");
  const prefix = `/projects/${browser.projectId}`, repo = join(browser.homeDirectory, "review-repo");
  await mkdir(repo);
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd: repo, encoding: "utf8" });
  git("init", "-q", "-b", "main"); await writeFile(join(repo, "note.md"), "first\n");
  git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
  git("add", "."); git("commit", "-q", "-m", "first"); await writeFile(join(repo, "note.md"), "first\nsecond\n");
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + prefix + "/" }, browser.sessionId));
  await browser.click(".navigator-project-settings"); await browser.click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await browser.waitFor("document.querySelector('[data-project-workspaces-add]') && !document.querySelector('[data-project-workspaces-refresh]').disabled");
  await browser.evaluate(`document.querySelector('[data-project-workspaces-add] [name=path]').value=${JSON.stringify(repo)}`);
  await browser.click("[data-project-workspaces-add] [type=submit]");
  await browser.waitFor("document.querySelector('[data-project-workspaces-list]').textContent.includes('review-repo')");
  await browser.navigate(() => browser.command("Page.navigate", { url: browser.origin + prefix + "/?openPlugin=git" }, browser.sessionId));
  await browser.surfaceReady("git"); await child.click("[data-git-path]"); await child.click("[data-git-index-action]");
  await browser.waitFor("document.querySelector('[data-host-review-slot] [data-agent-review-approve]')?.getClientRects().length");
  assert.equal(await child.evaluate("document.querySelector('[data-agent-review-approve]')"), null, "the review DOM never enters the child");
  const reviewId = await browser.evaluate<string>("document.querySelector('[data-agent-review-approve]').dataset.agentReviewApprove");
  for (const path of ["/api/agent/reviews", "/api/agent/reviews/decide", "/api/agent/reviews/recovery"]) {
    assert.equal(await child.evaluate(`fetch(${JSON.stringify(prefix + path)},{method:'POST',headers:{'x-molis-context-page':'invented'},body:JSON.stringify({review_id:${JSON.stringify(reviewId)},decision:'approve'})}).then(r=>r.status)`), 403);
  }
  await browser.evaluate("document.querySelector('[data-agent-review-approve]').click()");
  assert.equal(await browser.evaluate("!!document.querySelector('[data-page-dialog=confirm]')"), false);
  assert.equal(git("diff", "--cached", "--name-only"), "", "a synthetic click cannot stage anything");
  await browser.click("[data-host-review-slot] [data-agent-review-approve]");
  await browser.waitFor("document.querySelector('[data-page-dialog=confirm]')?.textContent.includes('note.md')");
  await browser.evaluate("document.querySelector('[data-page-dialog=confirm] [type=submit]').click();document.querySelector('[data-page-dialog=confirm] form').requestSubmit()");
  assert.equal(git("diff", "--cached", "--name-only"), "", "scripted dialog submission is not approval");
  // The Host delivers the settled outcome to the page asynchronously after the real confirmation, and that delivery
  // changes the notice before it refreshes the list. Record the change so the next open waits for it deterministically.
  await child.evaluate("const notice=document.querySelector('[data-git-notice]');notice.dataset.decisionBefore=notice.textContent;new MutationObserver(()=>{if(notice.textContent!==notice.dataset.decisionBefore)notice.dataset.decisionNoticed='1'}).observe(notice,{childList:true,characterData:true,subtree:true})");
  await browser.click("[data-page-dialog=confirm] [type=submit]");
  await child.waitFor("[...document.querySelectorAll('[data-git-path]')].some(node=>node.textContent.includes('note.md'))");
  await browser.waitFor("!document.querySelector('[data-host-review-slot] [data-agent-review-approve]')");
  assert.equal(git("diff", "--cached", "--name-only").trim(), "note.md", "real confirmation stages the exact requested file");
  await child.waitFor("!document.querySelector('[data-git-refresh]').disabled && [...document.querySelectorAll('[data-git-path]')].some(node=>JSON.parse(node.dataset.gitPath)[1]==='index')");
  await child.waitFor("document.querySelector('[data-git-notice]').dataset.decisionNoticed==='1' && !document.querySelector('[data-git-refresh]').disabled");
  await child.click("[data-git-close]");
  await child.click("[data-git-path]");
  try { await child.click("[data-git-index-action]"); } catch(error){t.diagnostic(await child.evaluate("document.querySelector('[data-git-notice]').textContent"));throw error;}
  await browser.waitFor("document.querySelector('[data-host-review-slot] [data-agent-review-reject]')?.getClientRects().length");
  await browser.click("[data-host-review-slot] [data-agent-review-reject]");
  await browser.click("[data-page-dialog=confirm] [type=submit]");
  await browser.waitFor("!document.querySelector('[data-host-review-slot] [data-agent-review-reject]')");
  assert.equal(git("diff", "--cached", "--name-only").trim(), "note.md", "rejecting the unstage request preserves the index");
  await child.click("[data-git-close]");
  let reviewReads = 0;
  if (holdLayout) {
    // T405-GIT-04: keep the real closed slot hidden until its next show has completed. A layout update is
    // geometry, not an owner-page lifecycle transition; it must not suppress the authoritative review read.
    await browser.waitFor("[...document.querySelectorAll('[data-host-review-slot]')].every(node => node.hidden || getComputedStyle(node).visibility === 'hidden')");
    browser.server.on("request", request => { if (request.method === "GET" && request.url?.includes("/api/agent/reviews")) reviewReads++; });
    await child.evaluate(`(() => {
      const post=MessagePort.prototype.postMessage, held=[];
      window.releaseReviewLayout=()=>{MessagePort.prototype.postMessage=post;for(const [port,value] of held)post.call(port,value);};
      MessagePort.prototype.postMessage=function(value,...rest){
        if(value?.type==='review-layout' && value.box){held.push([this,value]);return;}
        return post.call(this,value,...rest);
      };
    })()`);
  }
  await child.waitFor("!document.querySelector('[data-git-refresh]').disabled && !document.querySelector('[data-git-commit]').disabled");
  await child.evaluate("const field=document.querySelector('[data-git-commit-message]');field.value='reviewed commit';field.dispatchEvent(new Event('input',{bubbles:true}))");
  await child.click("[data-git-commit]");
  if (holdLayout) {
    await browser.waitFor("Boolean(document.querySelector('[data-host-review-slot] [data-agent-review-approve]'))");
    assert.ok(reviewReads > 0, "show reads the current review before geometry makes its slot visible");
    assert.equal(await browser.evaluate("Boolean(document.querySelector('[data-host-review-slot] [data-agent-review-approve]'))"), true);
    assert.equal(await browser.evaluate("[...document.querySelectorAll('[data-host-review-slot]')].every(node => node.hidden || getComputedStyle(node).visibility === 'hidden')"), true);
    await child.evaluate("releaseReviewLayout()");
  }
  await browser.waitFor("document.querySelector('[data-host-review-slot] [data-agent-review-approve]')?.getClientRects().length");
  await browser.click("[data-host-review-slot] [data-agent-review-approve]");
  await browser.click("[data-page-dialog=confirm] [type=submit]");
  await child.waitFor("document.querySelector('[data-git-commit-message]').value===''");
  assert.equal(git("log", "-1", "--format=%s").trim(), "reviewed commit", "only a settled commit clears its draft");
});
