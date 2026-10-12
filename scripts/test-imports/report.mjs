// What the tool prints: the split processes (--check) and the plan (--report), as lines of text or as data (--json).
import { keyOf } from "./plan.mjs";

const short = (name) => name.replace("@molis-ai/molis-work-", "");
const tally = (items) => { const counts = new Map(); for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1); return [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); };

/** The processes that load a package both from source and from the build, with a path for each side when `chains` is on. */
export function checkLines(graph, analysis, chains) {
  const split = analysis.filter((result) => result.splits.length);
  const lines = [`${split.length} of ${analysis.length} test processes load a package both from its source and from its build${split.some((result) => result.kind === "entry") ? " (entry = a tests/ file no test imports, such as a spawned fixture)" : ""}`];
  for (const result of split) {
    lines.push(`${result.kind === "entry" ? "entry " : ""}${result.file}: ${result.splits.map(short).join(", ")}`);
    if (!chains) continue;
    for (const entry of graph.chains(result.file)) {
      lines.push(`    ${short(entry.pkg)} from source:`, ...entry.src.map((step) => `      ${step}`), `    ${short(entry.pkg)} from the build:`, ...entry.dist.map((step) => `      ${step}`));
    }
  }
  if (split.length) lines.push("", "Fix: import the package by its name, or its built twin ../<package>/dist/…, in every file the process reads; `node scripts/test-imports.mjs --report` plans it.");
  return lines;
}

/** The per-specifier ledger of a plan, restricted to the selected files. */
export function ledger(plan, selected) {
  const rows = [];
  for (const action of plan.decision.actions.values()) {
    if (!selected.has(action.ref.file)) continue;
    const names = action.ref.imp.names?.map((element) => element.imported) ?? [];
    rows.push({ file: action.ref.file, line: action.ref.imp.line, rule: action.rule, from: action.ref.imp.spec, to: action.specifier, names, dynamic: ["dynamic", "require"].includes(action.ref.imp.form), pkg: action.ref.pkg.name, app: action.ref.pkg.dir.startsWith("apps/"), held: action.held, why: action.why });
  }
  for (const [file, planned] of plan.planned) {
    if (!selected.has(file)) continue;
    for (const [index, change] of planned) {
      if (!change.r5) continue;
      const imp = plan.files.get(file).imports[index];
      rows.push({ file, line: imp.line, rule: "R5", from: imp.spec, to: `type ${imp.spec}`, names: imp.names?.map((element) => element.imported) ?? [], dynamic: false, pkg: imp.found.pkg.name });
    }
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function reportLines(plan, result, options = {}) {
  const rows = ledger(plan, result.selected);
  const groups = plan.decision.groups;
  const blocked = groups.filter((group) => group.blocked);
  const countOf = (rule) => rows.filter((row) => row.rule === rule).length;
  const before = plan.analysis.filter((entry) => entry.splits.length).length;
  const after = result.after.filter((entry) => entry.splits.length).length;
  const lines = [
    `${plan.refs.length} internal references in ${new Set(plan.refs.map((ref) => ref.file)).size} test files; ${before} of ${plan.analysis.length} processes load a package both ways`,
    `${groups.length} groups: ${groups.filter((group) => group.converted).length} converted, ${blocked.length} blocked, ${groups.filter((group) => !group.converted && !group.blocked).length} left alone (no split, nothing to route)`,
    `${result.selected.size} files change${result.added.size ? ` (${result.added.size} added so no process is left half on source: ${[...result.added].join(", ")})` : ""}: R1 ${countOf("R1")} routed through an entry, R2 ${countOf("R2")} runtime and R3 ${countOf("R3")} type-only moved to the built twin, R4 ${countOf("R4")} swept, R5 ${countOf("R5")} \`type\` added`,
    `internal references fall by ${countOf("R1")}; processes that still load a package both ways: ${after} (was ${before})`,
  ];
  if (result.problems.length) lines.push("", "PROBLEMS (nothing is written):", ...result.problems.map((problem) => `  - ${problem}`));
  if (blocked.length) lines.push("", "Blocked groups (left as they are):", ...blocked.map((group) => `  - ${short(group.pkg)}: ${group.blocked}`));
  const needsRoot = tally(plan.refs.filter((ref) => ref.pkg && plan.decision.routes.get(keyOf(ref)).needsRootDependency).map((ref) => short(ref.pkg.name)));
  if (needsRoot.length) lines.push("", `Would be routed once the package is a root devDependency (PR-B): ${needsRoot.map(([name, count]) => `${name} ${count}`).join(", ")}`);
  const routed = tally(rows.filter((row) => row.rule === "R1" && row.app).flatMap((row) => row.names.map((name) => `${short(row.pkg)}.${name}`)));
  if (routed.length) lines.push("", `Composition-root names routed through an entry (rule H3), with references added: ${routed.map(([name, count]) => `${name} ${count}`).join(", ")}`);
  const held = tally(rows.filter((row) => row.held).map((row) => `${short(row.pkg)}.${row.held}`));
  if (held.length) lines.push(`Names left on the built twin by rule H3 or the Repository rule: ${held.map(([name, count]) => `${name} ${count}`).join(", ")}`);
  const dynamic = rows.filter((row) => row.dynamic && row.from !== row.to);
  if (dynamic.length) lines.push("", `Dynamic imports and require() calls that change target (review each against the baseline worktree): ${dynamic.length}`, ...dynamic.map((row) => `  ${row.file}:${row.line}`));
  if (!options.summary) lines.push("", "Per specifier (file:line  rule  old → new  names):", ...rows.map((row) => `${row.file}:${row.line}  ${row.rule}  ${row.from} → ${row.to}${row.names.length ? `  {${row.names.join(", ")}}` : ""}`));
  return lines;
}

/**
 * Every internal reference that is still one after the rewrite, with why it could not go through an entry: the ledger that says what
 * the later slices (moving a name to its owner package, W5-08/W5-10/W5-11) have left to do. One line per occurrence.
 */
export function remainingLines(plan, result) {
  const routedAway = new Set([...plan.decision.actions.values()].filter((action) => action.rule === "R1" && result.selected.has(action.ref.file)).map((action) => keyOf(action.ref)));
  const rows = plan.refs.filter((ref) => !routedAway.has(keyOf(ref))).map((ref) => {
    const route = plan.decision.routes.get(keyOf(ref));
    return { ref, reason: route.specifier ? "can be routed through the entry, but its file is not in this cut" : route.reason };
  });
  const lines = [`${rows.length} internal references remain after the rewrite, in ${new Set(rows.map((row) => row.ref.file)).size} files`];
  lines.push("By reason:", ...tally(rows.map((row) => row.reason.replace(/^\S+ (?:stays on the build|is not exported by an entry of)/, (head) => head.replace(/^\S+/, "<name>")))).map(([reason, count]) => `  ${String(count).padStart(4)}  ${reason}`));
  lines.push("", "Per occurrence (file:line  package  names  reason):");
  for (const { ref, reason } of rows) lines.push(`${ref.file}:${ref.imp.line}  ${short(ref.pkg.name)}  {${(ref.imp.names ?? []).map((element) => element.imported).join(", ") || "*"}}  ${reason}`);
  return lines;
}
