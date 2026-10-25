import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compareChangeSet, compareRunChangeSet, DIFF_LABELS } from "@molis-ai/molis-work-plugin-diff";
import { renderDiff } from "@molis-ai/molis-work-plugin-sdk/diff-view";
import { GIT_CLIENT_FACTORY_SCRIPT, GIT_SENTENCE_TABLE, headLabel, projectGit, renderGitChanges, sayHostSentence, sayUpstream } from "@molis-ai/molis-work-plugin-git";
import { parsePorcelainStatus } from "@molis-ai/molis-work-plugin-sdk";
import { pageText } from "./fixtures/page-text.js";
import { diffPageText } from "./fixtures/diff-page-text.js";

// specs/visual-ui-experience VUX-40 (English coverage): the sentences Diff and Git write once, in Chinese, with a path, a name or a
// count inside (the path a round didn't change, a rename, a unified diff that can't be read; a remote's host, the files a merge
// stopped on, a branch that already exists) are said again in the page's language. What an Agent reads is unchanged.

const HAN = /[一-鿿]/;
const primitives = (locale: "zh" | "en") => ({ escape: (value: unknown) => String(value), text: diffPageText(locale), icon: () => "" });
const WS = { workspace_id: "ws-1", name: "项目" };
const run = (diff: string) => ({ scope: "run-frozen" as const, run_id: "run-1", applied: false,
  files: [{ path: "a.ts", kind: "modified" as const, added_lines: 1, removed_lines: 1, diff }] });
const shown = (locale: "zh" | "en", view: Parameters<typeof renderDiff>[0]["view"]) => renderDiff({ labels: DIFF_LABELS, view, primitives: primitives(locale), sides: false });

test("VUX-40: Diff's path, rename and unified-diff sentences read in English on the English page and are unchanged for an Agent", () => {
  const input = (diff: string) => ({ content: run(diff), source_plugin_id: "io.molis.work.coding", content_version: 1 });
  const cases: Array<[view: ReturnType<typeof compareRunChangeSet>, zh: string, en: string]> = [
    [compareRunChangeSet(input("@@ -1 +1 @@\n-a\n+b\n"), "src/missing.ts"), "这一轮没有改动 src/missing.ts", "This round didn't change src/missing.ts"],
    [compareRunChangeSet(input("@@ -1,5 +1,5 @@\n a\n")), "hunk 行数与 @@ 头不一致：声明 5/5，实际 1/1", "A hunk's line counts don't match its @@ header: declared 5/5, found 1/1"],
    [compareRunChangeSet(input("@@ nonsense @@\n+x\n")), "读不懂的 hunk 头：@@ nonsense @@", "Can't read this hunk header: @@ nonsense @@"],
    [compareRunChangeSet(input("not a diff\n")), "这段 diff 里没有可读的 hunk", "There is no readable hunk in this diff"],
  ];
  for (const [view, zh, en] of cases) {
    assert.equal(view.message, zh, "the sentence an Agent reads is the one the producer wrote");
    assert.ok(shown("zh", view).includes(zh), `the Chinese page says: ${zh}`);
    const english = shown("en", view);
    assert.ok(english.includes(en), `the English page says: ${en}`);
    assert.doesNotMatch(english.replace(/<[^>]*>/g, ""), HAN, `${en} leaves no Chinese on the English page`);
  }

  // A Git rename and a mode change keep the paths they name; the notice that the text is the same is English too.
  const renamed = compareChangeSet({ content: { workspace: WS, path: ["new name.sh"], before_exists: true, after_exists: true, before: "echo\n", after: "echo\n",
    source: { kind: "comparison", comparison_id: "x" }, git: { before_mode: "100644", after_mode: "100755", previous_path: ["old name.sh"] } },
  source_plugin_id: "io.molis.work.git", content_version: 3 });
  assert.deepEqual(renamed.metadata_changes, ["重命名：old name.sh → new name.sh", "文件权限：新增执行权限（100644 → 100755）", "正文未改变"]);
  const english = shown("en", renamed).replace(/<[^>]*>/g, "");
  for (const line of ["Renamed: old name.sh → new name.sh", "File mode: made executable (100644 → 100755)", "The text is unchanged"]) assert.ok(english.includes(line), line);
  assert.doesNotMatch(english, HAN);
  assert.ok(shown("zh", renamed).includes("重命名：old name.sh → new name.sh"));
});

