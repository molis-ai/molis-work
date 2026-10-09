import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { DOM_EVENT_PREFIXES, DOM_EVENTS, PAGE_STATE_OWNERS } from "@molis-ai/molis-work-contracts/platform/dom-events";
import { ASSISTANT_EFFECT_EVENT, ASSISTANT_MESSAGE_EVENT, ASSISTANT_SURFACE_CHANGED_EVENT } from "@molis-ai/molis-work-contracts/services/assistant";
import { CONTEXT_ACTION_CHOOSE_EVENT, CONTEXT_ACTION_CHOSEN_EVENT, CONTEXT_ACTIONS_EVENT, PLACE_CHANGED_EVENT, SURFACE_FOCUS_EVENT } from "@molis-ai/molis-work-contracts/services/contextual";
import { DOM_EVENTS_CONTRACT, domEventProblems, domEventReport, formatDomEventReport, readRegistry } from "../scripts/gates/dom-events.mjs";

// specs/repository-anti-corruption §4.8 (W2-13): every page event is registered in
// packages/contracts/src/platform/dom-events.ts, and scripts/gates/dom-events.mjs (in `pnpm health:check`) reads the
// browser source to keep it true. The contract is checked against what the page's other contracts already name, the
// gate against the real tree, and each of its rules is mutation-verified: a violation is added to the real tree in
// memory (or, for the entry itself, to a scratch repository) and the gate must say so.
const root = fileURLToPath(new URL("..", import.meta.url));
const entry = path.join(root, "scripts/check-health-gates.mjs");

type Snapshot = { files: string[]; read: (file: string) => string | null };
const realTree = (): Snapshot => {
  // Tracked and not-yet-committed files, so the check also holds while the change is being made.
  const files = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
  const cache = new Map<string, string | null>();
  return { files, read: (file) => { if (!cache.has(file)) { try { cache.set(file, readFileSync(path.join(root, file), "utf8")); } catch { cache.set(file, null); } } return cache.get(file) ?? null; } };
};
const tree = realTree();
/** The real tree with some files replaced, added (a string) or removed (null). */
const changed = (changes: Record<string, string | null>): Snapshot => {
  const files = new Set(tree.files);
  for (const [file, text] of Object.entries(changes)) { if (text === null) files.delete(file); else files.add(file); }
  return { files: [...files], read: (file) => (Object.hasOwn(changes, file) ? changes[file] : tree.read(file)) };
};
const registryText = tree.read(DOM_EVENTS_CONTRACT) ?? "";
/** The registry with one text replaced; the replacement has to be there. */
const withRegistry = (from: string | RegExp, to: string): Snapshot => {
  const next = registryText.replace(from, to);
  assert.notEqual(next, registryText, `${String(from)} is not in the registry`);
  return changed({ [DOM_EVENTS_CONTRACT]: next });
};
const SIDE = "apps/workbench/src/side-panel.ts";
const problemsWith = (changes: Record<string, string | null>) => domEventProblems(changed(changes));
const NEW_FILE = "plugins/native/alpha/src/client.ts";
const script = (body: string) => `export const ALPHA_SCRIPT = \`(host) => {\n${body}\n}\`;\n`;

test("the page events the other contracts already name are registered, under the same name", () => {
  const names = new Set<string>(DOM_EVENTS.map((event) => event.name));
  for (const name of [ASSISTANT_EFFECT_EVENT, ASSISTANT_MESSAGE_EVENT, ASSISTANT_SURFACE_CHANGED_EVENT, CONTEXT_ACTION_CHOOSE_EVENT,
    CONTEXT_ACTION_CHOSEN_EVENT, CONTEXT_ACTIONS_EVENT, PLACE_CHANGED_EVENT, SURFACE_FOCUS_EVENT]) {
    assert.ok(names.has(name), `${name} is a constant in the contracts but not in DOM_EVENTS`);
  }
});

