import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./goal-browser.js";
import { pluginFrameBrowser } from "./plugin-frame-browser.js";
import { setProjectOutputFolder } from "./project-directories-http.js";
import { CODING_TAKEN } from "./coding-composer.js";
import type { TestContext } from "node:test";

export async function gitEditor(t: TestContext, surface: "git" | "coding", conflicts = false) {
  const browser = await openGoalBrowser(t, "seeded");
  if (!browser) return null;
  assert.ok(browser.projectId);
  const root = join(browser.homeDirectory, "editable-repository");
  await mkdir(root);
  const options = { cwd: root, encoding: "utf8" as const,
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0" } };
  const git = (...command: string[]) => execFileSync("git", command, options).trim();
  git("init", "-q", "-b", "main");
  for (const [name, value] of [["user.name", "Fixture"], ["user.email", "fixture@example.test"],
    ["commit.gpgsign", "false"], ["core.hooksPath", "/dev/null"]]) git("config", "--local", name, value);
  for (const file of ["one.txt", "two.txt"]) await writeFile(join(root, file), `base ${file}\n`);
  git("add", "."); git("commit", "-qm", "Initial");
  if (conflicts) {
    git("checkout", "-qb", "incoming");
    for (const file of ["one.txt", "two.txt"]) await writeFile(join(root, file), `incoming ${file}\n`);
    git("commit", "-qam", "Incoming changes");
    git("checkout", "-q", "main");
    for (const file of ["one.txt", "two.txt"]) await writeFile(join(root, file), `current ${file}\n`);
    git("commit", "-qam", "Current changes");
    const merge = spawnSync("git", ["merge", "incoming"], options);
    assert.equal(merge.status, 1, merge.stderr);
    assert.equal(git("diff", "--name-only", "--diff-filter=U").split("\n").length, 2);
  }
  const workspace = await setProjectOutputFolder(browser.web, browser.projectId, root);
  const frame = await pluginFrameBrowser(t, browser, surface);
  const visible = (selector: string) => `document.querySelector(${JSON.stringify(selector)})?.checkVisibility()`;
  const codingFace = async (face: "files" | "sessions") => {
    const control = `[data-coding-face=${face}]`, back = "[data-coding-directory-back]";
    await frame.waitFor(`${visible(control)} || ${visible(back)}`);
    if (!await frame.evaluate(visible(control))) await frame.click(back);
    await frame.click(control);
  };
  const startCodingSession = async () => {
    await codingFace("sessions");
    await frame.click("[data-coding-new]");
    await browser.waitFor(CODING_TAKEN);
  };
  const show = async () => {
    if (surface === "coding") await codingFace("files");
    await frame.waitFor("document.querySelector('[data-git-sc]')?.checkVisibility() && !document.querySelector('[data-git-refresh]').disabled");
  };
  await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?openPlugin=${surface}` }, browser.sessionId));
  await show();
  return { browser, frame, root, show, git, workspace, startCodingSession, codingFace };
}

/** Use the visible Back control when the compact result covers the directory. */
export async function chooseConflict(frame: NonNullable<Awaited<ReturnType<typeof gitEditor>>>["frame"], position: number) {
  const selector = `[data-git-conflict-list] li:nth-child(${position}) button`;
  if (!await frame.evaluate(`document.querySelector(${JSON.stringify(selector)}).checkVisibility()`)) await frame.click("[data-git-close]");
  await frame.click(selector);
}

export async function edit(ctx: NonNullable<Awaited<ReturnType<typeof gitEditor>>>, field: string, text: string, saved = true) {
  await ctx.frame.evaluate(`(() => { const editor = document.querySelector('[data-git-${field}]'); editor.value = ${JSON.stringify(text)}; editor.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  if (saved) await ctx.frame.waitFor("document.querySelector('[data-git-draft-status]').dataset.state === 'ready'");
}
export async function decide(ctx: NonNullable<Awaited<ReturnType<typeof gitEditor>>>, decision: "approve" | "reject") {
  const selector = `[data-host-review-slot] [data-agent-review-${decision}]`;
  await ctx.browser.waitFor(`(() => {
    const control = document.querySelector(${JSON.stringify(selector)});
    if (!control?.checkVisibility() || control.disabled) return false;
    control.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    const rect = control.getBoundingClientRect();
    return control.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })()`);
  await ctx.browser.click(selector);
  const confirm = "[data-page-dialog=confirm][open] [type=submit]";
  await ctx.browser.waitFor(`document.querySelector(${JSON.stringify(confirm)})?.checkVisibility()`);
  await ctx.browser.click(confirm);
}
