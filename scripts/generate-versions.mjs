#!/usr/bin/env node
// tooling/versions.json is the editable source. Generated literals retain public literal types and browser closure boundaries.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TOKEN = /\/\* @version ([\w./-]+)(?: ("(?:[^"\\]|\\.)*"))? \*\/(\s*)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\d+(?:\.\d+)?)/g;
const MARKDOWN = /# @version ([\w./-]+)\n(version: )\d+/g;
const quote = (value, original) => typeof value === 'string' && original.startsWith("'")
  ? "'" + value.replaceAll('\\', '\\\\').replaceAll("'", "\\'") + "'" : JSON.stringify(value);

export function versionSource(root = ROOT) {
  return JSON.parse(readFileSync(path.join(root, 'tooling/versions.json'), 'utf8'));
}

/** Pure expansion is also used by the existing release gate before it inspects declarations. */
export function expandVersionMarkers(source, versions) {
  return source.replace(TOKEN, (match, key, pattern, whitespace, original) => {
    if (!Object.hasOwn(versions, key)) throw new Error(`Unknown version key: ${key}`);
    const value = pattern ? JSON.parse(pattern).replaceAll('{version}', String(versions[key])) : versions[key];
    return match.slice(0, match.length - original.length) + quote(value, original);
  }).replace(MARKDOWN, (_match, key, prefix) => {
    if (!Object.hasOwn(versions, key)) throw new Error(`Unknown method version: ${key}`);
    return `# @version ${key}\n${prefix}${versions[key]}`;
  });
}

/** Resolve only generated owner constants for the existing literal-oriented inventories. Never evaluates source. */
export function versionInspectionSource(root, file, source) {
  let result = source.replace(/\/\* @version [^*]+\*\/\s*/g, '');
  const imports = /import\s*\{([^}]+)\}\s*from\s*["']([^"']*versions\.generated\.js)["'];?/g;
  for (const match of source.matchAll(imports)) {
    const target = path.resolve(root, path.dirname(file), match[2].replace(/\.js$/, '.ts'));
    if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error(`${file}: version constants outside repository`);
    const generated = readFileSync(target, 'utf8');
    result = result.replace(match[0], '');
    for (const specifier of match[1].split(',')) {
      const [name, alias] = specifier.trim().split(/\s+as\s+/);
      const found = generated.match(new RegExp(`export const ${name} = (.+);`));
      if (!found) throw new Error(`${file}: missing generated constant ${name}`);
      result = result.replace(new RegExp(`\\b${alias ?? name}\\b`, 'g'), found[1]);
    }
  }
  return result;
}

