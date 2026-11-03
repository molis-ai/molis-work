// Generate apps/workbench/src/builtin-plugins.ts and apps/local-host/src/plugin-registry.generated.ts from the built-in plugins'
// own registrations (W5-02, PG-065 in specs/repository-anti-corruption/privileges.md): the same list twice, once for the shell's
// resources and once for the platform, so the Host never takes what it decides from the workbench (W5-02 PR-B §3.0).
//
// Each plugin package under plugins/native/ that the workspace registry (scripts/workspace-packages.mjs) lists writes its
// catalog entry in src/registration.ts, `export const registration: PluginRegistration = { … }`, and declares it in its
// package.json: `exports["./registration"]` and `"molis-work": { "registration": "./registration" }`. The catalog file is
// only the list of those entries: one import per package (by package name, in code-point order) and the array in
// `catalog_order`; the platform's file is the same list under its own name. Neither is edited by hand: a new plugin writes its
// own registration and this script lists it.
// The packages that import those files depend on exactly the plugins they list (PG-069, W5-02 PR-C): this script also writes the
// built-in plugin dependencies of apps/workbench/package.json, apps/local-host/package.json and the root package.json (the
// union of the two files' imports), and the workspace registry reads each plugin's entry from its own package.json, so a new
// plugin is named in no file outside its package.
//
//   node scripts/generate-plugin-registry.mjs          write both files and the three manifests' plugin dependencies (refuses
//                                                      while any registration is malformed)
//   node scripts/generate-plugin-registry.mjs --check  fail, naming the package, when either file is stale, edited by hand or
//                                                      missing, a manifest depends on a built-in plugin neither file imports or
//                                                      lacks one they import, or a registration cannot be listed (pnpm
//                                                      health:check runs this)
//
// What --check reads is syntax only, nothing of the repository is executed: a package under plugins/native/ with no
// registration at all (W5-02-REG-02: deleting a plugin's registration and its package.json declaration together does not
// drop it from the catalog unnoticed), a declared package without src/registration.ts (or the other way round), a
// registration that is not an object literal, a key the contract (PluginRegistration and PluginWorkbenchRegistration in
// packages/contracts/src/platform/plugin-registration.ts) does not have, at the top or in `workbench`, a spread, a
// `catalog_order` that is not a positive integer literal (W5-02-REG-02: 0, 1.5 and -1 are refused) or repeats, a literal
// `project_plugin_id` that is malformed or repeats, and `clientUses` or `companions` that are not literal
// short ids. What it cannot see:
// an id given through a constant (most are) and a short id that names no plugin; the built catalog is checked for those
// when it loads (apps/workbench/src/plugin-catalog.ts) and by tests/plugin-registry-generation.test.ts.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

export const CATALOG_FILE = "apps/workbench/src/builtin-plugins.ts";
export const PLATFORM_FILE = "apps/local-host/src/plugin-registry.generated.ts";
/** The manifests whose built-in plugin dependencies are the generated files' imports: the importing app's, and the root's (both). */
export const PLUGIN_DEPENDENCY_MANIFESTS = [
  { manifest: "apps/workbench/package.json", files: [CATALOG_FILE] },
  { manifest: "apps/local-host/package.json", files: [PLATFORM_FILE] },
  { manifest: "package.json", files: [CATALOG_FILE, PLATFORM_FILE] },
];
export const REGISTRATION_CONTRACT = "packages/contracts/src/platform/plugin-registration.ts";
const PLUGIN_ROOT = "plugins/native/";
const REGISTRATION_FILE = "src/registration.ts";
const SHORT_ID = /^[a-z0-9][a-z0-9-]*$/;
const SHORT_ID_LISTS = { clientUses: "workbench", companions: "top" };

const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const keyOf = (property) => property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) ? property.name.text : null;
const unwrap = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
};

