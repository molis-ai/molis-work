import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));

// RAC-381's T1 evidence only: the actual Runtime guard is in plugin-trust-rules, and real Host startup is in maintenance-v3.
// The shared resolver, preview and install service for every source remain T2; this local regression adds no global gate.
test("RAC-381-T1 every production PluginRuntime.install call supplies explicit trust, without a bundled argument", () => {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "apps", "packages", "horizontal", "modules", "plugins", "server"], { cwd: root, encoding: "utf8" })
    .split("\0").filter(file => /\/src\/.*\.tsx?$/u.test(file));
  const candidates = files.filter(file => /\binstall\b/u.test(readFileSync(join(root, file), "utf8"))).map(file => join(root, file));
  const program = ts.createProgram(candidates, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, strictNullChecks: true, skipLibCheck: true });
  const checker = program.getTypeChecker(), calls: string[] = [], failures: string[] = [];
  for (const file of candidates) {
    const source = program.getSourceFile(file)!;
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "install"
        || ts.isElementAccessExpression(node.expression) && ts.isStringLiteralLike(node.expression.argumentExpression) && node.expression.argumentExpression.text === "install")) {
        const declaration = checker.getResolvedSignature(node)?.getDeclaration();
        if (declaration && ts.isMethodDeclaration(declaration) && declaration.name.getText() === "install"
          && ts.isClassDeclaration(declaration.parent) && declaration.parent.name?.text === "PluginRuntime"
          && /\/packages\/plugin-runtime\/(?:src|dist)\/index\.(?:d\.)?ts$/u.test(declaration.getSourceFile().fileName)) {
          const at = `${file.slice(root.length)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
          calls.push(at);
          const argument = node.arguments[0], input = argument ? checker.getTypeAtLocation(argument) : undefined;
          const trust = input?.getProperty("trust");
          if (!trust || (trust.flags & ts.SymbolFlags.Optional) !== 0) failures.push(`${at}: trust is missing or optional`);
          else {
            const value = checker.getTypeOfSymbolAtLocation(trust, argument!);
            if ((value.isUnion() ? value.types : [value]).some(type => (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0)) {
              failures.push(`${at}: trust is not definite Host evidence`);
            }
          }
          if (input?.getProperty("bundled")) failures.push(`${at}: bundled is still an install argument`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  assert.ok(calls.length > 0, "the source check must reach actual PluginRuntime.install calls");
  assert.deepEqual(failures, []);
});
