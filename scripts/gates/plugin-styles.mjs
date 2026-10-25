#!/usr/bin/env node
// Plugin style budget (PG-070, RAC-769): a plugin's own rules do not belong in the shared stylesheets. A plugin whose page
// runs in a frame sends the rules of its own namespace as `/assets/molis-work-plugins/<id>.css`, linked only by the frames
// that need it (`apps/workbench/src/plugin-workbench.ts`); the pages the shell itself draws — Feed today, Goals until its
// line moves — still have their stylesheet in the shared sheets. Each plugin's remaining count only falls.
//
// What is counted, per plugin with a registered stylesheet: the rule blocks (not bytes: the unit the splitter moves is a
// rule) that name the plugin's own classes or data attributes and that one of the shared sheets still holds. The splitter
// (apps/workbench/src/plugin-styles.ts, the first slice) first finds what a framed plugin's sheet sends on demand and what
// the shared sheet takes; the second pass counts, inside that shared part, every rule whose selectors name the plugin,
// WITHOUT discounting `stylesheetShared`. Declaring a class shared therefore cannot hide a rule, and a frame does not make
// the number zero either: anything the shared sheet still holds is measured. A plugin whose frame already sends its own
// sheet should only be left with rules that are deliberately shared (the coding workbench's data attributes, the plugin
// studio's preview pages); those are frozen where they are, not exempted.
//
// `stylesheetPrefixes` is what lets a plugin whose classes predate its id declare them (`as-`, `pb-` for the studio). The
// budget file remembers the prefixes each measured plugin declared; the measurement uses the union of those and the ones the
// build declares, so deleting a prefix cannot make rules disappear from the count, and the check below refuses a prefix that
// is no longer declared. Adding a prefix only adds rules to the count.
//
// Goals is measured the same way in spirit: it has no registered stylesheet and no frame, and `apps/workbench/src/page-assets.ts`
// imports `GOALS_DOCUMENT_STYLES`, `TRASH_GOAL_STYLES` and `PLANNING_SETTINGS_STYLES` straight into the shared sheets, so its
// three explicitly enumerated document style constants are held there and frozen; this is not import discovery.
//
// A number may only fall. `--update` refuses when any plugin grew relative to the reference (with `--base`: the merge-base's
// copy, otherwise the committed file) and it refuses to write a plugin the file does not know, so a new plugin with rules in
// the shared sheets is refused instead of frozen. Removing an entry is always allowed once the plugin no longer measures.
//
// Not covered, said here so nobody reads the gate as stronger than it is (the spec §5a records the same list):
//  - The count is the splitter's verdict, so a plugin whose class names do not start with its id and that forgets to declare
//    `stylesheetPrefixes` measures 0 here (the splitter sees no rule of its own). Text Stats is such a plugin today; its rules
//    stay shared because it has no frame, and its number is not part of this budget.
//  - Rules a plugin keeps in a host module rather than its registration stylesheet are not seen: only the registered
//    `stylesheet` and, for Goals, the three constants named above are measured. A fourth Goals constant newly imported by
//    page-assets is not counted automatically: add it to measureFromBuild's goalsStyles and update the real-build gate test
//    when adding the constant, then run plugin-styles-gate.test.ts and plugin-styles --base. No other Goals exports are scanned.
//  - The shared sheets are not searched for plugin rules that no registration names (a class copied by hand into a host
//    stylesheet is invisible to the splitter too).
//  - Sizes are not measured here; `/assets/` bytes are `scripts/gates/page-assets.mjs`. The two files can disagree about what a
//    "plugin style" is only if the splitter changes, and RAC-756/757 pin the splitter's behaviour in tests/plugin-styles.test.ts.
//
//   node scripts/gates/plugin-styles.mjs                  measure and compare with tooling/gates/plugin-styles.json
//   node scripts/gates/plugin-styles.mjs --base <ref>      also compare that file with the merge-base's copy: a count that was
//                                                          raised, or an entry that was added, relative to the merge-base fails.
//   --update                       write the file from the measurement; refuses when anything grew (with --base: relative to
//                                  the merge-base), and refuses an unknown plugin with rules left.
//   --report [--json]              print every plugin: measured rule blocks, budget, merge-base budget
//   --root <dir>                   gate another repository root (tests/plugin-styles-gate.test.ts)
//   --counts <file>                test hook: take { "<plugin id>": <rule blocks> } from a JSON file instead of the build
// Exit codes: 0 passed, 1 a gate failed, 2 the command or the environment is unusable (a missing build is exit 2, never a pass).
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// ---- counting rule blocks -------------------------------------------------------------------------------------------
// A rule block is a style rule (`selector { … }`), not an at-rule wrapper: `@media`, `@supports` and `@container` carry rules
// inside and are not counted themselves; `@keyframes`, `@font-face` and `@import` are not rules a plugin sheet moves. Nested
// rules count where they are. Comments and strings are skipped so their braces and semicolons do not confuse the scan.
export function countRules(css) {
  let rules = 0, index = 0, prelude = "";
  const stack = [];
  const insideKeyframes = () => stack.some((frame) => frame.keyframes);
  while (index < css.length) {
    const char = css[index];
    if (char === "/" && css[index + 1] === "*") {
      const end = css.indexOf("*/", index + 2);
      index = end < 0 ? css.length : end + 2;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      index++;
      while (index < css.length) {
        if (css[index] === "\\") { index += 2; continue; }
        if (css[index] === quote) { index++; break; }
        index++;
      }
      continue;
    }
    if (char === "{") {
      const head = prelude.trim(), at = head.startsWith("@");
      stack.push({ at, keyframes: at && /^@(?:-[a-z]+-)?keyframes\b/i.test(head) });
      if (!at && !insideKeyframes()) rules++;
      prelude = "";
      index++;
      continue;
    }
    if (char === "}") { stack.pop(); prelude = ""; index++; continue; }
    if (char === ";") { prelude = ""; index++; continue; }
    prelude += char;
    index++;
  }
  return rules;
}

