// Package inventory (specs/repository-anti-corruption §5, §4.4): one row per workspace package, measured from the code
// and kept true by a gate. The gate is wired into check-health-gates.mjs (an absolute rule, no merge-base comparison).
//
//   node scripts/gates/package-inventory.mjs --table [--root <dir>]   print the table rows measured from the code
//   node scripts/gates/package-inventory.mjs --check [--root <dir>]   check the committed table against the code
//
// What the gate holds the document to (the volatile numbers are regenerated with --table, not gated, or every PR that
// adds a file would have to touch the table):
//   - exactly the workspace packages of scripts/workspace-packages.mjs, once each (no stale or missing row);
//   - the layer column is the registry's `kind`;
//   - the status column is what the code says (see `statusOf`);
//   - depth and review cells use the vocabulary; numeric cells are numbers.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

/** Where the table lives. When the spec is archived, move the table (and this constant) to docs/system. */
export const INVENTORY_DOC = "specs/repository-anti-corruption/spec.md";
/** The file that starts the Plugin Runtime plugins (the proof tests/builtin-plugin-assembly-gate.test.ts also uses). */
export const PLUGIN_SUPERVISOR = "apps/local-host/src/project-plugins.ts";
/** Root tsconfig.json compiles these into the bins of package.json (molis-work, molis-work-mcp, molis-work-web). */
export const PRODUCT_ENTRY = "apps/desktop";

export const HEADER = ["包", "层", "源文件", "行数", "最大文件", "公开入口", "依赖内部包", "被依赖", "状态", "计划深度", "审查"];
export const LAYERS = {
  app: "应用", foundation: "基础", module: "模块", horizontal: "横向",
  "native-plugin": "内置插件", "integration-plugin": "官方接入", tooling: "工具",
};
export const STATUSES = ["在用", "Runtime", "构建期", "非产品"];
export const DEPTHS = ["深", "中", "浅"];
export const REVIEWS = ["待审", "已审"];

// ---- what is measured --------------------------------------------------------------------------------------------------
// Same definition of a source file as the giant-unit gate (check-health-gates.mjs): TypeScript that is not a declaration,
// a test or a fixture. The table counts the ones under `<package>/src/`; the import graph looks at the whole package.
const isCode = (file) => /\.(ts|mts)$/.test(file) && !file.endsWith(".d.ts")
  && !/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(file) && !/\.test\.(ts|mts)$/.test(file);
const WORKSPACE_IMPORT = /^(@molis-ai\/molis-work-[a-z0-9-]+)(?:\/.*)?$/;
const sortedBy = (registry) => [...registry].sort((a, b) => b.path.length - a.path.length);
const ownerOf = (sorted, file) => sorted.find((item) => file.startsWith(`${item.path}/`));

