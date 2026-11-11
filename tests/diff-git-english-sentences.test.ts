import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compareChangeSet, compareRunChangeSet, DIFF_UI_CONTRIBUTION_ID, diffUiContribution, type DiffView } from "@molis-ai/molis-work-plugin-diff";
import { GIT_CLIENT_FACTORY_SCRIPT, headLabel, projectGit, renderGitChanges, sayUpstream } from "@molis-ai/molis-work-plugin-git";
import { parsePorcelainStatus } from "@molis-ai/molis-work-plugin-sdk";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { pageText, withPageText } from "./fixtures/page-text.js";
import { diffPageText } from "./fixtures/diff-page-text.js";

// VUX-40: the owner's fixed words take the original paths, names and counts as arguments. The action keeps the source facts.

const HAN = /[一-鿿]/;
const primitives = (locale: "zh" | "en") => ({ escape: escapeHtml, text: diffPageText(locale), icon: () => "" });
const WS = { workspace_id: "ws-1", name: "项目" };
const run = { scope: "run-frozen" as const, run_id: "run-1", applied: false, coverage: "text-reviews" as const,
  origin: { session_id: "s", runtime_session_id: "r", workspace_id: "w", workspace_name: "w" },
  files: [{ path: "a.ts", kind: "modified" as const, added_lines: 1, removed_lines: 1, diff: "",
    review: { review_id: "v", before_text: "a\n", after_text: "b\n", decision: "approved" as const, execution: "applied" as const } }] };
const shown = (locale: "zh" | "en", view: DiffView) => diffUiContribution.render({
  contribution_id: DIFF_UI_CONTRIBUTION_ID, surface: "comparison", model: { view, primitives: primitives(locale), sides: false },
});