test("the registry is data the gate can read, and reads the same as the module the build produces", () => {
  const read = readRegistry(registryText);
  assert.equal("error" in read, false, "error" in read ? String(read.error) : "");
  assert.deepEqual(JSON.parse(JSON.stringify(read.events)), JSON.parse(JSON.stringify(DOM_EVENTS)));
  assert.deepEqual(JSON.parse(JSON.stringify(read.owners)), JSON.parse(JSON.stringify(PAGE_STATE_OWNERS)));
  assert.deepEqual(JSON.parse(JSON.stringify(read.prefixes)), [...DOM_EVENT_PREFIXES]);
});

test("every event is dispatched under a registered name, every owner holds what it owns, and nothing registered is dead", () => {
  assert.deepEqual(domEventProblems(tree), []);
});

test("the report lists each registered event with who sends and who hears it", () => {
  const report = domEventReport(tree);
  assert.equal("error" in report, false);
  assert.equal(report.events.length, DOM_EVENTS.length);
  // What the events say and what the findings say agree: an event with no dispatch site is exactly an event the report flags.
  for (const event of report.events as Array<{ name: string; dispatches: unknown[]; listeners: unknown[] }>) {
    assert.equal(report.findings.some((finding: string) => finding.startsWith(`"${event.name}" is listened to but nothing`)), event.dispatches.length === 0, event.name);
    assert.equal(report.findings.some((finding: string) => finding.startsWith(`"${event.name}" is dispatched but nothing`)), event.listeners.length === 0, event.name);
  }
  const placed = report.events.find((event: { name: string }) => event.name === "molis:side-open");
  assert.ok(placed.dispatches.length > 1 && placed.listeners.length >= 1);
  assert.ok(formatDomEventReport(report).some((line: string) => line.startsWith("molis:side-open")));
});

test("an unregistered CustomEvent name fails, however the constructor is written", () => {
  for (const make of [
    'new CustomEvent("molis:brand-new")',
    "new CustomEvent('molis:brand-new', { detail: {} })",
    "new CustomEvent(`molis:brand-new`)",
    "new window.CustomEvent(\"molis:brand-new\")",
    'new CustomEvent(\n   "molis:brand-new",\n   { bubbles: true })',
    'new CustomEvent(open ? "molis:side-open" : "molis:brand-new")',
    'new CustomEvent(open?"molis:brand-new":"molis:side-open")',
    "new Event('molis:brand-new')",
  ]) {
    const problems = problemsWith({ [NEW_FILE]: script(`window.dispatchEvent(${make});`) });
    assert.equal(problems.length, 1, `${make}: ${problems.join(" | ")}`);
    assert.match(problems[0], new RegExp(`${NEW_FILE}:2 dispatches "molis:brand-new", which is not registered`));
  }
  const rust = problemsWith({ "apps/desktop/adapters/tauri/src/wheel.rs": 'fn go() { eval(r#"window.dispatchEvent(new CustomEvent("molis-shelf-brand-new"));"#); }\n' });
  assert.equal(rust.length, 1);
  assert.match(rust[0], /wheel\.rs:1 dispatches "molis-shelf-brand-new"/);
});

test("registered names, and a condition choosing between two of them, pass; events of the browser itself are not ours", () => {
  assert.deepEqual(problemsWith({ [NEW_FILE]: script([
    'window.dispatchEvent(new CustomEvent("molis:placement-result", { detail: {} }));',
    'document.dispatchEvent(new CustomEvent(open ? "molis:side-open" : "molis:side-close", { detail: { focus } }));',
    "input.dispatchEvent(new Event('input', { bubbles: true }));",
    "form.dispatchEvent(new Event(kind));",
    "window.dispatchEvent(new StorageEvent('storage', { key: 'molis-work:theme' }));",
  ].join("\n")) }), []);
});

test("a CustomEvent whose name the gate cannot read fails instead of being skipped", () => {
  for (const make of ["new CustomEvent(name)", "new CustomEvent(EVENT_NAME, { detail })", 'new CustomEvent("molis:" + kind)', "new CustomEvent(`molis:${kind}`)",
    'new CustomEvent(open ? "molis:side-open" : other)', "new CustomEvent(pick())"]) {
    const problems = problemsWith({ [NEW_FILE]: script(`window.dispatchEvent(${make});`) });
    assert.equal(problems.length, 1, `${make}: ${problems.join(" | ")}`);
    assert.match(problems[0], new RegExp(`${NEW_FILE}:2 creates a CustomEvent whose name is not a string literal`));
  }
});

