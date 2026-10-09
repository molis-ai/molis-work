// Static checks (specs/repository-anti-corruption §4.16, slice W1-09): a minimal Biome rule set, counted per file and
// frozen, so it can only fall. The tool is Biome (root biome.jsonc); tooling/gates/README.md ("Static checks") says why, what
// each rule is for and how to turn a rule on for one package. scripts/check-health-gates.mjs turns every rule here into a
// metric that behaves exactly like the compatibility markers: the head and the merge-base are measured with this same code
// and the head's configuration, so a change of the rule set needs no re-baselining, and `--update` cannot launder growth.
//
// WHAT IS MEASURED. Every tracked .ts, .mts and .mjs file under apps, horizontal, modules, packages, plugins, server,
// tooling, tests, scripts and examples (not .d.ts, dist or node_modules) is copied, with biome.jsonc and the GritQL plugins it
// names, into a scratch directory, and `biome lint` runs there. A scratch tree has no node_modules and no build output, so
// the result depends on nothing but the tracked files and the pinned Biome version: the same on every machine, in CI, and on
// the merge-base, which has no checkout to run in. The price is in the one type-aware rule: noFloatingPromises follows a
// promise through imports between files of the tree (relative imports), not through a package name, so a call into
// another workspace package is not seen. Editors and `pnpm lint` run in place and may show more; the gate's number is the
// scratch one.
//
// THE COUNTS (baseline.json keys, one { file: count } each, a file with no record starts at 0):
//   emptyCatches        molis/no-empty-catch (tooling/gates/lint/no-empty-catch.grit): a `catch` clause whose block has no
//                       statement and no comment. The same definition and the same per-file numbers as the AST counter this
//                       replaces (W1-04); Biome's noEmptyBlockStatements is not used because it reports every empty function.
//   unknownCasts        molis/no-double-cast (no-double-cast.grit): `x as unknown as T`, `(x as unknown) as T`, `<T><unknown>x`.
//   floatingPromises    nursery/noFloatingPromises: a promise neither awaited, returned, handled with .catch nor marked `void`.
//   explicitAny         suspicious/noExplicitAny.
//   consoleCalls        suspicious/noConsole, off for the command-line programs and scripts that print (biome.jsonc overrides).
//   debuggerStatements  suspicious/noDebugger.
//   lintParseErrors     a file Biome cannot parse: no rule runs on it, so it is counted instead of skipped silently.
//   lintSuppressions    `biome-ignore` comments, which silence a rule: counted so that they are no way around the others.
// PLUS lintPolicy: the shape of biome.jsonc. It is compared with the merge-base's and may only get stricter (no rule removed
// or switched off for a directory, no new exclusion, no plugin dropped), and nested Biome configurations are refused: the
// gate reads the root one only.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

export const CONFIG_FILE = "biome.jsonc";
export const LINT_ROOTS = ["apps", "horizontal", "modules", "packages", "plugins", "server", "tooling", "tests", "scripts", "examples"];
const LINT_FILE = new RegExp(`^(?:${LINT_ROOTS.join("|")})/.+\\.(?:ts|mts|mjs)$`);
export const isLintFile = (file) => LINT_FILE.test(file) && !file.endsWith(".d.ts") && !/(^|\/)(?:node_modules|dist)\//.test(file);
/** The files a merge-base snapshot has to hold for the gate to measure it. */
export const lintWantsText = (file) => isLintFile(file) || file === CONFIG_FILE;

// A suppression comment as Biome reads it: the word biome-ignore (also with -all or -start) and then a rule category.
const SUPPRESSION = /biome-ignore(?:-all|-start)?[ \t]+(?:lint|plugin|syntax|assist)\b/g;

const HINT_RULE = "(a rule that does not fit a directory is switched off there in biome.jsonc, with a reason, in a reviewed change)";
/**
 * The counts. `biome` is the rule in biome.jsonc ("group/rule") that produces it, or null for a count Biome produces some
 * other way; `plugin` is the prefix of a plugin diagnostic's message.
 */
