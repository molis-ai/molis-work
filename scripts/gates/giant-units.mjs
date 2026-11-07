import ts from "typescript";
const fail = message => { throw new Error(message); };
const AREAS = /^(apps|horizontal|modules|packages|plugins|server|tooling)\//;
export const isSource = (file) => AREAS.test(file) && /\.(ts|mts)$/.test(file) && !file.endsWith(".d.ts")
  && !/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(file) && !/\.test\.(ts|mts)$/.test(file);
const isFunctionUnit = (node) => ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node);
// Keep unique names unchanged. Only multiple implementations of a name need their named lexical owners; overload
// signatures describe the same implementation. No line/ordinal identity: an unnameable collision cannot be measured safely.
const functionOwners = (source, span, limits) => {
  const groups = new Map(), names = new Map();
  const namedScope = (node) => ts.isClassDeclaration(node) || ts.isClassExpression(node) || isFunctionUnit(node)
    || ts.isVariableDeclaration(node) || ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node) || ts.isModuleDeclaration(node);
  const visit = (node) => {
    if (isFunctionUnit(node)) {
      const named = node.name && ts.isIdentifier(node.name) ? node
        : (ts.isVariableDeclaration(node.parent) || ts.isPropertyAssignment(node.parent)) && ts.isIdentifier(node.parent.name) ? node.parent : undefined;
      if (named) {
        const owners = [named.name.text];
        for (let outer = named.parent; outer; outer = outer.parent) {
          if (namedScope(outer) && outer.name && ts.isIdentifier(outer.name)) owners.unshift(outer.name.text);
        }
        const name = named.name.text, group = groups.get(name) ?? [];
        group.push({ node, owner: owners.join(".") });
        groups.set(name, group);
        names.set(node, name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  for (const [name, group] of groups) {
    const implementations = group.filter(({ node }) => node.body);
    if (implementations.length < 2) continue;
    const seen = new Set();
    for (const { node, owner } of implementations) {
      if (seen.has(owner) && group.some(({ node: candidate }) => span(candidate) > limits.functionLines)) {
        fail(`ambiguous giant function unit: function ${source.fileName}#${name}: multiple implementations have the same named lexical owner "${owner}"; give them distinct named owners so their measured sizes can be reviewed separately`);
      }
      seen.add(owner);
    }
    for (const { node, owner } of group) names.set(node, owner);
  }
  return names;
};

export function measureGiantUnits(snapshot, limits) {
    const giant = {};
    for (const file of snapshot.files.filter(isSource)) {
      const text = snapshot.read(file);
      if (text === null) continue;
      const lines = text.split("\n").length;
      if (lines > limits.file) giant[`file ${file}`] = lines;
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
      const span = (node) => source.getLineAndCharacterOfPosition(node.getEnd()).line - source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      const names = functionOwners(source, span, limits);
      // An unnamed function is named by the named function it sits in and its order among the giant ones there, so an
      // edit above it does not make it look new.
      const callbacks = {};
      const ownerOf = (node) => {
        if (names.has(node)) return names.get(node);
        let outer = node.parent;
        while (outer && !((ts.isFunctionDeclaration(outer) || ts.isMethodDeclaration(outer) || ts.isVariableDeclaration(outer)) && outer.name && ts.isIdentifier(outer.name))) outer = outer.parent;
        const base = outer ? outer.name.text : "(module)";
        callbacks[base] = (callbacks[base] ?? 0) + 1;
        return `${base} callback ${callbacks[base]}`;
      };
      const visit = (node) => {
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
          const key = `class ${file}#${node.name?.text ?? "(anonymous)"}`;
          const methods = node.members.filter((member) => ts.isMethodDeclaration(member) || ts.isGetAccessor(member) || ts.isSetAccessor(member)).length;
          const size = span(node);
          if (size > limits.classLines || methods > limits.classMethods) giant[key] = { lines: Math.max(giant[key]?.lines ?? 0, size), methods: Math.max(giant[key]?.methods ?? 0, methods) };
        }
        if (isFunctionUnit(node)) {
          const size = span(node);
          if (size > limits.functionLines) {
            const key = `function ${file}#${ownerOf(node)}`;
            giant[key] = Math.max(giant[key] ?? 0, size);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    return giant;
}