/** Facts of every package in the registry, measured from a snapshot ({ files, read }) of the repository. */
export function measurePackages(snapshot, registry) {
  const sorted = sortedBy(registry);
  const byName = new Map(registry.map((item) => [item.name, item]));
  const facts = new Map(registry.map((item) => [item.path, { ...item, files: 0, lines: 0, largest: { file: "", lines: 0 }, exports: 0, deps: [], dependedBy: [], imports: new Set() }]));
  for (const file of snapshot.files) {
    if (!isCode(file)) continue;
    const owner = ownerOf(sorted, file);
    if (!owner) continue;
    const text = snapshot.read(file);
    if (text === null) continue;
    const fact = facts.get(owner.path);
    if (file.startsWith(`${owner.path}/src/`)) {
      const lines = text.split("\n").length;
      fact.files++;
      fact.lines += lines;
      if (lines > fact.largest.lines) fact.largest = { file: file.slice(owner.path.length + 5), lines };
    }
    if (!text.includes("@molis-ai/molis-work-")) continue;
    // The scanner reads import and export specifiers, import() and require(); code inside a template string (the plugin
    // sources the Host and the CLI generate) is not an import of this package.
    for (const { fileName } of ts.preProcessFile(text, true, true).importedFiles) {
      const target = byName.get(WORKSPACE_IMPORT.exec(fileName)?.[1]);
      if (target && target.path !== owner.path) fact.imports.add(target.path);
    }
  }
  for (const fact of facts.values()) {
    const text = snapshot.read(`${fact.path}/package.json`);
    const manifest = text === null ? {} : JSON.parse(text);
    fact.exports = Object.keys(manifest.exports ?? {}).length;
    fact.deps = Object.keys(manifest.dependencies ?? {}).filter((name) => byName.has(name)).map((name) => byName.get(name).path);
    for (const dependency of fact.deps) facts.get(dependency).dependedBy.push(fact.path);
  }
  // Reachability from the product entry along imports (package code, launchers included, no tests; type-only imports count).
  const reachable = new Set([PRODUCT_ENTRY]);
  const queue = [PRODUCT_ENTRY];
  while (queue.length) for (const next of facts.get(queue.shift())?.imports ?? []) if (!reachable.has(next)) { reachable.add(next); queue.push(next); }
  const supervisor = snapshot.read(PLUGIN_SUPERVISOR) ?? "";
  for (const fact of facts.values()) fact.status = statusOf(fact, reachable.has(fact.path), supervisor);
  return [...facts.values()].sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * 在用    reached from the product entry (apps/desktop and its launchers) along shipped imports.
 * Runtime  a native plugin the Plugin Runtime supervisor starts (its package name is in project-plugins.ts).
 * 构建期   a native plugin assembled by hand into the Host and the Workbench; the frozen list of
 *          tests/builtin-plugin-assembly-gate.test.ts, which may only shrink.
 * 非产品   not reached from the product entry: a launcher of its own, test support, or code nothing imports.
 */
export function statusOf(fact, reached, supervisor) {
  if (!reached) return "非产品";
  if (fact.kind !== "native-plugin") return "在用";
  return supervisor.includes(`"${fact.name}"`) ? "Runtime" : "构建期";
}

// ---- how deep the §4.4 review goes (planned, from risk) ------------------------------------------------------------------
// Score one point per signal at the low threshold, two at the high one; 深 at 4 or more, or when the package is on the
// authorization spine: where every capability call (kernel's ActionService: trusted identity, beforeEffect, revoked calls)
// and every plugin install (plugin-runtime: grants, signatures) is enforced. 中 for anything over 1,000 source lines, with
// a giant unit, or depended on by three packages or more. 浅 for the rest.
export const CUTOVER = "2026-09-08";
export const SPINE = ["packages/kernel", "packages/plugin-runtime"];
const points = (value, high, low) => (value >= high ? 2 : value >= low ? 1 : 0);
export function plannedDepth({ path: packagePath, lines, churn, dependedBy, giants }) {
  const score = points(lines, 9000, 3000) + points(churn, 100, 40) + points(dependedBy, 17, 4) + points(giants, 10, 4);
  if (score >= 4 || SPINE.includes(packagePath)) return "深";
  if (lines >= 1000 || giants >= 1 || dependedBy >= 3) return "中";
  return "浅";
}

// ---- the table --------------------------------------------------------------------------------------------------------
const number = (value) => value.toLocaleString("en-US");
export const layerOf = (kind) => LAYERS[kind];
const layerName = (kind) => layerOf(kind) ?? (() => { throw new Error(`registry kind "${kind}" has no layer name in scripts/gates/package-inventory.mjs`); })();

export function formatRow(fact, { depth, review = "待审" }) {
  const largest = fact.largest.file ? `\`${fact.largest.file}\` ${number(fact.largest.lines)}` : "—";
  const cells = [`\`${fact.path}\``, layerName(fact.kind), number(fact.files), number(fact.lines), largest, number(fact.exports),
    number(fact.deps.length), number(fact.dependedBy.length), fact.status, depth, review];
  return `| ${cells.join(" | ")} |`;
}
export const formatHeader = () => `| ${HEADER.join(" | ")} |\n| ${HEADER.map(() => "---").join(" | ")} |`;

/** The table in the document: the first one whose header is HEADER. Rows are cell arrays, backticks stripped from the name. */
export function parseTable(markdown) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => splitRow(line)?.join("|") === HEADER.join("|"));
  if (start < 0) return undefined;
  const rows = [];
  for (let index = start + 2; index < lines.length; index++) {
    const cells = splitRow(lines[index]);
    if (!cells) break;
    rows.push({ cells, line: index + 1 });
  }
  return rows;
}
const splitRow = (line) => (line.startsWith("|") && line.trimEnd().endsWith("|") ? line.trim().slice(1, -1).split("|").map((cell) => cell.trim()) : undefined);

