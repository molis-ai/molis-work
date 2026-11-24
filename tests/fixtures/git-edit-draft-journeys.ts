import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { addProjectInputFolder, setProjectOutputFolder } from "./project-directories-http.js";
import { CODING_TAKEN, codingAdd } from "./coding-composer.js";
import { gitEditor, chooseConflict, edit, decide } from "./git-edit-drafts.js";
import test from "node:test";

export function testGitEditDrafts(surface: "git" | "coding") {
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

  test(`QEA-33 QEA-174 QEA-177: ${surface} restores each directory's own form through actual directory switching`, { timeout: 150_000 }, async t => {
    const ctx = await gitEditor(t, surface); if (!ctx) return;
    const { browser, frame, workspace, root } = ctx;
    if (surface === "coding") await browser.setViewport(780, 493);
    const otherRoot = join(browser.homeDirectory, "second-repository");
    await mkdir(otherRoot);
    execFileSync("git", ["init", "-q", "-b", "other-branch", otherRoot]);
    await addProjectInputFolder(browser.web, browser.projectId!, root);
    const other = await addProjectInputFolder(browser.web, browser.projectId!, otherRoot);
    await browser.reloadPage(); await ctx.show();
    const selectedSession = "[data-coding-session][aria-current=true]";
    const currentSession = `document.querySelector(${JSON.stringify(selectedSession)})?.dataset.codingSession`;
    let codingSession: string | undefined;
    if (surface === "coding") {
      await ctx.startCodingSession();
      await frame.waitFor(`Boolean(${currentSession})`);
      codingSession = await frame.evaluate<string>(currentSession);
    }
    const select = async (id: string, path: string, branch: string) => {
      if (surface === "git") {
        await setProjectOutputFolder(browser.web, browser.projectId!, path);
        await frame.click("[data-git-refresh]");
      } else {
        if (!await frame.evaluate("document.querySelector('.coding-stage').checkVisibility()")) {
          await ctx.codingFace("sessions");
          await frame.click(selectedSession);
        }
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
    if (codingSession) {
      // The saved session can arrive before its project's authorized directories.
      const state = Promise.withResolvers<void>();
      let stateRequested = false;
      const handlers = browser.server.listeners("request");
      browser.server.removeAllListeners("request");
      browser.server.on("request", async (request, response) => {
        if (request.url?.split("?")[0]?.endsWith("/api/plugins/io.molis.work.coding/state")) {
          stateRequested = true;
          await state.promise;
        }
        for (const handler of handlers) handler.call(browser.server, request, response);
      });
      try {
        await browser.reloadPage();
        await frame.waitFor(`JSON.parse(document.querySelector('[data-coding-workbench]')?.dataset.assistantContext || '{}').object?.id === ${JSON.stringify(codingSession)}`);
      } finally { state.resolve(); }
      await browser.waitFor(CODING_TAKEN);
      // Wait for the session's first read to restore its folder before opening the embedded Git pane.
      const restoredFolder = `document.querySelector('[data-coding-workspace-label]')?.title === ${JSON.stringify(other.canonical_path)}`;
      await frame.waitFor(`${currentSession} === ${JSON.stringify(codingSession)} && ${restoredFolder}`);
      assert.ok(stateRequested, "the project directories came through the controlled read");
    } else await browser.reloadPage();
    await ctx.show();
    await frame.waitFor("document.querySelector('[data-git-branch]').textContent === 'other-branch'");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "Second directory commit");
    assert.equal(await frame.evaluate("document.querySelector('[data-git-branch-name]').value"), "second-topic");
    assert.equal(ctx.git("log", "-1", "--format=%s"), "Initial");
    assert.equal(execFileSync("git", ["-C", otherRoot, "rev-list", "--all"], { encoding: "utf8" }), "", "drafts create no commits in either directory");
  });

  test(`QEA-33 QEA-34 QEA-133 QEA-174: ${surface} keeps rejected and later edits, and clears only the successful snapshot after reload`, { timeout: 150_000 }, async t => {
    const ctx = await gitEditor(t, surface); if (!ctx) return;
    const { browser, frame, root, git, show } = ctx;
    if (surface === "coding") {
      await browser.setViewport(780, 493);
      await show();
    }
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
      const resultScroll = "document.querySelector('[data-git-reviews]').parentElement.scrollTop";
      const beforeCover = await frame.evaluate<number>(resultScroll);
      assert.ok(beforeCover > 0, "the compact result panel has been scrolled to the review");
      await browser.click(".navigator-project-settings");
      await frame.waitFor("document.body.hidden");
      // Hold the real Host response while the replacement review slot is mounted and measured.
      await browser.evaluate(`(() => {
        const fetch = window.fetch;
        let release;
        const pending = new Promise(resolve => { release = resolve; });
        const held = window.heldGitReviewRead = { received: false, release: () => { window.fetch = fetch; release(); } };
        window.fetch = async (input, init) => {
          const response = await fetch.call(window, input, init);
          const url = new URL(input instanceof Request ? input.url : input, location.href);
          if (response.ok && url.pathname.endsWith('/api/agent/reviews') && url.searchParams.has('workspace_id')) {
            held.received = true;
            await pending;
          }
          return response;
        };
      })()`);
      try {
        await browser.click("[data-cover-close]");
        await browser.waitFor("window.heldGitReviewRead.received");
        await frame.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))");
        assert.equal(await frame.evaluate(resultScroll), beforeCover, "the pending read preserves where the review was on screen");
      } finally { await browser.evaluate("window.heldGitReviewRead.release()"); }
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
