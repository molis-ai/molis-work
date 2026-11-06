// Declarations that bypass tooling/versions.json (docs/releases/POLICY.md). scripts/generate-versions.mjs only copies values, so
// this is where a new `version: 1` without a marker, a marker with the wrong key, or a registered action without an entry is
// refused. It runs from scripts/verify-release-versions.mjs (CI) and never from the build: another branch's new declaration must
// not stop this machine's build.
//
// The source scan is wide on purpose: every first-party code file except real tests. What is not a first-party current version
// (a record's own revision, an upstream protocol, a frozen input) is listed with its reason in tooling/gates/version-exceptions.json.
// Static scanning cannot see every spelling, so registered facts close the loop: every row of tooling/gates/actions/*.tsv has to
// equal its `action.*` / `scene.*` entry, and the other way round.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { isTestFile, readSourceFiles, SOURCE_ROOTS, versionSource } from "../generate-versions.mjs";

const EXCEPTIONS = "tooling/gates/version-exceptions.json";
const MARKER = /\/\* @version ([\w./-]+)(?: "(?:[^"\\]|\\.)*")? \*\/\s*$/;
const FIELD = /^(?:version|\w+_version|\w*[a-z]Version|format|schema|v|protocol)$/;
const VERSION_VARIABLE = /^[A-Z_\d]*VERSION$/;
const VERSION_PARAMETER = /^(?:version|\w+_version|\w*[a-z]Version)$/;
const VERSION_TEXT = /^\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?$|[-._/]v\d+$|\/\d+$/;
const PUBLIC_IDENTITY = /^(?:io\.molis\.work|molis\.|connector\.|signal\.|listener\.|signals\.|workspace\.|files\.|diff\.|coding\.|git\.)[\w./-]*(?:[./-]v|\/)[1-9]\d*$/;
const IDENTITY_FIELDS = { capability_id: ["action", "action-family"], scene_id: ["scene"], prompt_id: ["prompt"], role_id: ["role"] };
// Everything besides the built-in Manifests that has to carry the product version. Code that announces it imports PRODUCT_VERSION
// from the Host; it is not another entry here.
const PRODUCT_CARRIERS = ["package.json", "apps/desktop/src-tauri/tauri.conf.json", "apps/desktop/src-tauri/Cargo.toml", "apps/desktop/src-tauri/Cargo.lock", "apps/local-host/src/product-version.ts"];

const unwrap = node => { while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) || ts.isTypeAssertionExpression?.(node))) node = node.expression; return node; };
// 0 means "no version yet" everywhere in this repository; only a positive number can be a current version.
const isVersionValue = node => !!node && ((ts.isNumericLiteral(node) && Number(node.text) > 0) || (ts.isStringLiteralLike(node) && VERSION_TEXT.test(node.text)));
const scriptKind = file => /x$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;

/** A key is right for an id when it is the kind's own entry for that id, or ends with it (a factory prefixes its plugin's name). */
function keyFitsIdentity(key, id, kinds) {
  return kinds.some(kind => key === `${kind}.${id}` || (key.startsWith(`${kind}.`) && key.endsWith(`.${id}`)));
}