// ---- the gate -----------------------------------------------------------------------------------------------------------
export function inventoryProblems(snapshot, registry) {
  const text = snapshot.read(INVENTORY_DOC);
  if (text === null) return [`${INVENTORY_DOC}: the package inventory document is missing`];
  const rows = parseTable(text);
  if (!rows) return [`${INVENTORY_DOC}: no package table with the header | ${HEADER.join(" | ")} |`];
  const problems = [];
  for (const item of registry) if (!layerOf(item.kind)) problems.push(`${item.path}: registry kind "${item.kind}" has no layer name in scripts/gates/package-inventory.mjs`);
  const facts = new Map(measurePackages(snapshot, registry).map((fact) => [fact.path, fact]));
  const seen = new Set();
  for (const { cells, line } of rows) {
    const where = `${INVENTORY_DOC}:${line}`;
    if (cells.length !== HEADER.length) { problems.push(`${where}: ${cells.length} cells, the table has ${HEADER.length} columns`); continue; }
    const [name, layer, files, lines, largest, entries, deps, dependedBy, status, depth, review] = cells;
    const packagePath = name.replace(/^`|`$/g, "");
    const fact = facts.get(packagePath);
    if (!fact) { problems.push(`${where}: ${packagePath} is not a workspace package of scripts/workspace-packages.mjs`); continue; }
    if (seen.has(packagePath)) problems.push(`${where}: ${packagePath} has more than one row`);
    seen.add(packagePath);
    if (layer !== layerOf(fact.kind)) problems.push(`${where}: ${packagePath} is ${fact.kind} in the registry, so its layer is ${layerOf(fact.kind)}, not ${layer}`);
    for (const [column, cell] of [["源文件", files], ["行数", lines], ["公开入口", entries], ["依赖内部包", deps], ["被依赖", dependedBy]]) {
      if (!/^\d{1,3}(,\d{3})*$/.test(cell)) problems.push(`${where}: ${packagePath} ${column} is "${cell}", not a number`);
    }
    if (!/^(`[^`]+` \d{1,3}(,\d{3})*|—)$/.test(largest)) problems.push(`${where}: ${packagePath} 最大文件 is "${largest}", expected \`path\` lines`);
    if (!STATUSES.includes(status)) problems.push(`${where}: ${packagePath} status "${status}" is not one of ${STATUSES.join(", ")}`);
    else if (status !== fact.status) problems.push(`${where}: ${packagePath} is marked ${status}, the code says ${fact.status} (${statusEvidence(fact)})`);
    if (!DEPTHS.includes(depth)) problems.push(`${where}: ${packagePath} planned depth "${depth}" is not one of ${DEPTHS.join(", ")}`);
    if (!REVIEWS.includes(review)) problems.push(`${where}: ${packagePath} review "${review}" is not one of ${REVIEWS.join(", ")}`);
  }
  for (const item of registry) if (!seen.has(item.path)) problems.push(`${INVENTORY_DOC}: ${item.path} is a workspace package but has no row in the inventory table`);
  return problems;
}
const statusEvidence = (fact) => (fact.status === "非产品"
  ? `nothing reachable from ${PRODUCT_ENTRY} imports it`
  : fact.status === "构建期" ? `${PLUGIN_SUPERVISOR} does not start ${fact.name}`
    : fact.status === "Runtime" ? `${PLUGIN_SUPERVISOR} starts ${fact.name}` : `reached from ${PRODUCT_ENTRY}`);

export async function loadRegistry(root) {
  const file = path.join(root, "scripts/workspace-packages.mjs");
  return existsSync(file) ? (await import(pathToFileURL(file).href)).WORKSPACE_PACKAGES : null;
}
export function workingTreeSnapshot(root) {
  const files = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
  return { files, read: (file) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } } };
}

// ---- command line ---------------------------------------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  const root = path.resolve(rootIndex >= 0 ? args[rootIndex + 1] : path.join(path.dirname(new URL(import.meta.url).pathname), "../.."));
  const mode = args.find((arg) => arg === "--table" || arg === "--check");
  if (!mode) { console.error("usage: package-inventory.mjs --table|--check [--root <dir>]"); process.exit(2); }
  const registry = await loadRegistry(root);
  if (!registry) { console.error(`${root}/scripts/workspace-packages.mjs is missing`); process.exit(2); }
  const snapshot = workingTreeSnapshot(root);
  if (mode === "--check") {
    const problems = inventoryProblems(snapshot, registry);
    if (problems.length) { console.error(`Package inventory is out of step with the code:\n- ${problems.join("\n- ")}`); process.exit(1); }
    console.log(`Package inventory holds ${registry.length} packages, all matching the code.`);
    return;
  }
  // --table: also needs the churn since the Cutover and the giant units of the committed baseline.
  const facts = measurePackages(snapshot, registry);
  const sorted = sortedBy(registry);
  const churn = new Map();
  const log = execFileSync("git", ["log", `--since=${CUTOVER}`, "--no-merges", "--name-only", "--format=@@%H"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 });
  let seen = new Set();
  for (const line of log.split("\n")) {
    if (line.startsWith("@@")) { seen = new Set(); continue; }
    const owner = line ? ownerOf(sorted, line) : undefined;
    if (owner && !seen.has(owner.path)) { seen.add(owner.path); churn.set(owner.path, (churn.get(owner.path) ?? 0) + 1); }
  }
  const baselineFile = path.join(root, "tooling/gates/baseline.json");
  const giantUnits = existsSync(baselineFile) ? Object.keys(JSON.parse(readFileSync(baselineFile, "utf8")).giant ?? {}) : [];
  const giants = new Map();
  for (const unit of giantUnits) {
    const owner = ownerOf(sorted, unit.replace(/^(?:file|class|function) /, "").split("#")[0]);
    if (owner) giants.set(owner.path, (giants.get(owner.path) ?? 0) + 1);
  }
  console.log(formatHeader());
  const tally = { 深: 0, 中: 0, 浅: 0 };
  const status = {};
  for (const fact of facts) {
    const depth = plannedDepth({ path: fact.path, lines: fact.lines, churn: churn.get(fact.path) ?? 0, dependedBy: fact.dependedBy.length, giants: giants.get(fact.path) ?? 0 });
    tally[depth]++;
    status[fact.status] = (status[fact.status] ?? 0) + 1;
    console.log(formatRow(fact, { depth }));
  }
  console.error(`${facts.length} packages; depth ${JSON.stringify(tally)}; status ${JSON.stringify(status)}`);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
