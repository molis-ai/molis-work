// The codemod end to end: measure, decide (plan.mjs), build the edits (edits.mjs), choose a safe set of files and check the result.
//   planRewrite  reads a snapshot and says what every reference should become;
//   rewriteFiles applies the plan to some files, adding the files that must go with them, and refuses a result that would load a
//                package twice in a process that did not before, or that does not count what R1 says it should.
import { createExportIndex } from "./exports.mjs";
import { applyEdits, editsOfAction, typeKeywordEdit, verifyEdits } from "./edits.mjs";
import { createGraph } from "./graph.mjs";
import { decide, keyOf } from "./plan.mjs";
import { collectRefs, consumerNames, erasedImports, isInternal } from "./refs.mjs";
import { withTexts } from "./snapshot.mjs";

const HELD = { app: "no code outside tests and no other test imports it by package name (rule H3, W5-08 relocates the composition root's names)", module: "Repository and Store exports are not routed (W5-08 removes them)" };

export function planRewrite({ snapshot, root }) {
  const cache = new Map();
  const graph = createGraph(snapshot, cache);
  const analysis = graph.analyze();
  const { files, refs } = collectRefs(graph, snapshot);
  const consumers = consumerNames(graph, snapshot);
  const manifest = JSON.parse(snapshot.read("package.json") ?? "{}");
  const isApp = (pkg) => pkg.dir.startsWith("apps/");
  const isModule = (pkg) => pkg.dir.startsWith("modules/") || pkg.dir === "server";
  const rules = {
    index: createExportIndex(graph, snapshot, [...new Set(refs.map((ref) => ref.target).filter(Boolean))], root),
    rootDependencies: new Set(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })),
    allowed: (pkg, name) => (isApp(pkg) ? Boolean(consumers.outside.get(pkg.name)?.has(name) || consumers.tests.get(pkg.name)?.has(name)) : !(isModule(pkg) && /(?:Repository|Store)$/.test(name))),
    whyHeld: (pkg) => (isApp(pkg) ? HELD.app : HELD.module),
    nameImports: (file, pkgName) => files.get(file)?.names.get(pkgName) ?? 0,
  };
  const before = splitsByProcess(analysis);
  const forced = new Set();
  let plan;
  // A group's rewrite can make a process load another package both ways (an entry pulls in the build of what it imports): that
  // package's group is converted too, until a round gains no split.
  for (;;) {
    const decision = decide({ refs, analysis, graph, rules, forced });
    plan = { snapshot, root, cache, graph, analysis, files, refs, rules, decision, edits: new Map(), planned: new Map(), consumers };
    for (const action of decision.actions.values()) addEdits(plan, action.ref.file, action.ref.pkg.name, action.ref.imp, editsOfAction(action), { specifier: action.specifier });
    const gained = analyzeWith(plan, rewritten(plan, new Set(plan.edits.keys()))).flatMap((result) => result.splits.filter((pkg) => !before.get(result.file)?.has(pkg)).map((pkg) => ({ pkg, closure: result.closure })));
    const more = decision.groups.filter((group) => !group.converted && !group.blocked && gained.some((entry) => entry.pkg === group.pkg && [...group.files].some((file) => entry.closure.has(file))) && !forced.has(group.key));
    if (!more.length) break;
    for (const group of more) forced.add(group.key);
  }
  addTypeKeywords(plan);
  return plan;
}

const indexOfImport = (plan, file, imp) => plan.files.get(file).imports.indexOf(imp);
function addEdits(plan, file, pkg, imp, edits, change) {
  plan.edits.set(file, [...(plan.edits.get(file) ?? []), ...edits.map((edit) => ({ ...edit, pkg }))]);
  const planned = plan.planned.get(file) ?? new Map();
  const index = indexOfImport(plan, file, imp);
  planned.set(index, { ...planned.get(index), ...change });
  plan.planned.set(file, planned);
}

/** The new text of some files: the plan's edits for each, or the original text. */
export const rewritten = (plan, selected, extra = new Map()) => new Map([...selected].map((file) => [file, applyEdits(plan.files.get(file).text, [...(plan.edits.get(file) ?? []), ...(extra.get(file) ?? [])])]));
const analyzeWith = (plan, texts) => createGraph(withTexts(plan.snapshot, texts), plan.cache).analyze();

/**
 * R5. After the other rules, a process that still loads a package both ways only because an import is used as a type gets
 * `type` on it. The test is the compiler's: the split has to go away when every erased import of the package carries `type`.
 */
