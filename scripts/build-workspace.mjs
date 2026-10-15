#!/usr/bin/env node
// `pnpm workspace:build` (and so `pnpm build`): builds the workspace packages, skipping each one whose inputs have not changed
// since its last build in this checkout (docs/system/PARALLEL-DEVELOPMENT.md §5).
//
//   node scripts/build-workspace.mjs [--clean] [--jobs <n>] [--dry-run]
//     --clean     forget every record, clean and build every package (what the build always did before; also MOLIS_WORK_BUILD_CLEAN=1,
//                 and `pnpm build:clean`)
//     --jobs <n>  packages built at once once their dependencies are built (default 4, pnpm's own default)
//     --dry-run   print which packages would be built and why; build nothing
//
// A package's inputs: every file of its directory that git tracks or would track (not dist/, not what .gitignore leaves out), the
// root files every package compiles against (pnpm-lock.yaml, the tsconfig*.json at the root), the Node version, and the inputs of
// the workspace packages it depends on, so a change reaches every package that depends on it. A package is skipped when those inputs
// are what its last successful build recorded and its dist/ is still the one that build left. Otherwise it is cleaned and built as
// before (`pnpm run clean`, `pnpm run build` in its directory), after the packages it depends on. The records are in
// node_modules/.cache/molis-work-build/records.json of this checkout, never in dist/. A build that reads a file outside its package
// without depending on that package is not seen: `pnpm build:clean` builds everything. CI starts with no records, so it builds all.
// The build takes the machine's build slot first (scripts/machine-slot.mjs) and waits for it when another checkout is building.
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireSlot } from "./machine-slot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The package directories `pnpm workspace:build` always built (the same filters as `workspace:clean` and `workspace:typecheck`).
const PACKAGE_ROOTS = ["apps/", "server", "packages/", "modules/", "horizontal/", "plugins/", "tooling/plugin-cli"];
const SHARED_INPUTS = ["pnpm-lock.yaml", "tsconfig.base.json", "tsconfig.package.json", "tsconfig.json"];
const RECORDS = path.join(root, "node_modules", ".cache", "molis-work-build", "records.json");
const USAGE = "usage: build-workspace.mjs [--clean] [--jobs <n>] [--dry-run]";

const die = (message) => { console.error(`build-workspace: ${message}\n${USAGE}`); process.exit(2); };
const sha = (text) => createHash("sha256").update(text).digest("hex");
const relativePath = (absolute) => path.relative(root, absolute).split(path.sep).join("/");

export function parseOptions(args, environment = process.env) {
  const options = { clean: environment.MOLIS_WORK_BUILD_CLEAN === "1", jobs: 4, dryRun: false };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--clean") options.clean = true;
    else if (args[index] === "--dry-run") options.dryRun = true;
    else if (args[index] === "--jobs") {
      const jobs = Number(args[++index]);
      if (!Number.isInteger(jobs) || jobs < 1) die(`--jobs needs a whole number of at least 1, not "${args[index]}"`);
      options.jobs = jobs;
    } else die(`unknown argument ${args[index]}`);
  }
  return options;
}

/** The workspace packages to build: name, directory, scripts and the workspace packages each depends on. */
export function readPackages() {
  const listed = JSON.parse(execFileSync("pnpm", ["-r", "ls", "--json", "--depth", "-1"], { cwd: root, encoding: "utf8" }));
  const packages = listed
    .map((entry) => ({ name: entry.name, directory: relativePath(entry.path) }))
    .filter(({ directory }) => PACKAGE_ROOTS.some((prefix) => directory === prefix.replace(/\/$/, "") || directory.startsWith(prefix)))
    .map(({ name, directory }) => {
      const manifest = JSON.parse(readFileSync(path.join(root, directory, "package.json"), "utf8"));
      const declared = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].flatMap((field) => Object.keys(manifest[field] ?? {}));
      return { name, directory, scripts: manifest.scripts ?? {}, declared };
    });
  const names = new Set(packages.map((entry) => entry.name));
  return packages.map(({ declared, ...entry }) => ({ ...entry, dependencies: [...new Set(declared.filter((name) => names.has(name) && name !== entry.name))].sort() }));
}

