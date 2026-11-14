#!/usr/bin/env node
// SMP-01, SMP-02, SMP-18. Read both trees with the same rules. Findings are informational until a separate decision.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildSync } from "esbuild";
import ts from "typescript";
import { isMainScript } from "../script-paths.mjs";
import { isSource } from "./giant-units.mjs";

const contracts = new URL("../../packages/contracts/src/platform/", import.meta.url);
const sdk = new URL("../../packages/plugin-sdk/src/", import.meta.url);
const vocabularyFile = "packages/contracts/src/platform/state-vocabulary.ts";
const familiesFile = "packages/contracts/src/platform/ui-state-rings.ts";
const documentFile = "docs/platform/STATE-VOCABULARY.md";
const publicSource = /^packages\/(?:contracts|plugin-sdk)\/src\//u;
const stateType = /(?:Status|State|Phase)$/u;
const stateProperty = /(?:^|_)(?:status|state|phase)$|(?:Status|State|Phase)$/u;
const pluginManifest = /^(?:plugins\/(?:native|official-integrations)|examples)\/.+\/(?:manifest\.(?:json|ts)|registration\.ts)$/u;
export const stateVocabularyWantsText = file => pluginManifest.test(file) || file === documentFile;

const sourceOf = (file, raw) => ts.createSourceFile(file, raw, ts.ScriptTarget.Latest, true);
const nameOf = name => name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
const exported = node => node.modifiers?.some(item => item.kind === ts.SyntaxKind.ExportKeyword);
const unwrap = node => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
};
const property = (object, key) => object.properties.find(row => ts.isPropertyAssignment(row) && nameOf(row.name) === key)?.initializer;
const lineOf = (node, source) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

function literal(node) {
  node = unwrap(node);
  if (!node) throw new Error("missing literal");
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(literal);
  if (ts.isObjectLiteralExpression(node)) {
    const entries = new Map();
    for (const row of node.properties) {
      const key = nameOf(row.name);
      if (!key || !ts.isPropertyAssignment(row) || entries.has(key)) throw new Error("object requires unique literal keys and values");
      entries.set(key, literal(row.initializer));
    }
    return Object.fromEntries(entries);
  }
  throw new Error("value is not static data");
}

function variable(source, name) {
  for (const statement of source.statements.filter(ts.isVariableStatement)) {
    const declaration = statement.declarationList.declarations.find(row => nameOf(row.name) === name);
    if (declaration) return declaration.initializer;
  }
  return undefined;
}

function registry(snapshot) {
  const read = (file, name) => {
    const text = snapshot.read(file);
    return text === null ? null : literal(variable(sourceOf(file, text), name));
  };
  const families = read(familiesFile, "STATE_RING_FAMILIES");
  const vocabularies = read(vocabularyFile, "STATE_VOCABULARIES");
  return { families, vocabularies };
}

function registryProblems({ families, vocabularies }) {
  if (!vocabularies) return [];
  const problems = [];
  const keys = new Set(families?.map(({ key }) => key));
  if (families?.length !== 21 || keys.size !== 21) problems.push(`${familiesFile}: expected 21 distinct state ring families`);
  for (const [name, entry] of Object.entries(vocabularies)) {
    const { owner, public: visibility, consumer, states } = entry ?? {};
    if (!owner || typeof visibility !== "boolean" || !consumer || !states || !Object.keys(states).length) {
      problems.push(`${vocabularyFile}: ${name} needs an owner, visibility, consumer and nonempty states`);
      continue;
    }
    for (const [state, family] of Object.entries(states)) {
      if (!keys.has(family)) problems.push(`${vocabularyFile}: ${name}.${state} has unknown family ${family}`);
    }
  }
  return problems;
}

const union = node => {
  const type = node && ts.isParenthesizedTypeNode(node) ? node.type : node;
  if (!type || !ts.isUnionTypeNode(type)) return null;
  const values = type.types.filter(part => ts.isLiteralTypeNode(part) && ts.isStringLiteral(part.literal)).map(part => part.literal.text);
  return values.length >= 2 ? values : null;
};