test("VUX-40: Git's remote and host-name sentences, path-conflict hints and executor refusals read in English", () => {
  const en = pageText("en"), zh = pageText("zh");
  const said = (locale: typeof en, sentence: string) => sayHostSentence(locale, GIT_SENTENCE_TABLE, sentence);
  const cases: Array<[zh: string, en: string]> = [
    ["这个仓库还没有远端", "This repository has no remote yet"],
    ["远端「origin」是本机路径（/tmp/remote.git），不在 GitHub 上；目前只支持经 GitHub CLI 建 PR", "The remote “origin” is a local path (/tmp/remote.git), not on GitHub. Only opening PRs through the GitHub CLI is supported for now."],
    ["远端在 gitlab.example.com，目前只支持经 GitHub CLI 建 PR", "The remote is on gitlab.example.com. Only opening PRs through the GitHub CLI is supported for now."],
    ["可以经 GitHub CLI 在 github.com 建 PR", "You can open a PR on github.com through the GitHub CLI"],
    ["GitHub CLI 还没有登录 github.com；在终端运行 gh auth login 后即可建 PR", "The GitHub CLI isn't signed in to github.com. Run gh auth login in a terminal, then you can open a PR."],
    ["有 2 个文件冲突：a/one.md、b/two.md。在 Git 面板逐个解决并提交，或放弃这次合并。", "2 files have conflicts: a/one.md, b/two.md. Resolve them one by one in the Git panel and commit, or abandon the merge."],
    ["有 1 个文件冲突：notes.md。在 Git 面板逐个解决并提交，或放弃这次合并。", "1 file has conflicts: notes.md. Resolve them one by one in the Git panel and commit, or abandon the merge."],
    ["有 9 个文件冲突：a、b、c、d、e、f、g、h 等。在 Git 面板逐个解决并提交，或放弃这次合并。", "9 files have conflicts: a, b, c, d, e, f, g, h and more. Resolve them one by one in the Git panel and commit, or abandon the merge."],
    ["冲突路径已变化，原操作未执行", "The conflicted path changed, so the operation didn't run"],
    ["分支「feature/x」已经存在", "The branch “feature/x” already exists"],
    ["没有远端「upstream」", "There's no remote “upstream”"],
    ["提交暂存区的 1 个文件", "Commit the 1 staged file"],
    ["提交暂存区的 3 个文件", "Commit the 3 staged files"],
    ["把「feature」合并到「main」", "Merge “feature” into “main”"],
    ["已推送到 origin：main -> main", "Pushed to origin: main -> main"],
    ["已推送到 origin，本地跟踪设置未完成：命令没有成功", "Pushed to origin, but the local tracking setup didn't finish: The command didn't succeed"],
    ["推送结果未确认；请核对以上远端，不要直接重试：操作超过 2 分钟没有完成，已停止；请检查网络或远端后重试", "The push result isn't confirmed. Check the remotes above and don't just retry: The operation didn't finish within 2 minutes and was stopped. Check the network or the remote and try again."],
    ["工作区内容不能作为完整文本差异读取：directory", "The working tree content can't be read as a full text difference: directory"],
    ["解决冲突：docs/a.md", "Resolve the conflict: docs/a.md"],
    ["新建分支「topic」", "New branch “topic”"],
    ["原操作未完成；具体说明保留在宿主审查记录中。", "The operation didn't finish. The details are kept in the host's review record."],
  ];
  for (const [chinese, english] of cases) {
    assert.equal(said(en, chinese), english, chinese);
    assert.equal(said(zh, chinese), chinese, `the Chinese page says it as written: ${chinese}`);
  }
  // Git's own words and a person's names are not touched.
  assert.equal(said(en, "! [rejected] main -> main (fetch first)"), "! [rejected] main -> main (fetch first)");
  assert.equal(said(en, "刷新.md"), "刷新.md", "a file named like a button is not a sentence");

  // The page's code carries the same lookup (the table comes with the bundle) and uses it where it shows the sentences, and times in the page's own language.
  const browser = (file: string) => readFileSync(new URL(`../plugins/native/git/src/browser/${file}`, import.meta.url), "utf8");
  assert.match(browser("source.ts"), /S\(support\.message\)/);
  assert.match(browser("results.ts"), /S\(item\?\.summary \|\| ""\)/);
  assert.ok(GIT_CLIENT_FACTORY_SCRIPT.includes(JSON.stringify(GIT_SENTENCE_TABLE)), "the bundle is given the table the Host's sentences are found by");
  for (const file of ["page.ts", "results.ts", "source.ts", "diff.ts", "list.ts", "conflicts.ts"]) assert.doesNotMatch(browser(file), /\.toLocaleString\(\)/, "dates follow the page's language, not the browser's default");
  assert.match(browser("page.ts"), /when: \(value\) => new Date\(value\)\.toLocaleString\(document\.documentElement\.lang/);
});

test("VUX-40: every sentence the Host's Git code sends to the Git page has an English one", () => {
  // Strings in the Host's Git code that are not sentences the Git page shows: the review card's labels and what it lists (the
  // Agent review surface draws them) and a fallback name. Anything else in these files with Chinese in it has to be said in English.
  const reviewCard = new Set(["仓库", "当前分支", "（分离的 HEAD x）", "提交说明", "暂存的文件", "（完成合并）", "执行范围", "新分支", "（尚无提交）", "未提交的改动", "目标分支",
    "合并进来的分支", "远端跟踪分支", "解决后的内容", "\\n…（其余未显示，将按你编辑的全文写入）", "远端", "推送的提交", "整个分支（远端还没有这个分支）",
    "只提交已暂存的内容，未暂存的改动保持原样；会运行仓库配置的 Git hooks（如有）；不推送远端。", "从当前提交建分支并切换；未提交的改动随你带到新分支，不会丢失。不推送远端。",
    "只建分支，不切换、不推送远端。", "x 个文件；Git 会把它们带到新分支，有冲突时会拒绝切换，不会覆盖", "经 GitHub CLI 在 x 建 PR，使用它已有的登录；不改动本地仓库。",
    "在本地合并，能快进时快进，否则生成合并提交；有冲突时停下，冲突文件留给你在面板里逐个解决。不推送远端。",
    "使用这台电脑上已有的 Git 凭据取回远端，再合并（不变基）；有冲突时停下，冲突文件留给你逐个解决。不推送。",
    "把这个文件写成上面的内容并暂存，标记冲突已解决；其他文件不动，不提交。", "回到合并开始前的状态：冲突文件和已暂存的合并结果都撤回；合并前已提交的内容不受影响。",
    "x 个（远端跟踪分支 x）", "远端比本地多 x 个提交，Git 会拒绝推送；不会强制推送", "推送已审查的提交 x 到以上全部地址；使用已有 Git 凭据，不强制推送x；会运行仓库的 pre-push hook（如有）。",
    "当前仓库", "合并进来的一方", "工作区内容不能作为完整文本差异读取："]);
  const en = pageText("en");
  const base = new URL("../apps/local-host/src/", import.meta.url);
  const left: string[] = [];
  for (const file of ["workspace-git-operations.ts", "workspace-git.ts", "workspace-git-index.ts", "workspace-git-actions.ts"]) {
    const source = readFileSync(new URL(file, base), "utf8");
    for (const [, , body] of source.matchAll(/(["`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) {
      if (!HAN.test(body!)) continue;
      const sample = body!.replace(/\$\{[^}]*\}/g, "x");
      if (reviewCard.has(sample)) continue;
      if (HAN.test(sayHostSentence(en, GIT_SENTENCE_TABLE, sample))) left.push(`${file}: ${sample}`);
    }
  }
  assert.deepEqual([...new Set(left)], [], "a sentence the Host's Git code sends to the page without an English one");
});

test("VUX-40: the Git surface's branch, upstream and status lines read in English; the upstream is fields the page says (⑧)", () => {
  const en = pageText("en"), zh = pageText("zh");
  const view = (record: string) => projectGit({ phase: "ready", status: parsePorcelainStatus({ stdout: `${record}\0` }) });
  // User 2026-10-23 ⑧: the view gives the upstream's name and how far ahead and behind; the page writes the sentence.
  const cases: Array<[record: string, fields: { name: string; ahead: number; behind: number }, zh: string, en: string]> = [
    ["## main...origin/main", { name: "origin/main", ahead: 0, behind: 0 }, "与 origin/main 同步", "Up to date with origin/main"],
    ["## main...origin/main [ahead 2]", { name: "origin/main", ahead: 2, behind: 0 }, "origin/main：领先 2", "origin/main: 2 ahead"],
    ["## main...origin/main [behind 3]", { name: "origin/main", ahead: 0, behind: 3 }, "origin/main：落后 3", "origin/main: 3 behind"],
    ["## main...origin/main [ahead 2, behind 1]", { name: "origin/main", ahead: 2, behind: 1 }, "origin/main：领先 2 · 落后 1", "origin/main: 2 ahead · 1 behind"],
  ];
  for (const [record, fields, chinese, english] of cases) {
    const upstream = view(record).upstream;
    assert.deepEqual(upstream, fields, "what an Agent reads is the upstream's fields");
    assert.equal(sayUpstream(en, upstream), english);
    assert.equal(sayUpstream(zh, upstream), chinese);
  }
  assert.equal(view("## main").upstream, null, "no upstream, no fields");
  assert.equal(sayUpstream(en, null), "");
  assert.equal(sayHostSentence(en, GIT_SENTENCE_TABLE, headLabel({ kind: "detached", commit: "0123456789abcdef" })), "Detached at 01234567");
  const unborn = view("## No commits yet on main");
  assert.equal(sayHostSentence(en, GIT_SENTENCE_TABLE, unborn.head), "main (no commits yet)");
  assert.equal(sayHostSentence(en, GIT_SENTENCE_TABLE, "feature/与 x 同步-not-a-sentence"), "feature/与 x 同步-not-a-sentence", "a branch name is left as it is");
  for (const phase of ["waiting", "loading", "not-a-repository", "unavailable", "error"] as const) {
    const message = projectGit({ phase, status: null }).message;
    assert.doesNotMatch(en(message), HAN, `the ${phase} sentence has an English one`);
  }
  // Both ways the page draws it — the rendered surface and the script's notice line — say it in English.
  const model = { route_prefix: "", view: view("## main...origin/main [ahead 2, behind 1]"), commit_message: "", primitives: primitives("en") };
  const drawn = renderGitChanges(model).replace(/<[^>]*>/g, " ");
  assert.match(drawn, /origin\/main: 2 ahead · 1 behind/);
  assert.match(readFileSync(new URL("../plugins/native/git/src/browser/list.ts", import.meta.url), "utf8"), /\[S\(view\.head\), page\.U\(view\.upstream\)/);
});
