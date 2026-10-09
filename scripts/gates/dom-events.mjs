// Gate: the page events of the Workbench are registered (specs/repository-anti-corruption §4.8, W2-13).
//
// The Workbench is one page made of a shell, plugin surfaces and a few frames, and they talk through DOM `CustomEvent`s.
// packages/contracts/src/platform/dom-events.ts lists every event (name, kind, owner, where it is dispatched, payload,
// meaning) and the module that owns the page state each is about. The browser programs are template-literal strings and
// cannot import that file, so this gate reads their source instead. A rule with no baseline: it starts at zero and any
// hit fails.
//
//   unregistered name   a `new CustomEvent("x")` (or a `new Event("molis:x")` with a page prefix) whose name is not listed
//   unreadable name     a `new CustomEvent(...)` whose first argument is not a string literal (or a condition choosing
//                       between two): the gate cannot know which event it makes
//   unregistered listener  `addEventListener`/`removeEventListener`/`.listen` on a name with a page prefix that is not
//                       listed: a typo there is an event that nobody hears
//   stale entry         a listed event that no source dispatches or listens to
//   owner               a listed owner that owns no event, whose file does not exist, or that does not hold what it owns
//                       (an announcement is dispatched from one of the owner's files; a request is listened to in one)
//   registry            names that repeat or are out of order, a name without one of the listed prefixes, a prefix no
//                       event uses, a field with an unknown value
//
// What it does not see: names built at run time (rejected, not skipped), a listener registered through an array of names or
// a helper the regular expressions below do not know, events from the browser itself, `postMessage` types and storage
// keys (other channels, no registry yet), and test files (a test may dispatch its own events to a page it controls).
// `--report` prints who dispatches and who listens, per event, computed from the source, and the receivers that cannot
// meet (a `window` listener for an event dispatched on `document`); those are findings, not failures.
//
//   node scripts/gates/dom-events.mjs [--root <dir>]             check the working tree (what `pnpm health:check` runs)
//   node scripts/gates/dom-events.mjs --report [--json] [--root <dir>]
import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const ts = createRequire(fileURLToPath(import.meta.url))("typescript");

export const DOM_EVENTS_CONTRACT = "packages/contracts/src/platform/dom-events.ts";

// Production code only: tests dispatch their own events at pages they drive, and the gate's own sources talk about the pattern.
const SCAN_ROOTS = /^(?:apps|horizontal|modules|packages|plugins|scripts|server|tooling)\//;
const SCAN_TYPES = /\.(?:[cm]?[jt]sx?|rs|html)$/;
const NOT_SCANNED = /(?:^|\/)(?:tests?|__tests__|fixtures|dist|node_modules|archive)\/|^scripts\/gates\/|\.d\.ts$|\.test\.[cm]?[jt]sx?$/;
export const isScanned = (file) => SCAN_ROOTS.test(file) && SCAN_TYPES.test(file) && !NOT_SCANNED.test(file) && file !== DOM_EVENTS_CONTRACT;

const KINDS = ["announcement", "request"];
const TARGETS = ["window", "document", "element"];
const EVENT_FIELDS = new Set(["name", "kind", "owner", "on", "bubbles", "cancelable", "detail", "summary"]);
const OWNER_FIELDS = new Set(["files", "state"]);
const NAME = /^[a-z][a-z0-9-]*(?::[a-z0-9-]+)?$/;
const FIRST_ARGUMENT_LIMIT = 400;

// ---- reading the registry ---------------------------------------------------------------------------------------------
/** Evaluates the registry file: it is data (`import type` only), so it runs in a context with no `require` and no globals. */
export function readRegistry(text) {
  try {
    const { outputText } = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: false });
    const sandbox = { exports: {} };
    vm.runInNewContext(outputText, sandbox, { timeout: 2000 });
    const { DOM_EVENT_PREFIXES: prefixes, PAGE_STATE_OWNERS: owners, DOM_EVENTS: events } = sandbox.exports;
    if (!Array.isArray(prefixes) || !owners || typeof owners !== "object" || !Array.isArray(events)) {
      return { error: "it has to export DOM_EVENT_PREFIXES (array), PAGE_STATE_OWNERS (object) and DOM_EVENTS (array)" };
    }
    return { prefixes, owners, events };
  } catch (error) {
    return { error: `${String(error?.message ?? error).split("\n")[0]}; it has to be plain data: no imports except \`import type\`, no calls` };
  }
}