/** Every declaration in one file that should carry a marker and does not, or carries the wrong one. Findings: { file, line, name, text }. */
export function sourceDeclarationFindings(file, source, versions = {}) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const findings = [];
  const markerOf = node => MARKER.exec(source.slice(node.pos, node.getStart(tree)))?.[1];
  const report = (node, name, text) => findings.push({ file, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, name, text });
  const unmanaged = (node, name) => { if (!markerOf(node)) report(node, name, `unmanaged current version ${name} = ${node.getText(tree)}`); };
  const propertyName = node => ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name) ? node.name.text : null;

  const checkIdentity = (object, value, key) => {
    if (!ts.isObjectLiteralExpression(object)) return;
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const kinds = IDENTITY_FIELDS[propertyName(property)], id = unwrap(property.initializer);
      if (kinds && id && ts.isStringLiteralLike(id) && !keyFitsIdentity(key, id.text, kinds)) {
        report(value, propertyName(property), `wrong version key ${key} beside ${propertyName(property)} "${id.text}"`);
      }
    }
  };
  const visit = node => {
    if ((ts.isPropertyAssignment(node) || ts.isPropertySignature(node)) && FIELD.test(propertyName(node) ?? "")) {
      const value = unwrap(node.initializer) ?? (node.type && ts.isLiteralTypeNode(node.type) ? node.type.literal : null);
      if (isVersionValue(value)) {
        unmanaged(value, propertyName(node));
        const key = markerOf(value);
        if (key && ts.isPropertyAssignment(node)) checkIdentity(node.parent, value, key);
      }
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && VERSION_VARIABLE.test(node.name.text)) {
      const value = unwrap(node.initializer);
      if (isVersionValue(value)) unmanaged(value, node.name.text);
    }
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && VERSION_PARAMETER.test(node.name.text)) {
      const value = unwrap(node.initializer);
      if (isVersionValue(value)) unmanaged(value, node.name.text);
    }
    if (ts.isBinaryExpression(node) && /^(?:===|!==|==|!=)$/.test(node.operatorToken.getText(tree))) {
      for (const [side, other] of [[node.left, node.right], [node.right, node.left]]) {
        const field = unwrap(side), value = unwrap(other);
        if (field && isVersionValue(value) && ts.isNumericLiteral(value) && (ts.isPropertyAccessExpression(field) || ts.isElementAccessExpression(field)) && ts.isIdentifier(field.name ?? field.argumentExpression) && FIELD.test((field.name ?? field.argumentExpression).text)) unmanaged(value, (field.name ?? field.argumentExpression).text);
      }
    }
    if (ts.isStringLiteralLike(node) && PUBLIC_IDENTITY.test(node.text)) unmanaged(node, node.text);
    // A factory's id and version sit side by side: define("items.list", /* @version action.todo.items.list */ 1, …).
    if (ts.isCallExpression(node)) {
      for (let index = 0; index + 1 < node.arguments.length; index++) {
        const id = unwrap(node.arguments[index]), value = node.arguments[index + 1], key = markerOf(value);
        if (!id || !ts.isStringLiteralLike(id)) continue;
        if (key && /^(?:action|scene)\./.test(key) && !keyFitsIdentity(key, id.text, ["action", "scene"])) report(value, "version", `wrong version key ${key} beside id "${id.text}"`);
        // shipped(actions, "todo.organize.get", 1, …): a known action's id followed by a bare number is a reference to that action.
        if (!key && ts.isNumericLiteral(value) && Object.hasOwn(versions, `action.${id.text}`)) report(value, "version", `unmanaged reference ${id.text}@${value.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return findings;
}

/** Frontmatter `version:` of any Markdown under the source roots has to come from a carrier. */
export function markdownFindings(file, source, carriers) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1];
  if (frontmatter === undefined || !/^version:/m.test(frontmatter) || carriers.some(carrier => carrier.file === file)) return [];
  return [{ file, line: 1, name: "version", text: "unmanaged frontmatter version: add a carrier in tooling/versions.json" }];
}

/** Manifest fields and capability strings of an official integration Manifest have to be carried. */
export function manifestFindings(file, source, carriers) {
  const configured = carriers.filter(carrier => carrier.file === file), findings = [];
  const covered = (start, end) => configured.some(carrier => [...source.matchAll(new RegExp(carrier.pattern, "gm"))]
    .some(match => match.index + match[1].length === start && match.index + match[0].length - match[2].length === end));
  const finding = name => findings.push({ file, line: 1, name, text: `unmanaged Manifest field ${name}` });
  for (const field of ["schema_version", "host_api_version", "version"]) {
    const match = new RegExp(`("${field}"\\s*:\\s*)("[^"]*"|\\d+)`).exec(source);
    const quote = match?.[2].startsWith('"') ? 1 : 0, start = match ? match.index + match[1].length + quote : -1;
    if (!match || !covered(start, start + match[2].length - 2 * quote)) finding(field);
  }
  for (const match of source.matchAll(/"([a-z][\w.-]*\.v)([1-9]\d*)"/g)) {
    const start = match.index + 1 + match[1].length;
    if (!covered(start, start + match[2].length)) finding(`${match[1]}${match[2]}`);
  }
  return findings;
}

const tsvRows = text => (text ?? "").split("\n").filter(line => line && !line.startsWith("#") && !/^(?:capability_id|scene_id)\t/.test(line))
  .map(line => line.split("\t")).map(([id, version]) => ({ id, version: Number(version) }));

/** Rows no entry can name one by one, and the entry each takes its version from. */
const FAMILY_ROWS = [
  [/^sdk\.artifacts\.[^.]+\.([\w-]+)$/, match => `action-family.sdk.artifacts.${match[1]}`],
  [/^[\w-]+\.content\.(list|read|receive|create)$/, match => `protocol.workflow-content.${match[1]}`],
  [/^scenes\.(?:enable|disable|targets):(.+)$/, match => `scene.${match[1]}`],
];

/** Registered facts against the source: each row equals its entry, each `action.*` / `scene.*` entry has a row or a stated reason. */
export function registeredFactProblems(versions, snapshots, entries = []) {
  const problems = [], seen = new Set(), exceptedRows = new Set(entries.flatMap(entry => entry.row ?? [])), usedRows = new Set();
  const compare = (text, kind, label) => {
    for (const { id, version } of tsvRows(text)) {
      if (exceptedRows.has(id)) { usedRows.add(id); continue; }
      let key = `${kind}.${id}`;
      if (!Object.hasOwn(versions, key)) {
        const family = FAMILY_ROWS.map(([pattern, name]) => { const match = pattern.exec(id); return match && name(match); }).find(Boolean);
        if (!family || !Object.hasOwn(versions, family)) { problems.push(`${label}: ${id}@${version} has no ${key} entry`); continue; }
        key = family;
      }
      seen.add(key);
      if (versions[key] !== version) problems.push(`${label}: ${id}@${version} but ${key} is ${versions[key]}`);
    }
  };
  compare(snapshots.actions, "action", "tooling/gates/actions/actions.tsv");
  compare(snapshots.hostActions, "action", "tooling/gates/actions/host-actions.tsv");
  compare(snapshots.scenes, "scene", "tooling/gates/actions/scenes.tsv");
  compare(snapshots.hostScenes, "scene", "tooling/gates/actions/host-scenes.tsv");
  const exceptedKeys = new Set(entries.flatMap(entry => entry.entry ?? []));
  for (const key of Object.keys(versions)) {
    if (/^(?:action|scene)\./.test(key) && !seen.has(key) && !exceptedKeys.has(key)) problems.push(`tooling/versions.json: ${key} has no registered row in tooling/gates/actions/`);
  }
  for (const key of exceptedKeys) if (seen.has(key) || !Object.hasOwn(versions, key)) problems.push(`${EXCEPTIONS}: entry ${key} excepts nothing any more`);
  for (const row of exceptedRows) if (!usedRows.has(row)) problems.push(`${EXCEPTIONS}: row ${row} excepts nothing any more`);
  return problems;
}

export function checkExceptions(entries) {
  const problems = [];
  for (const entry of entries) {
    if (typeof entry.reason !== "string" || [...entry.reason.trim()].length < 20) problems.push(`${EXCEPTIONS}: ${entry.file ?? entry.entry ?? entry.row} needs a reason of at least 20 characters`);
    if (!entry.file && !entry.entry && !entry.row) problems.push(`${EXCEPTIONS}: an exception names no file, entry or row`);
  }
  return problems;
}

const excepted = (finding, entries) => entries.find(entry => entry.file === finding.file && (entry.name === undefined || entry.name === finding.name));

/** Applies the exception list to raw findings: what is left over, and exceptions nothing needed any more. */
export function applyExceptions(findings, entries) {
  const used = new Set(), remaining = [];
  for (const finding of findings) {
    const entry = excepted(finding, entries);
    if (entry) used.add(entry); else remaining.push(finding);
  }
  const stale = entries.filter(entry => entry.file && !used.has(entry));
  return { remaining, stale };
}

function markdownFiles(root) {
  const files = [];
  const walk = directory => {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) { if (!["node_modules", "dist", "target", ".git", ".build"].includes(entry.name)) walk(relative); }
      else if (entry.name.endsWith(".md") && !isTestFile(relative)) files.push(relative);
    }
  };
  for (const directory of SOURCE_ROOTS) if (existsSync(path.join(root, directory))) walk(directory);
  return files;
}