/** The member names of the two interfaces a registration is written against. */
export function contractKeys(snapshot) {
  const text = snapshot.read(REGISTRATION_CONTRACT);
  if (text === null) return { problems: [`${REGISTRATION_CONTRACT} does not exist`] };
  const members = (name) => {
    const found = parse(REGISTRATION_CONTRACT, text).statements.find((statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === name);
    return found ? new Set(found.members.map(keyOf).filter(Boolean)) : null;
  };
  const top = members("PluginRegistration"), workbench = members("PluginWorkbenchRegistration");
  if (!top || !workbench) return { problems: [`${REGISTRATION_CONTRACT} no longer declares PluginRegistration and PluginWorkbenchRegistration`] };
  return { top, workbench, problems: [] };
}

/** The registry's built-in plugin packages, each with its registration source (or null) and what is wrong with its declaration. */
export function registeredPackages(snapshot, packages) {
  const result = [], problems = [], unregistered = [];
  for (const entry of packages.filter((item) => item.path.startsWith(PLUGIN_ROOT))) {
    const manifestText = snapshot.read(`${entry.path}/package.json`);
    if (manifestText === null) { problems.push(`${entry.name}: ${entry.path}/package.json does not exist`); continue; }
    let json;
    try { json = JSON.parse(manifestText); } catch { problems.push(`${entry.name}: ${entry.path}/package.json is not JSON`); continue; }
    const file = `${entry.path}/${REGISTRATION_FILE}`, source = snapshot.read(file);
    const declared = json["molis-work"]?.registration, exported = json.exports?.["./registration"];
    if (declared === undefined && source === null) { unregistered.push({ entry, file }); continue; }
    if (declared === undefined) { problems.push(`${entry.name}: has ${REGISTRATION_FILE} but its package.json does not declare it ("molis-work": { "registration": "./registration" })`); continue; }
    if (declared !== "./registration") problems.push(`${entry.name}: "molis-work".registration must be "./registration", not ${JSON.stringify(declared)}`);
    if (exported?.import !== "./dist/registration.js" || exported?.types !== "./dist/registration.d.ts") problems.push(`${entry.name}: package.json exports "./registration" must be { "types": "./dist/registration.d.ts", "import": "./dist/registration.js" }`);
    if (source === null) { problems.push(`${entry.name}: package.json declares a registration but ${file} does not exist`); continue; }
    result.push({ name: entry.name, dir: entry.path.slice(PLUGIN_ROOT.length), file, source });
  }
  // A package with no registration is a mistake wherever any plugin registers or the catalog or the contract is there; a layout
  // with none of those (a scratch layout of the gates' own tests that merely lists plugin packages) has not adopted them.
  const adopted = result.length > 0 || problems.length > 0 || snapshot.read(CATALOG_FILE) !== null || snapshot.read(REGISTRATION_CONTRACT) !== null;
  if (adopted) for (const { entry, file } of unregistered) problems.push(`${entry.name}: has no registration; every package under ${PLUGIN_ROOT} writes ${file} and declares it in package.json ("molis-work": { "registration": "./registration" })`);
  return { packages: result, problems };
}

/** One registration read as syntax: its `catalog_order`, its literal `project_plugin_id` (or null), and what is wrong. */
export function readRegistration(pkg, keys) {
  const problems = [], say = (problem) => problems.push(`${pkg.name}: ${pkg.file} ${problem}`);
  const tree = parse(pkg.file, pkg.source);
  const declarations = tree.statements.filter(ts.isVariableStatement)
    .filter((statement) => statement.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword))
    .flatMap((statement) => statement.declarationList.declarations.map((declaration) => ({ statement, declaration })))
    .filter(({ declaration }) => ts.isIdentifier(declaration.name) && declaration.name.text === "registration");
  if (declarations.length !== 1) { say("must export one `registration`"); return { order: null, id: null, problems }; }
  const [{ statement, declaration }] = declarations, object = unwrap(declaration.initializer);
  if ((statement.declarationList.flags & ts.NodeFlags.Const) === 0) say("must declare `registration` with const");
  if (!object || !ts.isObjectLiteralExpression(object)) { say("must give `registration` an object literal"); return { order: null, id: null, problems }; }
  const properties = (literal, allowed, where) => {
    const found = new Map();
    for (const property of literal.properties) {
      const key = keyOf(property);
      if (!key || !(ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property))) { say(`has ${where}a member that is not a plain property (${property.getText().slice(0, 40)})`); continue; }
      if (!allowed.has(key)) say(`has ${where}key "${key}", which PluginRegistration${where ? "'s workbench" : ""} does not declare`);
      if (found.has(key)) say(`repeats ${where}key "${key}"`);
      found.set(key, ts.isPropertyAssignment(property) ? unwrap(property.initializer) : property.name);
    }
    return found;
  };
  const top = properties(object, keys.top, ""), workbench = top.get("workbench");
  const inner = workbench && ts.isObjectLiteralExpression(workbench) ? properties(workbench, keys.workbench, "workbench ") : null;
  if (!inner) say(`must give "workbench" an object literal`);
  const orderNode = top.get("catalog_order"), idNode = top.get("project_plugin_id");
  const written = orderNode && ts.isNumericLiteral(orderNode) ? Number(orderNode.text) : null;
  if (written === null) say(`must give "catalog_order" a number literal, a positive integer`);
  else if (!Number.isSafeInteger(written) || written < 1) say(`gives "catalog_order" ${orderNode.getText()}, which is not a positive integer`);
  const order = Number.isSafeInteger(written) && written >= 1 ? written : null;
  let id = null;
  if (!idNode) say(`has no "project_plugin_id"`);
  else if (ts.isStringLiteralLike(idNode)) {
    id = idNode.text;
    if (!SHORT_ID.test(id)) say(`gives "project_plugin_id" "${id}", which is not a short id (${SHORT_ID})`);
  }
  for (const [key, level] of Object.entries(SHORT_ID_LISTS)) {
    const value = (level === "top" ? top : inner)?.get(key); if (!value) continue;
    const items = ts.isArrayLiteralExpression(value) ? [...value.elements] : null;
    if (!items || items.some((item) => !ts.isStringLiteralLike(item) || !SHORT_ID.test(item.text))) say(`must give "${key}" literal short ids (another plugin's constants cannot be imported here)`);
  }
  return { order, id, problems };
}