/** Packages in an order where each comes after the packages it depends on; a cycle is an error. */
export function buildOrder(packages) {
  const byName = new Map(packages.map((entry) => [entry.name, entry]));
  const state = new Map(), order = [];
  const visit = (name, trail) => {
    if (state.get(name) === "done") return;
    if (state.get(name) === "visiting") throw new Error(`dependency cycle: ${[...trail, name].join(" -> ")}`);
    state.set(name, "visiting");
    for (const dependency of byName.get(name).dependencies) visit(dependency, [...trail, name]);
    state.set(name, "done");
    order.push(byName.get(name));
  };
  for (const entry of [...packages].sort((a, b) => a.name.localeCompare(b.name))) visit(entry.name, []);
  return order;
}

/** Every package's input digest: its own files, the shared inputs, Node's major version and its dependencies' digests. */
export function inputDigests(order, files, hash = hashFile) {
  const shared = sha([`node ${process.versions.node.split(".")[0]}`, ...SHARED_INPUTS.map((file) => `${file} ${hash(file)}`)].join("\n"));
  // Longest directory first, so a file of a package nested in another package's directory belongs to the inner one.
  const directories = order.map((entry) => entry.directory).sort((a, b) => b.length - a.length);
  const own = new Map(order.map((entry) => [entry.directory, []]));
  for (const file of files) {
    const owner = directories.find((directory) => file.startsWith(`${directory}/`));
    if (owner && !file.startsWith(`${owner}/dist/`)) own.get(owner).push(`${file} ${hash(file)}`);
  }
  const digests = new Map();
  for (const entry of order) {
    digests.set(entry.name, sha([shared, ...own.get(entry.directory).sort(), ...entry.dependencies.map((name) => `${name} ${digests.get(name)}`)].join("\n")));
  }
  return digests;
}

const hashFile = (file) => {
  try { return sha(readFileSync(path.join(root, file))); } catch { return "absent"; } // listed by git but deleted in the work tree
};

/** A digest of what dist/ holds now (paths, sizes, modification times): equal only to the dist/ the recorded build left. */
export function distDigest(directory) {
  const dist = path.join(root, directory, "dist");
  if (!existsSync(dist)) return null;
  const lines = [];
  const walk = (folder) => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const absolute = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else { const stat = statSync(absolute); lines.push(`${relativePath(absolute)} ${stat.size} ${Math.round(stat.mtimeMs)}`); }
    }
  };
  walk(dist);
  return sha(lines.sort().join("\n"));
}

const readRecords = () => {
  try { return JSON.parse(readFileSync(RECORDS, "utf8")); } catch { return {}; } // no build recorded in this checkout yet
};

const writeRecords = (records) => {
  mkdirSync(path.dirname(RECORDS), { recursive: true });
  const temporary = `${RECORDS}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(records, null, 1)}\n`);
  renameSync(temporary, RECORDS);
};

/** Why a package must be built, or null when its last build still stands. */
export function staleReason(entry, digest, record) {
  if (!entry.scripts.build) return null;
  if (!record) return "no build recorded";
  if (record.input !== digest) return "inputs changed";
  if (record.output !== distDigest(entry.directory)) return "dist/ changed or missing";
  return null;
}