export const LINT_RULES = [
  { id: "emptyCatches", plugin: "molis/no-empty-catch", title: "Empty catch blocks", summary: "empty catches", what: "empty catch blocks",
    hint: "handle the error, or say in a comment inside the block why ignoring it is safe" },
  { id: "unknownCasts", plugin: "molis/no-double-cast", title: "`as unknown as` casts", summary: "unknown casts", what: "`as unknown as` casts",
    hint: "type the value, narrow it, or validate it instead of asserting through unknown" },
  { id: "floatingPromises", biome: "nursery/noFloatingPromises", title: "Floating promises", summary: "floating promises", what: "floating promises",
    hint: "await it, return it, handle it with .catch, or write `void` where dropping it is meant" },
  { id: "explicitAny", biome: "suspicious/noExplicitAny", title: "Explicit `any` types", summary: "explicit any", what: "explicit `any` types",
    hint: "use the real type, or `unknown` and narrow it" },
  { id: "consoleCalls", biome: "suspicious/noConsole", title: "console calls (leftover debug output)", summary: "console calls", what: "console calls",
    hint: `delete it, or log through the host's logger ${HINT_RULE}` },
  { id: "debuggerStatements", biome: "suspicious/noDebugger", title: "debugger statements", summary: "debugger statements", what: "debugger statements",
    hint: "delete it" },
  { id: "lintParseErrors", category: "parse", title: "Files Biome cannot parse (no rule runs on them)", summary: "unparsable files", what: "syntax errors Biome reports",
    hint: "fix the syntax; a file that does not parse is checked by no rule" },
  { id: "lintSuppressions", title: "Lint suppression comments (biome-ignore)", summary: "lint suppressions", what: "lint suppression comments",
    hint: "fix what the rule found instead of silencing it" },
];
const RULE_BY_BIOME = new Map(LINT_RULES.filter((rule) => rule.biome).map((rule) => [`lint/${rule.biome}`, rule]));
const PLUGIN_RULES = LINT_RULES.filter((rule) => rule.plugin);

/** The counter a Biome diagnostic belongs to; throws for a diagnostic nothing counts, so a new rule cannot go uncounted. */
const ruleOf = (diagnostic) => {
  if (diagnostic.category === "parse") return LINT_RULES.find((rule) => rule.category === "parse");
  if (diagnostic.category === "plugin") {
    const rule = PLUGIN_RULES.find((candidate) => diagnostic.message.startsWith(candidate.plugin));
    if (rule) return rule;
  }
  const rule = RULE_BY_BIOME.get(diagnostic.category);
  if (rule) return rule;
  if (diagnostic.severity === "information" || diagnostic.severity === "info" || diagnostic.severity === "hint") return null;
  // An unused or malformed suppression is about a comment lintSuppressions already counts.
  if (String(diagnostic.category).startsWith("suppressions/")) return null;
  throw new Error(`Biome reported ${diagnostic.category} (${diagnostic.message.slice(0, 120)}) in ${diagnostic.location?.path ?? "the configuration"}, which no count in scripts/gates/lint.mjs covers; add the rule there or take it out of biome.jsonc`);
};

// ---- the configuration ------------------------------------------------------------------------------------------------
const parseConfig = (text, where) => {
  const { config, error } = ts.parseConfigFileTextToJson(where, text);
  if (error || !config || typeof config !== "object") throw new Error(`${where} is not valid JSON with comments`);
  return config;
};
const configPluginsOf = (config) => (Array.isArray(config.plugins) ? config.plugins.filter((entry) => typeof entry === "string") : []);
const levelOf = (value) => (typeof value === "string" ? value : value && typeof value === "object" ? (value.level ?? "error") : "off");

/** Every ("group/rule", level) a `rules` object sets. A group given as a bare level is returned as ("group/*", level). */
const ruleLevels = (rules) => {
  const out = [];
  for (const [group, entries] of Object.entries(rules && typeof rules === "object" ? rules : {})) {
    if (group === "preset" || group === "recommended") continue;
    if (typeof entries === "string") out.push([`${group}/*`, entries]);
    else for (const [rule, value] of Object.entries(entries ?? {})) out.push([`${group}/${rule}`, levelOf(value)]);
  }
  return out;
};

