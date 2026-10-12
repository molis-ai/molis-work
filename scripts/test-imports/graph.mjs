// What one test process loads, and from where. The unit is a process: every tests/*.test.{ts,mts,mjs} file is one, because
// scripts/run-tests.mjs runs each as one `node --test` file. A package can then be loaded twice by it:
//   from source   a relative import into <package>/src, run by tsx (and the package's own imports of other packages' src);
//   from the build a package name, or a relative import into <package>/dist (and that build's own imports).
// Two copies break instanceof across them, module-level caches and AsyncLocalStorage, so a process that loads a package both
// ways is a "split". The same walk serves the health gate (scripts/gates/test-import-splits.mjs) and the codemod (plan.mjs).
//
// Every package builds with `tsc` from src/ to dist/ with the same layout, so a build module is followed by reading its src twin:
// ./dist/x.js is read as src/x.ts. Declarations that load nothing at run time (`import type`, `export type`, every element
// `type`) are skipped. Package code's import() and require() are not followed (they load lazily); a test's own are. A child
// process (fork, spawn) is a separate process and is not joined: a tests/ file that no test reads statically (a spawned fixture) is
// analysed as a process of its own ("entry"). Not seen: computed specifiers, createRequire, which file a test spawns (a fixture
// that a test also imports is measured as part of that test's process, not as the child).
import path from "node:path";
import ts from "typescript";
import { parseImports } from "./parse.mjs";

// The gate's definition of "reaches into a package" (scripts/check-health-gates.mjs INTERNAL_TARGET), used to count refs.
export const INTERNAL_TARGET = /^(?:apps|horizontal|modules|packages|plugins|server)\/(?:.+\/)?(?:src|dist)(?:\/|$)/;
export const isTestFile = (file) => /^tests\/.*\.(?:ts|mts|mjs)$/.test(file);
export const isProcessFile = (file) => /^tests\/[^/]+\.test\.(?:ts|mts|mjs)$/.test(file);
const MANIFEST = /^(?:apps|horizontal|modules|packages|plugins|server|tooling)\/(?:.+\/)?package\.json$/;

