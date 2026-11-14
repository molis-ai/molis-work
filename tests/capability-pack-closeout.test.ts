import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * CPK-02, CPK-08, CPK-10 (specs/capability-pack/spec.md §11, 2026-11-11 audit follow-up): the close-out table's deleted identifiers
 * are gone from the source trees; every record it left open names a concrete batch; the contract compares the three ways to place the
 * kit (the first draft is not kept in the repository, so the comparison has to live in the contract itself); and the two upgrade
 * differences are produced from data already persisted (kept signed releases, the connection cache) without a store-format bump.
 *
 * Read from the repository root, never the process's working directory: `new URL("..", import.meta.url)`. Paths and prose are read as
 * a snapshot: a rename or a rewrite of the contract makes this fail on purpose, so the row it stood for is re-checked.
 */
const repoRoot = fileURLToPath(new URL("..", import.meta.url));

/** The source trees the close-out table covers: the Host, Coding, contracts and the Agent Host. Build output is not source. */
const SOURCE_ROOTS = ["apps/local-host/src", "plugins/native/coding/src", "packages/contracts/src", "horizontal/agent-host/src"];


async function sourceFiles(roots: readonly string[], extension: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await readdir(join(repoRoot, dir), { withFileTypes: true })) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) await walk(path);
      else if (entry.name.endsWith(extension)) files.push(path);
    }
  };
  for (const root of roots) await walk(root);
  return files.sort();
}

const read = (path: string) => readFile(join(repoRoot, path), "utf8");

/** The row of a backlog record (one row per file, its id in the first cell). */
async function backlogRow(file: string, id: string): Promise<string> {
  const line = (await read(file)).split("\n").find(candidate => candidate.startsWith(`| ${id} |`));
  assert.ok(line, `${file}: its record row is in specs/backlog/ (CPK-08: a BL the close-out table left open keeps its record)`);
  return line;
}

test("CPK-08: the close-out table's deleted names no longer appear in the Host, Coding, contracts or Agent Host source", async () => {
  const deleted = ["molis-coding-method", "agent.skills.discover", "agent.skills.install", "AgentSkillLibrary",
    "UNREGISTERED_MODEL_CALLS", "AgentRoleSkillsDeclaration", "AgentSkillsCapability"];
  const found: string[] = [];
  for (const file of await sourceFiles(SOURCE_ROOTS, ".ts")) {
    const text = await read(file);
    for (const name of deleted) if (text.includes(name)) found.push(`${file}: ${name}`);
  }
  assert.deepEqual(found, [], "spec §8 deleted these; when one comes back, the row it was closed under is wrong");
  // The process's Skill selection was replaced by the round's binding in the call context (§8 row 1).
  assert.equal((await sourceFiles(SOURCE_ROOTS, ".ts")).some(file => file.endsWith("/skill-selection.ts")), false, "skill-selection.ts went with the old method path");
  // Coding's settings page reads the contract's MCP view rather than declaring a server of its own (§8 row 9).
  assert.match(await read("plugins/native/coding/src/browser/settings/mcp.ts"), /AgentMcpServerView/, "Coding setting page uses AgentMcpServerView");
});

test("CPK-08: every BL the close-out table left open names the batch that picks it up", async () => {
  const destinations: ReadonlyArray<readonly [id: string, file: string, batch: RegExp]> = [
    ["BL-skill-scripts-sandbox", "specs/backlog/BL-skill-scripts-sandbox.md", /去处第 62 批第 1 项/u],
    ["BL-runtime-mcp-actions-snapshot", "specs/backlog/BL-runtime-mcp-actions-snapshot.md", /去处第 62 批第 1 项/u],
    ["BL-goals-methods-as-skills", "specs/backlog/BL-goals-methods-as-skills.md", /去处第 41 批/u],
    ["BL-mcp-action-pipelines-merge", "specs/backlog/BL-mcp-action-pipelines-merge.md", /第 62 批第 1 项/u],
  ];
  for (const [id, file, batch] of destinations) {
    assert.match(await backlogRow(file, id), batch, `${id}: the owner cell names where it is done, not "会话待分配"`);
  }
});