/**
 * The part of biome.jsonc that decides what is checked, in a form that two versions can be compared in. A scope is "*" (the
 * whole tree) or one glob of an override's `includes`, so adding a directory to an override is a new scope and removing one
 * is a lost scope, however the lists are grouped:
 *   rules   { "group/rule": [the scopes where it is an error] }
 *   off     "group/rule@scope=level" for every scope where a rule is set to anything but error
 *   ignored the `!` entries of files.includes and linter.includes, and of an override's includes
 *   plugins the plugin files
 *   preset  the rule preset ("none": only the rules listed here run)
 */
export const policyOf = (text) => {
  if (text === null || text === undefined) return null;
  const config = parseConfig(text, CONFIG_FILE);
  const rulesBlock = config.linter?.rules ?? {};
  const preset = rulesBlock.preset ?? (rulesBlock.recommended === false ? "none" : "recommended");
  const policy = { linterEnabled: config.linter?.enabled !== false, preset, rules: {}, off: [], ignored: [], plugins: configPluginsOf(config) };
  const place = (rule, level, scopes) => {
    for (const scope of scopes) {
      if (level === "error") (policy.rules[rule] ??= []).push(scope);
      else policy.off.push(`${rule}@${scope}=${level}`);
    }
  };
  const exclusions = (list, prefix = "") => { for (const entry of Array.isArray(list) ? list : []) if (String(entry).startsWith("!")) policy.ignored.push(`${prefix}${entry}`); };
  for (const [rule, level] of ruleLevels(config.linter?.rules)) place(rule, level, ["*"]);
  exclusions(config.files?.includes);
  exclusions(config.linter?.includes);
  for (const override of Array.isArray(config.overrides) ? config.overrides : []) {
    const globs = Array.isArray(override.includes) ? override.includes.map(String) : [];
    const scopes = globs.filter((glob) => !glob.startsWith("!"));
    if (!scopes.length) scopes.push("*");
    exclusions(globs, "override:");
    exclusions(override.linter?.includes, "override:");
    if (override.linter?.enabled === false) place("linter", "off", scopes);
    for (const [rule, level] of ruleLevels(override.linter?.rules)) place(rule, level, scopes);
  }
  for (const key of Object.keys(policy.rules)) policy.rules[key].sort();
  policy.rules = Object.fromEntries(Object.entries(policy.rules).sort(([a], [b]) => a.localeCompare(b)));
  policy.off.sort(); policy.ignored.sort(); policy.plugins.sort();
  return policy;
};

/** Problems with the configuration itself, whatever the merge-base says. */
export const policyProblems = (policy) => {
  if (!policy) return [];
  const problems = [];
  if (!policy.linterEnabled) problems.push("the linter is switched off in biome.jsonc");
  const known = new Set(LINT_RULES.filter((rule) => rule.biome).map((rule) => rule.biome));
  for (const rule of Object.keys(policy.rules)) {
    if (!known.has(rule)) problems.push(`biome.jsonc turns on ${rule}, which no count in scripts/gates/lint.mjs covers; add it to LINT_RULES (and its definition to tooling/gates/README.md) or take it out`);
  }
  for (const entry of policy.off) {
    const level = entry.slice(entry.lastIndexOf("=") + 1);
    if (level !== "off") problems.push(`biome.jsonc sets ${entry.slice(0, entry.lastIndexOf("="))} to ${level}; a rule is an error or it is off (a warning is counted like an error and fails nothing)`);
  }
  if (policy.preset !== "none") problems.push(`biome.jsonc uses the "${policy.preset}" preset; only the rules it lists are counted, so set "preset": "none"`);
  for (const plugin of policy.plugins) {
    if (!/^\.\/tooling\/gates\/lint\/[^/]+\.grit$/.test(plugin)) problems.push(`biome.jsonc names the plugin ${plugin}; the gate runs the GritQL plugins in tooling/gates/lint/ only`);
  }
  return problems;
};

