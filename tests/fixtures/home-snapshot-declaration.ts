import assert from "node:assert/strict";
import ts from "typescript";

export const retainedDeclaration = { path: "sessions", snapshot: { retained: {
  database: { file: "sessions.db", metadata: { table: "session_meta", owner: "molis-work-session-registry-v1", version: 7 } },
  content: { directory: "content/blobs", dependency: "content/content.key" },
} } };
export const retainedRegistryPath = "apps/local-host/src/home-stores.ts";

function literal(node: ts.Node): unknown {
  if (ts.isStringLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  assert.ok(ts.isObjectLiteralExpression(node), "the retained declaration contains only literal data, never functions/calls/initializers");
  const value: Record<string, unknown> = {};
  for (const property of node.properties) {
    assert.ok(ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name), "only plain literal properties are permitted");
    assert.ok(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name));
    const name = property.name.text;
    assert.equal(Object.hasOwn(value, name), false, "duplicate properties are not declarations");
    value[name] = literal(property.initializer);
  }
  return value;
}

/** Remove exactly one verified data node. The rest of this file and every other file still undergo the original refusal. */
export function stripRetainedSnapshotDeclaration(path: string, source: string): string {
  if (path !== retainedRegistryPath) return source;
  const parsed = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const nodes: ts.ObjectLiteralExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node) && node.properties.some(property => ts.isPropertyAssignment(property)
      && ts.isIdentifier(property.name) && property.name.text === "path" && ts.isStringLiteral(property.initializer) && property.initializer.text === "sessions")) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  assert.equal(nodes.length, 1, "the one retained store declaration must remain unique");
  const node = nodes[0]!, parent = node.parent;
  assert.ok(ts.isCallExpression(parent) && ts.isIdentifier(parent.expression) && parent.expression.text === "owned"
    && parent.arguments.length === 2 && parent.arguments[1] === node && ts.isStringLiteral(parent.arguments[0]!)
    && parent.arguments[0].text === "apps/local-host", "only the original Host-owned registry entry can declare this data");
  assert.deepEqual(literal(node), retainedDeclaration);
  return source.slice(0, node.getStart(parsed)) + "{}" + source.slice(node.getEnd());
}
