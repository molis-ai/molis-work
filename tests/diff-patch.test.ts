import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compareRunChangeSet, parseUnifiedDiff, unifiedPatch } from "@molis-ai/molis-work-plugin-diff";

// specs/visual-ui-experience §code-diff「复制代码/补丁内容明确且等真实结果」(VUX-33): what 复制补丁 copies is a patch git takes,
// and applying it to the text before gives exactly the text after.

const view = (before: string | null, after: string) => compareRunChangeSet({
  content: { scope: "run-frozen", run_id: "r", applied: false, coverage: "text-reviews", files: [{ path: "src/a.txt", kind: before === null ? "added" : "modified", added_lines: 0, removed_lines: 0, diff: "",
    review: { review_id: "v", before_text: before, after_text: after, decision: "approved", execution: "applied" } }] } as never,
  source_plugin_id: "c", content_version: 1 }, undefined, 0);

/** Applies the patch with git in a scratch repository and returns the file after. */
function apply(before: string | null, patch: string): string {
  const dir = mkdtempSync(join(tmpdir(), "vux-patch-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    execFileSync("mkdir", ["-p", "src"], { cwd: dir });
    if (before !== null) writeFileSync(join(dir, "src/a.txt"), before);
    writeFileSync(join(dir, "change.patch"), patch);
    execFileSync("git", ["apply", "--whitespace=nowarn", "change.patch"], { cwd: dir });
    return readFileSync(join(dir, "src/a.txt"), "utf8");
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const lines = (count: number, at = (n: number) => `line ${n}`) => Array.from({ length: count }, (_v, i) => at(i + 1) + "\n").join("");

test("VUX-33: the copied patch applies with git and gives exactly the text after", () => {
  const long = lines(40);
  const cases: Array<[string, string | null, string]> = [
    ["one changed line in the middle", long, long.replace("line 20\n", "line twenty\n")],
    ["changes far apart are two hunks", long, long.replace("line 3\n", "three\n").replace("line 35\n", "thirty-five\n")],
    ["changes close together are one hunk", long, long.replace("line 10\n", "ten\n").replace("line 15\n", "fifteen\n")],
    ["lines added at the top", long, "new 1\nnew 2\n" + long],
    ["lines removed at the end", long, lines(36)],
    ["a new file", null, "first\nsecond\n"],
    ["everything removed", "only\nlines\n", ""],
    ["indentation, blank lines and spaces at the ends are kept", "  a\n\n\tb  \n", "  a\n\n\n\tb   \n  "],
    ["no newline at the end, before and after", "a\nb", "a\nc"],
    ["a newline added at the end", "a\nb", "a\nb\n"],
    ["CRLF lines stay CRLF", "a\r\nb\r\nc\r\n", "a\r\nB\r\nc\r\n"],
  ];
  for (const [name, before, after] of cases) {
    const shown = view(before, after);
    const patch = unifiedPatch(shown.rows, { path: "src/a.txt", created: shown.created, removed: shown.removed });
    assert.ok(patch.startsWith(before === null ? "--- /dev/null\n+++ b/src/a.txt\n" : "--- a/src/a.txt\n+++ b/src/a.txt\n"), `${name}: the file header`);
    assert.equal(apply(before, patch), after, `${name}: git applies it and the text after comes out exactly`);
  }
  const two = unifiedPatch(view(long, long.replace("line 3\n", "three\n").replace("line 35\n", "thirty-five\n")).rows, { path: "src/a.txt" });
  assert.deepEqual(two.match(/^@@ .* @@$/gm), ["@@ -1,6 +1,6 @@", "@@ -32,7 +32,7 @@"], "three lines of context around each change");
});

test("VUX-33: a producer's hunks copy as the same hunks, gaps kept, and nothing changed copies nothing", () => {
  const diff = "@@ -10,4 +10,4 @@ fn\n a\n b\n-c\n+C\n d\n@@ -50,3 +50,4 @@\n x\n+y\n z\n w\n";
  const shown = compareRunChangeSet({ content: { scope: "run-frozen", run_id: "r", applied: false, files: [{ path: "src/a.txt", kind: "modified", added_lines: 2, removed_lines: 1, diff }] } as never,
    source_plugin_id: "c", content_version: 1 });
  const patch = unifiedPatch(shown.rows, { path: "src/a.txt" });
  assert.deepEqual(parseUnifiedDiff(patch).map((hunk) => [hunk.before_start, hunk.before_count, hunk.after_start, hunk.after_count]),
    [[10, 4, 10, 4], [50, 3, 50, 4]], "the gap between the two hunks is not bridged");
  assert.deepEqual(parseUnifiedDiff(patch).flatMap((hunk) => hunk.rows), parseUnifiedDiff(diff).flatMap((hunk) => hunk.rows), "the same rows");
  assert.equal(unifiedPatch(view("same\n", "same\n").rows, { path: "src/a.txt" }), "", "nothing changed, nothing to copy");
});
