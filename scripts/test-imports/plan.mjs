// The rewrite plan: which references to a package's internals become imports of its entry, which move to the built twin of the
// same module, and which `type` keywords make the syntax say what the compiler already knows. The rules, per package P:
//   groups  Tests and tests/ helpers that reference P are joined when one process reads both (union-find over the processes'
//           closures). A group is converted as a whole, so no process ends up half on src and half on the build, when
//           (a) some process of it loads P both ways, or (b) one of its references can be routed through an entry.
//   R1      A reference whose every name is public (the same declaration is exported by one of P's entries) becomes an import of
//           that entry. src or dist, runtime or type-only; the gate's count falls by one.
//   R2      Any other src reference becomes the module's built twin, ../P/dist/x.js: the module the entry loads, one copy. The
//           count does not change. R3 is the same for a type-only reference.
//   R4      A file that still names P through src and through the build or the package name gets its src references moved to the build.
//   R5      A runtime import that is used only as a type gets `type`, where the syntactic split it makes is the last one left.
// Rule H3: in a composition root (apps/*) a name may be routed only if code outside tests or another test already imports it by
// package name, so a rewrite never adds a name to the set W5-08 has to relocate. Module Repository/Store names are never routed.
import path from "node:path";

const keyOf = (ref) => `${ref.file}:${ref.imp.start}`;
/** A group's identity across rounds: its package and its first file. */
export const groupKey = (group) => `${group.pkg}\0${[...group.files].sort()[0]}`;

class UnionFind {
  constructor(items) { this.parent = new Map([...items].map((item) => [item, item])); }
  find(item) { let root = item; while (this.parent.get(root) !== root) root = this.parent.get(root); this.parent.set(item, root); return root; }
  union(a, b) { this.parent.set(this.find(a), this.find(b)); }
}

/** Groups of files per package, each with the processes of the analysis that read it and whether one of them splits the package. */
export function formGroups(refs, analysis) {
  const byPackage = new Map();
  for (const ref of refs) {
    if (!byPackage.has(ref.pkg.name)) byPackage.set(ref.pkg.name, new Map());
    const files = byPackage.get(ref.pkg.name);
    files.set(ref.file, [...(files.get(ref.file) ?? []), ref]);
  }
  const groups = [];
  for (const [name, files] of byPackage) {
    const joined = new UnionFind(files.keys());
    const touching = analysis.map((result) => ({ result, members: [...(result.closure.size < files.size ? [...result.closure].filter((file) => files.has(file)) : [...files.keys()].filter((file) => result.closure.has(file)))] })).filter((entry) => entry.members.length);
    for (const { members } of touching) for (const member of members.slice(1)) joined.union(members[0], member);
    const made = new Map();
    for (const file of files.keys()) {
      const root = joined.find(file);
      if (!made.has(root)) made.set(root, { pkg: name, files: new Set(), refs: [], splitBy: new Set() });
      made.get(root).files.add(file);
      made.get(root).refs.push(...files.get(file));
    }
    for (const { result, members } of touching) if (result.splits.includes(name)) made.get(joined.find(members[0])).splitBy.add(result.file);
    groups.push(...made.values());
  }
  return groups;
}

