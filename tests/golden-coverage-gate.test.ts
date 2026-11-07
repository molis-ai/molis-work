// UPG2-04 and the 50 MB rule (scripts/gates/golden-homes.mjs; specs/upgrade-continuity/golden-replay-design.md §5, §6): what the gate refuses, one way each, on a small
// tree written here, and that the repository's own tree passes. How CI reports a replay that left the signed samples out is at the end (scripts/ci-golden-replay.mjs).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { reported } from "../scripts/ci-golden-replay.mjs";
import { GOLDEN_BYTES_LIMIT, goldenHomeProblems, pathMatcher, requiredRows } from "../scripts/gates/golden-homes.mjs";
import { versionsNewestLast } from "../scripts/golden/versions.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const DATA = `## 3. SQLite 权威库

### 3.2 助理与平台服务

| 路径 | owner 与打开它的代码 | 种类 · 版本 | 备份 | 卸载 |
| --- | --- | --- | --- | --- |
| \`memory/memory.db\` | x | y | 必备份 | purge |
| \`agent-declarations/agent-declarations.db\` | x | y | 可重建（插件下次启动时重新登记） | purge |

### 3.3 个人插件库

| 路径 | owner 与打开它的代码 | 版本 · 日志 | 表 |
| --- | --- | --- | --- |
| \`todo/todo.db\` | x | y | z |

## 4. 共享文件里的表归谁

| 路径 | owner 与打开它的代码 | 种类 · 版本 | 备份 | 卸载 |
| --- | --- | --- | --- | --- |
| \`not/a/row.db\` | x | y | 必备份 | purge |

## 6. 非 SQLite 状态

### 6.2 文件型状态

| 路径 | owner 与打开它的代码 | 种类 · 版本 | 备份 | 卸载 |
| --- | --- | --- | --- | --- |
| \`shelf/catalog.json\`、\`shelf/files/<item>/\` | x | y | 必备份 | purge |
| \`context-onboarding/journeys/<id>/{files,texts}/<sha256>\` | x | y | 不必备份（采用前的暂存） | purge |
`;
const DESIGN = ["storage-space.json", "plugin-packages/x.json", "spaces", "feed/secrets.json", "config/installation.json", "agent-runtime/storage.key"];
const HELD = ["memory/memory.db", "todo/todo.db", "shelf/catalog.json", "shelf/files/one/a.txt", ...DESIGN];
const COVERAGE = { uncovered: [], writes: { "memory/memory.db": { cases: ["memory.ts"] }, "todo/todo.db": { none: "这个库没有写入动作的理由写在这里" } }, other_writes: { "extra.ts": "写的是设置文件，不是哪一个库" } };
const MANIFEST = { third_party: "a", home_library: "b", node: "v24.15.0", homes: [{ path: "" }, { path: "spaces/one" }], stores: HELD.filter(file => file.endsWith(".db")).map(file => ({ path: file })), files: HELD.filter(file => !file.endsWith(".db")).map(file => ({ path: file })), directories: [] };

function tree({ manifest = MANIFEST, coverage = COVERAGE as unknown, data = DATA, goldens = ["1.0.0"], size = 1, files = ["tests/golden-writes/memory.ts", "tests/golden-writes/extra.ts"] }: { manifest?: unknown; coverage?: unknown; data?: string | null; goldens?: string[]; size?: number; files?: string[] } = {}) {
  const texts = new Map<string, string>(goldens.map(version => [`tests/fixtures/golden-homes/${version}/manifest.json`, JSON.stringify(manifest)]));
  texts.set("tooling/gates/golden-coverage.json", JSON.stringify(coverage));
  if (data !== null) texts.set("docs/system/HOME-DATA.md", data);
  return { files: [...files, ...goldens.map(version => `tests/fixtures/golden-homes/${version}/manifest.json`)], read: (file: string) => texts.get(file) ?? null, size: () => size };
}
const without = (dropped: string) => ({ ...MANIFEST, stores: MANIFEST.stores.filter(entry => entry.path !== dropped), files: MANIFEST.files.filter(entry => entry.path !== dropped) });