function vocabularySites(file, raw) {
  const source = sourceOf(file, raw);
  const rows = [];
  const namedExports = new Set(source.statements.filter(ts.isExportDeclaration)
    .filter(row => !row.moduleSpecifier && row.exportClause && ts.isNamedExports(row.exportClause))
    .flatMap(row => row.exportClause.elements.filter(item => stateType.test(item.name.text)).map(item => (item.propertyName ?? item.name).text)));
  const record = (kind, node, name) => {
    const states = union(node.type);
    if (states) rows.push({ file, line: lineOf(node, source), kind, name, states });
  };
  const visit = (node, owner) => {
    if (publicSource.test(file) && owner && ts.isPropertySignature(node) && stateProperty.test(nameOf(node.name) ?? "")) {
      record("inline", node, owner + "." + nameOf(node.name));
    }
    ts.forEachChild(node, child => visit(child, owner));
  };
  for (const node of source.statements) {
    if (ts.isTypeAliasDeclaration(node) && (exported(node) && stateType.test(node.name.text) || namedExports.has(node.name.text))) {
      record("named", node, node.name.text);
    }
    if ((ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) && (exported(node) || namedExports.has(node.name.text))) {
      visit(node, node.name.text);
    }
  }
  return rows;
}

// Like the translations gate, load the runtime validator from source so the report also works before pnpm build.
let inspectDeclarations;
async function getValidator() {
  if (inspectDeclarations) return inspectDeclarations;
  const bundle = buildSync({
    entryPoints: [fileURLToPath(new URL("state-machine-declaration.ts", sdk))],
    alias: Object.fromEntries(["actions", "plugin", "ui"].map(name => [
      `@molis-ai/molis-work-contracts/platform/${name}`, fileURLToPath(new URL(`${name}.ts`, contracts)),
    ])),
    bundle: true, format: "esm", platform: "node", write: false, logLevel: "silent",
  });
  const code = Buffer.from(bundle.outputFiles[0].contents).toString("base64");
  ({ inspectStateMachineDeclarations: inspectDeclarations } = await import("data:text/javascript;base64," + code));
  return inspectDeclarations;
}

