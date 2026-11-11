import assert from "node:assert/strict";
import test from "node:test";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";
import { CODING_COMPOSER, CODING_OPEN } from "./fixtures/coding-composer.js";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { projectOutputOf, readProjectDirectories } from "./fixtures/project-directories-http.js";
import { TEXT_WRAP_AUDIT, type TextWrapIssue } from "./fixtures/text-wrap-audit.js";

// specs/visual-ui-experience VUX-40「中英文…不溢出、不混排」: a page shown in English says everything it says itself in English.
// Goals' status words (the projection words them in Chinese), Jelly's fixed "uncategorized" category, and the Files, Git,
// Diff and Text Stats pages with the shell around them used to stay Chinese in English. What a person wrote (Goal titles,
// project names) is theirs and is not checked. The same places in Chinese still say it in Chinese, and the longer English
// fits where the Chinese did. The Coding page's markup (its dialogs, composer, results and settings, which the Host draws
// before Coding's script fills them) is checked the same way, hidden parts included, and then the page as Coding's own script
// fills it: with no session open and with a fresh one, its attach menu and results column showing.

/** Visible text and labels with Chinese characters inside the elements `selector` finds. */
const HAN_IN = (selector: string) => `(() => {
  const out = [], han = /[\\u4e00-\\u9fff]/;
  for (const scope of document.querySelectorAll(${JSON.stringify(selector)})) {
    if (!scope.checkVisibility()) continue;
    const walk = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node; (node = walk.nextNode());) if (han.test(node.data) && node.parentElement.checkVisibility()) out.push(node.data.trim());
    for (const el of [scope, ...scope.querySelectorAll('[aria-label], [title], [placeholder]')]) for (const name of ['aria-label', 'title', 'placeholder']) {
      const value = el.getAttribute(name); if (value && han.test(value) && el.checkVisibility()) out.push('@' + name + ' ' + value);
    }
  }
  return [...new Set(out)];
})()`;