function addTypeKeywords(plan) {
  const all = new Set(plan.edits.keys());
  const after = analyzeWith(plan, rewritten(plan, all)).filter((result) => result.splits.length);
  if (!after.length) return;
  const erased = new Map();
  const erasure = (file) => { if (!erased.has(file)) erased.set(file, erasedImports(file, plan.files.get(file).text, plan.files.get(file).imports)); return erased.get(file); };
  const insertions = new Map();
  for (const result of after) {
    for (const file of result.closure) {
      if (!plan.files.has(file)) continue;
      const list = plan.files.get(file).imports;
      list.forEach((imp, index) => { if (erasure(file).get(index) === "whole" && imp.keywordEnd && !imp.hasDefault) insertions.set(file, [...(insertions.get(file) ?? []), typeKeywordEdit(imp)]); });
    }
  }
  const effective = analyzeWith(plan, rewritten(plan, new Set([...all, ...insertions.keys()]), insertions));
  const remaining = new Map(effective.map((result) => [result.file, new Set(result.splits)]));
  const sideOf = (plan_, file, imp) => (plan_.decision.actions.has(keyOf({ file, imp })) ? "dist" : imp.found.kind === "src" ? "src" : "dist");
  for (const result of after) {
    for (const pkg of result.splits.filter((name) => !remaining.get(result.file)?.has(name))) {
      const sides = { src: [], dist: [] };
      for (const file of result.closure) {
        if (!plan.files.has(file)) continue;
        plan.files.get(file).imports.forEach((imp, index) => {
          if (imp.found.pkg?.name === pkg && !imp.typeOnly && ["src", "dist", "name"].includes(imp.found.kind)) sides[sideOf(plan, file, imp)].push({ file, imp, index });
        });
      }
      for (const side of Object.values(sides)) {
        if (!side.length || !side.every(({ file, index, imp }) => erasure(file).get(index) === "whole" && imp.keywordEnd && !imp.hasDefault)) continue;
        for (const { file, imp } of side) if (!(plan.planned.get(file)?.get(indexOfImport(plan, file, imp))?.r5)) addEdits(plan, file, pkg, imp, [typeKeywordEdit(imp)], { r5: true });
      }
    }
  }
}

const countInternal = (file, imports) => imports.filter((imp) => isInternal(file, imp.spec)).length;
const splitsByProcess = (analysis) => new Map(analysis.map((result) => [result.file, new Set(result.splits)]));

/**
 * Applies the plan to `requested` files (all files with edits when none are named). A process must not gain a split, so the files
 * that would leave one half on src are added until it does not (`added` lists them). Returns { selected, texts, added, problems }.
 */
export function rewriteFiles(plan, requested) {
  const editable = new Set(plan.edits.keys());
  const selected = new Set(requested ? [...requested].filter((file) => editable.has(file)) : editable);
  const before = splitsByProcess(plan.analysis);
  const added = new Set();
  for (;;) {
    const texts = rewritten(plan, selected);
    const after = analyzeWith(plan, texts);
    const gained = after.flatMap((result) => result.splits.filter((pkg) => !before.get(result.file)?.has(pkg)).map((pkg) => ({ process: result.file, pkg, closure: result.closure })));
    const partners = new Set(gained.flatMap(({ closure, pkg }) => [...closure].filter((file) => editable.has(file) && !selected.has(file) && plan.edits.get(file).some((edit) => edit.pkg === pkg))));
    if (gained.length && partners.size) { for (const file of partners) { selected.add(file); added.add(file); } continue; }
    const problems = gained.map(({ process, pkg }) => `${process} would load ${pkg} both ways (from source and from the build)`);
    for (const file of selected) problems.push(...verifyEdits(file, plan.files.get(file).imports, texts.get(file), plan.planned.get(file) ?? new Map()));
    const countBefore = [...selected].reduce((sum, file) => sum + countInternal(file, plan.files.get(file).imports), 0);
    const countAfter = [...selected].reduce((sum, file) => sum + countInternal(file, plan.files.get(file).imports.map((imp, index) => ({ spec: plan.planned.get(file)?.get(index)?.specifier ?? imp.spec }))), 0);
    const routed = [...plan.decision.actions.values()].filter((action) => action.rule === "R1" && selected.has(action.ref.file)).length;
    if (countBefore - countAfter !== routed) problems.push(`the count of internal imports falls by ${countBefore - countAfter} but ${routed} references are routed through an entry`);
    return { selected, texts, added, problems, after };
  }
}