test("a listener on a page prefix that nothing registers fails: a typo hears nothing", () => {
  for (const listen of [
    'window.addEventListener("molis:placement-reslt", () => {});',
    "document.addEventListener?.('molis:side-shwn', () => {});",
    'surface.removeEventListener("workbench-open-grup", handler);',
    'lifetime.listen(window, "molis-work:goal-chaged", () => {});',
    "lifetime.listen(frame.contentWindow,'molis-shelf-refrsh',e=>{});",
  ]) {
    const problems = problemsWith({ [NEW_FILE]: script(listen) });
    assert.equal(problems.length, 1, `${listen}: ${problems.join(" | ")}`);
    assert.match(problems[0], new RegExp(`${NEW_FILE}:2 listens to "[^"]+", which has a page event prefix but is not registered`));
  }
  assert.deepEqual(problemsWith({ [NEW_FILE]: script([
    'window.addEventListener("click", () => {});',
    'window.addEventListener("molis:placement-result", () => {});',
    'lifetime.listen(window, "storage", () => {});',
    'document.addEventListener("workbench-feed-task", () => {});',
  ].join("\n")) }), []);
});

test("test files, the gates themselves, fixtures, declarations and build output are not scanned", () => {
  const violation = 'window.dispatchEvent(new CustomEvent("molis:brand-new")); window.addEventListener("molis:brand-neww", f);\n';
  assert.deepEqual(problemsWith({
    "tests/page.test.ts": violation,
    "tests/helpers/page-driver.ts": violation,
    "plugins/native/alpha/test/driver.ts": violation,
    "tests/fixtures/page.ts": violation,
    "scripts/gates/page-events.mjs": violation,
    "plugins/native/alpha/src/fixtures/client.ts": violation,
    "plugins/native/alpha/src/client.test.ts": violation,
    "plugins/native/alpha/dist/client.js": violation,
    "plugins/native/alpha/src/client.d.ts": violation,
    "docs/design/prototype/main.js": violation,
  }), []);
  assert.equal(problemsWith({ "scripts/preview/client.ts": violation }).length, 2, "scripts/ outside scripts/gates/ is scanned");
});

test("renaming an event in its dispatcher only is caught from both sides", () => {
  const text = tree.read(SIDE) ?? "";
  assert.ok(text.includes("'molis:side-shown'"));
  const problems = problemsWith({ [SIDE]: text.replaceAll("'molis:side-shown'", "'molis:side-showm'") });
  assert.ok(problems.some((problem) => /dispatches "molis:side-showm", which is not registered/.test(problem)), problems.join("\n"));
  assert.ok(problems.some((problem) => /"molis:side-shown" is an announcement owned by "side-panel", but none of its files .* dispatches it/.test(problem)), problems.join("\n"));
});

test("deleting a registry entry leaves its dispatchers and listeners unregistered", () => {
  const entryOf = /  \{\n    name: "molis:shelf-admit"[\s\S]*?\n  \},\n/;
  const problems = domEventProblems(withRegistry(entryOf, ""));
  assert.ok(problems.some((problem) => /images\/src\/client\.ts:\d+ dispatches "molis:shelf-admit", which is not registered/.test(problem)), problems.join("\n"));
  assert.ok(problems.some((problem) => /shelf\/src\/client\.ts:\d+ listens to "molis:shelf-admit", which has a page event prefix but is not registered/.test(problem)), problems.join("\n"));
});

test("a registered event that nothing dispatches or listens to is stale", () => {
  const problems = domEventProblems(withRegistry('    name: "molis:side-toggle"', '    name: "molis:side-toggled"'));
  assert.ok(problems.some((problem) => /"molis:side-toggled" is registered but no source dispatches or listens to it/.test(problem)), problems.join("\n"));
});