// The rule blocks of the plugin's own namespace that the shared sheet still holds. `split` is the first slice's
// `splitPluginStylesheet`; `framed` says whether the build already sends this plugin its own sheet (its shared half is then
// the split's `shared`, otherwise the whole registered sheet is in the shared sheet). The second split deliberately passes
// no shared classes: a rule that names the plugin is counted wherever the shared sheet has it, however the registration
// labels it.
export function rulesInSharedSheet(split, stylesheet, id, { sharedClasses = [], prefixes = [], framed = true } = {}) {
  const sharedSheet = framed ? split(stylesheet, id, sharedClasses, prefixes).shared : stylesheet;
  return countRules(split(sharedSheet, id, [], prefixes).scoped);
}

// ---- the executable part ---------------------------------------------------------------------------------------------
async function main() {
const USAGE = "usage: plugin-styles.mjs [--base <ref>] [--update] [--report [--json]] [--root <dir>] [--counts <file>]";
const fail = (message) => { console.error(message); process.exit(2); };

// ---- command line ---------------------------------------------------------------------------------------------------
const args = process.argv.slice(2);
const options = {};
const flags = new Set();
for (let index = 0; index < args.length; index++) {
  const [name, inline] = args[index].split(/=(.*)/s);
  if (["--update", "--report", "--json"].includes(name)) flags.add(name);
  else if (["--base", "--root", "--counts"].includes(name)) {
    const value = inline ?? args[++index];
    if (!value || value.startsWith("--")) fail(`${name} needs a value\n${USAGE}`);
    options[name.slice(2)] = value;
  } else fail(`unknown argument ${args[index]}\n${USAGE}`);
}
if (flags.has("--json") && !flags.has("--report")) fail(`--json goes with --report\n${USAGE}`);
const update = flags.has("--update"), report = flags.has("--report");
const root = options.root ? path.resolve(options.root) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUDGET_FILE = "tooling/gates/plugin-styles.json";
const budgetPath = path.join(root, BUDGET_FILE);
const NOTE = "Only decreases. For each plugin with a registered stylesheet, the rule blocks of its own namespace that the "
  + "shared stylesheets still hold: the first slice's splitter finds the shared part, then a second pass counts every rule in "
  + "it that names the plugin, without discounting stylesheetShared (declaring a class shared cannot hide a rule, and a frame "
  + "does not make the number zero). stylesheetPrefixes are remembered per plugin and may only be added; the measurement uses "
  + "the union with the build's. Goals counts the document styles page-assets imports into the shared sheets. Measured from "
  + "the build by scripts/gates/plugin-styles.mjs; lower it with `node scripts/gates/plugin-styles.mjs --update --base "
  + "origin/main` in the PR that moves rules out. CI compares this file with the merge-base's copy, so raising a number or "
  + "adding a plugin here is refused.";

const git = (gitArgs) => {
  try { return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) { return fail(`git ${gitArgs.join(" ")} failed in ${root}: ${String(error.stderr ?? error.message).trim()}`); }
};
const gitMaybe = (gitArgs) => { try { return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

// ---- the budget file -------------------------------------------------------------------------------------------------
const parseBudget = (text, where) => {
  let parsed;
  try { parsed = JSON.parse(text); } catch { return fail(`${where} is not valid JSON`); }
  const plugins = parsed?.plugins;
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) return fail(`${where} needs a "plugins" object of { "<plugin id>": rule blocks }`);
  for (const [id, rules] of Object.entries(plugins)) {
    if (!/^[a-z][a-z0-9-]*$/.test(id)) return fail(`${where}: "${id}" is not a project_plugin_id`);
    if (!Number.isInteger(rules) || rules <= 0) return fail(`${where}: "${id}" needs a positive whole number of rule blocks`);
  }
  const prefixes = parsed?.prefixes ?? {};
  if (typeof prefixes !== "object" || Array.isArray(prefixes)) return fail(`${where} needs a "prefixes" object of { "<plugin id>": [prefix] }`);
  for (const [id, list] of Object.entries(prefixes)) {
    if (!Array.isArray(list)) return fail(`${where}: prefixes of "${id}" must be an array`);
    for (const prefix of list) if (typeof prefix !== "string" || !/^[a-z][a-z0-9]*-$/.test(prefix)) return fail(`${where}: "${id}" has an invalid stylesheet prefix ${JSON.stringify(prefix)}`);
  }
  return { plugins, prefixes };
};

// ---- what is still in the shared sheets -----------------------------------------------------------------------------
const distModule = async (file, what) => {
  const full = path.join(root, file);
  if (!existsSync(full)) return fail(`${file} is missing (${what}); build the workspace first: pnpm workspace:build`);
  try { return await import(pathToFileURL(full).href); }
  catch (error) { return fail(`could not load ${file} (${what}): ${String(error.message ?? error).trim()}`); }
};

async function measureFromBuild(knownPrefixes) {
  const workbench = await distModule("apps/workbench/dist/plugin-workbench.js", "the registered plugin packs");
  const splitter = await distModule("apps/workbench/dist/plugin-styles.js", "the first slice's stylesheet splitter");
  if (!Array.isArray(workbench.BUILTIN_PLUGIN_WORKBENCH)) return fail("apps/workbench/dist/plugin-workbench.js no longer exports BUILTIN_PLUGIN_WORKBENCH");
  if (typeof workbench.pluginOnDemandStylesheet !== "function") return fail("apps/workbench/dist/plugin-workbench.js no longer exports pluginOnDemandStylesheet");
  if (typeof splitter.splitPluginStylesheet !== "function") return fail("apps/workbench/dist/plugin-styles.js no longer exports splitPluginStylesheet");

  const measured = {};
  const prefixes = {};
  for (const pack of workbench.BUILTIN_PLUGIN_WORKBENCH) {
    if (!pack.stylesheet) continue;
    const id = pack.project_plugin_id;
    const declared = pack.stylesheetPrefixes ?? [];
    if (declared.length) prefixes[id] = declared;
    // The measurement uses every prefix the budget remembers too, so dropping one cannot shrink the count.
    const prefixesForCount = [...new Set([...(knownPrefixes?.[id] ?? []), ...declared])];
    const framed = workbench.pluginOnDemandStylesheet(id) !== null;
    const rules = rulesInSharedSheet(splitter.splitPluginStylesheet, pack.stylesheet, id,
      { sharedClasses: pack.stylesheetShared ?? [], prefixes: prefixesForCount, framed });
    if (rules > 0) measured[id] = rules;
  }

  // Goals has no registered stylesheet and no frame: page-assets imports its document styles straight into the shared sheets.
  const goals = await distModule("plugins/native/goals/dist/index.js", "the shell-drawn Goals document styles");
  const goalsStyles = ["GOALS_DOCUMENT_STYLES", "TRASH_GOAL_STYLES", "PLANNING_SETTINGS_STYLES"];
  for (const name of goalsStyles) if (typeof goals[name] !== "string") return fail(`plugins/native/goals/dist/index.js no longer exports ${name}, which page-assets imports into the shared sheets`);
  const goalsRules = countRules(goalsStyles.map((name) => goals[name]).join(""));
  if (goalsRules > 0) measured.goals = goalsRules;

  return { measured, prefixes };
}

async function measure(knownPrefixes) {
  if (!options.counts) return measureFromBuild(knownPrefixes);
  let counts;
  try { counts = JSON.parse(readFileSync(path.resolve(options.counts), "utf8")); } catch { return fail(`--counts ${options.counts} is not a readable JSON file`); }
  return { measured: parseBudget(JSON.stringify({ plugins: counts }), `--counts ${options.counts}`).plugins, prefixes: {} };
}

// ---- the rules -------------------------------------------------------------------------------------------------------
// head: what the build measures against the committed budget. The budget must be exactly what the build measures, so a
// shrink that did not lower its number is caught too (the next PR could otherwise grow back into the slack). A plugin that
// stops declaring a prefix the budget remembers gets a separate error: its rules would fall back into the shared sheets.
const headErrors = (measured, declaredPrefixes, budget, base) => {
  const errors = [];
  for (const [id, remembered] of Object.entries(budget.prefixes)) {
    for (const prefix of remembered) {
      if (!(declaredPrefixes[id] ?? []).includes(prefix)) errors.push(`${id} no longer declares stylesheet prefix ${prefix}; without it those rules fall back into the shared sheets (prefixes may only be added)`);
    }
  }
  for (const id of [...new Set([...Object.keys(measured), ...Object.keys(budget.plugins)])].sort()) {
    const rules = measured[id], allowed = budget.plugins[id];
    if (allowed === undefined && base?.plugins?.[id] !== undefined) {
      errors.push(`${id} (${rules} rule blocks) still keeps rules in the shared sheets but its entry was deleted from ${BUDGET_FILE} (the merge-base budgets ${base.plugins[id]}); deleting an entry does not exempt a plugin that keeps rules, restore it`);
    } else if (allowed === undefined) {
      errors.push(`${id} keeps ${rules} rule blocks in the shared sheets with no budget in ${BUDGET_FILE}; a plugin whose page runs in a frame brings its own sheet, and a page the shell draws is frozen with a number at the change that holds it there, never added here without review`);
    } else if (rules === undefined) {
      errors.push(`${id} has a budget but no longer keeps rules in the shared sheets; remove the entry from ${BUDGET_FILE} (removing is always allowed)`);
    } else if (rules > allowed) {
      errors.push(`${id} keeps more of its rules in the shared sheets: budget ${allowed} → built ${rules} rule blocks (+${rules - allowed}); move them into the plugin's own sheet, or the shell's line that owns them`);
    } else if (rules < allowed) {
      errors.push(`${id} is ${allowed - rules} rule blocks under its budget (${allowed} → built ${rules}); lower the budget with \`node scripts/gates/plugin-styles.mjs --update --base origin/main\` so the slack cannot be used again`);
    }
  }
  return errors;
};
// base: the budget file against the merge-base's. Raising a number, adding a plugin, or dropping a remembered prefix is the
// laundering move.
const baseErrors = (budget, base) => {
  const errors = [];
  for (const [id, allowed] of Object.entries(budget.plugins)) {
    if (base.plugins[id] === undefined) errors.push(`${BUDGET_FILE} adds ${id} (${allowed} rule blocks), which the merge-base did not budget; counts only fall and no plugin may be added`);
    else if (allowed > base.plugins[id]) errors.push(`${BUDGET_FILE} raises ${id} ${base.plugins[id]} → ${allowed}; counts only fall`);
  }
  for (const [id, remembered] of Object.entries(base.prefixes)) {
    for (const prefix of remembered) {
      if (!(budget.prefixes[id] ?? []).includes(prefix)) errors.push(`${BUDGET_FILE} drops the stylesheet prefix ${prefix} of ${id}; prefixes may only be added`);
    }
  }
  return errors;
};
// update: nothing may grow relative to the reference (the merge-base's budget, else the committed one); a missing
// reference is the first freeze. A plugin the reference does not know is refused while it still keeps rules.
const growthErrors = (measured, reference) => Object.entries(measured).flatMap(([id, rules]) => {
  if (reference.plugins[id] === undefined) return rules > 0 ? [`${id} (${rules} rule blocks) has no budget to lower`] : [];
  return rules > reference.plugins[id] ? [`${id} grew ${reference.plugins[id]} → ${rules}`] : [];
});
const prefixGrowthErrors = (budget, reference) => Object.entries(budget.prefixes).flatMap(([id, list]) => list
  .filter((prefix) => !(reference.prefixes[id] ?? []).includes(prefix))
  .filter((prefix) => (reference.plugins[id] ?? 0) > 0)
  .map((prefix) => `${id} adds the stylesheet prefix ${prefix} while its rules are still counted; a prefix may only be added when it does not hide the rules already in the budget`));

// ---- the merge-base's budget -----------------------------------------------------------------------------------------
let mergeBase = "";
let baseBudget = null;
const notes = [];
if (options.base) {
  const target = gitMaybe(["rev-parse", "--verify", "--quiet", `${options.base}^{commit}`]);
  if (!target) fail(`--base ${options.base} is not a commit in this clone; fetch it first (CI: scripts/ci-health-base.mjs does)`);
  mergeBase = gitMaybe(["merge-base", "HEAD", target]);
  if (!mergeBase) fail(`HEAD and ${options.base} share no history in this clone; fetch the full history`);
  // Only a clean answer that the file is not in the merge-base's tree (before this gate existed) skips the comparison;
  // an unreadable tree or blob is an error, never a pass.
  if (git(["ls-tree", "--name-only", mergeBase, "--", BUDGET_FILE]).trim()) {
    baseBudget = parseBudget(git(["cat-file", "blob", `${mergeBase}:${BUDGET_FILE}`]), `${mergeBase.slice(0, 8)}:${BUDGET_FILE}`);
  } else notes.push(`the merge-base has no ${BUDGET_FILE}, so the budget was not compared with it`);
}
const against = mergeBase ? `merge-base ${mergeBase.slice(0, 8)} (${options.base})` : BUDGET_FILE;
const budgetNow = () => {
  if (!existsSync(budgetPath)) return fail(`${budgetPath} is missing; create the freeze with --update`);
  return parseBudget(readFileSync(budgetPath, "utf8"), budgetPath);
};
const knownPrefixes = {};
if (baseBudget) Object.assign(knownPrefixes, baseBudget.prefixes);
if (existsSync(budgetPath)) Object.assign(knownPrefixes, budgetNow().prefixes);

const { measured, prefixes: declaredPrefixes } = await measure(knownPrefixes);
const total = Object.values(measured).reduce((sum, rules) => sum + rules, 0);

// ---- --report --------------------------------------------------------------------------------------------------------
if (report) {
  const budget = existsSync(budgetPath) ? budgetNow() : { plugins: {}, prefixes: {} };
  const rows = Object.keys(measured).sort((a, b) => measured[b] - measured[a] || a.localeCompare(b));
  if (flags.has("--json")) {
    console.log(JSON.stringify({ mergeBase: mergeBase || null, measured, prefixes: declaredPrefixes, budget: budget.plugins, budgetPrefixes: budget.prefixes, baseBudget: baseBudget?.plugins ?? null }, null, 2));
    process.exit(0);
  }
  console.log(`Plugin styles: ${rows.length} plugin${rows.length === 1 ? "" : "s"} keep rules in the shared sheets, ${total} rule blocks in all; against ${against}`);
  console.log(`  ${"rules".padStart(7)}${"budget".padStart(8)}${baseBudget ? "    base" : ""}  plugin`);
  for (const id of rows) console.log(`  ${String(measured[id]).padStart(7)}${String(budget.plugins[id] ?? "none").padStart(8)}${baseBudget ? String(baseBudget.plugins[id] ?? "none").padStart(8) : ""}  ${id}`);
  process.exit(0);
}

// ---- --update --------------------------------------------------------------------------------------------------------
if (update) {
  const reference = baseBudget ?? (!mergeBase && existsSync(budgetPath) ? budgetNow() : null);
  if (reference) {
    const errors = [...growthErrors(measured, reference), ...prefixGrowthErrors({ prefixes: declaredPrefixes }, reference)];
    if (errors.length) {
      console.error(`Budget not written: something grew relative to ${baseBudget ? against : BUDGET_FILE}:\n- ${errors.join("\n- ")}`);
      process.exit(1);
    }
  }
  const plugins = Object.fromEntries(Object.keys(measured).sort().map((id) => [id, measured[id]]));
  const prefixes = Object.fromEntries(Object.keys(declaredPrefixes).sort().filter((id) => declaredPrefixes[id].length).map((id) => [id, declaredPrefixes[id]]));
  mkdirSync(path.dirname(budgetPath), { recursive: true });
  writeFileSync(budgetPath, `${JSON.stringify({ note: NOTE, plugins, prefixes }, null, 2)}\n`);
  console.log(`plugin style budget written: ${Object.keys(plugins).length} plugin${Object.keys(plugins).length === 1 ? "" : "s"}, ${total} rule blocks${notes.length ? `. Note: ${notes.join("; ")}.` : ""}`);
  process.exit(0);
}

// ---- the verdict -----------------------------------------------------------------------------------------------------
const budget = budgetNow();
const errors = [...headErrors(measured, declaredPrefixes, budget, baseBudget), ...(baseBudget ? baseErrors(budget, baseBudget) : [])];
if (errors.length) {
  console.error(`Plugin style budgets failed against ${against}:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`Plugin style budgets passed against ${against} (${Object.keys(measured).length} plugin${Object.keys(measured).length === 1 ? "" : "s"}, ${total} rule blocks).${notes.length ? ` Note: ${notes.join("; ")}.` : ""}`);
}

if (process.argv[1] && pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href === import.meta.url) await main();