const aliasOf = (dir) => dir.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase()) + "Registration";

/** The catalog file's text for registrations already read; imports by package name, entries by `catalog_order`. */
export function generateCatalog(entries) {
  return generatedList(entries, "BUILTIN_PLUGIN_CATALOG",
    "/** Every plugin this build ships, in catalog order: the shared build composition for the catalog and the UI resources. */");
}

/** The platform's file: the same list, which apps/local-host/src/plugin-registry.ts derives the platform's facts from. */
export function generatePlatformRegistry(entries) {
  return generatedList(entries, "PLATFORM_PLUGIN_REGISTRATIONS",
    "/** Every plugin this build ships, in catalog order, as the platform reads them (apps/local-host/src/plugin-registry.ts). */");
}

function generatedList(entries, name, doc) {
  const imports = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((entry) => `import { registration as ${aliasOf(entry.dir)} } from "${entry.name}/registration";`);
  const items = [...entries].sort((a, b) => a.order - b.order).map((entry) => `  ${aliasOf(entry.dir)},`);
  return [
    "// Generated by `node scripts/generate-plugin-registry.mjs` from each built-in plugin's src/registration.ts (W5-02). Do not",
    "// edit: change the plugin's own registration and regenerate; `pnpm health:check` fails while this file is out of date.",
    `import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";`,
    ...imports,
    "",
    doc,
    `export const ${name}: readonly PluginRegistration[] = [`,
    ...items,
    "];",
    "",
  ].join("\n");
}

/** Read every registration in a snapshot ({ files?, read }) and give the catalog text, or the problems that stop it. */
export function pluginRegistry(snapshot, packages) {
  const listed = registeredPackages(snapshot, packages), problems = [...listed.problems];
  const known = new Set(packages.map((entry) => `${entry.path}/${REGISTRATION_FILE}`));
  for (const file of snapshot.files ?? []) {
    if (file.startsWith(PLUGIN_ROOT) && file.endsWith(`/${REGISTRATION_FILE}`) && file.split("/").length === 5 && !known.has(file)) problems.push(`${file} belongs to no package in scripts/workspace-packages.mjs`);
  }
  const keys = listed.packages.length ? contractKeys(snapshot) : { problems: [] };
  if (keys.problems.length) return { text: null, platformText: null, problems: [...problems, ...keys.problems].map((problem) => `Plugin registry: ${problem}`) };
  const entries = listed.packages.map((pkg) => {
    const read = readRegistration(pkg, keys);
    problems.push(...read.problems);
    return { ...pkg, order: read.order, id: read.id };
  });
  const repeated = (field, what) => {
    const seen = new Map();
    for (const entry of entries) if (entry[field] !== null) seen.set(entry[field], [...(seen.get(entry[field]) ?? []), entry.name]);
    for (const [value, names] of seen) if (names.length > 1) problems.push(`${what} ${JSON.stringify(value)} is given by ${names.join(" and ")}; each plugin needs its own`);
  };
  repeated("order", "catalog_order");
  repeated("id", "project_plugin_id");
  if (problems.length) return { text: null, platformText: null, problems: problems.map((problem) => `Plugin registry: ${problem}`) };
  return { text: generateCatalog(entries), platformText: generatePlatformRegistry(entries), problems: [] };
}

/** The packages a generated file's text imports registrations from. */
const importedPackages = (text) => [...(text ?? "").matchAll(/from "([^"]+)\/registration";/g)].map((match) => match[1]);