/** Detect new literal authorities before they can bypass generation. Record revisions and upstream protocols are excluded. */
export function unmanagedVersionProblems(file, source, carriers = []) {
  if (!/\.(?:[cm]?[jt]sx?)$/.test(file) || /(?:^|\/)(?:tests?|fixtures|dist|vendor)\//.test(file) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || file === 'apps/sync-worker/testing.mjs' || /(?:^|\/)test\.[cm]?[jt]sx?$/.test(file) || file.endsWith('/versions.generated.ts')) return [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true), problems = [];
  const spans = carriers.filter(carrier => carrier.file === file).flatMap(carrier => [...source.matchAll(new RegExp(carrier.pattern, 'gm'))].map(match =>
    [match.index + match[1].length - (/['"]$/.test(match[1]) ? 1 : 0), match.index + match[0].length - match[2].length + (/^['"]/.test(match[2]) ? 1 : 0)]));
  const managed = node => /\/\* @version [^*]+\*\/\s*$/.test(source.slice(node.pos, node.getStart(tree)))
    || spans.some(([start, end]) => node.getStart(tree) >= start && node.end <= end);
  const report = node => {
    if (!managed(node)) problems.push(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}: unmanaged current version ${node.getText(tree)}`);
  };
  const versionField = /^(?:schema_version|host_api_version|protocol_version|schemaVersion|format|schema|v|protocol|apiVersion|exportVersion)$/;
  const visit = node => {
    if (ts.isPropertyAssignment(node) || ts.isPropertySignature(node)) {
      const name = node.name.getText(tree).replace(/^['"]|['"]$/g, '');
      let value = node.initializer ?? (node.type && ts.isLiteralTypeNode(node.type) ? node.type.literal : null);
      if (value && ts.isAsExpression(value)) value = value.expression;
      let declaration = node.parent;
      while (declaration && !ts.isVariableDeclaration(declaration)) declaration = declaration.parent;
      let baselineObject = declaration?.initializer;
      while (baselineObject && (ts.isAsExpression(baselineObject) || ts.isSatisfiesExpression(baselineObject))) baselineObject = baselineObject.expression;
      const baseline = declaration && node.parent === baselineObject && /(?:SqliteBaseline|PluginDatabaseDeclaration|HomePluginDatabaseDeclaration)/.test(declaration.type?.getText(tree) ?? declaration.initializer?.getText(tree).match(/(?:satisfies|as)\s+(?:SqliteBaseline|PluginDatabaseDeclaration|HomePluginDatabaseDeclaration)/)?.[0] ?? '');
      const identity = ts.isObjectLiteralExpression(node.parent) && node.parent.properties.some(property =>
        ts.isPropertyAssignment(property) && /^(?:capability_id|prompt_id|role_id|skill_id|scene_id|plugin_id)$/.test(property.name.getText(tree)));
      const literalVersionType = name === 'version' && ts.isPropertySignature(node) && !/\/\*\* @(?:record-revision|upstream-version)/.test(node.getFullText(tree));
      const externalJelly = file === 'plugins/native/jelly/src/import.ts' && name === 'schema_version' && value?.getText(tree) === '5';
      if (value && (ts.isNumericLiteral(value) || name === 'version' && ts.isStringLiteral(value) && (/^\d+$/.test(value.text) || identity && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.text))) && !externalJelly && (versionField.test(name) || name === 'version' && (identity || baseline) || literalVersionType)) report(value);
    }
    if (ts.isVariableDeclaration(node) && /^[A-Z_\d]*VERSION$/.test(node.name.getText(tree)) && node.initializer
      && (ts.isNumericLiteral(node.initializer) || ts.isStringLiteral(node.initializer))) {
      const upstream = new Set(['plugins/official-integrations/catalog/src/document-import.ts#NOTION_VERSION', 'plugins/official-integrations/github/src/provider.ts#GITHUB_API_VERSION', 'packages/plugin-runtime/src/project-database-statements.ts#PLUGIN_STATEMENT_SQLITE_VERSION', 'apps/local-host/src/connector-tool-runtime.ts#UV_BOOTSTRAP_VERSION', 'apps/local-host/src/plugin-builder/build-dependencies.ts#VERSION']);
      if (!upstream.has(`${file}#${node.name.getText(tree)}`)) report(node.initializer);
    }
    if (ts.isBinaryExpression(node) && ts.isNumericLiteral(node.right) && /^(?:===|!==|==|!=)$/.test(node.operatorToken.getText(tree))
      && /\.(?:schema_version|host_api_version|protocol_version|schemaVersion|format|schema|v|protocol)$/.test(node.left.getText(tree))
      && !(file === 'plugins/native/jelly/src/import.ts' && node.left.getText(tree).endsWith('.schemaVersion'))
      && !(file === 'apps/local-host/src/character-import-plugins.ts' && node.left.getText(tree) === 'marker?.schema_version')) report(node.right);
    if (ts.isParameter(node) && /^(?:version|contractVersion)$/.test(node.name.getText(tree)) && node.initializer && ts.isNumericLiteral(node.initializer)) report(node.initializer);
    if (ts.isStringLiteral(node) && /^(?:io\.molis\.work|molis\.|connector\.|signal\.|listener\.|signals\.|workspace\.|files\.|diff\.|coding\.|git\.)[\w./-]*(?:[./-]v|\/)[1-9]$/.test(node.text)) report(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return problems;
}

/** Only the owned integration Manifest carriers, never business JSON or frozen fixtures. */
export function unmanagedManifestJsonProblems(file, source, carriers, owners, root) {
  if (!/^plugins\/official-integrations\/[^/]+\/manifest\.json$/.test(file)) return [];
  const manifest = JSON.parse(source), problems = [], configured = carriers.filter(carrier => carrier.file === file);
  const directory = path.dirname(file), constants = owners[`${directory}/src/versions.generated.ts`] ?? {};
  // The catalog base package and its per-connector factory have different plugin identities and releases.
  let releaseKey = `package.integration.${path.basename(directory)}`;
  const entrypoint = path.join(root, directory, 'src/index.ts');
  if (existsSync(entrypoint)) {
    const tree = ts.createSourceFile(entrypoint, readFileSync(entrypoint, 'utf8'), ts.ScriptTarget.Latest, true);
    const visit = node => {
      if (ts.isPropertyAssignment(node) && node.name.getText(tree) === 'version' && ts.isIdentifier(node.initializer)
        && constants[node.initializer.text]?.startsWith('package.')) {
        const identity = ts.isObjectLiteralExpression(node.parent) && node.parent.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(tree) === 'plugin_id');
        if (identity && ts.isStringLiteral(identity.initializer) && identity.initializer.text === manifest.plugin_id) releaseKey = constants[node.initializer.text];
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
  const covered = (start, end, key) => configured.some(carrier => carrier.key === key && [...source.matchAll(new RegExp(carrier.pattern, 'gm'))]
    .some(match => match.index + match[1].length === start && match.index + match[0].length - match[2].length === end));
  for (const [field, key] of [['schema_version', 'manifest.schema'], ['host_api_version', 'host.api'], ['version', releaseKey]]) {
    const match = source.match(new RegExp(`("${field}"\\s*:\\s*)("[^"]*"|\\d+)`));
    const value = match?.[2], quoted = value?.startsWith('"');
    const start = match ? match.index + match[1].length + (quoted ? 1 : 0) : -1, end = start + (value?.length ?? 0) - (quoted ? 2 : 0);
    if (!Object.hasOwn(manifest, field) || !key || !match || !covered(start, end, key)) problems.push(`${file}: unmanaged Manifest field ${field}`);
  }
  for (const match of source.matchAll(/"([a-z][\w.-]*\.v)([1-9]\d*)"/g)) {
    const key = (match[1].startsWith('io.molis.work.') ? 'contract.' : 'type.') + match[1].slice(0, -2);
    const start = match.index + 1 + match[1].length;
    if (!covered(start, start + match[2].length, key)) problems.push(`${file}: unmanaged capability version ${match[1]}${match[2]}`);
  }
  return problems;
}

export function generateVersions({ root = ROOT, write = false } = {}) {
  const { versions, owners, carriers } = versionSource(root);
  for (const [key, value] of Object.entries(versions)) {
    if (!/^[a-zA-Z0-9][\w./-]+$/.test(key) || !(Number.isSafeInteger(value) && value >= 0 || typeof value === 'string' && value.length)) {
      throw new Error(`Invalid first-party version: ${key}`);
    }
  }
  for (const file of [...Object.keys(owners), ...carriers.map(carrier => carrier.file)]) {
    if (!path.resolve(root, file).startsWith(path.resolve(root) + path.sep)) throw new Error(`Version output outside repository: ${file}`);
  }
  const changed = [], used = new Set();
  const apply = (file, output) => {
    const location = path.join(root, file), previous = existsSync(location) ? readFileSync(location, 'utf8') : null;
    if (previous === output) return;
    changed.push(file);
    if (write) { mkdirSync(path.dirname(location), { recursive: true }); writeFileSync(location, output); }
  };
  const files = [];
  const walk = directory => {
    if (!existsSync(path.join(root, directory))) return;
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!['node_modules', 'dist', 'target', '.git', '.build', 'tests', 'test', 'fixtures'].includes(entry.name)) walk(`${directory}/${entry.name}`);
      } else if (/\.(?:[cm]?[jt]sx?|md|rs|sql|json)$/.test(entry.name)) files.push(`${directory}/${entry.name}`);
    }
  };
  for (const directory of ['apps', 'packages', 'plugins', 'modules', 'horizontal', 'server', 'tooling/plugin-cli']) walk(directory);
  const unmanaged = [];
  for (const file of new Set(files)) {
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file) || file === 'apps/sync-worker/testing.mjs' || /(?:^|\/)test\.[cm]?[jt]sx?$/.test(file)) continue;
    const source = readFileSync(path.join(root, file), 'utf8');
    for (const match of source.matchAll(TOKEN)) used.add(match[1]);
    for (const match of source.matchAll(MARKDOWN)) used.add(match[1]);
    unmanaged.push(...unmanagedVersionProblems(file, source, carriers));
    unmanaged.push(...unmanagedManifestJsonProblems(file, source, carriers, owners, root));
    if (file.startsWith('plugins/native/goals/methods/') && /^version: \d+$/m.test(source) && !MARKDOWN.test(source)) unmanaged.push(`${file}: unmanaged method version`);
    MARKDOWN.lastIndex = 0;
    if (source.includes('@version ')) apply(file, expandVersionMarkers(source, versions));
  }
  for (const [file, constants] of Object.entries(owners)) {
    const declarations = Object.entries(constants).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, key]) => {
      if (!Object.hasOwn(versions, key)) throw new Error(`${file}: unknown version ${key}`);
      used.add(key);
      return `export const ${name} = ${JSON.stringify(versions[key])};`;
    });
    apply(file, '// Generated by scripts/generate-versions.mjs from tooling/versions.json. Do not edit.\n' + declarations.join('\n') + '\n');
  }
  const carrierOutputs = new Map();
  for (const { file, key, pattern } of carriers) {
    if (!Object.hasOwn(versions, key)) throw new Error(`${file}: unknown version ${key}`);
    used.add(key);
    const source = carrierOutputs.get(file) ?? readFileSync(path.join(root, file), 'utf8'), regex = new RegExp(pattern, 'gm');
    const matches = [...source.matchAll(regex)];
    if (!matches.length || matches.some(match => match.length !== 3)) throw new Error(`${file}: carrier needs exactly a prefix and suffix capture`);
    carrierOutputs.set(file, source.replace(regex, (_match, prefix, suffix) => `${prefix}${versions[key]}${suffix}`));
  }
  for (const [file, output] of carrierOutputs) apply(file, output);
  // The current database table is a view of each owner's actual declaration, never another authority.
  const checklist = 'docs/releases/CHECKLIST.md';
  if (existsSync(path.join(root, checklist))) {
    const source = readFileSync(path.join(root, checklist), 'utf8');
    let inTable = false, versionColumn = -1, definitionColumn = -1;
    const output = source.split('\n').map(line => {
      if (line.startsWith('## 3.')) inTable = true;
      else if (inTable && /^## /.test(line)) inTable = false;
      if (!inTable || !line.startsWith('|')) return line;
      const columns = line.split('|');
      if (columns.some(column => column.trim() === '定义处')) {
        versionColumn = columns.findIndex(column => column.trim() === '版本');
        definitionColumn = columns.findIndex(column => column.trim() === '定义处');
        return line;
      }
      if (versionColumn < 0 || !/^\d+$/.test(columns[versionColumn]?.trim() ?? '')) return line;
      const definition = columns[definitionColumn]?.replaceAll('`', '').trim().split('#');
      if (!definition?.[1]) return line;
      const text = versionInspectionSource(root, definition[0], readFileSync(path.join(root, definition[0]), 'utf8'));
      let value;
      if (definition[1] === 'PRAGMA user_version') value = text.match(/PRAGMA user_version\s*=\s*(\d+)/)?.[1];
      else {
        const tree = ts.createSourceFile(definition[0], text, ts.ScriptTarget.Latest, true);
        const visit = node => {
          if (ts.isVariableDeclaration(node) && node.name.getText(tree) === definition[1]) {
            let expression = node.initializer;
            while (expression && (ts.isAsExpression(expression) || ts.isSatisfiesExpression(expression))) expression = expression.expression;
            if (expression && ts.isObjectLiteralExpression(expression)) expression = expression.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(tree) === 'version')?.initializer;
            if (expression && (ts.isNumericLiteral(expression) || ts.isStringLiteral(expression))) value = expression.text;
          }
          ts.forEachChild(node, visit);
        };
        visit(tree);
      }
      if (value === undefined) throw new Error(`${checklist}: cannot resolve ${definition.join('#')}`);
      columns[versionColumn] = ` ${value} `;
      return columns.join('|');
    }).join('\n');
    apply(checklist, output);
  }
  if (unmanaged.length) throw new Error(`Unmanaged first-party declarations:\n${unmanaged.join('\n')}`);
  for (const key of Object.keys(versions)) if (!used.has(key)) throw new Error(`Unused version entry: ${key}`);
  return changed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let write = false, check = false, root = ROOT;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--write') write = true;
    else if (args[index] === '--check') check = true;
    else if (args[index] === '--root' && args[index + 1] && !args[index + 1].startsWith('--')) root = path.resolve(args[++index]);
    else throw new Error('usage: node scripts/generate-versions.mjs [--write|--check] [--root <dir>]');
  }
  if (write && check) throw new Error('--write and --check are mutually exclusive');
  const changed = generateVersions({ root, write });
  if (changed.length) {
    console[write ? 'log' : 'error'](`${write ? 'Generated' : 'Stale version outputs'}:\n${changed.join('\n')}`);
    if (!write) process.exitCode = 1;
  } else console.log('First-party version outputs match tooling/versions.json.');
}