test("an owner has to hold what it owns", () => {
  const request = domEventProblems(withRegistry(/name: "molis:side-open", kind: "request", owner: "side-panel"/, 'name: "molis:side-open", kind: "request", owner: "assistant"'));
  assert.ok(request.some((problem) => /"molis:side-open" is a request owned by "assistant", but none of its files .* listens to it/.test(problem)), request.join("\n"));
  const announcement = domEventProblems(withRegistry(/name: "molis:assistant-effect", kind: "announcement", owner: "assistant"/, 'name: "molis:assistant-effect", kind: "announcement", owner: "context-actions"'));
  assert.ok(announcement.some((problem) => /"molis:assistant-effect" is an announcement owned by "context-actions", but none of its files .* dispatches it/.test(problem)), announcement.join("\n"));
  // The kind decides which side the owner has to be on: placement dispatches molis:placement-changed and does not listen to it.
  const flipped = domEventProblems(withRegistry(/name: "molis:placement-changed", kind: "announcement"/, 'name: "molis:placement-changed", kind: "request"'));
  assert.ok(flipped.some((problem) => /"molis:placement-changed" is a request owned by "placement", but none of its files .* listens to it/.test(problem)), flipped.join("\n"));
});

test("an owner's files exist, and an owner without events is deleted", () => {
  const moved = domEventProblems(withRegistry('files: ["apps/workbench/src/scripts/client/placement.ts"]', 'files: ["apps/workbench/src/scripts/client/placement-moved.ts"]'));
  assert.ok(moved.some((problem) => /owner "placement" names apps\/workbench\/src\/scripts\/client\/placement-moved\.ts, which is not a tracked file/.test(problem)), moved.join("\n"));
  const unused = domEventProblems(withRegistry("  placement: {", '  nobody: {\n    files: ["apps/workbench/src/side-panel.ts"],\n    state: "No event.",\n  },\n  placement: {'));
  assert.ok(unused.some((problem) => /owner "nobody" owns no event; delete it/.test(problem)), unused.join("\n"));
  const empty = domEventProblems(withRegistry('files: ["plugins/native/coding/src/client.ts"]', "files: []"));
  assert.ok(empty.some((problem) => /owner "coding" needs files/.test(problem)), empty.join("\n"));
});

test("the registry itself is held to its shape: order, names, prefixes, fields", () => {
  const twice = domEventProblems(withRegistry('    name: "workbench-open-group"', '    name: "workbench-feed-task"'));
  assert.ok(twice.some((problem) => /"workbench-feed-task" is listed twice/.test(problem)), twice.join("\n"));
  const order = domEventProblems(withRegistry(/name: "molis-shelf-notice"/, 'name: "molis-shelf-zeta"'));
  assert.ok(order.some((problem) => /"molis-shelf-refresh" is out of name order \(after "molis-shelf-zeta"\)/.test(problem)), order.join("\n"));
  const prefix = domEventProblems(withRegistry('    name: "workbench-open-group"', '    name: "pane-open-group"'));
  assert.ok(prefix.some((problem) => /"pane-open-group" starts with none of DOM_EVENT_PREFIXES/.test(problem)), prefix.join("\n"));
  const unusedPrefix = domEventProblems(withRegistry('"workbench-"] as const', '"workbench-", "legacy-"] as const'));
  assert.ok(unusedPrefix.some((problem) => /the prefix "legacy-" is used by no event/.test(problem)), unusedPrefix.join("\n"));
  const field = domEventProblems(withRegistry('    name: "workbench-open-group", kind: "request"', '    name: "workbench-open-group", kind: "request", note: "x"'));
  assert.ok(field.some((problem) => /"workbench-open-group" has the unknown field "note"/.test(problem)), field.join("\n"));
  const kind = domEventProblems(withRegistry('name: "workbench-open-group", kind: "request"', 'name: "workbench-open-group", kind: "command"'));
  assert.ok(kind.some((problem) => /"workbench-open-group" has kind "command"/.test(problem)), kind.join("\n"));
  const target = domEventProblems(withRegistry('name: "molis:side-close", kind: "request", owner: "side-panel", on: "document"', 'name: "molis:side-close", kind: "request", owner: "side-panel", on: "page"'));
  assert.ok(target.some((problem) => /"molis:side-close" has on "page"/.test(problem)), target.join("\n"));
  const flag = domEventProblems(withRegistry('on: "document", cancelable: true', 'on: "document", cancelable: false'));
  assert.ok(flag.some((problem) => /has cancelable: false; leave it out or write true/.test(problem)), flag.join("\n"));
  const nobody = domEventProblems(withRegistry('name: "workbench-open-group", kind: "request", owner: "navigation-feed"', 'name: "workbench-open-group", kind: "request", owner: "ghost"'));
  assert.ok(nobody.some((problem) => /"workbench-open-group" is owned by "ghost", which is not in PAGE_STATE_OWNERS/.test(problem)), nobody.join("\n"));
  const silent = domEventProblems(withRegistry('    summary: "Open a group of the Feed directory.",\n', ""));
  assert.ok(silent.some((problem) => /"workbench-open-group" needs a summary sentence/.test(problem)), silent.join("\n"));
});

