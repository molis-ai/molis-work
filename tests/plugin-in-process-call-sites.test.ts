import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));

// BL-588, S-75 ⑥ (RAC-994, RAC-995): the only code that runs in the Host's process without `host` trust is what the Host's own code admitted by
// object, and every production way to build a Runtime says what it admits. The list below is the closed one of ac-trust §2 / the BL-588 design:
// the development directory's loaded plugin, and a Host's test fixtures; a new source is a change of this list and of that design.

/** How a production site says what it admits: nothing, the one plugin the development directory loaded, the Host's fixtures, or what the platform was given. */
type Admission = "none" | "loaded-plugin" | "fixtures" | "given";
const ALLOWED: Readonly<Record<string, readonly Admission[]>> = {
  "apps/local-host/src/plugin-development.ts": ["loaded-plugin"],
  "apps/local-host/src/project-plugins.ts": ["fixtures"],
  "apps/local-host/src/home-plugins.ts": ["fixtures"],
  "apps/local-host/src/plugin-platform.ts": ["given"],
  "apps/local-host/src/installed-plugin-host.ts": ["none"],
  "apps/local-host/src/integration-registry.ts": ["none"],
};

const productionFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "apps", "packages", "horizontal", "modules", "plugins", "server", "tooling", "scripts", "examples"],
  { cwd: root, encoding: "utf8" }).split("\0").filter(file => /\.(?:ts|tsx|mts|mjs)$/u.test(file) && !/(?:^|\/)(?:tests?|dist|node_modules)\//u.test(file) && !/\.test\.[cm]?[tj]sx?$/u.test(file));

const parsed = new Map<string, ts.SourceFile>();
const sourceOf = (file: string) => {
  let source = parsed.get(file);
  if (!source) { source = ts.createSourceFile(file, readFileSync(join(root, file), "utf8"), ts.ScriptTarget.ES2022, true); parsed.set(file, source); }
  return source;
};
const at = (file: string, node: ts.Node) => `${file}:${sourceOf(file).getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

/** The property assignments named `name` anywhere under `node` (a spread's conditional object included). */
function propertiesNamed(node: ts.Node, name: string): (ts.PropertyAssignment | ts.ShorthandPropertyAssignment)[] {
  const found: (ts.PropertyAssignment | ts.ShorthandPropertyAssignment)[] = [];
  const visit = (child: ts.Node): void => {
    if ((ts.isPropertyAssignment(child) || ts.isShorthandPropertyAssignment(child)) && child.name.getText() === name) found.push(child);
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

/** What an `inProcess: { admit: … }` initializer admits, by its shape: no other shape is a way the list knows. */
function admissionOf(property: ts.PropertyAssignment | ts.ShorthandPropertyAssignment): Admission | "unknown" {
  if (!ts.isPropertyAssignment(property)) return "unknown";
  const value = property.initializer;
  if (ts.isPropertyAccessExpression(value) && value.getText() === "options.inProcess") return "given";
  // `fixtureAdmission(entries, installed)`: the fixtures a Host was given and the definitions its test installs by hand, as objects (home-side.ts).
  if (ts.isCallExpression(value) && value.expression.getText() === "fixtureAdmission") return "fixtures";
  if (!ts.isObjectLiteralExpression(value) || value.properties.length !== 1) return "unknown";
  const admit = value.properties[0]!;
  if (!ts.isPropertyAssignment(admit) || admit.name.getText() !== "admit") return "unknown";
  const set = admit.initializer;
  if (!ts.isNewExpression(set) || set.expression.getText() !== "Set") return "unknown";
  const [from] = set.arguments ?? [];
  if (!from) return "none";
  if (ts.isArrayLiteralExpression(from) && from.elements.length === 1 && ts.isIdentifier(from.elements[0]!)) return "loaded-plugin";
  return "unknown";
}

function sites(): { file: string; node: ts.Node; kind: "runtime" | "platform" }[] {
  const found: { file: string; node: ts.Node; kind: "runtime" | "platform" }[] = [];
  for (const file of productionFiles) {
    const text = readFileSync(join(root, file), "utf8");
    if (!/new PluginRuntime\b|createPluginPlatform\b/u.test(text)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isNewExpression(node) && node.expression.getText() === "PluginRuntime") found.push({ file, node, kind: "runtime" });
      if (ts.isCallExpression(node) && node.expression.getText() === "createPluginPlatform") found.push({ file, node, kind: "platform" });
      ts.forEachChild(node, visit);
    };
    visit(sourceOf(file));
  }
  return found;
}

test("RAC-994 every production PluginRuntime and plugin platform says what it admits to the Host's process, from the closed list of sources", () => {
  const all = sites(), failures: string[] = [];
  assert.ok(all.some(site => site.kind === "runtime") && all.some(site => site.kind === "platform"), "the source check must reach the real constructions");
  const used = new Map<string, Set<Admission>>();
  for (const { file, node, kind } of all) {
    if (kind === "platform" && file === "apps/local-host/src/plugin-platform.ts") continue; // the definition itself, not a call
    const call = node as ts.NewExpression | ts.CallExpression;
    const options = (call.arguments ?? []).filter(ts.isObjectLiteralExpression);
    const named = options.flatMap(value => propertiesNamed(value, "inProcess"));
    if (named.length !== 1) { failures.push(`${at(file, node)}: ${kind === "runtime" ? "new PluginRuntime" : "createPluginPlatform"} must name inProcess exactly once (found ${named.length})`); continue; }
    const admission = admissionOf(named[0]!);
    if (admission === "unknown") { failures.push(`${at(file, node)}: inProcess is not one of the admissions the list knows (nothing, the loaded plugin, the Host's fixtures, what the platform was given)`); continue; }
    if (!ALLOWED[file]?.includes(admission)) failures.push(`${at(file, node)}: ${file} may not admit "${admission}" (the closed list is in this test and in the BL-588 design)`);
    used.set(file, (used.get(file) ?? new Set()).add(admission));
  }
  for (const [file, admissions] of Object.entries(ALLOWED)) {
    for (const admission of admissions) if (!used.get(file)?.has(admission)) failures.push(`${file}: the list allows "${admission}" but no construction there admits it any more; remove it from the list`);
  }
  assert.deepEqual(failures, []);
});

/** Harness scripts that run a one-off Home to replay a corpus (never a product Host); each is part of the closed list. */
const FIXTURE_HARNESSES: ReadonlySet<string> = new Set(["scripts/replay-plugins.mjs"]);

test("RAC-995 no production code hands a Host its test fixtures, and the development directory admits only the plugin it loaded", () => {
  const given: string[] = [];
  for (const file of productionFiles) {
    if (FIXTURE_HARNESSES.has(file) || !/\bpluginFixtures\b/u.test(readFileSync(join(root, file), "utf8"))) continue;
    const visit = (node: ts.Node): void => {
      if ((ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) && node.name.getText() === "pluginFixtures") given.push(at(file, node));
      ts.forEachChild(node, visit);
    };
    visit(sourceOf(file));
  }
  assert.deepEqual(given, [], "pluginFixtures is declared on the Host's options and read by it; only a test, or a replay harness of the closed list, hands it a value");
  // The loaded plugin is the object `loadDevelopmentPlugin` returned in the same function, and no parameter can widen it.
  const file = "apps/local-host/src/plugin-development.ts", text = readFileSync(join(root, file), "utf8");
  assert.match(text, /const definition = await loadDevelopmentPlugin\(input\.directory\);/u);
  assert.match(text, /inProcess: \{ admit: new Set\(\[definition\]\) \}/u);
});
