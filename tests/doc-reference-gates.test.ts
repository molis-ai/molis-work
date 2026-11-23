import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  allowlist, append, baseAllowed, branch, commit, contractsManifest, descriptor, gate,
  git, lines, put, read, refreshApiSnapshots, scratch, smallLimits,
} from "./fixtures/doc-reference-gates.js";

test("the clean base passes: archive/ links, fenced and inline code, globs, placeholders and non-owner tokens are not problems", () => {
  git("checkout", "-q", "-f", "main");
  assert.equal(gate("--update").code, 0);
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  // The summary lists the counts of every gate in the order the gates are registered, so each count is matched on its own.
  for (const count of [/2 root strays/, /6 \.impeccable files/]) assert.match(run.out, count);
  assert.equal(gate().code, 0, "and so does the quick check against the committed baseline");
});

test("changes that shrink things pass against the merge-base, and say what got smaller", () => {
  branch("tidy", () => {
    git("rm", "-q", "-r", "leftover.md", "outputs", ".impeccable/review/set-b/1.png");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  for (const count of [/0 root strays/, /5 \.impeccable files/]) assert.match(run.out, count);
  assert.match(run.out, /Lower than the merge-base: rootStrays, impeccable;/);
  assert.equal(gate("--update", "--base", "main").code, 0);
});

test("replacing a screenshot in place keeps the .impeccable count", () => {
  branch("refresh", () => put(".impeccable/review/set-a/1.png", "a refreshed screenshot"));
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("a new root entry named in the allow-list with a reason is a decision made in the open, and passes", () => {
  branch("named", () => {
    put("NOTES.md", "# notes\n");
    put("tooling/gates/root-allowlist.json", allowlist({ ...baseAllowed, "NOTES.md": "scratch notes for the fixture" }));
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("descriptor-only subpaths that something uses, or that carry types, are not placeholders", () => {
  branch("used", () => {
    put("packages/contracts/package.json", contractsManifest(["platform/real", "platform/used", "platform/wired", "platform/idle", "platform/imported", "platform/named", "platform/typed"]));
    put("packages/contracts/src/platform/imported.ts", descriptor("imported"));
    put("apps/host/src/more.ts", lines('import type { importedContract } from "@molis-ai/molis-work-contracts/platform/imported";', "export type More = typeof importedContract;"));
    put("packages/contracts/src/platform/named.ts", descriptor("named"));
    put("packages/other/package.json", JSON.stringify({ "molis-work": { contract: "@molis-ai/molis-work-contracts/platform/named" } }));
    put("packages/contracts/src/platform/typed.ts", descriptor("typed") + "export interface Typed { id: string }\n");
    put("packages/contracts/src/platform/idle.ts", descriptor("idle") + "export const idleValue = 1;\n");
    refreshApiSnapshots();
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("an exception with a reason lets a deliberate citation through, until the citation goes away", () => {
  branch("excepted", () => {
    append("AGENTS.md", "\nA file we plan to add: `docs/planned.md`.\n");
    put("tooling/gates/doc-citation-exceptions.json", JSON.stringify({ "AGENTS.md": { "docs/planned.md": "planned for the next slice" } }));
  });
  assert.equal(gate("--base", "main").code, 0);
  put("AGENTS.md", read("AGENTS.md").replace("\nA file we plan to add: `docs/planned.md`.\n", "\n"));
  commit("the citation goes away");
  const stale = gate("--base", "main");
  assert.equal(stale.code, 1, stale.out);
  assert.match(stale.out, /the exception for `docs\/planned\.md` in AGENTS\.md is not needed any more/);
});

test("an exception for an id works although gate data is quoted in tooling/gates/, and goes stale with its citation", () => {
  branch("excepted-id", () => {
    append("AGENTS.md", "\nA counter-example id: `alpha.counter.v1`.\n");
    put("tooling/gates/doc-citation-exceptions.json", JSON.stringify({ "AGENTS.md": { "alpha.counter.v1": "a deliberate counter-example, not an id" } }));
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  put("AGENTS.md", read("AGENTS.md").replace("\nA counter-example id: `alpha.counter.v1`.\n", "\n"));
  commit("the citation goes away");
  const stale = gate("--base", "main");
  assert.equal(stale.code, 1, stale.out);
  assert.match(stale.out, /the exception for `alpha\.counter\.v1` in AGENTS\.md is not needed any more/);
});

// RAC-2847 / RA4-05: implementation directory changes must preserve the functions action namespace.
for (const directory of ["functions", "judgment-rules"]) {
  test(`RAC-2847 judgment citations preserve rejection and exceptions under modules/${directory}`, () => {
    branch("judgment-citations", () => {
      put("tooling/gates/root-allowlist.json", allowlist({ ...baseAllowed, modules: "business modules" }));
      put(`modules/${directory}/src/actions.ts`, lines(
        'export const run = "functions.run";', 'export const authoring = "authoring.update";'));
      append("AGENTS.md", "\nCall `functions.run` and `functions.authoring.update`. Unknown namespaces stay ignored: `unrelated.missing`.\n");
    });
    const validText = read("AGENTS.md");
    const valid = gate("--base", "main");
    assert.equal(valid.code, 0, valid.out);

    append("AGENTS.md", "\nReject `functions.missing`.\n");
    commit("a misspelled functions action");
    const missing = gate("--base", "main");
    assert.equal(missing.code, 1, missing.out);
    assert.match(missing.out, /`functions\.missing` is not an id the code defines/);

    put("AGENTS.md", validText + "\nCounter-example: `functions.evaluate.v1`. The directory name adds no action namespace: `judgment-rules.missing`.\n");
    put("tooling/gates/doc-citation-exceptions.json", JSON.stringify({
      "AGENTS.md": { "functions.evaluate.v1": "a deliberate counter-example, not an action id" },
    }));
    commit("a still-consumed functions exception");
    const excepted = gate("--base", "main");
    assert.equal(excepted.code, 0, excepted.out);

    put("AGENTS.md", validText);
    commit("the functions counter-example goes away");
    const stale = gate("--base", "main");
    assert.equal(stale.code, 1, stale.out);
    assert.match(stale.out, /the exception for `functions\.evaluate\.v1` in AGENTS\.md is not needed any more/);
  });
}

test("an id declared in a manifest or package.json of a plugin counts as defined", () => {
  branch("manifest-id", () => {
    put("plugins/native/alpha/package.json", JSON.stringify({ name: "alpha", capabilities: ["alpha.declared_in_manifest"] }));
    append("skills/dev/SKILL.md", "\nCall `alpha.declared_in_manifest`.\n");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("a template that is kept matches by shape only: every id of its shape passes, which scripts/gates/README.md lists as a limit", () => {
  branch("template-shape", () => append("skills/dev/SKILL.md", "\nShape only: `alpha.sources.typo`, `alpha.published`, `alpha.content.nothing`.\n"));
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  const readme = readFileSync(fileURLToPath(new URL("../scripts/gates/README.md", import.meta.url)), "utf8");
  assert.match(readme, /模板匹配只认形状/, "if this case starts failing, the gate got stricter: update the limit in README 门禁读不到的 and the header of doc-citations.mjs");
  branch("template-shape-two-part", () => append("skills/dev/SKILL.md", "\nStill caught: `alpha.sources`.\n"));
  const caught = gate("--base", "main");
  assert.equal(caught.code, 1, caught.out);
  assert.match(caught.out, /`alpha\.sources` is not an id the code defines/);
});

test("a spec in the index may carry an anchor, and a heading link may use the heading as GitHub spells it", () => {
  branch("anchors", () => {
    put("specs/README.md", read("specs/README.md").replace("(alpha/spec.md)", "(alpha/spec.md#alpha)"));
    append("docs/next.md", "\n## 侧栏标签（`side`）\n\n## Repeated\n\n## Repeated\n");
    append("docs/guide.md", "\n[a](next.md#侧栏标签side) [b](next.md#repeated-1) [c](next.md#Repeated)\n");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("--report lists the document problems and the new counts", () => {
  branch("report", () => append("docs/guide.md", "\n[gone](missing.md)\n"));
  const text = gate("--report").out;
  assert.match(text, /Root entries outside the allow-list \(tracked files\): 4 in 2 root entries\n  count  entry/);
  assert.match(text, /Tracked \.impeccable files: 6 in 5 groups\n  count  group/);
  assert.match(text, /Document references: 1 problems\n- broken link: docs\/guide\.md:\d+: link missing\.md/);
});

test("the run that introduces the allow-list has nothing to compare it with, and passes", () => {
  scratch("first", () => {
    put("tooling/gates/limits.json", smallLimits);
    put("README.md", "# x\n");
    put("stray.txt", "s\n");
    commit("base without an allow-list");
    git("checkout", "-q", "-b", "adds-allowlist");
    put("tooling/gates/root-allowlist.json", allowlist({ "README.md": "front page" }));
    commit("the allow-list arrives");
    const run = gate("--base", "main");
    assert.equal(run.code, 0, run.out);
    assert.match(run.out, /2 root strays/);
  });
});

test("with no allow-list nothing is a stray: every root folder is read as documentation and can start a cited path", () => {
  scratch("nolist", () => {
    put("tooling/gates/limits.json", smallLimits);
    put("README.md", "# x\n");
    commit("base");
    git("checkout", "-q", "-b", "later");
    put("stuff/b.md", "# b\n\n[gone](missing.md)\n");
    put("AGENTS.md", "# Agents\n\nSee `stuff/gone.txt`.\n");
    commit("later");
    const run = gate("--base", "main");
    assert.equal(run.code, 1, run.out);
    assert.match(run.out, /broken link: stuff\/b\.md:\d+: link missing\.md points at stuff\/missing\.md/);
    assert.match(run.out, /bad citation: AGENTS\.md:\d+: `stuff\/gone\.txt` points at stuff\/gone\.txt/);
  });
});

test("a repository without docs, specs or an allow-list has nothing for the document gates to say", () => {
  scratch("bare", () => {
    put("tooling/gates/limits.json", smallLimits);
    put("packages/alpha/src/index.ts", "export const alpha = 1;\n");
    commit("base");
    git("checkout", "-q", "-b", "later");
    put("packages/alpha/src/index.ts", "export const alpha = 2;\n");
    commit("later");
    const run = gate("--base", "main");
    assert.equal(run.code, 0, run.out);
  });
});