test("VUX-40: Diff's path and rename sentences read in English on the English page and are unchanged for an Agent", () => {
  const input = { content: run, source_plugin_id: "io.molis.work.coding", content_version: 1 };
  const cases: Array<[view: ReturnType<typeof compareRunChangeSet>, zh: string, en: string]> = [
    [compareRunChangeSet(input, "src/missing.ts"), "这一轮没有改动 src/missing.ts", "This turn didn’t change src/missing.ts"],
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

test("VUX-40: Git’s fixed sentences keep names, paths and plural counts", () => {
  const en = pageText("en", "git"), zh = pageText("zh", "git");
  const cases: Array<[key: string, args: Record<string, string | number>, chinese: string, english: string]> = [
    ["git.host.conflicts", { count: 2, files: "a/one.md、b/two.md" }, "有 2 个文件冲突：a/one.md、b/two.md。在 Git 面板逐个解决并提交，或放弃这次合并。",
      "2 files have conflicts: a/one.md、b/two.md. Resolve them one by one in the Git panel and commit, or abandon the merge."],
    ["git.host.conflicts", { count: 1, files: "notes.md" }, "有 1 个文件冲突：notes.md。在 Git 面板逐个解决并提交，或放弃这次合并。",
      "1 file has conflicts: notes.md. Resolve them one by one in the Git panel and commit, or abandon the merge."],
    ["git.host.conflicts-more", { count: 9, files: "a、b、c、d、e、f、g、h" }, "有 9 个文件冲突：a、b、c、d、e、f、g、h 等。在 Git 面板逐个解决并提交，或放弃这次合并。",
      "9 files have conflicts: a、b、c、d、e、f、g、h and more. Resolve them one by one in the Git panel and commit, or abandon the merge."],
    ["git.host.branch-exists", { name: "feature/x" }, "分支「feature/x」已经存在", "The branch “feature/x” already exists"],
    ["git.host.no-remote", { remote: "upstream" }, "没有远端「upstream」", "There’s no remote “upstream”"],
    ["git.host.sum-commit", { count: 1 }, "提交暂存区的 1 个文件", "Commit the 1 staged file"],
    ["git.host.sum-commit", { count: 3 }, "提交暂存区的 3 个文件", "Commit the 3 staged files"],
    ["git.host.sum-merge", { branch: "feature", into: "main" }, "把「feature」合并到「main」", "Merge “feature” into “main”"],
    ["git.host.done-push", { name: "origin", ref: "main -> main" }, "已推送到 origin：main -> main", "Pushed to origin: main -> main"],
    ["git.host.push-track-failed", { name: "origin", reason: "命令没有成功" }, "已推送到 origin，本地跟踪设置未完成：命令没有成功", "Pushed to origin, but the local tracking setup didn’t finish: 命令没有成功"],
    ["git.host.push-unconfirmed", { reason: "操作超过 2 分钟没有完成，已停止；请检查网络或远端后重试" }, "推送结果未确认；请核对以上远端，不要直接重试：操作超过 2 分钟没有完成，已停止；请检查网络或远端后重试",
      "The push result isn’t confirmed. Check the remotes above and don’t just retry: 操作超过 2 分钟没有完成，已停止；请检查网络或远端后重试"],
    ["git.host.read-unsupported", { reason: "directory" }, "工作区内容不能作为完整文本差异读取：directory", "The working tree content can’t be read as a full text difference: directory"],
    ["git.op.resolve-file", { path: "docs/a.md" }, "解决冲突：docs/a.md", "Resolve the conflict: docs/a.md"],
    ["git.op.create-branch", { name: "topic" }, "新建分支「topic」", "New branch “topic”"],
  ];
  for (const [key, args, chinese, english] of cases) {
    assert.equal(zh(key, args), chinese, key);
    assert.equal(en(key, args), english, key);
  }
});

test("VUX-40: Git renders original refusals and paths without reading them as keys", () => {
  const messages = ["! [rejected] main -> main (fetch first)", "冲突路径已变化，原操作未执行", "原操作未完成；具体说明保留在宿主审查记录中。", "刷新.md"];
  for (const locale of ["zh", "en"] as const) withPageText(locale, ["git"], () => {
    const p = { ...primitives(locale), text: pageText(locale, "git") };
    for (const message of messages) {
      const view = projectGit({ phase: "error", status: null, message });
      assert.equal(view.message, message);
      assert.ok(renderGitChanges({ route_prefix: "", view, commit_message: "", primitives: p }).includes(escapeHtml(message)));
    }
  });
  assert.doesNotMatch(GIT_CLIENT_FACTORY_SCRIPT, /sayHostSentence|GIT_SENTENCE_TABLE/);
  const browser = (file: string) => readFileSync(new URL(`../plugins/native/git/src/browser/${file}`, import.meta.url), "utf8");
  for (const file of ["page.ts", "results.ts", "source.ts", "diff.ts", "list.ts", "conflicts.ts"]) assert.doesNotMatch(browser(file), /\.toLocaleString\(\)/, "dates follow the page's language, not the browser's default");
  assert.match(browser("page.ts"), /when: \(value\) => format\.date\(value, "datetime-with-seconds"\)/u);
});

test("VUX-40: the Git surface's branch, upstream and status lines read in English; the upstream is fields the page says (⑧)", () => {
  const en = pageText("en", "git"), zh = pageText("zh", "git");
  const view = (record: string) => withPageText("en", ["git"], () => projectGit({ phase: "ready", status: parsePorcelainStatus({ stdout: `${record}\0` }) }));
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
  assert.equal(withPageText("en", ["git"], () => headLabel({ kind: "detached", commit: "0123456789abcdef" })), "Detached at 01234567");
  const unborn = view("## No commits yet on main");
  assert.equal(unborn.head, "main (no commits yet)");
  assert.equal(view("## feature/与 x 同步-not-a-sentence").head, "feature/与 x 同步-not-a-sentence", "a branch name is left as it is");
  for (const phase of ["waiting", "loading", "not-a-repository", "unavailable", "error"] as const) {
    const message = withPageText("en", ["git"], () => projectGit({ phase, status: null }).message);
    assert.doesNotMatch(message, HAN, `the ${phase} sentence has an English one`);
    assert.notEqual(message, "This text cannot be shown right now", phase);
  }
  // Both ways the page draws it — the rendered surface and the script's notice line — say it in English.
  const model = { route_prefix: "", view: view("## main...origin/main [ahead 2, behind 1]"), commit_message: "", primitives: { ...primitives("en"), text: en } };
  const drawn = withPageText("en", ["git"], () => renderGitChanges(model)).replace(/<[^>]*>/g, " ");
  assert.match(drawn, /origin\/main: 2 ahead · 1 behind/);
  assert.match(readFileSync(new URL("../plugins/native/git/src/browser/list.ts", import.meta.url), "utf8"), /\[\(view\.head\), page\.U\(view\.upstream\)/);
});
