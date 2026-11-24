import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";
import { CODING_OPEN, CODING_SEND, codingControl, codingType, CODING_MODEL, CODING_MODELS_LISTED, codingSetting } from "./fixtures/coding-composer.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { codingToolResponse } from "./fixtures/coding-sdk-runtime.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { asideReply } from "./fixtures/ending-review.js";

// QEA-35, QEA-160: only the provider's answers are controlled. The SDK run, actual file approval/write,
// Coding commit action, framed clientUses handoff and platform draft cache remain the product's.
test("QEA-35: Coding hands a delayed model draft to Git without overwriting typing; cache retry reuses the generated draft and a removed directory is refused", { timeout: 210_000 }, async t => {
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend; resetSecretStoreCache(); });
  const entered = () => ({ started: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() });
  let gate = entered(), foreground = 0, draftCalls = 0;
  t.after(() => gate.release.resolve());
  const model = createServer(async (request, response) => {
    let raw = "";
    for await (const chunk of request.setEncoding("utf8")) raw += chunk;
    const aside = asideReply(raw);
    let result: Response;
    if (aside) result = cogniaModelResponse(aside);
    else {
      foreground++;
      if (foreground === 1) result = codingToolResponse("read", { path: "note.txt" });
      else if (foreground === 2) result = codingToolResponse("write", { path: "note.txt", text: "Reviewed SDK edit\n" });
      else if (foreground === 3) result = cogniaModelResponse("The reviewed edit is complete.");
      else {
        draftCalls++; const current = gate, number = draftCalls;
        current.started.resolve(); await current.release.promise;
        result = cogniaModelResponse(`feat: reviewed change ${number}`);
      }
    }
    response.writeHead(result.status, Object.fromEntries(result.headers)); response.end(await result.text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const browser = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, {
    prepareHome: home => seedConfiguredModels(home, [{ provider_id: "fixture", model_id: "fixture-model" }], `http://127.0.0.1:${address.port}`),
  });
  if (!browser) return;
  await browser.setViewport(1440, 900);
  const root = join(browser.homeDirectory, "handoff-repository"); await mkdir(root);
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main"); await writeFile(join(root, "note.txt"), "Before review\n"); git("add", "."); git("commit", "-qm", "Initial");
  await setProjectOutputFolder(browser.web, browser.projectId!, root);
  const frame = await pluginFrameBrowser(t, browser, "coding");
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=coding` }, browser.sessionId));
  await frame.click("[data-coding-new]"); await browser.waitFor(CODING_OPEN);
  await frame.waitFor(CODING_MODELS_LISTED);
  await frame.evaluate(codingSetting(CODING_MODEL, JSON.stringify(["fixture", "fixture-model"])));
  for (const [id, value] of [["intent", "edit"]]) {
    await browser.evaluate(`{ const control = document.querySelector(${JSON.stringify(codingControl(id!))}); control.value = ${JSON.stringify(value)}; control.dispatchEvent(new Event('change', { bubbles: true })); }`);
  }
  await browser.evaluate(codingType("Change note.txt to the reviewed text. Do not stage or commit."));
  await browser.waitFor(`!document.querySelector(${JSON.stringify(CODING_SEND)}).disabled`); await browser.click(CODING_SEND);
  const visible = (selector: string) => `document.querySelector(${JSON.stringify(selector)})?.checkVisibility()`;
  const approve = "[data-host-review-slot] [data-agent-review-approve]";
  const confirm = "[data-page-dialog=confirm][open] [type=submit]";
  await browser.waitFor(visible(approve), 30_000);
  assert.equal(await readFile(join(root, "note.txt"), "utf8"), "Before review\n");
  await browser.click(approve);
  await browser.waitFor(visible(confirm));
  await browser.click(confirm);
  const generate = "[data-coding-commit-round]";
  // Expected change (screen-polish POLISH-24): an ended round is one line, and committing sits in the round's details, behind
  // the chevron at the end of that line. The test opens them where it used to find the button on the card; the button and
  // what it does are the same.
  const present = `!!document.querySelector(${JSON.stringify(generate)})`;
  const openDetails = () => frame.evaluate(`{ const more = document.querySelector('[data-coding-run-more][aria-expanded=false]'); if (more && ${present}) more.click(); }`);
  await frame.waitFor(present, 30_000);
  await openDetails();
  await frame.waitFor(visible(generate));
  assert.equal(await readFile(join(root, "note.txt"), "utf8"), "Reviewed SDK edit\n");
  assert.equal(foreground, 3);
  const back = "[data-coding-directory-back]";
  const showGit = async () => {
    const files = "[data-coding-face=files]";
    await frame.waitFor(`${visible(files)} || ${visible(back)}`);
    if (!(await frame.evaluate<boolean>(visible(files)))) await frame.click(back);
    await frame.click(files);
    await frame.waitFor("document.querySelector('[data-git-sc]')?.checkVisibility() && !document.querySelector('[data-git-commit-message]').disabled && !document.querySelector('[data-git-refresh]').disabled");
  };
  const reloadGit = async () => {
    await browser.reloadPage();
    // On a narrow screen the restored session takes over after the frame's first render of its directory.
    await frame.waitFor(visible(back));
    await showGit();
  };
  const edit = async (text: string) => {
    await frame.evaluate(`{ const input = document.querySelector('[data-git-commit-message]'); input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true })); }`);
    await frame.waitFor("document.querySelector('[data-git-draft-status]').dataset.state === 'ready'");
  };
  const draft = async () => {
    await openDetails();
    if (!(await frame.evaluate<boolean>(visible(generate)))) {
      await frame.click("[data-coding-face=sessions]");
      await frame.click("[data-coding-session]");
      await frame.waitFor(present);
      await openDetails();
      await frame.waitFor(visible(generate));
    }
    await frame.click(generate);
    await gate.started.promise;
  };
  await draft(); await showGit(); await edit("A person's newer handwritten message");
  gate.release.resolve();
  await frame.waitFor("document.querySelector('[data-coding-status]').textContent.includes('手写说明已保留')");
  await showGit();
  assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "A person's newer handwritten message");
  await frame.click("[data-git-commit-draft]");
  await frame.waitFor("document.querySelector('[data-git-commit-message]').value === 'feat: reviewed change 1' && document.querySelector('[data-git-draft-status]').dataset.state === 'ready'");
  await browser.setViewport(720, 900);
  await reloadGit();
  assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "feat: reviewed change 1");
  await edit(""); gate = entered(); await draft();
  await browser.evaluate(`{
    const put = Cache.prototype.put;
    Cache.prototype.put = function(key, body) {
      if (String(typeof key === 'string' ? key : key.url).includes('git.edit.v1')) return Promise.reject(Error('controlled draft storage failure'));
      return put.call(this, key, body);
    };
    window.restoreGitDraftWrites = () => { Cache.prototype.put = put; };
  }`);
  gate.release.resolve();
  await frame.waitFor("document.querySelector('[data-coding-commit-retry]')?.checkVisibility()");
  assert.equal(draftCalls, 2);
  assert.match(await frame.evaluate<string>("document.querySelector('[data-coding-status]').textContent"), /未能交给 Git/u);
  await browser.evaluate("restoreGitDraftWrites()"); await frame.click("[data-coding-commit-retry]");
  await showGit();
  await frame.waitFor("document.querySelector('[data-git-draft-status]').dataset.state === 'ready'");
  assert.equal(draftCalls, 2, "retry hands off the already generated result without spending another model call");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "feat: reviewed change 2");
  await reloadGit();
  assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "feat: reviewed change 2");
  gate = entered(); await draft();
  const other = join(browser.homeDirectory, "replacement-repository"); await mkdir(other);
  execFileSync("git", ["init", "-q", "-b", "replacement", other]);
  await setProjectOutputFolder(browser.web, browser.projectId!, other);
  gate.release.resolve();
  await frame.waitFor("/原工作目录|未能交给 Git/.test(document.querySelector('[data-coding-status]').textContent)");
  await reloadGit();
  await frame.waitFor("document.querySelector('[data-git-branch]').textContent === 'replacement'");
  assert.equal(await frame.evaluate("document.querySelector('[data-git-commit-message]').value"), "", "a removed run directory never falls back into the new output's draft");
  assert.equal(git("log", "-1", "--format=%s"), "Initial");
  assert.equal(git("show", "HEAD:note.txt"), "Before review", "draft handoff never stages or commits the SDK's approved edit");
});
