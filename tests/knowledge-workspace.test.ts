import assert from "node:assert/strict";
import test from "node:test";

import { knowledgeActions } from "@molis-ai/molis-work-contracts/services/knowledge";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { nameMatches, pathPattern } from "@molis-ai/molis-work-service-knowledge";
import { knowledgeWorkspace } from "./fixtures/knowledge-workspace.js";

// specs/project-knowledge K0b: the project's linked folders found by path and read line by line, through the Host's workspace read.

test("PMAT-13 path patterns: * stays in a folder, ** crosses folders, braces give alternatives, hidden names need a dot", () => {
  const ts = pathPattern("src/**/*.{ts,tsx}")!;
  assert.deepEqual([ts.matches(["src", "index.ts"]), ts.matches(["src", "lib", "a.tsx"]), ts.matches(["src", "a.md"]), ts.matches(["test", "a.ts"])], [true, true, false, false]);
  assert.deepEqual(ts.starts, [["src"]]);
  assert.deepEqual([ts.mayContain(["src", "lib"]), ts.mayContain(["docs"])], [true, false]);
  const top = pathPattern("*.md")!;
  assert.deepEqual([top.matches(["README.md"]), top.matches(["docs", "a.md"]), top.mayContain(["docs"])], [true, false, false]);
  const any = pathPattern("**/*")!;
  assert.deepEqual([any.matches([".env"]), any.matches(["a", ".hidden", "b"]), pathPattern("**/.env")!.matches(["x", ".env"])], [false, false, true]);
  assert.equal(pathPattern("**/node_modules/**")!.names("node_modules"), true);
  assert.equal(any.names("node_modules"), false);
  for (const bad of ["", "/etc/*", "../*", "src/../../x"]) assert.equal(pathPattern(bad), null, bad);
  assert.equal(nameMatches("a*b*c", "a".repeat(5_000) + "x"), false, "a long name against stars stays linear");
});

test("PMAT-13 knowledge.glob lists matching files in the linked folder and skips built, fetched and dot folders unless named", async t => {
  const f = await knowledgeWorkspace(t);
  const found = await f.knowledge.glob(f.access(f.agent()), { pattern: "**/*.ts" });
  assert.deepEqual(found.files.map(file => file.path).sort(), ["src/index.ts", "src/lib/util.ts"]);
  assert.deepEqual(found.files[0]!.subject.kind, "workspace_file");
  assert.equal(found.more, false);
  const named = await f.knowledge.glob(f.access(f.agent()), { pattern: "node_modules/**/*.ts" });
  assert.deepEqual(named.files.map(file => file.path), ["node_modules/dep/index.ts"], "a skipped folder is entered when the pattern names it");
  const dot = await f.knowledge.glob(f.access(f.agent()), { pattern: ".github/*" });
  assert.deepEqual(dot.files.map(file => file.path), [".github/ci.yml"]);
  const limited = await f.knowledge.glob(f.access(f.agent()), { pattern: "**/*", limit: 1 });
  assert.deepEqual([limited.files.length, limited.more], [1, true], "the limit says there is more instead of cutting silently");
});

test("PMAT-13 knowledge.read, outline and grep take a workspace file; grep finds lines in the files a glob matches", async t => {
  const f = await knowledgeWorkspace(t);
  const access = f.access(f.agent());
  const [index] = (await f.knowledge.glob(access, { pattern: "src/index.ts" })).files;
  const read = await f.knowledge.read(access, { subject: index!.subject });
  assert.equal(read.text, "export const answer = 42;\n// 内测通行证 MW-0042\n");
  assert.match(read.revision, /^[0-9a-f]{64}$/u, "the revision is the file's fingerprint");
  assert.equal((await f.knowledge.outline(access, { subject: index!.subject })).title, "src/index.ts");
  const grep = await f.knowledge.grep(access, { pattern: "内测通行证", glob: "**/*" });
  assert.deepEqual(grep.matches.map(match => [match.subject.id, match.line]).sort(), [["ws1:src/index.ts", 2], ["ws1:src/lib/util.ts", 1]]);
  assert.deepEqual(grep.unread.map(item => [item.subject.id, item.reason]), [["ws1:src/logo.png", "这是二进制文件，没有文字可读"]]);
  assert.equal((await f.knowledge.grep(access, { pattern: "x" })).catalog, true, "with neither subjects nor glob, grep looks through the catalog (PMAT-29)");
});

test("PMAT-01 knowledge.glob is declared once with the other knowledge actions, read-only and concurrent", () => {
  assert.deepEqual(inspectActionDeclarations([knowledgeActions.glob], undefined), []);
  assert.deepEqual([knowledgeActions.glob.action.effect, knowledgeActions.glob.action.scheduling, knowledgeActions.glob.operation], ["read", "concurrent", "query"]);
});
