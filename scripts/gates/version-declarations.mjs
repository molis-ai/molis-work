// Declarations that bypass tooling/versions.json (docs/releases/POLICY.md). scripts/generate-versions.mjs only copies values, so
// this is where a new `version: 1` without a marker, a marker with the wrong key, or a registered action without an entry is
// refused. It runs from scripts/verify-release-versions.mjs (CI) and never from the build: another branch's new declaration must
// not stop this machine's build.
//
// The source scan is wide on purpose: every first-party code file except real tests. What is not a first-party current version
// (a record's own revision, an upstream protocol, a frozen input) is listed literal by literal with its reason in
// tooling/gates/version-exceptions.json. Static scanning cannot see every spelling, so registered facts close the loop: every row of
// tooling/gates/actions/*.tsv has to equal its `action.*` / `scene.*` entry, and the other way round.
import { readdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { isMainScript, walkFiles } from "../script-paths.mjs";
import { isQuotedMarker, isTestFile, MARKED_LITERAL, markerAtEnd, packageOf, readSourceFiles, scriptKind, SOURCE_ROOTS, versionSource } from "../version-source.mjs";

const EXCEPTIONS = "tooling/gates/version-exceptions.json";
const VERSION_NAME = /^(?:[A-Z_\d]*VERSION|version|\w+_version|\w*[a-z]Version)$/;
const FIELD = new RegExp(`${VERSION_NAME.source}|^(?:format|schema|v|protocol)$`);
const VERSION_TEXT = /^\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?$|[-._/]v\d+$|\/\d+$/;
// A version written into a name. There is no list of prefixes: a new kind of id is seen before anyone has added it to the table.
const NAME_LIKE = /^[A-Za-z][\w./@-]*$/;
const VERSION_IN_NAME = /[._-]v[1-9]\d*(?:[._-]|$)|\/v[1-9]\d*$|@[1-9]\d*$/;
// `/2` only when it ends a whole string: inside a script's text, bytes/1024 is a division.
const SLASH_VERSION = /\/[1-9]\d*$/;
const TOKEN_SEPARATOR = /[\s"'`,;()[\]{}<>=|\\]+/;
// The namespace of the MCP tools: this one literal prefix, not a rule about a field or a shape of name. It is part of every tool's name
// and does not move, so it would be the same exception 25 times. Only the prefix is forgiven: the rest of the name is still read, and
// it keeps the `_` in front of it, so `molis_work_v1_v2_tool` still shows its `_v2_` (VG-40).
const MCP_NAMESPACE = /^molis_work_v1_/;
const USER_VERSION = /(?:\bPRAGMA\s+(?:\w+\.)?|^\s*)user_version\s*[=(]\s*([1-9]\d*)/i;
const IDENTITY_FIELDS = { capability_id: ["action", "action-family"], scene_id: ["scene"], prompt_id: ["prompt"], role_id: ["role"] };
// Everything besides the built-in Manifests that has to carry the product version. Code that announces it imports PRODUCT_VERSION
// from the Host; it is not another entry here.
const PRODUCT_CARRIERS = ["package.json", "apps/desktop/src-tauri/tauri.conf.json", "apps/desktop/src-tauri/Cargo.toml", "apps/desktop/src-tauri/Cargo.lock", "apps/local-host/src/product-version.ts"];
const SNAPSHOTS = { actions: "actions.tsv", hostActions: "host-actions.tsv", scenes: "scenes.tsv", hostScenes: "host-scenes.tsv" };
// Stays at its first version until the first outside install: docs/system/CONTRACT-CHANGES.md §3. Stage two replaces this rule.
const STAGE_ONE = /^(?:action|action-family|scene|prompt|role)\.|^(?:manifest\.schema|host\.api)$/;
// The kinds of entry that are a contract between packages by definition. Any other entry is one package's own number, so a second
// package marking its literal with it has borrowed the number for something else. A new kind starts on that side.
const SHARED_KINDS = /^(?:action|event|format|type|artifact|manifest|host|protocol|product)\.|^sync\.protocol$/;

const unwrap = node => { while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression?.(node))) node = node.expression; return node; };
// 0 means "no version yet" everywhere in this repository; only a positive number can be a current version.
const isVersionValue = node => !!node && ((ts.isNumericLiteral(node) && Number(node.text) > 0) || (ts.isStringLiteralLike(node) && VERSION_TEXT.test(node.text)));
const propertyName = ({ name }) => {
  if (ts.isComputedPropertyName(name)) return ts.isStringLiteralLike(name.expression) ? name.expression.text : null;
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : null;
};

/** The literals a version field holds, through the spellings that only wrap one: a union, a default, `{ enum: [2] }`, `z.literal(2)`. */
function heldValues(node) {
  node = unwrap(node);
  if (!node) return [];
  if (ts.isLiteralTypeNode(node)) return heldValues(node.literal);
  if (ts.isUnionTypeNode(node)) return node.types.flatMap(heldValues);
  if (ts.isConditionalExpression(node)) return [node.whenTrue, node.whenFalse].flatMap(heldValues);
  if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) return heldValues(node.right);
  if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(heldValues);
  if (ts.isObjectLiteralExpression(node)) return node.properties.filter(property => ts.isPropertyAssignment(property) && ["enum", "const"].includes(propertyName(property))).flatMap(property => heldValues(property.initializer));
  if (ts.isCallExpression(node) && /(?:^|\.)literal$/.test(node.expression.getText())) return node.arguments.flatMap(heldValues);
  return isVersionValue(node) ? [node] : [];
}