const readIfThere = (root, file) => existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), "utf8") : null;

/** Everything this gate has to say about a tree, as strings naming the place. */
export function versionDeclarationProblems(root) {
  const { versions, carriers = [] } = versionSource(root);
  const text = readIfThere(root, EXCEPTIONS);
  const entries = text === null ? [] : JSON.parse(text);
  const problems = checkExceptions(entries), findings = [];
  for (const [file, source] of readSourceFiles(root)) findings.push(...sourceDeclarationFindings(file, source, versions));
  for (const file of markdownFiles(root)) findings.push(...markdownFindings(file, readFileSync(path.join(root, file), "utf8"), carriers));
  if (existsSync(path.join(root, "plugins/official-integrations"))) {
    for (const entry of readdirSync(path.join(root, "plugins/official-integrations"), { withFileTypes: true })) {
      const file = `plugins/official-integrations/${entry.name}/manifest.json`, source = entry.isDirectory() ? readIfThere(root, file) : null;
      if (source !== null) findings.push(...manifestFindings(file, source, carriers));
    }
  }
  const { remaining, stale } = applyExceptions(findings, entries);
  for (const finding of remaining) problems.push(`${finding.file}:${finding.line}: ${finding.text}`);
  for (const entry of stale) problems.push(`${EXCEPTIONS}: ${entry.file}${entry.name ? `#${entry.name}` : ""} excepts nothing any more`);
  for (const file of PRODUCT_CARRIERS) {
    if (!carriers.some(carrier => carrier.file === file && carrier.key === "product.release") && !readIfThere(root, file)?.includes("@version product.release")) problems.push(`${file}: does not take the product version from tooling/versions.json`);
  }
  const snapshots = {
    actions: readIfThere(root, "tooling/gates/actions/actions.tsv"), hostActions: readIfThere(root, "tooling/gates/actions/host-actions.tsv"),
    scenes: readIfThere(root, "tooling/gates/actions/scenes.tsv"), hostScenes: readIfThere(root, "tooling/gates/actions/host-scenes.tsv"),
  };
  if (snapshots.actions !== null) problems.push(...registeredFactProblems(versions, snapshots, entries));
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const problems = versionDeclarationProblems(path.resolve(process.argv[2] ?? "."));
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
}