const globToRegExp = (glob) => new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\u0000/g, "(?:.*/)?")}$`);

function discoverPackages(snapshot) {
  const packages = new Map();
  for (const file of snapshot.files.filter((entry) => MANIFEST.test(entry) && !entry.includes("node_modules/"))) {
    let json;
    try { json = JSON.parse(snapshot.read(file) ?? ""); } catch { continue; }
    const dir = path.posix.dirname(file);
    if (typeof json?.name !== "string" || !snapshot.files.some((entry) => entry.startsWith(`${dir}/src/`))) continue;
    const config = ts.parseConfigFileTextToJson(`${dir}/tsconfig.json`, snapshot.read(`${dir}/tsconfig.json`) ?? "{}").config ?? {};
    packages.set(json.name, { name: json.name, dir, json, exclude: (config.exclude ?? []).map((glob) => globToRegExp(path.posix.join(dir, glob.replace(/\/$/, "")))) });
  }
  return packages;
}

/** `parseCache` (a Map) can be shared between graphs of snapshots that differ in a few files: a file is parsed again only when its text changed. */
export function createGraph(snapshot, parseCache = new Map()) {
  const known = new Set(snapshot.files);
  const packages = discoverPackages(snapshot);
  const dirs = [...packages.values()].sort((a, b) => b.dir.length - a.dir.length);
  const ownerOf = (file) => dirs.find((pkg) => file === pkg.dir || file.startsWith(`${pkg.dir}/`));
  const resolveFile = (p) => {
    const base = p.replace(/\.(?:m?js)$/, "");
    return [p, `${base}.ts`, `${base}.mts`, `${p}.ts`, `${p}/index.ts`].find((candidate) => known.has(candidate));
  };
  const distToSrc = (pkg, rest) => resolveFile(`${pkg.dir}/src/${rest.replace(/^dist\//, "").replace(/\.d\.ts$/, ".ts")}`);
  /** The built twin of a package source file (tsc writes src/x.ts to dist/x.js), or undefined when tsconfig leaves it out. */
  const distOf = (pkg, srcFile) => {
    const rest = srcFile.slice(pkg.dir.length + 1);
    const parts = srcFile.split("/");
    const prefixes = parts.map((_, index) => parts.slice(0, index + 1).join("/"));
    if (!/^src\/.+\.m?ts$/.test(rest) || pkg.exclude.some((pattern) => prefixes.some((prefix) => pattern.test(prefix)))) return undefined;
    return `${pkg.dir}/${rest.replace(/^src\//, "dist/").replace(/\.mts$/, ".mjs").replace(/\.ts$/, ".js")}`;
  };
  const entryOf = (spec) => {
    const match = /^(@[^/]+\/[^/]+|[^@./][^/]*)(\/.*)?$/.exec(spec);
    const pkg = match && packages.get(match[1]);
    if (!pkg) return undefined;
    const subpath = `.${match[2] ?? ""}`;
    const value = typeof pkg.json.exports === "string" ? (subpath === "." ? pkg.json.exports : undefined) : pkg.json.exports?.[subpath];
    const target = typeof value === "string" ? value : value?.import ?? value?.default ?? value?.node ?? value?.types;
    return { pkg, subpath, target, file: typeof target === "string" ? distToSrc(pkg, target.replace(/^\.\//, "")) : undefined };
  };
  const entriesOf = (pkg) => Object.keys(typeof pkg.json.exports === "object" ? pkg.json.exports ?? {} : { ".": 1 }).map((subpath) => ({ subpath, ...entryOf(subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`) }));

  const classified = new Map();
  /** { kind: test | free | src | dist | name | external, pkg?, file?, subpath? } for the specifier of `file`. */
  const classify = (file, spec) => {
    const key = `${file}\0${spec}`;
    if (classified.has(key)) return classified.get(key);
    let result;
    if (spec.startsWith(".")) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      const owner = ownerOf(target);
      const rest = owner ? target.slice(owner.dir.length + 1) : "";
      if (owner && /^src(?:\/|$)/.test(rest)) result = { kind: "src", pkg: owner, file: resolveFile(target), path: target };
      else if (owner && /^dist(?:\/|$)/.test(rest)) result = { kind: "dist", pkg: owner, file: distToSrc(owner, rest), path: target };
      else result = { kind: !owner && target.startsWith("tests/") ? "test" : "free", file: resolveFile(target), path: target };
    } else {
      const entry = entryOf(spec);
      result = entry ? { kind: "name", ...entry } : { kind: "external" };
    }
    classified.set(key, result);
    return result;
  };

  const importsOf = (file) => {
    const text = /\.(?:ts|mts|mjs)$/.test(file) ? snapshot.read(file) : null;
    const hit = parseCache.get(file);
    if (hit && hit.text === text) return hit.records;
    const records = text === null ? [] : parseImports(file, text, { deep: isTestFile(file) });
    parseCache.set(file, { text, records });
    return records;
  };

  const successors = new Map();
  /** The nodes (file, mode) a node loads: mode is free (tests, scripts), src or dist. Unresolvable loads carry only the package. */
  const successorsOf = (file, mode) => {
    const key = `${mode}|${file}`;
    if (successors.has(key)) return successors.get(key);
    const owner = ownerOf(file);
    const out = [];
    for (const record of importsOf(file)) {
      if (record.typeOnly) continue;
      const found = classify(file, record.spec);
      const step = { spec: record.spec, line: record.line, to: undefined, load: undefined };
      if (found.kind === "external") continue;
      if (found.kind === "test") step.to = [found.file, "free"];
      else if (found.kind === "free") step.to = [found.file, owner && mode !== "free" ? mode : "free"];
      else if (found.kind === "src") {
        const nested = mode === "dist" && owner?.dir === found.pkg.dir;
        step.to = [found.file, nested ? "dist" : "src"];
        step.load = [found.pkg.name, nested ? "dist" : "src"];
      } else { step.to = [found.file, "dist"]; step.load = [found.pkg.name, "dist"]; }
      if (step.to[0] === undefined) step.to = undefined;
      out.push(step);
    }
    successors.set(key, out);
    return out;
  };

  const reached = new Map();
  /** Everything a build module loads, as "package|mode" strings. The build side is the same for every process, so it is computed once. */
  const buildReach = (file) => {
    if (reached.has(file)) return reached.get(file);
    const found = new Set();
    const seen = new Set([`dist|${file}`]);
    for (const queue = [[file, "dist"]], head = { index: 0 }; head.index < queue.length; head.index++) {
      const [current, mode] = queue[head.index];
      const owner = ownerOf(current);
      if (owner && mode !== "free") found.add(`${owner.name}|${mode}`);
      for (const step of successorsOf(current, mode)) {
        if (step.load) found.add(`${step.load[0]}|${step.load[1]}`);
        if (!step.to || seen.has(`${step.to[1]}|${step.to[0]}`)) continue;
        seen.add(`${step.to[1]}|${step.to[0]}`);
        queue.push(step.to);
      }
    }
    reached.set(file, found);
    return found;
  };

  /**
   * Breadth-first from one process: the tests/ files it reads (its closure) and, per package, how it loads it. With `chains` it
   * also remembers a path to the first node that loaded each package in each mode (slower: it does not reuse the build side).
   */
  const walk = (processFile, chains = false) => {
    const start = `free|${processFile}`;
    const parent = new Map([[start, null]]);
    const closure = new Set([processFile]);
    const loads = new Map();
    const mark = (pkg, mode, key) => { const entry = loads.get(pkg) ?? {}; if (!entry[mode]) { entry[mode] = key; loads.set(pkg, entry); } };
    for (let queue = [[processFile, "free", start]], index = 0; index < queue.length; index++) {
      const [file, mode, key] = queue[index];
      const owner = ownerOf(file);
      if (mode === "dist" && !chains) { for (const entry of buildReach(file)) mark(...entry.split("|"), key); continue; }
      if (owner && mode !== "free") mark(owner.name, mode, key);
      for (const step of successorsOf(file, mode)) {
        const edge = { from: key, text: `${file}:${step.line} ${step.spec}` };
        if (step.load && !step.to) { const pseudo = `${key}\0${step.spec}`; parent.set(pseudo, edge); mark(step.load[0], step.load[1], pseudo); }
        if (!step.to) continue;
        const next = `${step.to[1]}|${step.to[0]}`;
        if (parent.has(next)) continue;
        parent.set(next, edge);
        if (step.to[1] === "free" && isTestFile(step.to[0])) closure.add(step.to[0]);
        queue.push([step.to[0], step.to[1], next]);
      }
    }
    const chainOf = (key) => { const steps = []; for (let edge = parent.get(key); edge; edge = parent.get(edge.from)) steps.unshift(edge.text); return steps; };
    return { file: processFile, closure, loads, chainOf };
  };
  const splitsOf = (result) => [...result.loads].filter(([, entry]) => entry.src && entry.dist).map(([pkg]) => pkg).sort();

  /** Every process, and every tests/ file no process reads (spawned fixtures), with the packages each loads both ways. */
  const analyze = () => {
    const results = [];
    const covered = new Set();
    for (const file of snapshot.files.filter(isProcessFile).sort()) {
      const result = walk(file);
      for (const member of result.closure) covered.add(member);
      results.push({ file, kind: "test", closure: result.closure, splits: splitsOf(result) });
    }
    for (const file of snapshot.files.filter((entry) => isTestFile(entry) && !covered.has(entry) && /\.(?:ts|mts|mjs)$/.test(entry)).sort()) {
      const result = walk(file);
      results.push({ file, kind: "entry", closure: result.closure, splits: splitsOf(result) });
    }
    return results;
  };
  /** How a process loads a package both ways: one path for the source side and one for the build side. */
  const chains = (processFile) => {
    const result = walk(processFile, true);
    return splitsOf(result).map((pkg) => ({ pkg, src: result.chainOf(result.loads.get(pkg).src), dist: result.chainOf(result.loads.get(pkg).dist) }));
  };

  return { packages, known, ownerOf, classify, importsOf, resolveFile, distOf, entryOf, entriesOf, analyze, chains, read: snapshot.read, files: snapshot.files };
}

/**
 * { file: number of packages its process loads both ways }, only the processes that split (what the health gate counts): the
 * tests/*.test.* files, and the tests/ files no test reads, which are the ones a test spawns (`kind: "entry"`, keyed by their own path).
 */
export const splitCounts = (results) => Object.fromEntries(results.filter((result) => result.splits.length).map((result) => [result.file, result.splits.length]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