test("UPG2-04 the document's rows that must be backed up are read, and no others", () => {
  assert.deepEqual(requiredRows(DATA), [{ paths: ["memory/memory.db"], library: true }, { paths: ["todo/todo.db"], library: true }, { paths: ["shelf/catalog.json", "shelf/files/<item>/"], library: false }]);
  assert.equal(pathMatcher("projects/<project_id>/molis-work.db")("projects/p1/molis-work.db"), true);
  assert.equal(pathMatcher("projects/<project_id>/molis-work.db")("projects/p1/x/molis-work.db"), false);
  assert.equal(pathMatcher("feed/evidence/blobs/**")("feed/evidence/blobs/a/b"), true);
  assert.equal(pathMatcher("shelf/files/<item>/")("shelf/files/one/a.txt"), true);
  assert.equal(pathMatcher("plugin-builder/<p>/{design,runs}/")("plugin-builder/x/runs/a"), true);
  assert.equal(pathMatcher("plugin-builder/<p>/{design,runs}/")("plugin-builder/x/other/a"), false);
});

test("UPG2-04 a tree that holds everything passes, and a document that no longer has rows it can read does not pass by saying nothing", () => {
  assert.deepEqual(goldenHomeProblems(tree()), []);
  assert.match(goldenHomeProblems(tree({ data: "# 没有表\n" })).join("\n"), /no longer has rows this gate can read/u);
  assert.deepEqual(goldenHomeProblems(tree({ data: null })), [], "a scratch repository without the document has nothing to check");
});

test("UPG2-04 a row that must be backed up and is not in the latest golden fails, naming it", () => {
  for (const dropped of ["memory/memory.db", "shelf/catalog.json", "storage-space.json", "config/installation.json"]) {
    const problems = goldenHomeProblems(tree({ manifest: without(dropped) }));
    assert.equal(problems.length, 1, JSON.stringify(problems));
    assert.match(problems[0]!, new RegExp(`${dropped.replaceAll(".", "\\.")} must be backed up`, "u"));
  }
  // Only the latest counts: an older golden does not hold up the coverage of a new one.
  const texts = tree({ goldens: ["1.0.0", "1.1.0-dev.1"] }), read = texts.read;
  assert.match(goldenHomeProblems({ ...texts, read: (file: string) => file.includes("1.1.0-dev.1") ? JSON.stringify(without("todo/todo.db")) : read(file) }).join("\n"), /todo\/todo\.db must be backed up/u);
  assert.match(goldenHomeProblems({ ...tree(), files: tree().files.filter(file => !file.startsWith("tests/fixtures/golden-homes/")) }).join("\n"), /holds no golden Home/u);
});

test("UPG2-04 an uncovered path needs a reason, and an entry that is no longer true fails so the list cannot go stale", () => {
  const listed = (entry: { path: string; reason?: string }, manifest: unknown = without("shelf/catalog.json")) => goldenHomeProblems(tree({ manifest, coverage: { ...COVERAGE, uncovered: [entry] } })).join("\n");
  assert.equal(listed({ path: "shelf/catalog.json", reason: "这条理由写清了为什么金样里没有它" }), "");
  assert.match(listed({ path: "shelf/catalog.json" }), /needs a reason/u);
  assert.match(listed({ path: "shelf/catalog.json", reason: "短" }), /needs a reason/u);
  assert.match(listed({ path: "shelf/catalog.json", reason: "这条理由写清了为什么金样里没有它" }, MANIFEST), /is in golden 1\.0\.0 now; remove it/u);
  assert.match(listed({ path: "no/longer/in/the/document.json", reason: "这条理由写清了为什么金样里没有它" }), /not a path that must be backed up any more/u);
});