/** What got looser from `ref` (the merge-base's policy) to `head`. A rule set only gets stricter. */
export const looserThan = (head, ref) => {
  if (!head || !ref) return [];
  const out = [];
  if (ref.linterEnabled && !head.linterEnabled) out.push("the linter is switched off");
  for (const [rule, scopes] of Object.entries(ref.rules)) {
    const now = head.rules[rule] ?? [];
    if (now.includes("*")) continue;
    for (const scope of scopes) if (!now.includes(scope)) out.push(`${rule} is no longer an error ${scope === "*" ? "everywhere" : `for ${scope}`}`);
  }
  for (const entry of head.off) if (!ref.off.includes(entry)) out.push(`${entry.slice(0, entry.lastIndexOf("="))} is switched off`);
  for (const entry of head.ignored) if (!ref.ignored.includes(entry)) out.push(`${entry} excludes files from the check`);
  for (const plugin of ref.plugins) if (!head.plugins.includes(plugin)) out.push(`the plugin ${plugin} is gone`);
  return out;
};

// ---- running Biome ------------------------------------------------------------------------------------------------------
const biomeEntry = () => path.join(path.dirname(createRequire(import.meta.url).resolve("@biomejs/biome/package.json")), "bin/biome");

/**
 * Lints `texts` (a Map of repository-relative path to text) in a scratch tree with the configuration of the repository at
 * `root`. Returns { counts: { id: { file: n } }, lines: { id: { file: [line…] } } }.
 */
export const lintTexts = (root, texts) => {
  const configText = readFileSync(path.join(root, CONFIG_FILE), "utf8");
  const dir = mkdtempSync(path.join(os.tmpdir(), "molis-lint-"));
  try {
    const put = (relative, text) => { const target = path.join(dir, relative); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, text); };
    put(CONFIG_FILE, configText);
    for (const plugin of configPluginsOf(parseConfig(configText, CONFIG_FILE))) put(path.posix.normalize(plugin), readFileSync(path.join(root, plugin), "utf8"));
    for (const [file, text] of texts) put(file, text);
    const run = spawnSync(process.execPath, [biomeEntry(), "lint", "--reporter=json", "--max-diagnostics=none", "--colors=off", "--no-errors-on-unmatched", "."],
      { cwd: dir, encoding: "utf8", maxBuffer: 1 << 30 });
    let report;
    try { report = JSON.parse(run.stdout); } catch { throw new Error(`biome lint printed no report (exit ${run.status}): ${`${run.stderr}`.trim().slice(0, 600)}`); }
    const counts = Object.fromEntries(LINT_RULES.map((rule) => [rule.id, {}]));
    const lines = Object.fromEntries(LINT_RULES.map((rule) => [rule.id, {}]));
    for (const diagnostic of report.diagnostics ?? []) {
      const rule = ruleOf(diagnostic);
      if (!rule) continue;
      const file = diagnostic.location?.path;
      if (!file || file === CONFIG_FILE) throw new Error(`Biome rejected ${CONFIG_FILE}: ${diagnostic.message}`);
      // A file that does not parse counts once however many errors Biome reports for it (the number depends on its recovery).
      counts[rule.id][file] = rule.category === "parse" ? 1 : (counts[rule.id][file] ?? 0) + 1;
      (lines[rule.id][file] ??= []).push(diagnostic.location.start?.line ?? 0);
    }
    for (const [file, text] of texts) {
      const found = (text.match(SUPPRESSION) ?? []).length;
      if (found) counts.lintSuppressions[file] = found;
    }
    return { counts, lines };
  } finally { rmSync(dir, { recursive: true, force: true }); }
};

/** Tracked files that look like a second Biome configuration: the gate reads the root one only, so they would be ignored. */
const nestedConfigs = (files) => files.filter((file) => /(^|\/)biome\.jsonc?$/.test(file) && file !== CONFIG_FILE).sort();

// ---- the metrics --------------------------------------------------------------------------------------------------------
const lineDetails = new WeakMap(); // the { file: count } object a rule measured -> { file: [line…] }
const passes = new WeakMap();      // snapshot -> its measurement