const runScript = (entry, script) => new Promise((resolve) => {
  const child = spawn("pnpm", ["run", script], { cwd: path.join(root, entry.directory), stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  child.once("exit", (code) => resolve({ ok: code === 0, output }));
});

/** Builds `stale` (names) in dependency order, `jobs` at once; resolves to the names that failed (their dependents are not started). */
async function buildStale(order, stale, digests, records, jobs) {
  const pending = order.filter((entry) => stale.has(entry.name));
  const done = new Set(order.filter((entry) => !stale.has(entry.name)).map((entry) => entry.name));
  const failed = new Set();
  let running = 0;
  await new Promise((resolve) => {
    const next = () => {
      for (let index = 0; index < pending.length && running < jobs; index++) {
        const entry = pending[index];
        if (entry.dependencies.some((name) => failed.has(name))) { pending.splice(index--, 1); failed.add(entry.name); continue; }
        if (!entry.dependencies.every((name) => done.has(name))) continue;
        pending.splice(index--, 1);
        running += 1;
        void start(entry); // start() reports its own failure and calls next()
      }
      if (!running && !pending.length) resolve();
    };
    const start = async (entry) => {
      const started = Date.now();
      const clean = entry.scripts.clean ? await runScript(entry, "clean") : { ok: true, output: "" };
      const build = clean.ok ? await runScript(entry, "build") : clean;
      running -= 1;
      if (build.ok) {
        done.add(entry.name);
        records[entry.name] = { input: digests.get(entry.name), output: distDigest(entry.directory) };
        writeRecords(records);
        console.log(`build-workspace: built ${entry.name} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      } else {
        failed.add(entry.name);
        console.error(`build-workspace: ${entry.name} failed\n${build.output.trimEnd()}`);
      }
      next();
    };
    next();
  });
  return failed;
}

const FILTERS = PACKAGE_ROOTS.map((prefix) => ["--filter", `./${prefix.endsWith("/") ? `${prefix}**` : prefix}`]).flat();

/** Every package, the way `pnpm workspace:build` always did it: clean them all, then `pnpm -r run build`. */
const buildAll = () => new Promise((resolve) => {
  const run = (script, then) => {
    const child = spawn("pnpm", ["-r", ...FILTERS, "run", script], { cwd: root, stdio: "inherit" });
    child.once("exit", (code) => (code === 0 ? then() : resolve(false)));
  };
  run("clean", () => run("build", () => resolve(true)));
});

/** What to build now: the packages whose last build no longer stands (all of them with --clean), with the reason. */
function plan(options) {
  const order = buildOrder(readPackages());
  const files = execFileSync("git", ["ls-files", "-z", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 }).split("\0").filter(Boolean);
  const digests = inputDigests(order, files);
  const records = options.clean ? {} : readRecords();
  const reasons = order.map((entry) => [entry.name, options.clean && entry.scripts.build ? "--clean" : staleReason(entry, digests.get(entry.name), records[entry.name])]);
  return { order, digests, records, stale: new Map(reasons.filter(([, reason]) => reason)), buildable: order.filter((entry) => entry.scripts.build).length };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const started = Date.now();
  let current = plan(options);
  console.log(`build-workspace: ${current.stale.size} of ${current.buildable} packages to build, ${current.buildable - current.stale.size} unchanged`);
  if (options.dryRun) {
    for (const [name, reason] of current.stale) console.log(`  ${name}: ${reason}`);
    return 0;
  }
  if (!current.stale.size) return 0;
  const release = await acquireSlot("build", { label: `build ${path.basename(root)}` });
  current = plan(options); // again: another checkout may have built, or files changed, while this one waited
  const { order, digests, records, stale, buildable } = current;
  let failed;
  if (stale.size === buildable) {
    writeRecords({});
    const ok = await buildAll();
    failed = new Set(ok ? [] : order.map((entry) => entry.name));
    if (ok) writeRecords(Object.fromEntries(order.filter((entry) => entry.scripts.build).map((entry) => [entry.name, { input: digests.get(entry.name), output: distDigest(entry.directory) }])));
  } else {
    failed = await buildStale(order, new Set(stale.keys()), digests, records, options.jobs);
  }
  release();
  console.log(`build-workspace: ${failed.size ? "failed" : `${stale.size} built`} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return failed.size ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