test("a registry that is not plain data, or is missing, is reported", () => {
  const imported = domEventProblems(changed({ [DOM_EVENTS_CONTRACT]: `import { x } from "./other.js";\nexport const BORROWED = x;\n${registryText}` }));
  assert.equal(imported.length, 1);
  assert.match(imported[0], /dom-events\.ts cannot be evaluated: .*plain data/);
  const hollow = domEventProblems(changed({ [DOM_EVENTS_CONTRACT]: "export const DOM_EVENTS = [];\n" }));
  assert.match(hollow[0], /has to export DOM_EVENT_PREFIXES/);
  assert.match(domEventProblems(changed({ [DOM_EVENTS_CONTRACT]: null }))[0], /does not exist; the registry lists every page event/);
  // No registry and no event anywhere is a repository that has no page (a scratch repository), not a failure.
  assert.deepEqual(domEventProblems({ files: ["packages/alpha/src/index.ts"], read: (file) => (file === "packages/alpha/src/index.ts" ? "export const alpha = 1;\n" : null) }), []);
});

test("the report names the receivers that cannot meet, and does not fail on them", () => {
  const report = domEventReport(changed({ [NEW_FILE]: script([
    'window.addEventListener("molis:side-open", () => {});',
    'document.addEventListener("molis:assistant-effect", () => {});',
    'window.dispatchEvent(new CustomEvent("molis:side-close"));',
    'window.addEventListener("molis:surface-focus", () => {});',
  ].join("\n")) }));
  const text = report.findings.join("\n");
  assert.match(text, /alpha\/src\/client\.ts:2 listens to "molis:side-open" on window, but it is dispatched on document and does not bubble/);
  assert.match(text, /alpha\/src\/client\.ts:3 listens to "molis:assistant-effect" on document, but it is dispatched on window/);
  assert.match(text, /alpha\/src\/client\.ts:4 dispatches "molis:side-close" on window; the entry says document/);
  assert.doesNotMatch(text, /alpha\/src\/client\.ts:5/, "an event that bubbles reaches a window listener");
  assert.deepEqual(domEventProblems(changed({ [NEW_FILE]: script('window.addEventListener("molis:side-open", () => {});') })), []);
  // A document event that bubbles does reach a window listener.
  const bubbling = domEventReport(changed({
    [DOM_EVENTS_CONTRACT]: registryText.replace('on: "document", cancelable: true', 'on: "document", bubbles: true, cancelable: true'),
    [NEW_FILE]: script('window.addEventListener("molis:side-open", () => {});'),
  }));
  assert.notEqual(registryText, registryText.replace('on: "document", cancelable: true', 'on: "document", bubbles: true, cancelable: true'));
  assert.doesNotMatch(bubbling.findings.join("\n"), /alpha\/src\/client\.ts:2/);
});