// ---- finding the sites ------------------------------------------------------------------------------------------------
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** The text of the first argument of the call whose `(` is at `open`, or null when it does not end within a sane length. */
function firstArgument(text, open) {
  let depth = 0, quote = "";
  for (let index = open + 1; index < text.length && index - open <= FIRST_ARGUMENT_LIMIT; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") {
      if (depth === 0) return text.slice(open + 1, index);
      depth--;
    } else if (char === "," && depth === 0) return text.slice(open + 1, index);
  }
  return null;
}

const LITERAL = /^(["'`])([^"'`\\$\s{}]+)\1$/;
/** The names an argument can have: one literal, or `condition ? "a" : "b"`. null when it is anything else. */
function namesOf(argument) {
  const text = argument.trim();
  const single = LITERAL.exec(text);
  if (single) return [single[2]];
  let depth = 0, quote = "", question = -1, colon = -1;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "(" || char === "[" || char === "{") depth++;
    else if (char === ")" || char === "]" || char === "}") depth--;
    else if (depth === 0 && char === "?" && text[index + 1] !== "?" && text[index + 1] !== "." && text[index - 1] !== "?" && question < 0) question = index;
    else if (depth === 0 && char === ":" && question >= 0 && colon < 0) colon = index;
  }
  if (question < 0 || colon < 0) return null;
  const left = LITERAL.exec(text.slice(question + 1, colon).trim()), right = LITERAL.exec(text.slice(colon + 1).trim());
  return left && right ? [left[2], right[2]] : null;
}