test("UPG2-04 every library that must be backed up names its write case or why it has none, and every case file is accounted for", () => {
  const coverage = (over: object) => ({ ...COVERAGE, ...over });
  const problems = (over: object, files?: string[]) => goldenHomeProblems(tree({ coverage: coverage(over), ...(files ? { files } : {}) })).join("\n");
  assert.match(problems({ writes: { "memory/memory.db": { cases: ["memory.ts"] } } }), /todo\/todo\.db must be backed up and .* does not say which case/u);
  assert.match(problems({ writes: { ...COVERAGE.writes, "todo/todo.db": { none: "短" } } }), /writes todo\/todo\.db needs a reason/u);
  assert.match(problems({ writes: { ...COVERAGE.writes, "todo/todo.db": { cases: [] } } }), /names no case and gives no reason/u);
  assert.match(problems({ writes: { ...COVERAGE.writes, "todo/todo.db": { cases: ["gone.ts"] } } }), /tests\/golden-writes\/gone\.ts, which does not exist/u);
  assert.match(problems({ writes: { ...COVERAGE.writes, "elsewhere.db": { cases: ["memory.ts"] } } }), /elsewhere\.db, which is not a library that must be backed up/u);
  assert.match(problems({ other_writes: {} }), /tests\/golden-writes\/extra\.ts is neither mapped/u);
  assert.match(problems({ other_writes: { "gone.ts": "写的是设置文件，不是哪一个库" , "extra.ts": "写的是设置文件，不是哪一个库" } }), /other_writes names tests\/golden-writes\/gone\.ts/u);
  assert.match(problems({ other_writes: { "extra.ts": "写的是设置文件，不是哪一个库", "memory.ts": "写的是设置文件，不是哪一个库" } }), /memory\.ts is both mapped to a library and under other_writes/u);
});

test("UPG2-07 a golden made without the signed samples, or that does not say which Node ran, is refused", () => {
  for (const field of ["third_party", "home_library", "node"]) {
    const problems = goldenHomeProblems(tree({ manifest: { ...MANIFEST, [field]: null } }));
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, new RegExp(`its manifest has no ${field}`, "u"));
  }
});

test("UPG2-08 over 50 MB the gate names the oldest golden, whatever its age, and exactly 50 MB passes", () => {
  const goldens = ["1.0.0", "0.9.0-dev.2", "0.9.0"];
  assert.deepEqual(versionsNewestLast(goldens), ["0.9.0-dev.2", "0.9.0", "1.0.0"]);
  const atLimit = tree({ goldens, files: [] });
  assert.deepEqual(goldenHomeProblems({ ...tree({ goldens }), size: () => GOLDEN_BYTES_LIMIT / goldens.length }), []);
  const problems = goldenHomeProblems({ ...tree({ goldens }), size: () => GOLDEN_BYTES_LIMIT / goldens.length + 1 });
  assert.equal(problems.length, 1, JSON.stringify(atLimit.files));
  assert.match(problems[0]!, /Move the oldest, 0\.9\.0-dev\.2, to a release attachment/u);
});

test("UPG2-04 UPG2-08 the repository's own tree passes", () => {
  const files = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean);
  const problems = goldenHomeProblems({ files, read: (file: string) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } }, size: (file: string) => statSync(path.join(root, file)).size });
  assert.deepEqual(problems, []);
});

test("UPG2-07 a job that left the signed samples out says so in the summary and as a notice, and a run that had them says nothing of the kind", () => {
  const left = reported("ok   0.1.0 (10 reads, 2 writes, third-party: not run on linux, not a pass, home library: not run on linux, not a pass)\n", 0);
  assert.match(left.summary, /did not run here: not a pass/u);
  assert.match(left.summary, /not run on linux/u);
  assert.equal(left.notices.length, 1);
  assert.match(left.notices[0]!, /^::notice title=Golden replay: not run on this runner::ok {3}0\.1\.0/u);
  const all = reported("ok   0.1.0 (10 reads, 2 writes, third-party: replayed, home library: replayed)\n", 0);
  assert.deepEqual(all.notices, []);
  assert.match(all.summary, /signed samples included/u);
  assert.match(reported("FAIL 0.1.0 upgrade root golden.x\n", 1).summary, /Failed\./u);
});
