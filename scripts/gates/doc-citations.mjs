// Gate: what the agent-facing documents point at exists (specs/repository-anti-corruption §4.13/§4.14).
//
// Checked documents: skills/**/*.md, AGENTS.md and docs/system/CALL-CHAINS.md (when it is tracked). A reader, human or
// model, follows these literally, so a path or an id that no longer exists is a wrong instruction, not a stale link.
//
// A citation is an inline code span (`like this`; fenced blocks are examples and are not read). Three kinds are verified:
//   path      a repo-rooted path: its first segment is a root entry the root allow-list names (apps/, docs/, packages/, …;
//             allowlist.mjs: allowedRoots, so a folder added to tooling/gates/root-allowlist.json is read, a stray one is not).
//             `<name>`, `{name}`, `*` and `{a,b}` stand for "something here"; at least one tracked file must match. A path under
//             a folder .gitignore keeps out of the repository (dist/, .impeccable/qa/) is accepted, since it exists on a
//             machine that built or ran the thing.
//   command   `pnpm <script>` names a script of the root package.json (or a pnpm built-in). `pnpm --filter … run x` is not read.
//   id        a capability id: `owner.noun.verb`, an MCP tool name `molis_work_v1_action_<id>__v<N>`, or a typed id ending
//             in `.vN`. Only tokens whose first segment is the name of a plugin, module or horizontal service directory
//             (plugins/native/<x>, modules/<x>, horizontal/<x>) are read; `ui.views` or `services.events` are manifest
//             fields and SDK members, not ids. The id must be one the code can produce, in one of three ways:
//               exact      the whole id is a string literal in source (apps, plugins, packages, modules, horizontal, server,
//                          tooling, examples; not tests, fixtures, build output or tooling/gates/'s own data);
//               owner      the id minus its owner prefix is a literal under that owner's directory (a plugin writes
//                          define("reminders.recover") and the catalog prefixes it with schedule.);
//               template   the id matches a template literal that builds ids (`${station.id}.content.${role}`). A template
//                          counts only when it has a fixed segment after the first: `pages.${name}` or `shelf.${recipe}.${id}`
//                          would accept every misspelling and every removed id of their owner, so they are ignored. A template
//                          that is kept is matched by shape only, and accepts every id of that shape: `feed.sources.${suffix}`
//                          accepts any `feed.sources.<x>` (the `feed.sources.sync` and `.tick` that CALL-CHAINS.md cites are
//                          checked by shape, nothing more), `${station.id}.content.${role}` any `<owner>.content.<role>`, and
//                          `${x}.published`, `${x}.version` and `${prefix}${id}.resources.read` those suffixes for any owner.
//                          A typo in the last segment of such an id, or the removal of the action, is not caught: a blind
//                          spot that only a parser of the placeholders' values would close (scripts/gates/README.md,
//                          门禁读不到的).
// Not read (scripts/gates/README.md, 门禁读不到的): MCP tool names other than molis_work_v1_action_<id>__v<N> (the context
// tools, molis_work_v1_context_resolve and its siblings), ids whose owner is not a directory name (schedules.add), paths and
// ids that are not inside an inline code span, and `.cursor/rules/*.mdc` globs.
// An exception goes in tooling/gates/doc-citation-exceptions.json as { "<file>": { "<token>": "<why it is not a problem>" } }
// with a reason; an exception that is no longer needed is an error itself, so the file cannot rot. No baseline: starts at 0.
import { fileIndex, readMarkdown } from "./markdown.mjs";
import { allowedRoots } from "./allowlist.mjs";

export const CITATION_EXCEPTIONS = "tooling/gates/doc-citation-exceptions.json";
const ID = /^[a-z][a-z0-9_-]*(?:\.[a-zA-Z0-9_-]+){1,7}$/;
const PNPM_BUILTINS = new Set(["add", "audit", "bin", "config", "dedupe", "deploy", "dlx", "exec", "fetch", "install", "i", "link", "list", "ls", "outdated", "pack", "patch", "prune", "publish", "rebuild", "remove", "rm", "run", "store", "test", "t", "update", "up", "why"]);
const SOURCE_AREA = /^(?:apps|plugins|packages|modules|horizontal|server|tooling|examples)\//;
// tooling/gates/ holds the gates' own data (baselines, allow-lists, the citation exceptions): a quoted id there is a record that
// something was excused, so it must not make that id look defined.
const isSourceForIds = (file) => SOURCE_AREA.test(file) && /\.(?:ts|mts|mjs|js|tsx|json)$/.test(file) && !file.endsWith(".d.ts")
  && !file.startsWith("tooling/gates/") && !/(?:^|\/)(?:tests?|dist|node_modules|fixtures)\//.test(file) && !/\.test\.[a-z]+$/.test(file);
