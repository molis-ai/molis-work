// N41: inspect the live first-party declarations used by this build. The unified origin is not a date inferred from this check.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { collectHost, loadManifests, withIsolatedHome } from "./action-contract-host.mjs";

export function initialVersionProblems({ manifests, hostViews, registrations }) {
  const problems = new Set();
  const check = (owner, kind, id, version) => {
    if (version !== 1) problems.add(`${owner}: ${kind} ${id} = ${String(version)} (expected 1)`);
  };
  const agent = (owner, declaration) => {
    for (const prompt of declaration.prompts) check(owner, "prompt", prompt.prompt_id, prompt.version);
    for (const role of declaration.roles) check(owner, "role", role.role_id, role.version);
    for (const role of declaration.subagents?.roles ?? []) check(owner, "child role", role.role_id, role.version);
  };
  for (const manifest of manifests) {
    const owner = manifest.plugin_id;
    check(owner, "Manifest", "schema_version", manifest.schema_version);
    check(owner, "Manifest", "host_api_version", manifest.host_api_version);
    for (const action of manifest.actions ?? []) check(owner, "action", action.capability_id, action.version);
    if (manifest.agent) agent(owner, manifest.agent);
  }
  for (const view of hostViews) check(view.provider.plugin_id ?? view.provider.provider_id, "action", view.capability_id, view.version);
  for (const owner of registrations) agent(owner.owner_id, owner);
  return [...problems].sort();
}

// These are versions chosen by an upstream provider, the bundled SQLite binary, the release process, or a SemVer pattern.
const outsideUniformOrigin = new Map([
  ["plugins/official-integrations/catalog/src/document-import.ts", "NOTION_VERSION"],
  ["plugins/official-integrations/github/src/provider.ts", "GITHUB_API_VERSION"],
  ["packages/plugin-runtime/src/project-database-statements.ts", "PLUGIN_STATEMENT_SQLITE_VERSION"],
  ["apps/local-host/src/connector-tool-runtime.ts", "UV_BOOTSTRAP_VERSION"],
  ["apps/local-host/src/product-version.ts", "PRODUCT_VERSION"],
  ["apps/local-host/src/plugin-builder/build-dependencies.ts", "VERSION"],
]);

export function sourceVersionProblems(file, source) {
  if (!/\b[A-Z_\d]*VERSION\b/.test(source)) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest);
  const problems = [];
  const visit = (node) => {
    if (ts.isVariableDeclarationList(node) && (node.flags & ts.NodeFlags.Const)) {
      for (const declaration of node.declarations) {
        const name = declaration.name.getText(tree);
        if (!/^[A-Z_\d]*VERSION$/.test(name) || outsideUniformOrigin.get(file) === name) continue;
        let value = declaration.initializer;
        while (value && (ts.isAsExpression(value) || ts.isSatisfiesExpression(value) || ts.isParenthesizedExpression(value))) value = value.expression;
        if (value && ts.isNumericLiteral(value) && Number(value.text) === 1) continue;
        if (value && ts.isStringLiteralLike(value) && /^(?:[a-z][a-z0-9._-]*\/)?1$/.test(value.text)) continue;
        problems.push(`${file}: ${name} = ${value?.getText(tree) ?? "(missing)"} (expected 1)`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return problems;
}

async function check() {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const files = execFileSync("git", ["ls-files", "-z", "--", "apps", "packages", "plugins", "modules", "server", "horizontal"],
    { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).split("\0").filter(Boolean);
  const problems = await withIsolatedHome(async home => {
    const { builtinRegistrations } = await import("../../apps/local-host/dist/agent-definitions/builtin-registrations.js");
    const { manifests } = await loadManifests();
    const { hostViews } = await collectHost(home);
    return initialVersionProblems({ manifests, hostViews, registrations: builtinRegistrations() });
  });
  for (const file of files) {
    if (!/\.(?:[cm]?[jt]s|[jt]sx)$/.test(file) || /(?:^|\/)(?:tests|fixtures)\//.test(file)) continue;
    problems.push(...sourceVersionProblems(file, readFileSync(path.join(root, file), "utf8")));
  }
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
  else console.log("The registered actions, manifests, prompts, roles and first-party version constants are at the unified origin.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await check();