test("VUX-40: Goals statuses, Jelly's fixed category and the Files, Git, Diff and Text Stats pages speak English in English", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { navigate, command, sessionId, origin, projectId } = browser;
  assert.ok(projectId);
  const initialDirectories = await readProjectDirectories(browser.web, projectId);
  assert.equal(initialDirectories.default_output_made, false);
  const views = Object.fromEntries(await Promise.all(["jelly", "files", "git", "diff", "text-stats", "coding"].map(async id => [id, await pluginFrameBrowser(t, browser, id)])));
  let active: Pick<typeof browser, "evaluate" | "waitFor"> = browser;
  const evaluate: typeof browser.evaluate = (...args) => active.evaluate(...args);
  const waitFor: typeof browser.waitFor = (...args) => active.waitFor(...args);
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  const open = async (plugin: string, ready: string) => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=${plugin}` }, sessionId));
    active = views[plugin] ?? browser;
    await waitFor(ready, 30_000);
  };
  // Each page's own words: where they are and when it has drawn them.
  const pages: Array<[plugin: string, ready: string, selector: string, zh: string]> = [
    ["goals", "document.querySelectorAll('.goal-status').length > 3", ".goal-status", "正在推进"],
    ["jelly", "document.querySelector('[data-jelly-category-filters] [data-jelly-filter=uncategorized]')", "[data-jelly-category-filters]", "未分类"],
    ["files", "document.querySelector('[data-companion=files] [data-files-browser]:not([hidden])')", "[data-companion=files]", "项目的当前目录"],
    ["git", "document.querySelector('[data-companion=git] [data-git-status]')?.textContent", "[data-companion=git]", "Git 改动"],
    ["diff", "document.querySelector('[data-companion=diff] [data-companion-content] .mw-empty')", "[data-companion=diff]", "打开 Files"],
    ["text-stats", "document.querySelector('[data-companion=text-stats] [data-companion-content] .mw-empty')", "[data-companion=text-stats]", "固定一份文件快照后"],
  ];
  for (const [plugin, ready, selector, zh] of pages) {
    await open(plugin, ready);
    if (plugin === "git") await waitFor("document.querySelector('[data-git-status]')?.textContent === '这个文件夹还没有建立，不是 Git 仓库'");
    assert.ok((await evaluate<string>(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((el) => el.textContent).join(' ')`)).includes(zh), `${plugin} in Chinese says 「${zh}」`);
  }
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=en&next=%2F` }, sessionId));
  for (const [plugin, ready, selector] of pages) {
    await open(plugin, ready);
    if (plugin === "git") await waitFor("document.querySelector('[data-git-status]')?.textContent === 'This folder hasn’t been made yet, so it isn’t a Git repository'");
    assert.deepEqual(await evaluate<string[]>(HAN_IN(selector)), [], `${plugin} in English`);
    // The English is longer: none of it runs out of its box.
    assert.deepEqual((await evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT)).filter((issue) => issue.kind === "spill"), [], `${plugin} in English fits`);
  }
  assert.equal((await readProjectDirectories(browser.web, projectId)).default_output_made, false, "viewing Git never creates the project’s default output");
  await mkdir(projectOutputOf(initialDirectories).canonical_path, { recursive: true });
  await open("git", "document.querySelector('[data-git-status]')?.textContent.includes('not a git repository')");
  assert.match(await evaluate<string>("document.querySelector('[data-git-status]').textContent"), /not a git repository/i);
  assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-git-status]').textContent"), /hasn’t been made/u);
  await open("goals", pages[0]![1]);
  assert.ok((await evaluate<string>("[...document.querySelectorAll('.goal-status')].map((el) => el.textContent).join('|')")).includes("In progress"));
});

test("VUX-40: with a real repository, Git's changes, branches, commit and conflict tools and the Files reader speak English", { timeout: 240_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { navigate, command, sessionId, origin, projectId, homeDirectory } = browser;
  const views = Object.fromEntries(await Promise.all(["files", "git"].map(async id => [id, await pluginFrameBrowser(t, browser, id)])));
  let active: Pick<typeof browser, "evaluate" | "waitFor" | "click"> = browser;
  const evaluate: typeof browser.evaluate = (...args) => active.evaluate(...args);
  const waitFor: typeof browser.waitFor = (...args) => active.waitFor(...args);
  const click: typeof browser.click = (...args) => active.click(...args);
  // A repository with one commit, one staged change and one that is not, so every list and the source-control tools show.
  const repo = join(homeDirectory, "english-repo");
  const remote = join(homeDirectory, "english-remote.git");
  await mkdir(repo, { recursive: true });
  const git = (...args: string[]) => execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args], { cwd: repo });
  git("init", "-q", "-b", "main");
  await writeFile(join(repo, "notes.md"), "first\n"); await writeFile(join(repo, "todo.md"), "one\n");
  await writeFile(join(repo, "keep.md"), Array.from({ length: 12 }, (_, line) => `line ${line}\n`).join(""));
  // A remote that is a folder on this computer, so the pull-request note names it (VUX-40: the sentence has a remote's name and path in it).
  git("remote", "add", "origin", remote);
  git("add", "."); git("commit", "-q", "-m", "start");
  await writeFile(join(repo, "notes.md"), "first\nsecond\n"); git("add", "notes.md");
  await writeFile(join(repo, "todo.md"), "one\ntwo\n");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=en&next=%2F` }, sessionId));
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await click(".navigator-project-settings");
  await waitFor("!!document.querySelector('[data-directory-panel=project-settings] [data-settings-section=workspaces]')");
  await click("[data-directory-panel=project-settings] [data-settings-section=workspaces]");
  await waitFor("!!document.querySelector('[data-directories-add]') && document.querySelector('[data-project-directories]')?.dataset.state==='ready'");
  await evaluate(`(()=>{const node=document.querySelector('[data-directories-add] [name=path]');node.value=${JSON.stringify(repo)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await click("[data-directories-add] [type=submit]");
  await waitFor("document.querySelector('[data-directories-inputs]').textContent.includes('english-repo')");
  await click("[data-directories-inputs] [data-directory-row]:has([title$='/english-repo']) [data-act=set-output]");
  await waitFor("document.querySelector('[data-directories-output] [data-directory-row] [data-text=path]')?.title.endsWith('/english-repo')");

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=git` }, sessionId));
  active = views.git!;
  await waitFor("document.querySelector('[data-companion=git] [data-git-sc]:not([hidden])') && document.querySelectorAll('[data-companion=git] [data-git-path]').length === 2", 30_000);
  await evaluate(`(() => {
    window.gitPrAnswers = [];
    globalThis.molisWorkRequest = new Proxy(globalThis.molisWorkRequest, { apply(request, receiver, args) {
      const pending = Reflect.apply(request, receiver, args);
      if (!String(args[0]).includes('/pr-support')) return pending;
      return pending.then(answer => { gitPrAnswers.push(answer); return answer; });
    } });
  })()`);
  // The branch form, the PR form and one change opened: what they say is the page's too.
  await click("[data-companion=git] [data-git-branch-toggle]");
  await click("[data-companion=git] [data-git-pr-toggle]");
  await waitFor("(t => t && !t.startsWith('Checking'))(document.querySelector('[data-companion=git] [data-git-pr-support]').textContent)", 20_000);
  await click("[data-companion=git] [data-git-path]");
  await waitFor("document.querySelector('[data-companion=git] [data-git-index-action]:not([hidden])')", 20_000);
  assert.deepEqual(await evaluate<string[]>(HAN_IN("[data-companion=git]")), [], "Git in English");
  assert.match(await evaluate<string>("document.querySelector('[data-companion=git] [data-git-pr-support]').textContent"), /^The remote “origin” is a local path \(.*english-remote\.git\), not on GitHub\./, "VUX-40: the note names the remote and its path in English");
  assert.deepEqual(await evaluate("gitPrAnswers.at(-1)"), { outcome: "pr-support", tool: "unsupported", host: null,
    message: `远端「origin」是本机路径（${remote}），不在 GitHub 上；目前只支持经 GitHub CLI 建 PR`, local_remote: { name: "origin", url: remote } });
  assert.equal(await evaluate("document.querySelector('[data-git-pr-create]').disabled"), true);
  assert.equal(await evaluate("document.querySelector('[data-companion=git] [data-git-commit]').textContent"), "Commit 1 staged file…", "one staged file reads as one (VUX-40 counts)");
  git("add", "todo.md");
  await click("[data-companion=git] [data-git-refresh]");
  await waitFor("document.querySelector('[data-companion=git] [data-git-commit]').textContent === 'Commit 2 staged files…'", 20_000);
  // A staged rename: the pinned comparison names both paths in English (VUX-40), and nothing on the page stays Chinese.
  git("mv", "keep.md", "kept.md");
  await click("[data-companion=git] [data-git-refresh]");
  await waitFor("document.querySelector('[data-companion=git] [data-git-commit]').textContent === 'Commit 3 staged files…'", 20_000);
  await click(`[data-companion=git] [data-git-path='${JSON.stringify([["kept.md"], "index"])}']`);
  await waitFor("document.querySelector('[data-companion=git] [data-git-diff] .mw-diff-notices')", 20_000);
  assert.ok((await evaluate<string>("document.querySelector('[data-companion=git] [data-git-diff] .mw-diff-notices').textContent")).includes("Renamed: keep.md → kept.md"), "VUX-40: the rename is said in English");
  assert.deepEqual(await evaluate<string[]>(HAN_IN("[data-companion=git]")), [], "Git in English, with a rename open");

  const readPR = async (tool: string, host: string | null, original: string, display: string) => {
    const count = await evaluate<number>("gitPrAnswers.length");
    const toggle = "[data-companion=git] [data-git-pr-toggle]";
    await click(toggle); await click(toggle);
    await waitFor(`gitPrAnswers.length === ${count + 1} && document.querySelector('[data-git-pr-support]').textContent === ${JSON.stringify(display)}`);
    assert.deepEqual(await evaluate("gitPrAnswers.at(-1)"), { outcome: "pr-support", tool, host, message: original });
    assert.equal(await evaluate("document.querySelector('[data-git-pr-create]').disabled"), tool !== "ready");
  };
  git("remote", "remove", "origin");
  await readPR("unsupported", null, "这个仓库还没有远端", "This repository has no remote yet");
  git("remote", "add", "origin", "https://gitlab.example.com/acme/demo.git");
  await readPR("unsupported", "gitlab.example.com", "远端在 gitlab.example.com，目前只支持经 GitHub CLI 建 PR", "The remote is on gitlab.example.com. Only opening PRs through the GitHub CLI is supported for now.");
  git("remote", "set-url", "origin", "https://github.com/acme/demo.git");
  const bin = join(homeDirectory, "fixture-bin"), gh = join(bin, "gh"), originalPath = process.env.PATH;
  await mkdir(bin);
  const cli = (version: number, auth: number) => writeFile(gh, `#!/bin/sh\ncase "$*" in\n  --version) exit ${version};;\n  "auth status --hostname github.com") exit ${auth};;\nesac\nexit 99\n`, { mode: 0o755 });
  try {
    await cli(127, 1); process.env.PATH = bin + delimiter + originalPath;
    await readPR("missing", "github.com", "这台电脑没有安装 GitHub CLI（gh），装好并登录后即可建 PR", "GitHub CLI (gh) isn’t installed on this computer. Install it and sign in, then you can open a PR.");
    await cli(0, 1);
    await readPR("unauthenticated", "github.com", "GitHub CLI 还没有登录 github.com；在终端运行 gh auth login 后即可建 PR", "The GitHub CLI isn’t signed in to github.com. Run gh auth login in a terminal, then you can open a PR.");
    await cli(0, 0);
    await readPR("ready", "github.com", "可以经 GitHub CLI 在 github.com 建 PR", "You can open a PR on github.com through the GitHub CLI");
  } finally { process.env.PATH = originalPath; }

  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/?openPlugin=files` }, sessionId));
  active = views.files!;
  await waitFor("document.querySelectorAll('[data-companion=files] [data-file-path]').length >= 2", 30_000);
  await click(`[data-companion=files] [data-file-path='${JSON.stringify(["notes.md"])}']`);
  await waitFor("!document.querySelector('[data-companion=files] [data-files-text]').hidden", 20_000);
  assert.deepEqual(await evaluate<string[]>(HAN_IN("[data-companion=files]")), [], "Files reader in English");
  assert.deepEqual((await evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT)).filter((issue) => issue.kind === "spill"), [], "Files reader in English fits");
});

/** Chinese in the markup the Host sent for `selector` (text, every attribute and template contents, shown or not). */
const HAN_IN_MARKUP = (url: string, selector: string) => `(async () => {
  const page = new DOMParser().parseFromString(await (await fetch(${JSON.stringify(url)})).text(), 'text/html');
  for (const node of page.querySelectorAll('script[data-plugin-document]')) { const parsed = new DOMParser().parseFromString(JSON.parse(node.textContent), 'text/html'); node.parentElement.replaceWith(...parsed.body.childNodes); }
  const out = [], han = /[\\u4e00-\\u9fff]/, scopes = [...page.querySelectorAll(${JSON.stringify(selector)})];
  for (const t of [...scopes.flatMap((scope) => [...scope.querySelectorAll('template')])]) scopes.push(t.content);
  for (const scope of scopes) {
    const walk = page.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node; (node = walk.nextNode());) if (han.test(node.data)) out.push(node.data.trim());
    for (const el of [...(scope.attributes ? [scope] : []), ...scope.querySelectorAll('*')]) for (const { name, value } of el.attributes) if (han.test(value)) out.push('@' + name + ' ' + value);
  }
  return { found: scopes.length > 0, han: [...new Set(out)] };
})()`;

test("VUX-40: the Coding page, its own script's words and Coding settings speak English in English", { timeout: 120_000 }, async (t) => {
  const browser = await openGoalBrowser(t, "seeded"); if (!browser) return;
  const { navigate, command, sessionId, origin, projectId } = browser;
  const views = Object.fromEntries(await Promise.all(["jelly", "files", "git", "diff", "text-stats", "coding"].map(async id => [id, await pluginFrameBrowser(t, browser, id)])));
  let active: Pick<typeof browser, "evaluate" | "waitFor"> = browser;
  const evaluate: typeof browser.evaluate = (...args) => active.evaluate(...args);
  const waitFor: typeof browser.waitFor = (...args) => active.waitFor(...args);
  const coding = `${origin}/projects/${projectId}/?openPlugin=coding`, settings = `${origin}/settings/coding-settings?project=${projectId}`;
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  const zh = await evaluate<{ found: boolean; han: string[] }>(HAN_IN_MARKUP(coding, "[data-coding-workbench]"));
  assert.ok(zh.found && zh.han.includes("和 Agent 一起写代码"), "Coding in Chinese says 「和 Agent 一起写代码」");
  assert.ok((await evaluate<{ han: string[] }>(HAN_IN_MARKUP(settings, "[data-coding-settings]"))).han.includes("内置执行方式"));
  await navigate(() => command("Page.navigate", { url: `${origin}/locale?lang=en&next=%2F` }, sessionId));
  assert.deepEqual(await evaluate(HAN_IN_MARKUP(coding, "[data-coding-workbench]")), { found: true, han: [] }, "Coding in English");
  // The project's name is the person's own; the line around it is English.
  const inSettings = await evaluate<{ found: boolean; han: string[] }>(HAN_IN_MARKUP(settings, "[data-coding-settings]"));
  assert.deepEqual(inSettings.han.filter((line) => !/^Current project: .+ ·$/.test(line)), [], "Coding settings in English");
  assert.equal(inSettings.han.length, 1, "the current project line is there, in English");
  // Coding's own script fills the page in English too: the session list, the composer's controls and the results column.
  await navigate(() => command("Page.navigate", { url: coding }, sessionId));
  active = views.coding!;
  // Coding's page has started: its composer is mounted as a receiver of the bar (no session open, the bar stays the Assistant's).
  await waitFor("Boolean(document.querySelector('[data-coding-input][data-composer-remote]'))", 30_000);
  assert.deepEqual(await evaluate(HAN_IN("[data-coding-workbench]")), [], "Coding with no session open, in English");
  assert.ok((await evaluate<string>("document.querySelector('[data-coding-workbench] .coding-start').textContent")).includes("Write code with an Agent"));
  // A fresh session: the welcome, the composer and its menus, the results column.
  await evaluate("document.querySelector('.coding-start [data-coding-new]').click()");
  await waitFor("Boolean(document.querySelector('[data-coding-welcome]'))", 30_000);
  // The composer is the workbench bar's (one input), in the session's own words: its ＋ menu is the bar's.
  await browser.waitFor(CODING_OPEN, 30_000);
  await browser.evaluate(`document.querySelector('${CODING_COMPOSER} [data-composer-add]').click()`);
  await evaluate("document.querySelector('[data-coding-results-open]').click()");
  assert.deepEqual(await evaluate(HAN_IN("[data-coding-workbench]")), [], "a fresh Coding session and its results, in English");
  assert.deepEqual(await browser.evaluate(HAN_IN(CODING_COMPOSER)), [], "the bar's composer for the session and its ＋ menu, in English");
  // Words Coding's script writes itself, not the Host's markup.
  assert.deepEqual([await evaluate<string>("document.querySelector('[data-coding-goal-label]').textContent"), await browser.evaluate<string>(`document.querySelector('${CODING_COMPOSER} [data-composer-send]').textContent`)], ["No goal for the next turn", "Send"]);
  assert.deepEqual((await evaluate<TextWrapIssue[]>(TEXT_WRAP_AUDIT)).filter((issue) => issue.kind === "spill"), [], "Coding in English fits");
});
