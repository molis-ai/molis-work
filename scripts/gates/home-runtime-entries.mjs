import ts from "typescript";
import { catalogEntries } from "./catalog-entries.mjs";

const property = (node, key) => node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText() === key)?.initializer;
const literal = node => node && ts.isStringLiteral(node) ? node.text : null;

/** The packages whose registration declares `key` with a literal package name and factory export beside its `create`. */
function declaredPackages(snapshot, key, label) {
  const packages = new Set();
  for (const { file, object } of catalogEntries(snapshot)) {
    const runtime = property(object, key);
    if (!runtime || !ts.isObjectLiteralExpression(runtime)) continue;
    const name = literal(property(runtime, "package_name"));
    if (!name || !literal(property(runtime, "factory_export")) || !property(runtime, "create")) throw new Error(`${file}: ${label} entry must declare package_name, factory_export and create`);
    packages.add(name);
  }
  return packages;
}

/**
 * Home entries declare their trusted factory where the Host obtains it; a UI-only catalog entry is not a Runtime. That a plugin runs
 * in the Home is its Manifest's `runtime.scope` (PG-011); the Host holds the Manifest and this registration to each other
 * (`catalogProblems`), so here an entry with `runtime` is a Home entry.
 */
export function homeRuntimePackages(snapshot) {
  return declaredPackages(snapshot, "runtime", "Home Runtime");
}

/** Each project's instances the project supervisor starts from the registration's `project_runtime` (PG-067). */
export function projectRuntimePackages(snapshot) {
  return declaredPackages(snapshot, "project_runtime", "Project Runtime");
}