/**
 * Each manifest that exists, with what is wrong with its built-in plugin dependencies against the generated texts, and its text
 * with them made exactly the imported packages (the other dependencies kept, all of them in code-point order).
 */
export function pluginDependencyManifests(snapshot, packages, generated) {
  const plugins = new Set(packages.filter((item) => item.path.startsWith(PLUGIN_ROOT)).map((item) => item.name));
  const result = [];
  for (const { manifest, files } of PLUGIN_DEPENDENCY_MANIFESTS) {
    const source = snapshot.read(manifest);
    if (source === null) continue;
    let json;
    try { json = JSON.parse(source); } catch { result.push({ manifest, problems: [`${manifest} is not JSON`], text: null }); continue; }
    const wanted = new Set(files.flatMap((file) => importedPackages(generated[file])));
    const dependencies = json.dependencies ?? {};
    const problems = [];
    for (const [name, version] of Object.entries(dependencies)) {
      if (!plugins.has(name)) continue;
      if (!wanted.has(name)) problems.push(`${manifest} depends on ${name}, which ${files.join(" and ")} does not import`);
      else if (version !== "workspace:*") problems.push(`${manifest} depends on ${name} as ${JSON.stringify(version)}, not "workspace:*"`);
    }
    for (const name of wanted) if (!(name in dependencies)) problems.push(`${manifest} does not depend on ${name}, which ${files.join(" and ")} imports`);
    const kept = Object.entries(dependencies).filter(([name]) => !plugins.has(name));
    const next = Object.fromEntries([...kept, ...[...wanted].map((name) => [name, "workspace:*"])].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    result.push({ manifest, problems, text: `${JSON.stringify({ ...json, dependencies: next }, null, 2)}\n` });
  }
  return result;
}

/** The --check rule for pnpm health:check: the registrations can be listed and each generated file is exactly their list. */
export function pluginRegistryProblems(snapshot, packages) {
  const { text, platformText, problems } = pluginRegistry(snapshot, packages);
  if (problems.length) return problems;
  // A repository with no built-in plugins and no generated files (a scratch layout of the gates' own tests) has nothing to list.
  const empty = text === generateCatalog([]) && snapshot.read(CATALOG_FILE) === null && snapshot.read(PLATFORM_FILE) === null;
  if (empty) return [];
  const stale = [[CATALOG_FILE, text], [PLATFORM_FILE, platformText]].filter(([file, expected]) => snapshot.read(file) !== expected)
    .map(([file]) => `Plugin registry: ${file} is out of date or edited by hand; run node scripts/generate-plugin-registry.mjs`);
  const manifests = pluginDependencyManifests(snapshot, packages, { [CATALOG_FILE]: text, [PLATFORM_FILE]: platformText })
    .flatMap((entry) => entry.problems.map((problem) => `Plugin registry: ${problem}; run node scripts/generate-plugin-registry.mjs and pnpm install`));
  return [...stale, ...manifests];
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const snapshot = { read: (file) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } } };
  // Loaded here, not imported above: the health gate imports this module in scratch layouts that have no registry.
  const { WORKSPACE_PACKAGES } = await import(pathToFileURL(path.join(root, "scripts/workspace-packages.mjs")).href);
  const check = process.argv.includes("--check");
  const problems = check ? pluginRegistryProblems(snapshot, WORKSPACE_PACKAGES) : pluginRegistry(snapshot, WORKSPACE_PACKAGES).problems;
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  if (!check) {
    const { text, platformText } = pluginRegistry(snapshot, WORKSPACE_PACKAGES);
    for (const [file, expected] of [[CATALOG_FILE, text], [PLATFORM_FILE, platformText]]) {
      if (snapshot.read(file) !== expected) writeFileSync(path.join(root, file), expected);
    }
    // A manifest is rewritten only when its plugin dependencies are not already exactly the imported ones.
    for (const { manifest, problems: wrong, text: next } of pluginDependencyManifests(snapshot, WORKSPACE_PACKAGES, { [CATALOG_FILE]: text, [PLATFORM_FILE]: platformText })) {
      if (wrong.length && next !== null) writeFileSync(path.join(root, manifest), next);
    }
    console.log(`${CATALOG_FILE}, ${PLATFORM_FILE}: ${text.split("\n").filter((line) => line.startsWith("  ")).length} registrations`);
  } else console.log(`${CATALOG_FILE} and ${PLATFORM_FILE} list every built-in plugin's registration`);
}