const CONSTRUCTOR = /\bnew\s+(?:(?:window|globalThis|self)\s*\.\s*)?(CustomEvent|Event)\s*\(/g;
const DISPATCH_RECEIVER = /(?:^|[^\w$.])(window|document)\s*\??\.\s*dispatchEvent\s*\??\.?\s*\(\s*!?\s*$/;
const LISTEN_BY_METHOD = /\b(addEventListener|removeEventListener)\s*\??\.?\s*\(\s*(["'`])([^"'`\\\s$]+)\2/g;
const LISTEN_BY_HELPER = /\blisten\s*\??\.?\s*\(\s*([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)\s*,\s*(["'`])([^"'`\\\s$]+)\2/g;
const METHOD_RECEIVER = /([A-Za-z_$][\w$]*)\s*\??\.\s*$/;

/**
 * Every place the source dispatches or listens to a page event.
 *   dispatches: { file, line, names | null, text, ctor, receiver }   `names` is null when the first argument is not readable
 *   listeners:  { file, line, name, receiver }                       only names with one of `prefixes`
 */
export function domEventSites(snapshot, prefixes) {
  const dispatches = [], listeners = [];
  const pageName = (name) => prefixes.some((prefix) => name.startsWith(prefix));
  for (const file of snapshot.files.filter(isScanned)) {
    const text = snapshot.read(file);
    if (text === null || !/Event\s*\(|listen\s*\??\.?\s*\(|Listener\s*\??\.?\s*\(/.test(text)) continue;
    for (const match of text.matchAll(CONSTRUCTOR)) {
      const open = match.index + match[0].length - 1;
      const argument = firstArgument(text, open);
      const names = argument === null ? null : namesOf(argument);
      // A plain `new Event(...)` is a browser event unless it carries a page name; a CustomEvent is always ours.
      if (match[1] === "Event" && !(names && names.some(pageName))) continue;
      const before = text.slice(Math.max(0, match.index - 80), match.index);
      dispatches.push({ file, line: lineOf(text, match.index), names, text: argument === null ? "(no end within reach)" : argument.trim(), ctor: match[1],
        receiver: DISPATCH_RECEIVER.exec(before)?.[1] ?? "" });
    }
    for (const match of text.matchAll(LISTEN_BY_METHOD)) {
      if (!pageName(match[3])) continue;
      listeners.push({ file, line: lineOf(text, match.index), name: match[3], receiver: METHOD_RECEIVER.exec(text.slice(Math.max(0, match.index - 60), match.index))?.[1] ?? "" });
    }
    for (const match of text.matchAll(LISTEN_BY_HELPER)) {
      if (!pageName(match[3])) continue;
      listeners.push({ file, line: lineOf(text, match.index), name: match[3], receiver: match[1] });
    }
  }
  return { dispatches, listeners };
}

// ---- the checks -------------------------------------------------------------------------------------------------------
const sentence = (value) => typeof value === "string" && value.trim().length > 0;

function registryProblems(registry, snapshot) {
  const { prefixes, owners, events } = registry;
  const problems = [];
  const at = `${DOM_EVENTS_CONTRACT}:`;
  if (!prefixes.length || prefixes.some((prefix) => typeof prefix !== "string" || !prefix)) problems.push(`${at} DOM_EVENT_PREFIXES has to list the name prefixes as non-empty strings`);
  const files = new Set(snapshot.files);
  for (const [id, owner] of Object.entries(owners)) {
    for (const field of Object.keys(owner ?? {})) if (!OWNER_FIELDS.has(field)) problems.push(`${at} owner "${id}" has the unknown field "${field}"`);
    if (!owner || !Array.isArray(owner.files) || !owner.files.length) problems.push(`${at} owner "${id}" needs files: the client modules that hold the state`);
    else for (const file of owner.files) if (!files.has(file)) problems.push(`${at} owner "${id}" names ${file}, which is not a tracked file; it moved or was deleted, so point the owner at where the state lives now`);
    if (!sentence(owner?.state)) problems.push(`${at} owner "${id}" needs a sentence saying what state it owns`);
  }
  const seen = new Set();
  let previous = "";
  for (const event of events) {
    const name = event?.name;
    if (typeof name !== "string" || !NAME.test(name)) { problems.push(`${at} an event has a name that is not lowercase words joined by - with one optional prefix colon: ${JSON.stringify(name)}`); continue; }
    for (const field of Object.keys(event)) if (!EVENT_FIELDS.has(field)) problems.push(`${at} "${name}" has the unknown field "${field}"`);
    if (seen.has(name)) problems.push(`${at} "${name}" is listed twice`);
    seen.add(name);
    if (previous && name < previous) problems.push(`${at} "${name}" is out of name order (after "${previous}")`);
    previous = name;
    if (!prefixes.some((prefix) => name.startsWith(prefix))) problems.push(`${at} "${name}" starts with none of DOM_EVENT_PREFIXES (${prefixes.join(" ")})`);
    if (!KINDS.includes(event.kind)) problems.push(`${at} "${name}" has kind ${JSON.stringify(event.kind)}; it is one of ${KINDS.join(", ")}`);
    if (!TARGETS.includes(event.on)) problems.push(`${at} "${name}" has on ${JSON.stringify(event.on)}; it is one of ${TARGETS.join(", ")}`);
    if (!Object.hasOwn(owners, event.owner)) problems.push(`${at} "${name}" is owned by ${JSON.stringify(event.owner)}, which is not in PAGE_STATE_OWNERS`);
    for (const flag of ["bubbles", "cancelable"]) if (event[flag] !== undefined && event[flag] !== true) problems.push(`${at} "${name}" has ${flag}: ${JSON.stringify(event[flag])}; leave it out or write true`);
    if (!sentence(event.detail)) problems.push(`${at} "${name}" needs detail: the payload fields, a contract type, or "none"`);
    if (!sentence(event.summary)) problems.push(`${at} "${name}" needs a summary sentence`);
  }
  for (const id of Object.keys(owners)) if (!events.some((event) => event?.owner === id)) problems.push(`${at} owner "${id}" owns no event; delete it`);
  for (const prefix of prefixes) if (typeof prefix === "string" && !events.some((event) => typeof event?.name === "string" && event.name.startsWith(prefix))) {
    problems.push(`${at} the prefix "${prefix}" is used by no event; delete it from DOM_EVENT_PREFIXES`);
  }
  return problems;
}

/** Problems of the working tree; every one fails. A tree with no registry and no event sites is clean (a scratch repository). */
export function domEventProblems(snapshot) {
  const text = snapshot.read(DOM_EVENTS_CONTRACT);
  const registry = text === null ? null : readRegistry(text);
  if (registry?.error) return [`DOM events: ${DOM_EVENTS_CONTRACT} cannot be evaluated: ${registry.error}`];
  const { dispatches, listeners } = domEventSites(snapshot, registry?.prefixes ?? []);
  if (!registry) {
    const some = dispatches[0];
    return some ? [`DOM events: ${some.file}:${some.line} creates a CustomEvent but ${DOM_EVENTS_CONTRACT} does not exist; the registry lists every page event (docs/platform/UI-PLATFORM.md)`] : [];
  }
  const problems = registryProblems(registry, snapshot).map((problem) => `DOM events: ${problem}`);
  const listed = new Map(registry.events.filter((event) => typeof event?.name === "string").map((event) => [event.name, event]));
  const how = `list it in DOM_EVENTS of ${DOM_EVENTS_CONTRACT} (name, kind, owner, on, detail, summary), or use an event that is listed`;

  for (const site of dispatches) {
    if (site.names === null) {
      problems.push(`DOM events: ${site.file}:${site.line} creates ${site.ctor === "Event" ? "an Event" : "a CustomEvent"} whose name is not a string literal (${JSON.stringify(site.text.slice(0, 60))}); the gate reads names from the source, so write the name as a literal, or a condition choosing between two literals`);
      continue;
    }
    for (const name of site.names) if (!listed.has(name)) problems.push(`DOM events: ${site.file}:${site.line} dispatches "${name}", which is not registered; ${how}`);
  }
  for (const site of listeners) {
    if (!listed.has(site.name)) problems.push(`DOM events: ${site.file}:${site.line} listens to "${site.name}", which has a page event prefix but is not registered, so nothing sends it (a typo?); ${how}`);
  }

  const sentBy = new Map(), heardBy = new Map();
  for (const site of dispatches) for (const name of site.names ?? []) (sentBy.get(name) ?? sentBy.set(name, new Set()).get(name)).add(site.file);
  for (const site of listeners) (heardBy.get(site.name) ?? heardBy.set(site.name, new Set()).get(site.name)).add(site.file);
  for (const [name, event] of listed) {
    if (!sentBy.has(name) && !heardBy.has(name)) {
      problems.push(`DOM events: "${name}" is registered but no source dispatches or listens to it; delete the entry from ${DOM_EVENTS_CONTRACT} (or restore the code that uses it)`);
      continue;
    }
    const owner = registry.owners[event.owner];
    if (!owner || !Array.isArray(owner.files)) continue;
    const used = event.kind === "announcement" ? sentBy : heardBy;
    if (![...(used.get(name) ?? [])].some((file) => owner.files.includes(file))) {
      problems.push(`DOM events: "${name}" is ${event.kind === "announcement" ? "an announcement" : "a request"} owned by "${event.owner}", but none of its files (${owner.files.join(", ")}) ${event.kind === "announcement" ? "dispatches" : "listens to"} it; the owner of ${event.kind === "announcement" ? "an announcement is where it is sent from" : "a request is where it is handled"}, so fix the owner or the kind`);
    }
  }
  return problems;
}

// ---- the report -------------------------------------------------------------------------------------------------------
/**
 * Per event: the registry entry, who dispatches, who listens, and findings that are not failures: no listener in the tree, no
 * dispatcher in the tree, and receivers that cannot meet (a `window` listener for a non-bubbling event dispatched on
 * `document`, a `document` listener for one dispatched on `window`, a dispatch on `window` or `document` that is not where
 * the entry says the event goes).
 */
export function domEventReport(snapshot) {
  const text = snapshot.read(DOM_EVENTS_CONTRACT);
  const registry = text === null ? null : readRegistry(text);
  if (!registry || registry.error) return { error: registry?.error ?? `${DOM_EVENTS_CONTRACT} is missing`, events: [], findings: [] };
  const { dispatches, listeners } = domEventSites(snapshot, registry.prefixes);
  const events = [], findings = [];
  for (const event of registry.events) {
    const sent = dispatches.filter((site) => site.names?.includes(event.name));
    const heard = listeners.filter((site) => site.name === event.name);
    events.push({ ...event, dispatches: sent.map(({ file, line, receiver }) => ({ file, line, receiver })), listeners: heard.map(({ file, line, receiver }) => ({ file, line, receiver })) });
    if (!sent.length) findings.push(`"${event.name}" is listened to but nothing in the tree dispatches it`);
    if (!heard.length) findings.push(`"${event.name}" is dispatched but nothing in the tree listens to it`);
    for (const site of sent) {
      if ((site.receiver === "window" || site.receiver === "document") && site.receiver !== event.on) {
        findings.push(`${site.file}:${site.line} dispatches "${event.name}" on ${site.receiver}; the entry says ${event.on}, so listeners attached there do not hear it`);
      }
    }
    for (const site of heard) {
      if (event.bubbles) continue;
      if (site.receiver === "window" && event.on === "document") findings.push(`${site.file}:${site.line} listens to "${event.name}" on window, but it is dispatched on document and does not bubble, so this never fires`);
      if (site.receiver === "document" && event.on === "window") findings.push(`${site.file}:${site.line} listens to "${event.name}" on document, but it is dispatched on window, so this never fires`);
    }
  }
  return { events, findings, sites: { dispatches: dispatches.length, listeners: listeners.length } };
}

export function formatDomEventReport(report) {
  if (report.error) return [`DOM events: ${report.error}`];
  const out = [`Page events: ${report.events.length} registered, ${report.sites.dispatches} dispatch sites, ${report.sites.listeners} listener sites on a page prefix`, ""];
  for (const event of report.events) {
    out.push(`${event.name}  ${event.kind}  owner ${event.owner}  on ${event.on}${event.bubbles ? " (bubbles)" : ""}${event.cancelable ? " (cancelable)" : ""}`);
    const places = (sites) => (sites.length ? sites.map((site) => `${site.file}:${site.line}${site.receiver ? ` (${site.receiver})` : ""}`).join(", ") : "none");
    out.push(`  dispatched: ${places(event.dispatches)}`, `  listened:   ${places(event.listeners)}`);
  }
  out.push("", `Findings (${report.findings.length}; not failures):`, ...(report.findings.length ? report.findings.map((finding) => `  - ${finding}`) : ["  none"]));
  return out;
}

// ---- command line -----------------------------------------------------------------------------------------------------
const workingTree = (root) => ({
  files: execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean),
  read: (file) => { try { return readFileSync(path.join(root, file), "utf8"); } catch { return null; } },
});

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href) {
  const USAGE = "usage: dom-events.mjs [--report [--json]] [--root <dir>]";
  const args = process.argv.slice(2);
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  let report = false, json = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--report") report = true;
    else if (args[index] === "--json") json = true;
    else if (args[index] === "--root" && args[index + 1]) root = path.resolve(args[++index]);
    else { console.error(`unknown argument ${args[index]}\n${USAGE}`); process.exit(2); }
  }
  if (json && !report) { console.error(`--json goes with --report\n${USAGE}`); process.exit(2); }
  const snapshot = workingTree(root);
  if (report) {
    const result = domEventReport(snapshot);
    console.log(json ? JSON.stringify(result, null, 2) : formatDomEventReport(result).join("\n"));
    process.exit(result.error ? 1 : 0);
  }
  const problems = domEventProblems(snapshot);
  if (problems.length) { console.error(problems.join("\n")); process.exit(1); }
  console.log("page events: every CustomEvent and page-prefixed listener is registered");
}
