import ts from "typescript";

const CATALOG = "apps/workbench/src/builtin-plugins.ts";
/** Home entries declare their trusted factory where the Host obtains it; a UI-only catalog entry is not a Runtime. */
export function homeRuntimePackages(snapshot) {
  const source = ts.createSourceFile(CATALOG, snapshot.read(CATALOG) ?? "", ts.ScriptTarget.Latest, true);
  const property = (node, key) => node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(source) === key)?.initializer;
  const literal = node => node && ts.isStringLiteral(node) ? node.text : null;
  const packages = new Set();
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "BUILTIN_PLUGIN_CATALOG" && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
      for (const entry of node.initializer.elements) {
        if (!ts.isObjectLiteralExpression(entry)) continue;
        const runtime = property(entry, "runtime");
        if (!runtime || !ts.isObjectLiteralExpression(runtime) || literal(property(runtime, "scope")) !== "home") continue;
        const name = literal(property(runtime, "package_name"));
        if (!name || !literal(property(runtime, "factory_export")) || !property(runtime, "create")) throw new Error("Home Runtime entry must declare package_name, factory_export and create");
        packages.add(name);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return packages;
}