function inspectManifestDeclarations({ files, read }, extraManifests) {
  const declarations = [];
  const problems = [];
  for (const file of new Set([...files.filter(file => pluginManifest.test(file)), ...extraManifests])) {
    const raw = read(file);
    if (raw === null || !extraManifests.includes(file) && !raw.includes("state_machines")) continue;
    if (file.endsWith(".json") || extraManifests.includes(file)) {
      try {
        const value = JSON.parse(raw);
        if (value?.state_machines !== undefined) declarations.push({ at: file, id: value.plugin_id, value: value.state_machines });
      } catch { problems.push(`${file}: invalid Manifest JSON`); }
      continue;
    }
    const source = sourceOf(file, raw);
    const resolveLocal = expression => {
      const value = unwrap(expression);
      return value && ts.isIdentifier(value) ? variable(source, value.text) : value;
    };
    const visit = node => {
      if (ts.isObjectLiteralExpression(node) && node.properties.some(row => nameOf(row.name) === "state_machines")) {
        const at = `${file}:${lineOf(node, source)}`;
        try {
          const value = literal(resolveLocal(property(node, "state_machines")));
          const id = literal(resolveLocal(property(node, "plugin_id")));
          declarations.push({ at, id, value });
        } catch (error) { problems.push(`${at}: state_machines is not statically readable (${error.message}); check its emitted JSON Manifest`); }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { declarations, problems };
}

export function stateVocabularyTable({ families, vocabularies }) {
  const code = value => "`" + String(value).replaceAll("|", "\\|").replaceAll("`", "&#96;") + "`";
  return [
    "# 平台公开状态词汇", "",
    "由 `node scripts/gates/state-vocabulary.mjs --table` 生成。", "",
    "业务状态的迁移由各自主人执行。插件的状态由自己的 Manifest 声明。", "",
    "| 词表 | 主人 | 状态 | 家族 | 公开性 | 消费合同 |",
    "| --- | --- | --- | --- | --- | --- |",
    ...Object.entries(vocabularies ?? {}).flatMap(([name, entry]) =>
      Object.entries(entry.states).map(([state, family]) =>
        `| ${code(name)} | ${code(entry.owner)} | ${code(state)} | ${code(family)} | ${entry.public ? "公开" : "内部"} | ${code(entry.consumer)} |`)),
    "", "## 状态环家族", "",
    "| 家族 | 文案 | 既有视觉别名 |", "| --- | --- | --- |",
    ...(families ?? []).map(({ key, label, states }) => `| ${code(key)} | ${label} | ${states.map(code).join("、")} |`), "",
    "作者写法见 [插件开发 Skill](../../skills/molis-plugin-dev/state-machine.md)。", "",
  ].join("\n");
}

export async function reportStateVocabulary(head, base, { renames = new Map(), manifests = [] } = {}) {
  const sitesOf = snapshot => snapshot.files.filter(isSource).flatMap(file => {
    const text = snapshot.read(file);
    return text?.includes("export") && /(?:Status|State|Phase|status|state|phase)/u.test(text) ? vocabularySites(file, text) : [];
  });
  const sites = sitesOf(head), previousSites = base ? sitesOf(base) : null;
  const counts = (rows, pathOf) => {
    const byFile = new Map();
    for (const site of rows) {
      const file = pathOf(site.file), count = byFile.get(file) ?? { named: 0, inline: 0 };
      count[site.kind]++;
      byFile.set(file, count);
    }
    return byFile;
  };
  const previous = counts(previousSites ?? [], file => renames.get(file) ?? file);
  const current = counts(sites, file => file);
  const findings = [];
  if (base) {
    for (const [file, next] of current) for (const kind of ["named", "inline"]) {
      const before = previous.get(file)?.[kind] ?? 0;
      if (next[kind] > before) findings.push(`${file}: ${kind} state unions ${before} → ${next[kind]}`);
    }
  }
  let table;
  try {
    const data = registry(head);
    findings.push(...registryProblems(data));
    if (data.vocabularies) {
      table = stateVocabularyTable(data);
      if (head.read(documentFile) !== table) findings.push(`${documentFile}: regenerate with --table`);
    }
  } catch (error) { findings.push(`State vocabulary data: ${error.message}`); }

  const { declarations, problems } = inspectManifestDeclarations(head, manifests);
  findings.push(...problems);
  if (declarations.length) {
    const validate = await getValidator();
    for (const { at, id, value } of declarations) {
      if (typeof id !== "string" || !id) { findings.push(`${at}: Manifest plugin_id is missing`); continue; }
      try { validate(value, id); } catch (error) { findings.push(`${at}: ${error.code}: ${error.message}`); }
    }
  }
  return { sites, previousSites, findings, table, declaredManifests: declarations.length };
}

export const stateVocabularySummary = report => {
  const count = rows => `${rows.filter(row => row.kind === "named").length} named, ${rows.filter(row => row.kind === "inline").length} inline`;
  const comparison = report.previousSites ? count(report.previousSites) + " → " : "";
  return `State vocabulary (report only) ${comparison}${count(report.sites)} unions, ${report.declaredManifests} Manifest declarations, ${report.findings.length} findings` +
    report.findings.map(finding => "\n- " + finding).join("");
};

if (isMainScript(import.meta.url)) {
  try {
    const { values: args } = parseArgs({ options: {
      base: { type: "string" }, root: { type: "string" }, manifest: { type: "string", multiple: true },
      report: { type: "boolean" }, table: { type: "boolean" },
    } });
    const root = path.resolve(args.root ?? fileURLToPath(new URL("../../", import.meta.url)));
    const git = (...command) => execFileSync("git", command, { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
    const list = result => result.split("\0").filter(Boolean);
    const read = file => { try { return readFileSync(path.resolve(root, file), "utf8"); } catch { return null; } };
    const head = { files: list(git("ls-files", "-z")), read };
    const base = args.base ? git("merge-base", "HEAD", args.base).trim() : null;
    const previous = base ? {
      files: list(git("ls-tree", "-r", "--name-only", "-z", base)),
      read: file => git("cat-file", "blob", `${base}:${file}`),
    } : undefined;
    const renames = new Map();
    if (base) {
      const fields = list(git("diff", "-M", "--name-status", "--diff-filter=R", "-z", base));
      fields.forEach((field, index) => { if (/^R\d+$/u.test(field)) renames.set(fields[index + 1], fields[index + 2]); });
    }
    const report = await reportStateVocabulary(head, previous, { renames, manifests: args.manifest });
    if (args.table) {
      if (!report.table) throw new Error(`Cannot read ${vocabularyFile}`);
      process.stdout.write(report.table);
    } else {
      console.log(stateVocabularySummary(report));
      if (args.report) for (const site of report.sites) console.log(`${site.file}:${site.line}: ${site.kind} ${site.name} ${site.states.join(" | ")}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