/** The entry a reference can be routed through, or { reason }. `rules` carries the export index, root dependencies and H3 name sets. */
export function routeOf(ref, rules) {
  const names = ref.imp.names;
  if (!names?.length) return { reason: "its names cannot be listed (default import, namespace, or an unreadable destructuring)" };
  if (!ref.target) return { reason: "the module it names was not found" };
  const options = [];
  for (const element of names) {
    const entries = rules.index.publicEntries(ref.target, element.imported);
    if (!entries.length) return { reason: `${element.imported} is not exported by an entry of ${ref.pkg.name}` };
    const allowed = entries.filter((entry) => rules.allowed(ref.pkg, entry.name));
    if (!allowed.length) return { reason: `${element.imported} stays on the build: ${rules.whyHeld(ref.pkg)}`, held: entries[0].name };
    options.push(allowed);
  }
  if (!rules.rootDependencies.has(ref.pkg.name)) return { reason: `${ref.pkg.name} is not a dependency of the root package.json, so a test cannot import it by name`, needsRootDependency: true };
  const common = [...new Set(options[0].map((entry) => entry.subpath))].filter((subpath) => options.every((list) => list.some((entry) => entry.subpath === subpath)));
  if (!common.length) return { reason: "its names are exported by different entries" };
  const entryFile = (subpath) => options[0].find((entry) => entry.subpath === subpath).file;
  common.sort((a, b) => Number(entryFile(b) === ref.target) - Number(entryFile(a) === ref.target) || Number(b === ".") - Number(a === ".") || a.length - b.length || a.localeCompare(b));
  const subpath = common[0];
  return {
    specifier: subpath === "." ? ref.pkg.name : `${ref.pkg.name}/${subpath.slice(2)}`,
    renames: names.map((element, index) => ({ element, exported: options[index].find((entry) => entry.subpath === subpath).name })),
  };
}

/**
 * Decides every reference. `forced` lists groups (by key) that must be converted although nothing in them splits or routes yet: the
 * ones a first round's rewrite would have split. Returns { groups, actions } where `actions` maps keyOf(ref) to { ref, rule, specifier, renames? } for
 * the references that change, and each group says whether it was converted, left alone, or blocked (and why).
 */
export function decide({ refs, analysis, graph, rules, forced = new Set() }) {
  const groups = formGroups(refs, analysis);
  for (const group of groups) group.key = groupKey(group);
  const actions = new Map();
  const routes = new Map(refs.map((ref) => [keyOf(ref), routeOf(ref, rules)]));
  const distSpecifier = (ref) => {
    const twin = ref.target && graph.distOf(ref.pkg, ref.target);
    if (!twin) return undefined;
    const spec = path.posix.relative(path.posix.dirname(ref.file), twin);
    return spec.startsWith(".") ? spec : `./${spec}`;
  };
  for (const group of groups) {
    group.routable = group.refs.some((ref) => routes.get(keyOf(ref)).specifier);
    group.converted = group.splitBy.size > 0 || group.routable || forced.has(group.key);
    if (!group.converted) continue;
    const planned = [];
    for (const ref of group.refs) {
      const route = routes.get(keyOf(ref));
      if (route.specifier) planned.push({ ref, rule: "R1", specifier: route.specifier, renames: route.renames });
      else if (ref.kind === "src") {
        const specifier = distSpecifier(ref);
        if (!specifier) { group.blocked = `${ref.file}:${ref.imp.line} names ${ref.imp.spec}, which has no built twin (tsconfig leaves it out, or the file was not found)`; break; }
        planned.push({ ref, rule: ref.imp.typeOnly ? "R3" : "R2", specifier, held: route.held, why: route.reason });
      }
    }
    if (group.blocked) { group.converted = false; continue; }
    for (const action of planned) actions.set(keyOf(action.ref), action);
  }
  // R4: a file that still names a package through src and through the build (or its name) moves the src references over.
  const byFilePackage = new Map();
  for (const ref of refs) byFilePackage.set(`${ref.file}\0${ref.pkg.name}`, [...(byFilePackage.get(`${ref.file}\0${ref.pkg.name}`) ?? []), ref]);
  for (const list of byFilePackage.values()) {
    const { file, pkg } = list[0];
    const left = list.filter((ref) => ref.kind === "src" && !actions.has(keyOf(ref)));
    const buildSide = list.some((ref) => ref.kind === "dist" || actions.has(keyOf(ref))) || rules.nameImports(file, pkg.name) > 0;
    if (!left.length || !buildSide || groups.some((group) => group.blocked && group.pkg === pkg.name && group.files.has(file))) continue;
    for (const ref of left) { const specifier = distSpecifier(ref); if (specifier) actions.set(keyOf(ref), { ref, rule: "R4", specifier }); }
  }
  return { groups, actions, routes };
}

export { keyOf };