const FILE_EXTENSION = /\.(?:ts|mts|mjs|js|tsx|json|md|mdc|yaml|yml|html|css|sh|toml|rs|swift|py|txt|tgz|patch|sqlite|db|png|jpg|svg)$/;

/** The documents whose citations are verified. */
export const isCitingDoc = (file) => file === "AGENTS.md" || file === "docs/system/CALL-CHAINS.md" || /^skills\/.+\.md$/.test(file);

// ---- what exists ------------------------------------------------------------------------------------------------------
const globToRegExp = (pattern) => {
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") { source += ".*"; i++; if (pattern[i + 1] === "/") i++; }
    else if (c === "*") source += "[^/]*";
    else if (c === "<") { const end = pattern.indexOf(">", i); if (end === -1) return null; source += "[^/]+"; i = end; }
    else if (c === "{") {
      const end = pattern.indexOf("}", i);
      if (end === -1) return null;
      const inner = pattern.slice(i + 1, end);
      // {a,b} is a choice; {name} is a placeholder like <name>.
      source += inner.includes(",") ? `(?:${inner.split(",").map((part) => part.replace(/[.+?^$()|[\]\\]/g, "\\$&")).join("|")})` : "[^/]+";
      i = end;
    }
    else source += c.replace(/[.+?^$()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}(?:/.*)?$`);
};

/** Folders .gitignore keeps out of the repository, from its plain `dir/` and `path/to/dir/` lines. */
const ignoredFolders = (gitignore) => (gitignore ?? "").split("\n").map((line) => line.trim())
  .filter((line) => line.endsWith("/") && !/[*?![\]]/.test(line) && !line.startsWith("#"))
  .map((line) => line.replace(/^\//, "").replace(/\/$/, ""));
const underIgnored = (p, folders) => folders.some((folder) => (folder.includes("/") ? p === folder || p.startsWith(`${folder}/`) : p.split("/").includes(folder)));

const rootedPattern = (names) => names.length === 0 ? /(?!)/ : new RegExp(`^(?:${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})/`);

function pathCitation(token, rooted) {
  let value = token.replace(/^\.\//, "").replace(/:\d+(?:[-,]\d+)*$/, "").replace(/#[^/]*$/, "").replace(/\(\)$/, "").replace(/[,;.)]+$/, "");
  if (!rooted.test(value) || /[\s…]|\.\.\./.test(value) || /[$%]/.test(value)) return null;
  return value;
}

function pathExists(value, index, folders) {
  if (underIgnored(value, folders)) return true;
  if (!/[<*{]/.test(value)) return index.has(value.replace(/\/$/, ""));
  const pattern = globToRegExp(value.replace(/\/$/, ""));
  return pattern ? index.files.some((file) => pattern.test(file)) : false;
}

// ---- the id universe --------------------------------------------------------------------------------------------------
function idUniverse(snapshot) {
  const exact = new Set();
  const byOwner = new Map();
  const templates = [];
  const literal = new RegExp(`["'\`](${ID.source.slice(1, -1)})["'\`]`, "g");
  for (const file of snapshot.files.filter(isSourceForIds)) {
    const text = snapshot.read(file);
    if (text === null) continue;
    const owner = file.match(/^(?:plugins\/native|modules|horizontal)\/([^/]+)\//)?.[1];
    for (const m of text.matchAll(literal)) {
      exact.add(m[1]);
      if (owner) { if (!byOwner.has(owner)) byOwner.set(owner, new Set()); byOwner.get(owner).add(m[1]); }
    }
    for (const m of text.matchAll(/`([^`\n]*\$\{[^`\n]*)`/g)) {
      const segments = m[1].replace(/\$\{[^}]*\}/g, "\u0000").split(".");
      if (segments.length < 2 || !segments.every((segment) => /^[a-z0-9_\u0000-]*$/i.test(segment))) continue;
      // Needs a fixed segment after the owner: with none, `${a}.${b}` would accept every id there is, and `pages.${name}` (or
      // `shelf.${recipe}.${optionId}`) every misspelling and every removed id of that owner. A template is therefore only read
      // when it has fixed text after the first segment (`${station.id}.content.${role}`). That narrows what it accepts to ids of
      // its shape, it does not pin one id down: `feed.sources.${suffix}` still accepts every `feed.sources.<x>` (see the header).
      if (!segments.slice(1).some((segment) => segment && !segment.includes("\u0000"))) continue;
      templates.push(new RegExp(`^${segments.map((segment) => segment.split("\u0000").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[a-z0-9_-]+")).join("\\.")}$`));
    }
  }
  return { exact, byOwner, templates };
}

const ownerDirectories = (files) => new Set(files.map((file) => file.match(/^(?:plugins\/native|modules|horizontal)\/([^/]+)\//)?.[1]).filter(Boolean));

const producible = (id, universe) => {
  if (universe.exact.has(id)) return true;
  const [owner, ...rest] = id.split(".");
  if (universe.byOwner.get(owner)?.has(rest.join("."))) return true;
  return universe.templates.some((pattern) => pattern.test(id));
};

// ---- the gate ---------------------------------------------------------------------------------------------------------
export function brokenCitations(snapshot) {
  const documents = snapshot.files.filter(isCitingDoc);
  if (!documents.length) return [];
  const index = fileIndex(snapshot.files);
  const folders = ignoredFolders(snapshot.read(".gitignore"));
  const owners = ownerDirectories(snapshot.files);
  const rooted = rootedPattern(allowedRoots(snapshot).names);
  let universe = null;
  let scripts = null;
  const problems = [];
  const used = new Set();
  const exceptions = readExceptions(snapshot, problems);

  const report = (file, line, token, message) => {
    if (exceptions[file]?.[token] !== undefined) { used.add(`${file}\u0000${token}`); return; }
    problems.push(`${file}:${line}: \`${token}\` ${message}`);
  };

  for (const file of documents) {
    const text = snapshot.read(file);
    if (text === null) continue;
    for (const { text: span, line } of readMarkdown(text).code) {
      const mcp = span.match(/^molis_work_v1_action_(.+)__v\d+$/);
      const command = span.match(/^pnpm\s+(?:run\s+)?([a-z][\w:-]*)(?:\s|$)/);
      if (command && !span.includes("--filter")) {
        scripts ??= packageScripts(snapshot);
        if (scripts && !PNPM_BUILTINS.has(command[1]) && !scripts.has(command[1])) report(file, line, span, `names pnpm script "${command[1]}", which package.json does not define`);
        continue;
      }
      for (const word of span.split(/\s+/)) {
        const value = pathCitation(word, rooted);
        if (value !== null && !pathExists(value, index, folders)) report(file, line, word, `points at ${value}, which is not in the repository`);
      }
      const id = mcp ? mcp[1] : span;
      if (!ID.test(id) || FILE_EXTENSION.test(id) || !owners.has(id.split(".")[0])) continue;
      universe ??= idUniverse(snapshot);
      if (!producible(id, universe)) report(file, line, span, `is not an id the code defines (no literal or id template for it in source)`);
    }
  }
  for (const [file, tokens] of Object.entries(exceptions)) {
    for (const token of Object.keys(tokens)) if (!used.has(`${file}\u0000${token}`)) problems.push(`${CITATION_EXCEPTIONS}: the exception for \`${token}\` in ${file} is not needed any more; delete it`);
  }
  return problems;
}

function packageScripts(snapshot) {
  try { return new Set(Object.keys(JSON.parse(snapshot.read("package.json") ?? "{}").scripts ?? {})); } catch { return null; }
}

function readExceptions(snapshot, problems) {
  const text = snapshot.read(CITATION_EXCEPTIONS);
  if (text === null) return {};
  let parsed;
  try { parsed = JSON.parse(text); } catch { problems.push(`${CITATION_EXCEPTIONS} is not valid JSON`); return {}; }
  for (const [file, tokens] of Object.entries(parsed)) {
    for (const [token, reason] of Object.entries(tokens ?? {})) {
      if (typeof reason !== "string" || !reason.trim()) problems.push(`${CITATION_EXCEPTIONS}: the exception for \`${token}\` in ${file} needs a reason`);
    }
  }
  return parsed;
}