test("CPK-10: the contract compares the three ways to place the kit; nothing points at a first draft that is not in the repository", async () => {
  const contract = await read("specs/capability-pack/contract-design.md");
  assert.match(contract, /为什么是主人上报/, "the contract has the comparison itself, not only its conclusion");
  for (const way of ["宿主扩展 Agent 定义登记", "`horizontal/` 新包", "主人上报"]) assert.ok(contract.includes(way), `the comparison names 「${way}」`);
  assert.match(contract, /三种放法/u, "the comparison says how many ways it weighs");
  assert.doesNotMatch(contract, /见第 1 稿/u, "the first draft is not kept in the repository; the contract has to carry the comparison");
  const placement = contract.split("\n").find(line => line.startsWith("| 5 | 放在哪个包 |"));
  assert.ok(placement, "§6.1 still answers where it goes");
  assert.match(placement, /第 4\.1 节/u, "§6.1 #5 points at the comparison in §4.1");
  // The rest of CPK-10: the ownership row and the author's chapter the acceptance names still exist.
  assert.match(await read("docs/SSOT-MATRIX.md"), /能力包/u);
  assert.match(await read("docs/system/PACKAGE-BOUNDARIES.md"), /horizontal\/kit/u);
  assert.match(await read("skills/molis-plugin-dev/skills-and-kits.md"), /能力包/u);
  assert.match(await read("docs/system/GLOSSARY.md"), /能力包/u);
});

test("CPK-02: the two upgrade differences come from data already persisted, without a store-format version change, and the contract says so", async () => {
  const contract = await read("specs/capability-pack/contract-design.md");
  const deviation = contract.slice(contract.indexOf("## 10. 偏离记录"), contract.indexOf("## 11. 待决"));
  assert.match(deviation, /retainedVersions/u, "pack upgrades are read from the signed releases the Host kept");
  assert.match(deviation, /connector-mcp-tools\.json/u, "connection discovery differences are kept in the existing JSON cache");
  assert.match(deviation, /第 62 批 MCP 策略 M0/u, "project MCP servers' discovery difference stays with batch 62's M0");
  assert.doesNotMatch(deviation, /本轮没有产出者/u, "the old 「nothing produces it this round」 deviation is gone");
  const acceptance = contract.slice(contract.indexOf("## 7. 验收对照表"), contract.indexOf("## 8. 子分支拆法建议"));
  const cpk02 = acceptance.split("\n").find(line => line.startsWith("| CPK-02 |"));
  assert.ok(cpk02, "the acceptance table still has CPK-02");
  assert.doesNotMatch(cpk02, /\*\*部分\*\*/u, "CPK-02 is no longer partial");
  assert.match(cpk02, /tests\/kit-catalog\.test\.ts/u, "it names the pack-upgrade test");
  assert.match(cpk02, /tests\/connector-mcp\.test\.ts/u, "it names the connection-discovery test");
  // The producers read data that was already there: the kept signed release, and the connection cache with one optional field.
  assert.match(await read("apps/local-host/src/sandbox-package-store.ts"), /retainedVersions\(pluginId: string, keyId: string\)/u);
  assert.match(await read("apps/local-host/src/kit-actions.ts"), /retainedVersions/u);
  assert.match(await read("apps/local-host/src/kit-actions.ts"), /upgraded/u);
  assert.match(await read("apps/local-host/src/connector-mcp-actions.ts"), /change\?: ConnectorMcpListingChange/u);
  assert.match(await read("apps/local-host/src/kit-mcp-reports.ts"), /kind: "discovered"/u);
  // No new store or format version: the cache stays the same plain JSON file with an optional field.
  assert.match(await read("apps/local-host/src/connector-mcp-actions.ts"), /config\/connector-mcp-tools\.json/u);
});