/**
 * The metrics for scripts/check-health-gates.mjs. `required` says that this repository must have a configuration (the
 * scratch repositories of the other gate tests have none and are left alone). `helpers` are the entry's own comparison tools.
 */
export const createLintMetrics = ({ root, required, fail, perFile, rekey, rekeyFile, sumOf, requireShape }) => {
  const configPath = path.join(root, CONFIG_FILE);
  const configured = () => existsSync(configPath);
  const empty = () => ({ counts: Object.fromEntries(LINT_RULES.map((rule) => [rule.id, {}])), lines: Object.fromEntries(LINT_RULES.map((rule) => [rule.id, {}])) });
  const measureSnapshot = (snapshot) => {
    let result = passes.get(snapshot);
    if (result) return result;
    if (configured()) {
      const texts = new Map();
      for (const file of snapshot.files) {
        if (!isLintFile(file)) continue;
        const text = snapshot.read(file);
        if (text !== null) texts.set(file, text);
      }
      try { result = lintTexts(root, texts); } catch (error) { fail(`static checks: ${error.message}`); }
    } else result = empty();
    for (const rule of LINT_RULES) lineDetails.set(result.counts[rule.id], result.lines[rule.id]);
    passes.set(snapshot, result);
    return result;
  };

  const ruleMetric = (rule) => ({
    id: rule.id,
    measure: (snapshot) => measureSnapshot(snapshot).counts[rule.id],
    toBaseline: (counts) => ({ [`${rule.id}Total`]: sumOf(counts), [rule.id]: counts }),
    fromBaseline: (json) => perFile.fromBaseline(json, rule.id),
    grew(head, ref, { renames }) {
      const before = rekey(ref, renames, rekeyFile);
      const where = Object.fromEntries(Object.entries(lineDetails.get(head) ?? {}).map(([file, lines]) => [file, [...new Set(lines)].sort((a, b) => a - b)]));
      return Object.entries(head).filter(([file, count]) => count > (before[file] ?? 0)).map(([file, count]) =>
        `${rule.what} in ${file} ${before[file] ?? 0} → ${count}${where[file]?.length ? ` (line${where[file].length > 1 ? "s" : ""} ${where[file].join(", ")})` : ""}; ${rule.hint}`);
    },
    lowered: perFile.lowered,
    lines: (head, ref, env) => perFile.lines(rule.title, head, ref, env),
    summary: (counts) => `${sumOf(counts)} ${rule.summary}`,
  });

  const policyMetric = {
    id: "lintPolicy",
    measure(snapshot) {
      try {
        const policy = policyOf(snapshot.read(CONFIG_FILE));
        return policy && { ...policy, nested: nestedConfigs(snapshot.files) };
      } catch (error) { return fail(`static checks: ${error.message}`); }
    },
    toBaseline: (policy) => ({ lintPolicy: policy }),
    fromBaseline(json) { requireShape(json.lintPolicy === null || (json.lintPolicy && typeof json.lintPolicy === "object"), "lintPolicy"); return json.lintPolicy; },
    absolute: (policy) => [
      ...(policy === null && required ? [`${CONFIG_FILE} is missing: the static checks (scripts/gates/lint.mjs) read it, and without it they check nothing`] : []),
      ...policyProblems(policy),
      ...(policy?.nested ?? []).map((file) => `${file} is a nested Biome configuration; the static checks read ${CONFIG_FILE} only, so put the rule or the exception there`),
    ],
    grew: (head, ref) => looserThan(head, ref).map((what) => `${CONFIG_FILE} is looser than the merge-base's: ${what}; the rule set only gets stricter (a new exclusion or a rule switched off for a directory is a decision for a reviewed change to this gate)`),
    lowered: () => false,
    lines: (head) => [`Static check rules (${CONFIG_FILE}): ${head ? `${Object.keys(head.rules).length} rules, ${head.off.length} directory exceptions, ${head.plugins.length} plugins` : "no configuration"}`],
    summary: (policy) => `${policy ? Object.keys(policy.rules).length + policy.plugins.length : 0} lint rules`,
  };

  return [...LINT_RULES.map(ruleMetric), policyMetric];
};