// ---- the entry: `pnpm health:check` runs the gate -------------------------------------------------------------------
let scratch = "";
const gitAt = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: scratch, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(scratch, file)), { recursive: true }); writeFileSync(path.join(scratch, file), text); };
const health = (...args: string[]) => {
  const run = spawnSync(process.execPath, [entry, "--root", scratch, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const commit = (message: string) => { gitAt("add", "-A"); gitAt("commit", "-q", "--allow-empty", "-m", message); };
const FIXTURE_REGISTRY = `import type { ContractDescriptor } from "./package.js";
export const DOM_EVENT_PREFIXES = ["x:"] as const;
export const PAGE_STATE_OWNERS = { panel: { files: ["apps/page/src/panel.ts"], state: "The panel." } } as const;
export const DOM_EVENTS = [
  { name: "x:close", kind: "request", owner: "panel", on: "document", detail: "none", summary: "Close the panel." },
  { name: "x:opened", kind: "announcement", owner: "panel", on: "document", detail: "{ id }", summary: "The panel opened." },
] as const;
`;

before(() => {
  scratch = mkdtempSync(path.join(tmpdir(), "molis-dom-events-"));
  gitAt("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 200, classLines: 100, classMethods: 30, functionLines: 80, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put(DOM_EVENTS_CONTRACT, FIXTURE_REGISTRY);
  put("apps/page/src/panel.ts", 'export const PANEL = `\ndocument.addEventListener("x:close", () => {});\ndocument.dispatchEvent(new CustomEvent("x:opened", { detail: { id: 1 } }));\n`;\n');
  commit("base");
});
after(() => { rmSync(scratch, { recursive: true, force: true }); });

test("health:check fails on a page event nobody registered, and passes once it is registered", () => {
  assert.equal(health("--base", "main").code, 0, health("--base", "main").out);
  gitAt("switch", "-q", "-c", "branch");
  put("apps/page/src/other.ts", 'export const OTHER = `window.dispatchEvent(new CustomEvent("x:surprise"));`;\n');
  commit("an event nobody registered");
  const failed = health("--base", "main");
  assert.equal(failed.code, 1, failed.out);
  assert.match(failed.out, /DOM events: apps\/page\/src\/other\.ts:1 dispatches "x:surprise", which is not registered/);
  put(DOM_EVENTS_CONTRACT, FIXTURE_REGISTRY.replace("\n] as const;\n", '\n  { name: "x:surprise", kind: "request", owner: "panel", on: "window", detail: "none", summary: "A surprise." },\n] as const;\n'));
  put("apps/page/src/panel.ts", 'export const PANEL = `\ndocument.addEventListener("x:close", () => {});\nwindow.addEventListener("x:surprise", () => {});\ndocument.dispatchEvent(new CustomEvent("x:opened", { detail: { id: 1 } }));\n`;\n');
  commit("registered");
  const passed = health("--base", "main");
  assert.equal(passed.code, 0, passed.out);
});

test("health:check fails when the registry is deleted while the page still sends events", () => {
  gitAt("switch", "-q", "main");
  gitAt("switch", "-q", "-c", "no-registry");
  gitAt("rm", "-q", DOM_EVENTS_CONTRACT);
  commit("delete the registry");
  const failed = health("--base", "main");
  assert.equal(failed.code, 1, failed.out);
  assert.match(failed.out, /creates a CustomEvent but packages\/contracts\/src\/platform\/dom-events\.ts does not exist/);
});

test("the gate's own command line checks and reports the working tree", () => {
  gitAt("switch", "-q", "main");
  const tool = fileURLToPath(new URL("../scripts/gates/dom-events.mjs", import.meta.url));
  const checked = spawnSync(process.execPath, [tool, "--root", scratch], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  const report = spawnSync(process.execPath, [tool, "--root", scratch, "--report", "--json"], { encoding: "utf8" });
  assert.equal(report.status, 0, report.stderr);
  assert.deepEqual(JSON.parse(report.stdout).events.map((event: { name: string }) => event.name), ["x:close", "x:opened"]);
  put("apps/page/src/other.ts", 'export const OTHER = `window.dispatchEvent(new CustomEvent("x:surprise"));`;\n');
  gitAt("add", "-A");
  const tracked = spawnSync(process.execPath, [tool, "--root", scratch], { encoding: "utf8" });
  assert.equal(tracked.status, 1);
  assert.match(tracked.stderr, /dispatches "x:surprise"/);
});