/** The name a compared or assigned expression goes by, when that name says it holds a version: `x.version`, `x['version']`, `x[version]`, `schemaVersion`. */
function versionHolder(node) {
  node = unwrap(node);
  if (!node) return null;
  if (ts.isIdentifier(node)) return VERSION_NAME.test(node.text) ? node.text : null;
  const name = (ts.isPropertyAccessExpression(node) ? node.name : ts.isElementAccessExpression(node) ? node.argumentExpression : null)?.text;
  return typeof name === "string" && FIELD.test(name) ? name : null;
}

/** A key is right for an id when it is the kind's own entry for that id, or ends with it (a factory prefixes its plugin's name). */
function keyFitsIdentity(key, id, kinds) {
  return kinds.some(kind => key === `${kind}.${id}` || (key.startsWith(`${kind}.`) && key.endsWith(`.${id}`)));
}

/** Every declaration in one file that should carry a marker and does not, or carries the wrong one. Findings: { file, line, name, value, text }. */
export function sourceDeclarationFindings(file, source, versions = {}, carriers = []) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const findings = [], handled = new Set();
  const carried = carriers.filter(carrier => carrier.file === file).flatMap(carrier => [...source.matchAll(new RegExp(carrier.pattern, "gm"))].map(match => match[0]));
  const markerOf = node => markerAtEnd(source.slice(node.pos, node.getStart(tree)));
  const report = (node, name, value, text) => findings.push({ file, line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1, name, value, text });
  const unmanaged = (node, name) => {
    handled.add(node);
    if (!markerOf(node)) report(node, name, node.text, `unmanaged current version ${name} = ${node.getText(tree)}`);
  };

  const checkIdentity = (object, value, key) => {
    if (!ts.isObjectLiteralExpression(object)) return;
    for (const property of object.properties) {
      if (!ts.isPropertyAssignment(property)) continue;
      const kinds = IDENTITY_FIELDS[propertyName(property)], id = unwrap(property.initializer);
      if (kinds && id && ts.isStringLiteralLike(id) && !keyFitsIdentity(key, id.text, kinds)) {
        report(value, propertyName(property), value.text, `wrong version key ${key} beside ${propertyName(property)} "${id.text}"`);
      }
    }
  };
  // A string as it reads at run time: a substitution is X, except a bare number, which is part of the text.
  const textOf = node => ts.isStringLiteralLike(node) ? node.text : node.head.text + node.templateSpans.map(span => {
    const value = unwrap(span.expression);
    return (ts.isNumericLiteral(value) && !markerOf(value) ? value.text : "X") + span.literal.text;
  }).join("");
  const holderHint = node => {
    const holder = node.parent;
    const name = holder && (ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder)) && (ts.isIdentifier(holder.name) || ts.isStringLiteralLike(holder.name)) ? holder.name.text : "";
    return /contribution/i.test(name) ? ": a UI contribution id needs no version in its name, drop it" : "";
  };
  // A version inside a string: `PRAGMA user_version = 3`, a whole id, or an id in a script's text. A marked literal moves with its entry.
  const inspectString = node => {
    if (handled.has(node) || markerOf(node)) return;
    const text = textOf(node).replace(MARKED_LITERAL, "X");
    const pragma = USER_VERSION.exec(text);
    if (pragma) report(node, "PRAGMA user_version", pragma[1], `unmanaged current version PRAGMA user_version = ${pragma[1]}`);
    const tokens = text.split(TOKEN_SEPARATOR).filter(Boolean), whole = tokens.length === 1 && tokens[0] === text;
    for (const token of tokens) {
      if (!NAME_LIKE.test(token) || !(VERSION_IN_NAME.test(token.replace(MCP_NAMESPACE, "_")) || (whole && SLASH_VERSION.test(token)))) continue;
      if (!whole && carried.some(match => match.includes(token) || token.includes(match))) continue;
      if (whole) report(node, token, token, `unmanaged current version ${token} = ${node.getText(tree)}${holderHint(node)}`);
      else report(node, token, token, `unmanaged current version ${token} inside a string`);
    }
  };
  const visit = node => {
    if ((ts.isPropertyAssignment(node) || ts.isPropertySignature(node) || ts.isPropertyDeclaration(node) || ts.isEnumMember(node)) && FIELD.test(propertyName(node) ?? "")) {
      for (const value of heldValues(node.initializer ?? node.type)) {
        unmanaged(value, propertyName(node));
        const key = markerOf(value);
        if (key && ts.isPropertyAssignment(node)) checkIdentity(node.parent, value, key);
      }
    }
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
      const holder = node.propertyName ?? node.name;
      if (ts.isIdentifier(holder) && VERSION_NAME.test(holder.text)) for (const value of heldValues(node.initializer)) unmanaged(value, holder.text);
    }
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.getText(tree);
      const sides = /^(?:\?\?|\|\|)?=$/.test(operator) ? [[node.left, node.right]] : /^[!=]==?$/.test(operator) ? [[node.left, node.right], [node.right, node.left]] : [];
      for (const [side, other] of sides) {
        const holder = versionHolder(side);
        if (holder) for (const value of heldValues(other)) unmanaged(value, holder);
      }
    }
    if (ts.isCaseClause(node)) {
      const holder = versionHolder(node.parent.parent.expression);
      if (holder) for (const value of heldValues(node.expression)) unmanaged(value, holder);
    }
    if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) inspectString(node);
    // A factory's id and version sit side by side: define("items.list", /* @version action.todo.items.list */ 1, …).
    if (ts.isCallExpression(node)) {
      for (let index = 0; index + 1 < node.arguments.length; index++) {
        const id = unwrap(node.arguments[index]), value = node.arguments[index + 1], key = markerOf(value);
        if (!id || !ts.isStringLiteralLike(id)) continue;
        if (key && /^(?:action|scene)\./.test(key) && !keyFitsIdentity(key, id.text, ["action", "scene"])) report(value, "version", value.getText(tree), `wrong version key ${key} beside id "${id.text}"`);
        // shipped(actions, "todo.organize.get", 1, …): a known action's id followed by a bare number is a reference to that action.
        if (!key && ts.isNumericLiteral(value) && Object.hasOwn(versions, `action.${id.text}`)) report(value, "version", value.text, `unmanaged reference ${id.text}@${value.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return findings;
}

/**
 * An entry used by two packages is a contract between them, or one has taken the other's number for something else (TODO_SECOND with
 * the pages database's marker). What makes it the former: the kind of entry, a holder that says it is a version, and a plugin's own
 * format staying out of the other plugins.
 */
export function borrowedEntryFindings(files, carriers) {
  const uses = new Map();
  const use = (key, entry) => { const owner = packageOf(entry.file); if (owner) uses.set(key, [...(uses.get(key) ?? []), { ...entry, owner }]); };
  for (const [file, source] of files) {
    for (const match of source.matchAll(MARKED_LITERAL)) {
      if (isQuotedMarker(file, source, match.index)) continue;
      const before = source.slice(source.lastIndexOf("\n", match.index) + 1, match.index);
      use(match[2], { file, line: source.slice(0, match.index).split("\n").length, value: match[4], holder: /^\d/.test(match[4]) && !match[3] ? /(\w+)\s*(?::[^=;\n]*=|[:=])\s*$/.exec(before)?.[1] : undefined });
    }
  }
  for (const { file, key } of carriers) use(key, { file, line: 1, value: "carrier" });
  const plugins = new Set([...files.keys()].flatMap(file => /^plugins\/native\/([^/]+)\//.exec(file)?.[1] ?? []));
  const findings = [];
  for (const [key, entries] of uses) {
    const owners = [...new Set(entries.map(entry => entry.owner))];
    if (owners.length < 2) continue;
    const formatOwner = /^format\.([^.]+)\./.exec(key)?.[1];
    for (const { file, line, value, holder, owner } of entries) {
      const finding = text => findings.push({ file, line, name: key, value, text });
      if (!SHARED_KINDS.test(key)) finding(`${key} is shared by ${owners.join(", ")}, but an entry of this kind belongs to one package`);
      else if (plugins.has(formatOwner) && owner.startsWith("plugins/native/") && owner !== `plugins/native/${formatOwner}`) finding(`${key} belongs to another plugin, plugins/native/${formatOwner}: a plugin does not read another's format`);
      else if (holder && !FIELD.test(holder) && !/version|schema/i.test(holder) && !key.split(/[./-]/).includes(holder)) finding(`${holder} does not say it holds a version, and ${key} is shared by ${owners.join(", ")}: give it a name of its own or an entry of its own`);
    }
  }
  return findings;
}

