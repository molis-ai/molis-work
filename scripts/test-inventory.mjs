// Print the current test collections without executing a test. Multiple memberships are intentional.
import { rustTestSource } from "./rust-test-source.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPackages, listFiles } from "./affected-tests/repository.mjs";
import { readmeTests } from "./affected-tests/select.mjs";
import { isMacOnlyTest, selectTests } from "./ci-linux-probe/select.mjs";
import { parseList } from "./ci-product-subset/plan.mjs";
import { securityList } from "./ci-test-selection.mjs";
import { isGateMetaTest, isVisualAuditTest } from "./run-tests/strata.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = file => readFileSync(path.join(root, file), "utf8");
const files = listFiles(root).sort();
const roots = selectTests(root);
const rootNames = roots.map(entry => entry.file);
const pkg = read("package.json");
const security = new Set(securityList(pkg, rootNames));
const product = new Set(parseList(read("tests/ci-product-subset.txt")).entries.map(entry => entry.file));
const contractGlobs = JSON.parse(pkg).scripts["test:contracts"].split(/\s+/).filter(token => token.startsWith("tests/"));
const rows = [];
for (const { file, marks } of roots) {
  const suites = [];
  if (security.has(file)) suites.push("security");
  if (product.has(file)) suites.push("product");
  if (contractGlobs.some(glob => path.matchesGlob(file, glob))) suites.push("contracts");
  if (isGateMetaTest(file)) suites.push("gate");
  if (isVisualAuditTest(file)) suites.push("visual");
  const platform = isMacOnlyTest(root, file) ? "macOS" : "Linux Full";
  rows.push([file, platform, suites.join(","), marks.join(",")]);
}

const authCommands = new Set([...read(".github/workflows/ci.yml").matchAll(/^\s*node (scripts\/[^\s]+\.test\.mjs)\s*$/gm)].map(match => match[1]));
const workerSuite = JSON.parse(read("examples/personal-sync-tools/package.json")).scripts.test;
const workerFiles = new Set(workerSuite.split(/\s+/).filter(token => token.startsWith("../../apps/")).map(token => token.slice(6)));
const rootSet = new Set(rootNames);
for (const file of files) {
  if (rootSet.has(file)) continue;
  if (rustTestSource(file, read) !== null) {
    rows.push([file, "Rust", "native-checks", ""]);
    continue;
  }
  if (workerFiles.has(file)) rows.push([file, "Worker WASM + D1/R2", "Full,personal-sync-tools", ""]);
  else if (file === "tests/npm-distribution-smoke.mjs") rows.push([file, "npm install", "release smoke", ""]);
  else if (file === "tests/fixtures/visual-capture.mts")
    rows.push([file, "screenshot", "visual", "browser"]);
  else if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) {
    let entry = "unmapped";
    if (file.startsWith("specs/archive/")) entry = "archived";
    else if (file.startsWith("packages/test-kit/tests/")) entry = "boundary:test";
    else if (authCommands.has(file)) entry = "account-login";
    else if (/^scripts\/account-[^/]+\.test\.mjs$/.test(file)) entry = "Auth integration (manual)";
    rows.push([file, entry, "", ""]);
  }
}

if (process.argv.length > 2) throw new Error("usage: node scripts/test-inventory.mjs");
// The same README declarations used by affected-tests identify the packages that request this test.
const requestedBy = new Map();
for (const pkg of discoverPackages(root, files)) {
  const { mustRun, ui, extras } = readmeTests(root, pkg);
  for (const file of new Set([...mustRun, ...ui, ...extras.flatMap(extra => extra.tests)])) {
    if (!requestedBy.has(file)) requestedBy.set(file, []);
    requestedBy.get(file).push(pkg.dir);
  }
}
console.log("file\texecution\tcollections\tprobe_hints\tpackage_readmes");
for (const row of rows) console.log([...row, (requestedBy.get(row[0]) ?? []).sort().join(",")].join("\t"));
