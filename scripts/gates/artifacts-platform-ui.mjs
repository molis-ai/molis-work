import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const UI_ROOT = "apps/workbench/src/artifacts";
const MODULE = "@molis-ai/molis-work-module-artifacts";
const PRESENTATION_EXPORTS = new Set(["artifactVersionPath", "ArtifactBrowserView", "GoalArtifactEmbed"]);
const RESERVED_UI = new Set(["io.molis.work.native.artifacts.browser.v1", "io.molis.work.native.artifacts.reference.v1"]);

function sources(root, relative) {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === "node_modules" || entry.name === "dist") return [];
    const child = `${relative}/${entry.name}`;
    return entry.isDirectory() ? sources(root, child) : entry.isFile() && child.endsWith(".ts") ? [child] : [];
  });
}

function checkPresentation(root, file, errors) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const specifier = node.moduleSpecifier.text;
      if (specifier === MODULE) {
        const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : node.exportClause;
        if (!bindings || (!ts.isNamedImports(bindings) && !ts.isNamedExports(bindings))
          || bindings.elements.some(item => !PRESENTATION_EXPORTS.has((item.propertyName ?? item.name).text))) {
          errors.push(`${file}: platform Artifact UI may import only the Module's presentation types and URL function`);
        }
      } else if (/^(?:node:|@molis-ai\/molis-work-(?:storage|module-artifacts\/))/u.test(specifier)) {
        errors.push(`${file}: platform Artifact UI must receive facts through actions, not a Store or filesystem`);
      }
    }
    if (ts.isIdentifier(node) && /^(?:ArtifactsModule|ArtifactRepository|DatabaseSync|createArtifactVersionStore|projectVersionStores)$/u.test(node.text)) {
      errors.push(`${file}: platform Artifact UI must not construct or query the Artifact Store`);
    }
    if (ts.isStringLiteralLike(node) && /\b(?:CREATE TABLE|SELECT\b[\s\S]*?FROM|INSERT INTO|UPDATE|DELETE FROM)\s+(?:artifacts|artifact_versions|library_artifacts|library_artifact_versions|process_items|process_item_versions)\b/iu.test(node.text)) {
      errors.push(`${file}: Artifact SQL belongs only to modules/artifacts`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}

function checkPluginIdentity(root, file, errors) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = node => {
    if (ts.isStringLiteralLike(node) && RESERVED_UI.has(node.text)) errors.push(`${file}: a Plugin cannot declare the platform Artifact UI id`);
    if ((ts.isPropertyAssignment(node) || ts.isVariableDeclaration(node)) && node.initializer && ts.isStringLiteralLike(node.initializer)
      && node.initializer.text === "artifacts" && /^(?:project_plugin_id|.*PROJECT_PLUGIN_ID)$/u.test(node.name.getText(ast).replace(/["']/gu, ""))) {
      errors.push(`${file}: a Plugin cannot declare the retired artifacts project key`);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
}

/** PG-077: replacing the former required Plugin shell must preserve the fact boundary and reserve its platform UI. */
export function checkArtifactsPlatformUi(root) {
  const errors = [];
  const registry = fs.readFileSync(path.join(root, "apps/local-host/src/plugin-registry.ts"), "utf8");
  const ast = ts.createSourceFile("registry.ts", registry, ts.ScriptTarget.Latest, true);
  let keyGuard = false;
  const visit = node => {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
      && ts.isPropertyAccessExpression(node.left) && node.left.name.text === "project_plugin_id"
      && ts.isIdentifier(node.right) && node.right.text === "ARTIFACTS_PROJECT_PLUGIN_ID") keyGuard = true;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  if (!keyGuard) errors.push("apps/local-host/src/plugin-registry.ts: resolved registrations must refuse the platform Artifact project key");
  if (fs.existsSync(path.join(root, "plugins/native/artifacts"))) errors.push("plugins/native/artifacts: the retired Manifest and registration must stay deleted");
  for (const name of ["index.ts", "browser-ui.ts", "reference-ui.ts"]) {
    if (!fs.existsSync(path.join(root, UI_ROOT, name))) errors.push(`${UI_ROOT}/${name}: platform Artifact UI is missing`);
  }
  for (const file of sources(root, UI_ROOT)) checkPresentation(root, file, errors);
  for (const file of sources(root, "plugins")) checkPluginIdentity(root, file, errors);
  return errors;
}