/** Frontmatter `version:` of any Markdown under the source roots has to come from a carrier. */
export function markdownFindings(file, source, carriers) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1];
  const version = frontmatter === undefined ? null : /^version:[ \t]*(.*)$/m.exec(frontmatter);
  if (!version || carriers.some(carrier => carrier.file === file)) return [];
  return [{ file, line: 1, name: "version", value: version[1], text: "unmanaged frontmatter version: add a carrier in tooling/versions.json" }];
}

/** The generator rewrites only JS and TS, so a marker in another language would look managed and never move. */
export function strayMarkerFindings(file, source) {
  return source.split("\n").flatMap((line, index) => {
    const marker = /@version [\w./-]+/.exec(line);
    return marker ? [{ file, line: index + 1, name: "marker", value: marker[0], text: "@version marker in a file the generator does not read: add a carrier in tooling/versions.json" }] : [];
  });
}

/** Manifest fields and capability strings of an official integration Manifest have to be carried. */
export function manifestFindings(file, source, carriers) {
  const configured = carriers.filter(carrier => carrier.file === file), findings = [];
  const covered = (start, end) => configured.some(carrier => [...source.matchAll(new RegExp(carrier.pattern, "gm"))]
    .some(match => match.index + match[1].length === start && match.index + match[0].length - match[2].length === end));
  const finding = (name, value) => findings.push({ file, line: 1, name, value, text: `unmanaged Manifest field ${name}` });
  for (const field of ["schema_version", "host_api_version", "version"]) {
    const match = new RegExp(`("${field}"\\s*:\\s*)("[^"]*"|\\d+)`).exec(source);
    const quote = match?.[2].startsWith('"') ? 1 : 0, start = match ? match.index + match[1].length + quote : -1;
    if (!match || !covered(start, start + match[2].length - 2 * quote)) finding(field, match?.[2] ?? "missing");
  }
  for (const match of source.matchAll(/"([a-z][\w.-]*\.v)([1-9]\d*)"/g)) {
    const start = match.index + 1 + match[1].length;
    if (!covered(start, start + match[2].length)) finding(`${match[1]}${match[2]}`, `${match[1]}${match[2]}`);
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
  compare(snapshots.actions, "action", `tooling/gates/actions/${SNAPSHOTS.actions}`);
  compare(snapshots.hostActions, "action", `tooling/gates/actions/${SNAPSHOTS.hostActions}`);
  compare(snapshots.scenes, "scene", `tooling/gates/actions/${SNAPSHOTS.scenes}`);
  compare(snapshots.hostScenes, "scene", `tooling/gates/actions/${SNAPSHOTS.hostScenes}`);
  const exceptedKeys = new Set(entries.flatMap(entry => entry.entry ?? []));
  for (const key of Object.keys(versions)) {
    if (/^(?:action|scene)\./.test(key) && !seen.has(key) && !exceptedKeys.has(key)) problems.push(`tooling/versions.json: ${key} has no registered row in tooling/gates/actions/`);
  }
  for (const key of exceptedKeys) if (seen.has(key) || !Object.hasOwn(versions, key)) problems.push(`${EXCEPTIONS}: entry ${key} excepts nothing any more`);
  for (const row of exceptedRows) if (!usedRows.has(row)) problems.push(`${EXCEPTIONS}: row ${row} excepts nothing any more`);
  return problems;
}

const countsLetThrough = values => !!values && typeof values === "object" && Object.keys(values).length > 0 && Object.values(values).every(count => Number.isSafeInteger(count) && count > 0);

export function checkExceptions(entries) {
  const problems = [];
  for (const entry of entries) {
    if (typeof entry.reason !== "string" || [...entry.reason.trim()].length < 20) problems.push(`${EXCEPTIONS}: ${entry.file ?? entry.entry ?? entry.row} needs a reason of at least 20 characters`);
    if (!entry.file && !entry.entry && !entry.row) problems.push(`${EXCEPTIONS}: an exception names no file, entry or row`);
    if (entry.file && !(entry.name && countsLetThrough(entry.values))) problems.push(`${EXCEPTIONS}: ${entry.file} needs a name and the values it lets through`);
  }
  return problems;
}

/**
 * Applies the exception list to raw findings: what is left over, exceptions nothing needed any more, and exceptions whose literals
 * are not the ones found. An entry names the literals it lets through and how many of each, so one more `version: 1` beside the
 * excepted one is seen, and so is a literal that changed.
 */
export function applyExceptions(findings, entries) {
  const found = new Map(), remaining = [];
  for (const finding of findings) {
    const entry = entries.find(candidate => candidate.file === finding.file && candidate.name === finding.name);
    if (!entry) { remaining.push(finding); continue; }
    const counts = found.get(entry) ?? {};
    counts[finding.value] = (counts[finding.value] ?? 0) + 1;
    found.set(entry, counts);
  }
  const written = counts => JSON.stringify(Object.fromEntries(Object.entries(counts).sort()));
  return {
    remaining,
    stale: entries.filter(entry => entry.file && !found.has(entry)),
    changed: [...found].filter(([entry, counts]) => written(entry.values ?? {}) !== written(counts)).map(([entry, counts]) => ({ entry, counts: written(counts) })),
  };
}

const readIfThere = (root, file) => existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), "utf8") : null;

/** What a tree declares without going through the table, before the exception list is applied. */
export function declarationFindings(root) {
  const { versions, carriers = [] } = versionSource(root), findings = [];
  const code = readSourceFiles(root);
  const others = name => walkFiles(root, SOURCE_ROOTS, file => name.test(file) && !isTestFile(file));
  for (const [file, source] of code) findings.push(...sourceDeclarationFindings(file, source, versions, carriers));
  findings.push(...borrowedEntryFindings(code, carriers));
  for (const file of others(/\.md$/)) findings.push(...markdownFindings(file, readFileSync(path.join(root, file), "utf8"), carriers));
  for (const file of others(/\.(?:rs|sql|toml)$/)) findings.push(...strayMarkerFindings(file, readFileSync(path.join(root, file), "utf8")));
  if (existsSync(path.join(root, "plugins/official-integrations"))) {
    for (const entry of readdirSync(path.join(root, "plugins/official-integrations"), { withFileTypes: true })) {
      const file = `plugins/official-integrations/${entry.name}/manifest.json`, source = entry.isDirectory() ? readIfThere(root, file) : null;
      if (source !== null) findings.push(...manifestFindings(file, source, carriers));
    }
  }
  return findings;
}

/** Everything this gate has to say about a tree, as strings naming the place. */
export function versionDeclarationProblems(root) {
  const { versions, carriers = [] } = versionSource(root);
  const text = readIfThere(root, EXCEPTIONS);
  const entries = text === null ? [] : JSON.parse(text);
  const problems = checkExceptions(entries);
  for (const [key, value] of Object.entries(versions)) {
    if (STAGE_ONE.test(key) && value !== 1) problems.push(`tooling/versions.json: ${key} is ${value}; before the first outside install it stays 1 (docs/system/CONTRACT-CHANGES.md §3)`);
  }
  const { remaining, stale, changed } = applyExceptions(declarationFindings(root), entries);
  for (const finding of remaining) problems.push(`${finding.file}:${finding.line}: ${finding.text}`);
  for (const entry of stale) problems.push(`${EXCEPTIONS}: ${entry.file}#${entry.name} excepts nothing any more`);
  for (const { entry, counts } of changed) problems.push(`${EXCEPTIONS}: ${entry.file}#${entry.name} lets through ${JSON.stringify(entry.values)}, the file has ${counts}`);
  for (const file of PRODUCT_CARRIERS) {
    if (!carriers.some(carrier => carrier.file === file && carrier.key === "product.release") && !readIfThere(root, file)?.includes("@version product.release")) problems.push(`${file}: does not take the product version from tooling/versions.json`);
  }
  const snapshots = {};
  for (const [name, file] of Object.entries(SNAPSHOTS)) {
    snapshots[name] = readIfThere(root, `tooling/gates/actions/${file}`);
    if (snapshots[name] === null) problems.push(`tooling/gates/actions/${file}: cannot read it, so the registered actions and scenes were not compared`);
  }
  if (Object.values(snapshots).every(snapshot => snapshot !== null)) problems.push(...registeredFactProblems(versions, snapshots, entries));
  return problems;
}

if (isMainScript(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? "."), problems = versionDeclarationProblems(root), checked = readSourceFiles(root).size;
  if (!checked) problems.push(`${root}: no code files under ${SOURCE_ROOTS.join(", ")}, so nothing was checked`);
  for (const problem of problems) console.error(problem);
  if (problems.length) process.exitCode = 1;
  else console.log(`No version declaration bypasses tooling/versions.json: ${checked} code files checked.`);
}
