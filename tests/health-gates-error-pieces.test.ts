import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
// @ts-expect-error the gate modules are plain .mjs
import { measureErrors } from "../scripts/gates/error-scan.mjs";
// @ts-expect-error the gate modules are plain .mjs
import { ACTION_ERRORS_FILE, ERROR_OWNERS_FILE, errorOwnerProblems, errorOwnersWantsText, looserOwnership, measureOwners, ownerAssignment, ownerLookup, platformCodes, readOwnerTable } from "../scripts/gates/error-owners.mjs";
// @ts-expect-error the gate modules are plain .mjs
import { createErrorMetrics } from "../scripts/gates/error-metrics.mjs";

// specs/repository-anti-corruption W3-02-B. tests/health-gates-errors.test.ts runs the gate on scratch repositories and shows that each
// rule fails when it is broken. This file pins the decisions inside the rules, each one with a small piece of source or a small table read
// in memory: the names a status test is read through, the places a status can sit, what a factory call has to look like, how the owner of
// a file is picked among paths, what the table rejects, and what the comparison of two tables calls looser. Each case is here because
// breaking that one decision in scripts/gates/error-*.mjs (a mutation: a name taken out of a list, a guard turned off, a comparison
// flipped) left every other test green; the cases are small enough to name what they pin.
const memory = (files: Record<string, string>) => ({ files: Object.keys(files), read: (file: string) => files[file] ?? null });
const FILE = "modules/alpha/src/x.ts";
const scan = (source: string, file = FILE) => measureErrors(memory({ [file]: source }), () => true);
const count = (record: Record<string, number>, file = FILE) => record[file] ?? 0;
const codes = (found: { sites: Record<string, Array<{ code: string }>> }, file = FILE) => (found.sites[file] ?? []).map((site) => site.code);
const ALPHA_ERROR = "export class AlphaError extends Error { constructor(readonly code: string, message: string) { super(message); } }\n";

// ---- where a status is chosen ------------------------------------------------------------------------------------------------------
const NAMES = ["error", "err", "cause", "failure", "exception", "e"];
const STATUS_CASES: Array<[string, string, number]> = [
  // the names an error is read through
  ["a read of errorCode", `export const f = (x: any) => (x.errorCode === "a.b" ? 404 : 400);`, 2],
  ["a read of error_code", `export const f = (x: any) => (x.error_code === "a.b" ? 404 : 400);`, 2],
  ["a bare code", `export const f = (code: string) => (code === "a.b" ? 404 : 400);`, 2],
  ["an element access of code", `export const f = (x: any) => (x["code"] === "a.b" ? 404 : 400);`, 2],
  ["a property that is not a name of a code", `export const f = (x: any) => (x.name === "a.b" ? 404 : 400);`, 0],
  ...NAMES.map((name): [string, string, number] => [`${name} instanceof any class`, `export const f = (${name}: unknown) => (${name} instanceof Anything ? 404 : 400);`, 2]),
  ["a value that is not called an error (a name that only contains one)", `export const f = (value: unknown) => (value instanceof Date ? 404 : 400); export const g = (terror: unknown) => (terror instanceof Date ? 404 : 400);`, 0],
  ["anything instanceof a class called …Error", `export const f = (thrown: unknown) => (thrown instanceof TimeoutError ? 504 : 500);`, 2],
  ["anything instanceof a class that only starts with Error", `export const f = (thrown: unknown) => (thrown instanceof ErrorBoundary ? 404 : 400);`, 0],
  ["a test of a code inside a callback", `export const f = (items: any[]) => (items.some((item) => item.code === "x") ? 404 : 400);`, 0],
  // a name computed from the code, followed two names deep
  ["a name computed from the code, one deep", `export const f = (error: any) => { const conflict = /stale/.test(error.code); return respond(conflict ? 409 : 400, {}); };`, 2],
  ["a name computed from a name that was computed from the code", `export const f = (error: any) => { const a = error.code === "x"; const b = !a; return respond(b ? 409 : 400, {}); };`, 2],
  ["a name three deep is not followed", `export const f = (error: any) => { const a = error.code === "x"; const b = !a; const c = b; return respond(c ? 409 : 400, {}); };`, 0],
  ["a name declared in the enclosing block of the branch", `export const f = (error: any, ok: boolean) => { const conflict = /stale/.test(error.code); if (ok) { return respond(conflict ? 409 : 400, {}); } };`, 2],
  ["the declaration that is named, not the first one", `export const f = (error: any) => { const unrelated = 1; const conflict = /stale/.test(error.code); return respond(conflict ? 409 : 400, {}); };`, 2],
  ["a property that has the name of such a variable is not the variable", `export const f = (error: any, response: any) => { const conflict = /stale/.test(error.code); return respond(response.conflict ? 404 : 400, {}); };`, 0],
  ["a key of an object literal that has the name of such a variable is not the variable", `export const f = (error: any) => { const conflict = /stale/.test(error.code); return respond(options({ conflict: 1 }) ? 404 : 400, {}); };`, 0],
  // where the number has to be for the test to have chosen it
  ["a number assigned inside the test itself", `export const f = (error: any, res: any) => ((error.code === "x" || (res.status = 404)) ? 1 : 2);`, 0],
  ["a number assigned inside the condition of an if", `export const f = (error: any, res: any) => { if (error.code === "x" || (res.status = 404)) return 1; return 2; };`, 0],
  ["a number in a callback inside the branch", `export const f = (error: any, list: any[]) => { if (error.code === "x") { list.map(() => 404); } };`, 0],
  ["a number after && of a test", `export const f = (error: any) => { const s = error.code === "x" && 404; return s; };`, 1],
  ["a number on the left of && (the test is on that side too, but the number is not what is chosen)", `export const f = (error: any, res: any) => ((res.status = 404, error.code) && 1);`, 0],
  ["a number on the left of =", `export const f = (error: any) => { if (error.code === "a.a") { 404 = error; } };`, 0],
  ["a number in the label of a case", `export const f = (error: any) => { switch (error.code) { case 404: return 1; default: return 2; } };`, 0],
  ["a number handed to a call that answers inside the label of a case", `export const f = (error: any) => { switch (error.code) { case respond(404): return 1; default: return 2; } };`, 0],
  // where the number has to be to be a status
  ["a number through parentheses, as, satisfies and !", `export const f = (error: any) => { if (error.code === "a.a") return (404); if (error.code === "a.b") return 404 as number; if (error.code === "a.c") return 404 satisfies number; if (error.code === "a.d") return 404!; };`, 4],
  ["both branches of a conditional that is returned", `export const f = (error: any, flag: boolean) => { if (error.code === "a.a") return flag ? 404 : 400; };`, 2],
  ["a number that is the condition of a conditional", `export const f = (error: any) => { if (error.code === "a.a") return 404 ? "a" : "b"; };`, 0],
  ["a number on the right of ??, || and &&", `export const f = (error: any, v: any) => { let a, b, c; if (error.code === "a.a") { a = v ?? 404; b = v || 404; c = v && 404; } return [a, b, c]; };`, 3],
  ["a number on the left of ??", `export const f = (error: any, v: any) => { let a; if (error.code === "a.a") { a = 404 ?? v; } return a; };`, 0],
  ["a variable and an assignment", `export const f = (error: any) => { let t; if (error.code === "a.a") { const s = 404; t = 409; } return t; };`, 2],
  ["a number handed to each call that answers", `export const f = (error: any, res: any) => { if (error.code === "a.a") { sendIt(404); jsonOf(404); respondWith(404); reply(404); res.writeHead(404); setStatus(404); makeResponse(404); failWith(404); reject(404); refuseWith(404); } };`, 10],
  ["a number handed to calls that do not answer", `export const f = (error: any) => { if (error.code === "a.a") { logIt(404); track(500); } };`, 0],
  ["a number handed to a class that is not an error", `export const f = (error: any) => { if (error.code === "a.a") throw new Widget(409); };`, 0],
  ["a string or a template with the digits of a status", "export const f = (error: any) => { if (error.code === \"a.a\") return \"404\"; if (error.code === \"a.b\") return `409`; };", 0],
  // which numbers are statuses
  ["the edges of the range", `export const f = (error: any) => { if (error.code === "a.a") { const a = 400, b = 599, c = 399, d = 600; return [a, b, c, d]; } };`, 2],
  ["a file with only a 5xx in it", `export const f = (error: any) => { if (error.code === "a.a") return 503; };`, 1],
  ["a file with only a 4xx in it", `export const f = (error: any) => { if (error.code === "a.a") return 404; };`, 1],
  // a table keyed by a code
  ["a table keyed by words that are not a code", `export const T = { "some key": 404, plain: 500, "Content-Type": 400 };`, 0],
  ["a table keyed by a dotted code, with a status that is not one", `export const T = { "alpha.gone": 404, "alpha.fine": 200 };`, 1],
];
for (const [name, source, expected] of STATUS_CASES) test(`status decisions: ${name}`, () => assert.equal(count(scan(source).status), expected));

test("status decisions: a number in the file of the SDK that turns a kind into a status is the one place and is not counted", () => {
  const source = `export const f = (error: any) => (error.code === "a.b" ? 404 : 400);`;
  assert.equal(count(scan(source, "packages/plugin-sdk/src/errors.ts").status, "packages/plugin-sdk/src/errors.ts"), 0);
  assert.equal(count(scan(source, "packages/plugin-sdk/src/error.ts").status, "packages/plugin-sdk/src/error.ts"), 2);
});

// ---- classes -------------------------------------------------------------------------------------------------------------------
test("subclasses: only `extends` a name ending in Error counts; implements, other bases and names that only contain Error do not", () => {
  const found = scan([
    "export class A implements Error {}", "export class B implements HasError {}", "export class C extends ErrorBoundary {}", "export class D extends Component {}",
    "export class E extends RangeError {}", "export default class extends TypeError {}", "export const F = class extends errors.PluginError {};",
  ].join("\n"));
  assert.equal(count(found.subclasses), 3);
  const lines = found.details.get(found.subclasses)[FILE] as string[];
  assert.deepEqual(lines, ["line 5: E extends RangeError", "line 6: (anonymous class) extends TypeError", "line 7: (anonymous class) extends PluginError"]);
});

test("subclasses: ActionError in the contracts' file is the model and not counted; the same name elsewhere, or another class in that file, is", () => {
  const model = "packages/contracts/src/platform/action-errors.ts";
  const found = measureErrors(memory({
    [model]: "export class ActionError extends Error {}\nexport class SecondError extends Error {}\n",
    "modules/alpha/src/copy.ts": "export class ActionError extends Error {}\n",
  }), () => true);
  assert.deepEqual(found.subclasses, { [model]: 1, "modules/alpha/src/copy.ts": 1 });
  const exempt = measureErrors(memory({ [model]: "export class ActionError extends Error {}\n" }), () => true);
  assert.deepEqual(exempt.subclasses, {});
});

// ---- code sites ----------------------------------------------------------------------------------------------------------------
test("sites: the four factories are read with a code and a message, wherever they are called from; logs and look-alikes are not", () => {
  const found = scan([
    "export const a = [context.error('alpha.one', 'm'), context.errorFactory('alpha.two', 'm'), context.createError('alpha.three', 'm'), context.fail('alpha.four', 'm')];",
    "export const b = [error('alpha.five', 'm'), errorFactory('alpha.six', 'm'), createError('alpha.seven', 'm'), fail('alpha.eight', 'm')];",
    "export const c = () => { logger.error('Log.Line', 'm'); log.error('Log.Line', 'm'); console.error('Log.Line', 'm'); };",
    // not codes: one argument, no dot (a known limit: the dotless code of a factory is not read), a sentence with spaces before the dot, a digit first
    "export const d = [context.error('Alpha.single'), fail('nodot', 'm'), fail('A sentence with spaces.then', 'm'), error('0.digit', 'm'), fail('not a code', 'm')];",
  ].join("\n"));
  assert.deepEqual(codes(found), ["alpha.one", "alpha.two", "alpha.three", "alpha.four", "alpha.five", "alpha.six", "alpha.seven", "alpha.eight"]);
});

test("sites: defineErrorCodes gives prefix.reason for identifier and string keys, and nothing for a prefix or a table that is not a literal", () => {
  const found = scan([
    "export const a = defineErrorCodes('one', { not_found: 'not_found', 'family-item': 'invalid', [computed]: 'x', ...more });",
    "export const b = defineErrorCodes(prefix, { lost: 'not_found' });",
    "export const c = defineErrorCodes('two', reasons);",
    "export const d = defineErrorCode('three', { lost: 'not_found' });",
  ].join("\n"));
  assert.deepEqual(codes(found), ["one.not_found", "one.family-item"]);
  assert.equal(count(found.shape), 1, "the dash makes it a bad shape");
});

test("sites: the code of an error class is the argument its constructor calls `code`, in a class that inherits it too, and nothing else", () => {
  const found = scan([
    ALPHA_ERROR,
    "export class MessageFirstError extends Error { constructor(message: string, readonly code: string) { super(message); } }",
    "export class ChildError extends AlphaError {}",
    "export class NoCodeError extends Error { constructor(message: string) { super(message); } }",
    "export const a = [new AlphaError('alpha.one', 'm'), new MessageFirstError('a message', 'alpha.two'), new ChildError('alpha.three', 'm'), new NoCodeError('A sentence.')];",
    "export const b = [new AlphaError(variable, 'm'), new AlphaError(`alpha.${reason}`, 'm'), new AlphaError(), new Unknown('Whatever.x')];",
    "export const c = () => { throw new AlphaError; };",
    "export const d = new AlphaError(`BAD`, 'm');",
  ].join("\n"));
  assert.deepEqual(codes(found), ["alpha.one", "alpha.two", "alpha.three", "BAD"]);
  assert.deepEqual(found.shape, { [FILE]: 1 });
});

test("sites: a known limit, an error class whose name does not end in Error is a subclass but its codes are not read", () => {
  const found = scan("export class Failure extends Error { constructor(readonly code: string) { super(code); } }\nexport const f = new Failure('Bad Code');\n");
  assert.equal(count(found.subclasses), 1);
  assert.deepEqual(codes(found), []);
});

test("sites: a known limit, the codes of a class expression are not followed even when it has a name", () => {
  const found = scan("export const Made = class MadeError extends Error { constructor(readonly code: string) { super(code); } static make() { return new MadeError('Bad Code'); } };\n");
  assert.equal(count(found.subclasses), 1);
  assert.deepEqual(codes(found), []);
});

test("sites: classes that extend each other in a circle end the search instead of looping", () => {
  const found = scan("export class AError extends BError {}\nexport class BError extends AError {}\nexport const a = new AError('Bad.x');\n");
  assert.deepEqual(codes(found), []);
  assert.equal(count(found.subclasses), 2);
});

test("sites: two classes of one name take the first position that is a `code` parameter, in whichever file the other one is", () => {
  const withCode = "export class DupError extends Error { constructor(readonly code: string) { super(code); } }\n";
  const without = "export class DupError extends Error { constructor(message: string) { super(message); } }\n";
  const found = measureErrors(memory({
    "modules/alpha/src/a.ts": withCode.replace("DupError", "DupAError") + without.replace("DupError", "DupBError"),
    "modules/alpha/src/b.ts": without.replace("DupError", "DupAError") + withCode.replace("DupError", "DupBError"),
    "modules/alpha/src/use.ts": "export const x = [new DupAError('alpha.a', 'm'), new DupBError('alpha.b', 'm')];\n",
  }), () => true);
  assert.deepEqual(codes(found, "modules/alpha/src/use.ts"), ["alpha.a", "alpha.b"]);
});

test("sites: a file that is not a source file is not read", () => {
  const found = measureErrors(memory({ "a/src/yes.ts": "export class YesError extends Error {}\n", "a/src/no.ts": "export class NoError extends Error {}\n" }), (file: string) => file.endsWith("yes.ts"));
  assert.deepEqual(found.subclasses, { "a/src/yes.ts": 1 });
});

// ---- platform codes ------------------------------------------------------------------------------------------------------------
test("platformCodes: the rows of ACTION_ERROR_KINDS, through as, satisfies and parentheses, and only that table", () => {
  const rows = `{ "actions.forbidden": "forbidden", "placement.same": "invalid" }`;
  for (const wrapped of [`${rows} as const`, `${rows} satisfies Record<string, string>`, `(${rows})`, `((${rows} as const))`, rows]) {
    const codes = platformCodes(memory({ [ACTION_ERRORS_FILE]: `export const ACTION_ERROR_KINDS = ${wrapped};\nexport const OTHER = { "files.other": "x" };\n` }));
    assert.deepEqual([...codes].sort(), ["actions.forbidden", "placement.same"], wrapped);
  }
  assert.deepEqual([...platformCodes(memory({}))], [], "a snapshot without the file has no platform codes");
  assert.deepEqual([...platformCodes(memory({ [ACTION_ERRORS_FILE]: "export const ACTION_ERROR_KINDS = makeKinds();\nexport const OTHER = { \"files.other\": \"x\" };\n" }))], [], "a table that is not a literal is not read");
  assert.deepEqual([...platformCodes(memory({ [ACTION_ERRORS_FILE]: "export const OTHER = { \"files.other\": \"x\" };\nexport const ACTION_ERROR_KINDS = { \"actions.a\": \"x\", plain: \"y\" };\n" }))], ["actions.a"], "a key that is not a string literal is not a code");
});

// ---- the table: reading --------------------------------------------------------------------------------------------------------
const REASON = "A reason that says why these paths belong to this owner, long enough for the table.";
const tableOf = (patch: Record<string, unknown> = {}) => JSON.stringify({ platform: { prefixes: ["actions"], reason: REASON }, owners: { alpha: { paths: ["modules/alpha/"], reason: REASON } }, ...patch });
const read = (text: string | null) => readOwnerTable(memory(text === null ? {} : { [ERROR_OWNERS_FILE]: text }));
const problemsOf = (patch: Record<string, unknown>) => read(tableOf(patch)).problems as string[];
const withOwner = (name: string, entry: unknown) => ({ owners: { [name]: entry } });
const goodEntry = { paths: ["modules/alpha/"], reason: REASON };

test("readOwnerTable: a good table has no problems, a missing file has no table, and the shapes that are wrong are named", () => {
  assert.deepEqual(read(tableOf()).problems, []);
  assert.equal(read(null).table, null);
  assert.deepEqual(read(null).problems, []);
  assert.match(read("{ nope").problems[0], /is not valid JSON/);
  assert.equal(read("{ nope").table, null);
  for (const text of ['[]', '"x"', 'null', JSON.stringify({ platform: { prefixes: ["actions"], reason: REASON } }), JSON.stringify({ owners: {} }), JSON.stringify({ platform: [], owners: {} }), JSON.stringify({ platform: { prefixes: ["actions"], reason: REASON }, owners: [] })]) {
    assert.match(read(text).problems.join("\n"), /needs a "platform" object/, text);
    assert.equal(read(text).table, null);
  }
});

test("readOwnerTable: the sections are note, platform and owners", () => {
  assert.deepEqual(problemsOf({ note: "x" }), []);
  assert.match(problemsOf({ extra: {} }).join("\n"), /unknown section "extra"/);
});

test("readOwnerTable: the platform's prefixes are a list of plain words and need a reason", () => {
  for (const prefixes of ["actions", [], ["Actions"], ["a.b"], ["a-b"], [1], ["ok", ""], undefined]) assert.match(problemsOf({ platform: { prefixes, reason: REASON } }).join("\n"), /platform: "prefixes" must list/, JSON.stringify(prefixes));
  assert.deepEqual(problemsOf({ platform: { prefixes: ["a", "b_2"], reason: REASON } }), []);
  for (const reason of [undefined, 5, "short", " ".repeat(40), "x ".repeat(10), "x".repeat(19)]) assert.match(problemsOf({ platform: { prefixes: ["actions"], reason } }).join("\n"), /platform: "reason" needs at least 20 characters/, JSON.stringify(reason));
  assert.deepEqual(problemsOf({ platform: { prefixes: ["actions"], reason: "x".repeat(20) } }), [], "twenty characters that are not spaces are enough");
});

test("readOwnerTable: an owner is a plain lower-case word that is not `actions`, with a reason and valid paths, and nothing else", () => {
  assert.deepEqual(problemsOf(withOwner("a1_b", goodEntry)), []);
  for (const name of ["Alpha", "bad-name", "bad name", "1abc", "a.b", "", "ab-"]) assert.match(problemsOf(withOwner(name, goodEntry)).join("\n"), /an owner's name is one lower-case word/, name);
  assert.match(problemsOf(withOwner("actions", goodEntry)).join("\n"), /"actions" is the platform's prefix/);
  for (const entry of ["x", ["a"], null, 5]) assert.match(problemsOf(withOwner("alpha", entry)).join("\n"), /the entry must be an object/, JSON.stringify(entry));
  assert.match(problemsOf(withOwner("alpha", { ...goodEntry, extra: 1 })).join("\n"), /alpha: unknown field "extra"/);
  for (const reason of [undefined, 7, "short", " ".repeat(40), "x ".repeat(10), "x".repeat(19)]) assert.match(problemsOf(withOwner("alpha", { ...goodEntry, reason })).join("\n"), /alpha: "reason" needs at least 20 characters/, JSON.stringify(reason));
  assert.deepEqual(problemsOf(withOwner("alpha", { ...goodEntry, reason: "x".repeat(20) })), []);
});

test("readOwnerTable: a path is a directory, a glob in one segment or a file; absolute, parent, ** and space paths are refused, and so is a list that is not one", () => {
  for (const path of ["modules/alpha/", "apps/local-host/src/jelly-*", "modules/alpha/src/errors.ts", "a/*/b.ts"]) assert.deepEqual(problemsOf(withOwner("alpha", { ...goodEntry, paths: [path] })), [], path);
  for (const paths of ["modules/", [], ["/abs/"], ["a/../b/"], ["a/**"], ["has space/"], [""], [5], [["a/"]], [{ length: 3 }], ["ok/", "bad/ /"], undefined]) assert.match(problemsOf(withOwner("alpha", { ...goodEntry, paths })).join("\n"), /alpha: "paths" must list directories/, JSON.stringify(paths));
});

// ---- the table: whose file is it -----------------------------------------------------------------------------------------------
const lookupOf = (owners: Record<string, string[]>) => ownerLookup(read(tableOf({ owners: Object.fromEntries(Object.entries(owners).map(([name, paths]) => [name, { paths, reason: REASON }])) })).table);

test("ownerLookup: a file beats a glob beats a directory, and a longer path beats a shorter one of the same kind", () => {
  const { ownerOf } = lookupOf({
    dir: ["apps/local-host/src/"], deeper: ["apps/local-host/src/deeper/"], glob: ["apps/local-host/src/jelly-*"], longglob: ["apps/local-host/src/jelly-long-*"],
    file: ["apps/local-host/src/jelly-file.ts"], longdir: ["packages/some/long/dir/inside/"], globby: ["packages/*.ts"],
  });
  assert.equal(ownerOf("apps/local-host/src/other.ts"), "dir");
  assert.equal(ownerOf("apps/local-host/src/deeper/x.ts"), "deeper", "a longer directory");
  assert.equal(ownerOf("apps/local-host/src/jelly-x.ts"), "glob", "a glob beats the directory around it");
  assert.equal(ownerOf("apps/local-host/src/jelly-long-x.ts"), "longglob", "a longer glob");
  assert.equal(ownerOf("apps/local-host/src/jelly-file.ts"), "file", "a file beats the glob");
  assert.equal(ownerOf("packages/some/long/dir/inside/x.ts"), "longdir");
  assert.equal(ownerOf("unknown/x.ts"), undefined);
});

test("ownerLookup: a glob does not cross a slash, is anchored at both ends and takes its dots literally; a directory is a prefix; a file is itself", () => {
  const { ownerOf } = lookupOf({ glob: ["apps/local-host/src/jelly-*.ts"], dir: ["modules/alpha/"], file: ["modules/beta/a.ts"], mid: ["x/*/y.ts"] });
  assert.equal(ownerOf("apps/local-host/src/jelly-a.ts"), "glob");
  assert.equal(ownerOf("apps/local-host/src/jelly-a/b.ts"), undefined, "* stops at /");
  assert.equal(ownerOf("apps/local-host/src/jelly-a.tsx"), undefined, "anchored at the end");
  assert.equal(ownerOf("other/apps/local-host/src/jelly-a.ts"), undefined, "anchored at the start");
  assert.equal(ownerOf("apps/local-host/src/jelly-aXts"), undefined, "a dot in the path is a dot");
  assert.equal(ownerOf("x/mid/y.ts"), "mid");
  assert.equal(ownerOf("x/mid/deeper/y.ts"), undefined);
  assert.equal(ownerOf("modules/alpha/src/a.ts"), "dir");
  assert.equal(ownerOf("other/modules/alpha/src/a.ts"), undefined, "a directory is a prefix, not a part of the path");
  assert.equal(ownerOf("modules/beta/a.ts"), "file");
  assert.equal(ownerOf("modules/beta/a.tsx"), undefined, "a file is only itself");
});

test("ownerLookup: plugins/native/<dir>/ is owned by the directory's name with hyphens as underscores, unless the table has a path that is at least as specific", () => {
  const { ownerOf, tiesOf } = lookupOf({ short: ["plugins/native/"], explicit: ["plugins/native/text-stats/"], inside: ["plugins/native/work/http/"], file: ["plugins/native/work/src/one.ts"] });
  assert.equal(ownerOf("plugins/native/text-stats/src/a.ts"), "explicit", "an explicit path as long as the rule wins");
  assert.equal(ownerOf("plugins/native/work/src/a.ts"), "work", "the rule is longer than plugins/native/");
  assert.equal(ownerOf("plugins/native/feed-reader/src/a.ts"), "feed_reader");
  assert.equal(ownerOf("plugins/native/work/http/a.ts"), "inside", "a longer path inside the plugin directory");
  assert.equal(ownerOf("plugins/native/work/src/one.ts"), "file");
  assert.deepEqual(tiesOf("plugins/native/text-stats/src/a.ts"), ["explicit"], "an explicit path is not a tie with the rule");
  assert.deepEqual(tiesOf("plugins/native/work/src/a.ts"), ["work"]);
  assert.deepEqual(tiesOf("nothing/here.ts"), []);
});

test("ownerLookup: a glob and a directory of the same weight are not a tie, the glob is the more specific", () => {
  const { ownerOf, tiesOf } = lookupOf({ glob: ["a/*/y.ts"], dir: ["a/xxxx/"] });
  assert.equal(ownerOf("a/xxxx/y.ts"), "glob");
  assert.deepEqual(tiesOf("a/xxxx/y.ts"), ["glob"]);
  assert.deepEqual(tiesOf("a/xxxx/z.ts"), ["dir"]);
});

test("ownerLookup: tiesOf names each owner that has the most specific path of a file, once", () => {
  const { ownerOf, tiesOf } = lookupOf({ one: ["a/x*.ts"], two: ["a/*y.ts"], three: ["a/xz*"], four: ["a/xy.ts*"], same: ["b/*.ts", "b/*.ts"] });
  assert.deepEqual(tiesOf("a/xzy.ts").sort(), ["one", "two"], "two globs of the same weight; three is lighter and four does not match");
  assert.deepEqual(tiesOf("a/xq.ts"), ["one"]);
  assert.deepEqual(tiesOf("a/xy.ts"), ["four"], "the heaviest glob alone");
  assert.equal(ownerOf("a/xy.ts"), "four");
  assert.deepEqual(tiesOf("b/q.ts"), ["same"], "one owner with the same path twice is one name");
});

// ---- the table: its own rules ----------------------------------------------------------------------------------------------------
const KINDS_FILE = (rows: string) => `export const ACTION_ERROR_KINDS = { ${rows} } as const;\n`;
const snapshotOf = (table: Record<string, unknown> | string | null, files: Record<string, string> = {}) => memory({ ...(table === null ? {} : { [ERROR_OWNERS_FILE]: typeof table === "string" ? table : JSON.stringify(table) }), ...files });
const GOOD = { platform: { prefixes: ["actions"], reason: REASON }, owners: { alpha: { paths: ["modules/alpha/"], reason: REASON } } };
const SOURCES = { "modules/alpha/src/a.ts": "", [ACTION_ERRORS_FILE]: KINDS_FILE(`"actions.forbidden": "forbidden"`) };

test("errorOwnerProblems: the table is required where the gate says so and only there", () => {
  assert.deepEqual(errorOwnerProblems(snapshotOf(null), { required: false }), []);
  assert.deepEqual(errorOwnerProblems(snapshotOf(null)), []);
  assert.match(errorOwnerProblems(snapshotOf(null), { required: true }).join("\n"), /tooling\/gates\/error-owners\.json is missing/);
  assert.deepEqual(errorOwnerProblems(snapshotOf(GOOD, SOURCES), { required: true }), []);
});

test("errorOwnerProblems: the problems of the file's own shape are part of the answer", () => {
  assert.match(errorOwnerProblems(snapshotOf("{ nope", SOURCES)).join("\n"), /is not valid JSON/);
  assert.match(errorOwnerProblems(snapshotOf({ ...GOOD, owners: { Bad: GOOD.owners.alpha } }, SOURCES)).join("\n"), /an owner's name is one lower-case word/);
});

test("errorOwnerProblems: a path that matches no tracked file is stale, a path under two owners is refused, the same owner may repeat itself", () => {
  const owners = (extra: Record<string, unknown>) => ({ ...GOOD, owners: { ...GOOD.owners, ...extra } });
  assert.match(errorOwnerProblems(snapshotOf(owners({ gone: { paths: ["modules/gone/"], reason: REASON } }), SOURCES)).join("\n"), /gone: modules\/gone\/ matches no tracked file/);
  assert.match(errorOwnerProblems(snapshotOf(owners({ beta: { paths: ["modules/alpha/"], reason: REASON } }), SOURCES)).join("\n"), /modules\/alpha\/ is under both "alpha" and "beta"/);
  assert.deepEqual(errorOwnerProblems(snapshotOf({ ...GOOD, owners: { alpha: { paths: ["modules/alpha/", "modules/alpha/"], reason: REASON } } }, SOURCES)), []);
});

test("errorOwnerProblems: two owners whose paths tie on a TypeScript file are refused, on any other file they are not", () => {
  const tie = (ext: string) => errorOwnerProblems(snapshotOf({ ...GOOD, owners: { ...GOOD.owners, one: { paths: [`m/x*${ext}`], reason: REASON }, two: { paths: [`m/*y${ext}`], reason: REASON } } }, { ...SOURCES, [`m/xy${ext}`]: "" })).join("\n");
  assert.match(tie(".ts"), /m\/xy\.ts is claimed by "one" and "two" with equally specific paths/);
  assert.match(tie(".mts"), /m\/xy\.mts is claimed by "one" and "two"/);
  assert.equal(tie(".md"), "", "a file that is not TypeScript is not a source of codes");
  assert.equal(errorOwnerProblems(snapshotOf({ ...GOOD, owners: { one: { paths: ["m/x*"], reason: REASON }, two: { paths: ["m/xy*"], reason: REASON } } }, { ...SOURCES, "m/xy.ts": "" })).join("\n"), "", "paths of different weight do not tie");
});

test("errorOwnerProblems: every row of the platform table needs its prefix in the table, and every prefix needs a row", () => {
  const withRows = (rows: string, prefixes: string[]) => errorOwnerProblems(snapshotOf({ ...GOOD, platform: { prefixes, reason: REASON } }, { "modules/alpha/src/a.ts": "", [ACTION_ERRORS_FILE]: KINDS_FILE(rows) })).join("\n");
  assert.equal(withRows(`"actions.a": "x", "actions.b": "y"`, ["actions"]), "");
  assert.match(withRows(`"actions.a": "x", "files.b": "y"`, ["actions"]), /ACTION_ERROR_KINDS has a row for "files\.b", whose prefix "files" is not a platform prefix/);
  assert.match(withRows(`"actions.a": "x"`, ["actions", "files"]), /platform prefix "files" has no row in ACTION_ERROR_KINDS/);
  assert.equal(withRows(`"actions.a": "x", "files.b": "y"`, ["actions", "files"]), "");
  // Without the file that holds the platform table, a prefix cannot be missing its row.
  assert.equal(errorOwnerProblems(snapshotOf({ ...GOOD, platform: { prefixes: ["actions", "files"], reason: REASON } }, { "modules/alpha/src/a.ts": "" })).join("\n"), "");
});

// ---- the count of codes without their owner's name ---------------------------------------------------------------------------------
test("measureOwners: a code counts unless it starts with the file's owner's name or is a platform code; a file nobody owns counts every other code", () => {
  const snapshot = memory({ [ACTION_ERRORS_FILE]: KINDS_FILE(`"actions.forbidden": "forbidden"`) });
  const { table } = read(tableOf());
  const site = (code: string, line = 1) => ({ line, code });
  const sites = {
    "modules/alpha/src/a.ts": [site("alpha.ok"), site("alpha_not_found", 2), site("alphabet.x", 3), site("beta.x", 4), site("actions.forbidden", 5), site("actions.made_up", 6), site("Alpha.x", 7), site("alpha", 8)],
    "tooling/other/b.ts": [site("other.x"), site("actions.forbidden", 2)],
  };
  const { counts, details } = measureOwners(snapshot, sites, table);
  assert.deepEqual(counts, { "modules/alpha/src/a.ts": 5, "tooling/other/b.ts": 1 });
  assert.deepEqual(details["modules/alpha/src/a.ts"], ['line 2: "alpha_not_found" in alpha\'s file', 'line 3: "alphabet.x" in alpha\'s file', 'line 4: "beta.x" in alpha\'s file', 'line 6: "actions.made_up" in alpha\'s file', 'line 7: "Alpha.x" in alpha\'s file']);
  assert.deepEqual(details["tooling/other/b.ts"], ['line 1: "other.x" in a file nobody owns']);
  assert.deepEqual(measureOwners(snapshot, sites, null), { counts: {}, details: {} }, "without a table nothing is counted");
});

// ---- the assignment and the comparison of two tables -----------------------------------------------------------------------------
test("ownerAssignment: the owner of each source file, the source files nobody owns, and the platform prefixes in order", () => {
  const table = { platform: { prefixes: ["placement", "actions"], reason: REASON }, owners: { alpha: { paths: ["modules/alpha/"], reason: REASON } } };
  const snapshot = memory({ [ERROR_OWNERS_FILE]: JSON.stringify(table), "modules/alpha/src/a.ts": "", "modules/alpha/README.md": "", "tooling/other/x.ts": "", "tooling/other/y.md": "" });
  const isSource = (file: string) => file.endsWith(".ts") && !file.startsWith("tooling/gates/");
  assert.deepEqual(ownerAssignment(snapshot, isSource), { files: { "modules/alpha/src/a.ts": "alpha" }, unowned: ["tooling/other/x.ts"], prefixes: ["actions", "placement"] });
  assert.equal(ownerAssignment(memory({ "modules/alpha/src/a.ts": "" }), isSource), null, "no table, no assignment");
});

const assignment = (files: Record<string, string>, unowned: string[] = [], prefixes = ["actions"]) => ({ files, unowned, prefixes });
test("looserOwnership: another owner, no owner and a new platform prefix are looser; everything that is not one of them is free", () => {
  const ref = assignment({ "a.ts": "alpha", "b.ts": "beta", "c.ts": "gamma" });
  const none = new Map<string, string>();
  assert.deepEqual(looserOwnership(ref, ref, none), []);
  assert.deepEqual(looserOwnership(assignment({ "a.ts": "alpha", "b.ts": "alpha", "c.ts": "gamma" }), ref, none), ["b.ts was the beta owner's at the merge-base and is the alpha owner's now"]);
  assert.deepEqual(looserOwnership(assignment({ "a.ts": "alpha", "c.ts": "gamma" }, ["b.ts"]), ref, none), ["b.ts was the beta owner's at the merge-base and has no owner now"]);
  assert.deepEqual(looserOwnership(assignment({ "a.ts": "alpha", "c.ts": "gamma" }, ["b.ts", "d.ts"], ["actions", "files"]), ref, none),
    ["b.ts was the beta owner's at the merge-base and has no owner now", `"files" is a platform prefix now, so anyone may raise codes that start with it`]);
  // free: a file that is gone (deleted or moved), a new file with an owner, a new file nobody owns, a file nobody owned that has one, a prefix that left
  assert.deepEqual(looserOwnership(assignment({ "a.ts": "alpha", "c.ts": "gamma", "n.ts": "new" }, ["m.ts"]), ref, none), []);
  assert.deepEqual(looserOwnership(assignment({ "a.ts": "alpha", "b.ts": "beta", "c.ts": "gamma", "d.ts": "delta" }), assignment({ "a.ts": "alpha", "b.ts": "beta", "c.ts": "gamma" }, ["d.ts"]), none), []);
  assert.deepEqual(looserOwnership(assignment({ "a.ts": "alpha", "b.ts": "beta", "c.ts": "gamma" }, [], []), assignment({ "a.ts": "alpha", "b.ts": "beta", "c.ts": "gamma" }, [], ["actions"]), none), []);
  // a file that came in by a rename is judged by its counts, whichever end of the rename the table names
  assert.deepEqual(looserOwnership(assignment({ "a.ts": "other" }), ref, new Map([["old.ts", "a.ts"]])), []);
  assert.deepEqual(looserOwnership(assignment({ "a.ts": "other" }), ref, new Map([["a.ts", "new.ts"]])), []);
  assert.equal(looserOwnership(assignment({ "a.ts": "other" }), ref, new Map([["x.ts", "y.ts"]])).length, 1);
  // there is nothing to compare when either side has no table
  assert.deepEqual(looserOwnership(null, ref, none), []);
  assert.deepEqual(looserOwnership(assignment({ "a.ts": "other" }, ["z.ts"]), null, none), []);
  assert.deepEqual(looserOwnership(assignment({ "a.ts": "other" }, ["z.ts"]), undefined, none), []);
});

// ---- the metrics -----------------------------------------------------------------------------------------------------------------
const helpers = (root: string, required = false) => {
  const perFile = { lowered: () => false, lines: () => [], fromBaseline: (json: Record<string, unknown>, id: string) => json[id] };
  return createErrorMetrics({ root, required, isSource: () => true, perFile, rekey: (record: Record<string, number>, renames: Map<string, string>, rename: (key: string, renames: Map<string, string>) => string) => Object.fromEntries(Object.entries(record).map(([key, value]) => [rename(key, renames), value])), rekeyFile: (file: string, renames: Map<string, string>) => renames.get(file) ?? file, sumOf: (record: Record<string, number>) => Object.values(record).reduce((a, b) => a + b, 0) });
};
// The parts of a metric (scripts/check-health-gates.mjs reads them) that these cases call.
interface Metric {
  id: string;
  measure(snapshot: { files: string[]; read(file: string): string | null }): unknown;
  absolute(value: unknown): string[];
  toBaseline(value: unknown): Record<string, unknown>;
  fromBaseline(json: Record<string, unknown>): unknown;
  lowered(head: unknown, ref: unknown): boolean;
  grew(head: unknown, ref: unknown, env: { renames: Map<string, string> }): string[];
  lines(head: unknown): string[];
  summary(value: unknown): string;
}
const metricOf = (metrics: Metric[], id: string) => metrics.find((metric) => metric.id === id) as Metric;

test("metrics: the table is required of the repository that says so, and the table metric holds no baseline of its own", () => {
  const empty = mkdtempSync(path.join(tmpdir(), "molis-error-metrics-"));
  try {
    const bare = memory({ "modules/alpha/src/a.ts": "" });
    const required = metricOf(helpers(empty, true), "errorOwnerTable"), optional = metricOf(helpers(empty, false), "errorOwnerTable");
    assert.match(required.absolute(required.measure(bare)).join("\n"), /^error owner table: tooling\/gates\/error-owners\.json is missing/);
    assert.deepEqual(optional.absolute(optional.measure(bare)), []);
    assert.deepEqual(required.toBaseline(required.measure(bare)), {});
    assert.equal(required.fromBaseline({ errorOwnerTable: { anything: 1 } }), null);
    assert.equal(required.lowered({ assignment: null, problems: [] }, { assignment: null, problems: [] }), false);
    assert.deepEqual(required.grew({ assignment: null, problems: [] }, undefined, { renames: new Map() }), []);
    // the other four metrics measure nothing without the table's text on disk
    assert.deepEqual(metricOf(helpers(empty), "errorCodeOwner").measure(memory({ "modules/alpha/src/a.ts": ALPHA_ERROR + "export const x = new AlphaError('beta.x', 'm');" })), {});
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("metrics: the table metric forgives a renamed file, says so in the report, and counts its problems", () => {
  const empty = mkdtempSync(path.join(tmpdir(), "molis-error-metrics-"));
  try {
    const metric = metricOf(helpers(empty, true), "errorOwnerTable");
    const was = { assignment: { files: { "a.ts": "alpha" }, unowned: [], prefixes: ["actions"] }, problems: [] };
    const now = { assignment: { files: { "a.ts": "beta" }, unowned: [], prefixes: ["actions"] }, problems: [] };
    assert.equal(metric.grew(now, was, { renames: new Map() }).length, 1);
    assert.deepEqual(metric.grew(now, was, { renames: new Map([["old.ts", "a.ts"]]) }), []);
    assert.match(metric.grew(now, was, { renames: new Map() })[0], /^error owner table: a\.ts was the alpha owner's at the merge-base and is the beta owner's now; an owner is fixed once it is given/);
    assert.deepEqual(metric.lines(now), ["Error owner table (tooling/gates/error-owners.json): 1 owners over 1 source files (0 more that nobody owns), platform prefixes actions"]);
    assert.deepEqual(metric.lines({ assignment: { files: {}, unowned: ["x.ts", "y.ts"], prefixes: ["actions", "files"] }, problems: ["one", "two"] }), ["Error owner table (tooling/gates/error-owners.json): 0 owners over 0 source files (2 more that nobody owns), platform prefixes actions, files, 2 problems"]);
    assert.deepEqual(metric.lines({ assignment: null, problems: [] }), ["Error owner table (tooling/gates/error-owners.json): no table"]);
    assert.equal(metric.summary(now), "1 error owners");
    assert.equal(metric.summary({ assignment: null, problems: [] }), "0 error owners");
  } finally { rmSync(empty, { recursive: true, force: true }); }
});

test("metrics: the owner of a code is read from the working tree's table, whichever snapshot is measured", () => {
  const root = mkdtempSync(path.join(tmpdir(), "molis-error-metrics-"));
  try {
    mkdirSync(path.join(root, "tooling/gates"), { recursive: true });
    writeFileSync(path.join(root, ERROR_OWNERS_FILE), tableOf());
    const metric = metricOf(helpers(root), "errorCodeOwner");
    const source = { "modules/alpha/src/a.ts": ALPHA_ERROR + "export const x = new AlphaError('beta.x', 'm');" };
    // A snapshot whose own table gives the file to beta (or has none) is still measured with the table in the working tree, where alpha owns it.
    const other = tableOf({ owners: { beta: { paths: ["modules/alpha/"], reason: REASON } } });
    assert.deepEqual(metric.measure(memory({ ...source, [ERROR_OWNERS_FILE]: other })), { "modules/alpha/src/a.ts": 1 });
    assert.deepEqual(metric.measure(memory({ ...source, [ERROR_OWNERS_FILE]: "{}" })), { "modules/alpha/src/a.ts": 1 });
    assert.deepEqual(metric.measure(memory({ "modules/alpha/src/a.ts": ALPHA_ERROR + "export const x = new AlphaError('alpha.x', 'm');", [ERROR_OWNERS_FILE]: other })), {});
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("metrics: each count names its file, its numbers and the lines, says how many more there are, and gives the baseline its total", () => {
  const root = mkdtempSync(path.join(tmpdir(), "molis-error-metrics-"));
  try {
    const metric = metricOf(helpers(root), "errorCodeShape");
    const bad = Array.from({ length: 6 }, (_, index) => `export const x${index} = new AlphaError('BAD_${index}', 'm');`).join("\n");
    const head = metric.measure(memory({ "modules/alpha/src/a.ts": ALPHA_ERROR + bad }));
    assert.deepEqual(head, { "modules/alpha/src/a.ts": 6 });
    const [message, ...rest] = metric.grew(head, { "modules/alpha/src/a.ts": 2 }, { renames: new Map() }) as string[];
    assert.equal(rest.length, 0);
    assert.match(message, /^error codes that are not lower-case words joined by dots in modules\/alpha\/src\/a\.ts 2 → 6 \(line 2: "BAD_0"; line 3: "BAD_1"; line 4: "BAD_2"; line 5: "BAD_3"; … 2 more\); write the code as <owner>\.<reason>/);
    assert.deepEqual(metric.grew(head, { "modules/alpha/src/a.ts": 6 }, { renames: new Map() }), [], "the same number is not growth");
    assert.equal(metric.grew(head, {}, { renames: new Map() }).length, 1, "a file with no record starts at 0");
    assert.deepEqual(metric.grew(head, { "modules/alpha/src/old.ts": 6 }, { renames: new Map([["modules/alpha/src/old.ts", "modules/alpha/src/a.ts"]]) }), [], "a moved file keeps its record");
    assert.deepEqual(metric.toBaseline(head), { errorCodeShapeTotal: 6, errorCodeShape: head });
    assert.equal(metric.summary(head), "6 badly shaped error codes");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("metrics: the four counts read the four numbers of the scan, each under its own baseline key", () => {
  const root = mkdtempSync(path.join(tmpdir(), "molis-error-metrics-"));
  try {
    const metrics = helpers(root);
    assert.deepEqual(metrics.map((metric: Metric) => metric.id), ["errorSubclasses", "errorCodeShape", "errorStatusDecisions", "errorCodeOwner", "errorOwnerTable"]);
    const snapshot = memory({ "modules/alpha/src/a.ts": ALPHA_ERROR + "export class Other extends Error {}\nexport const a = new AlphaError('Bad', 'm');\nexport const b = (error: any) => (error.code === 'x' ? 404 : 400);\n" });
    assert.deepEqual(metricOf(metrics, "errorSubclasses").measure(snapshot), { "modules/alpha/src/a.ts": 2 });
    assert.deepEqual(metricOf(metrics, "errorCodeShape").measure(snapshot), { "modules/alpha/src/a.ts": 1 });
    assert.deepEqual(metricOf(metrics, "errorStatusDecisions").measure(snapshot), { "modules/alpha/src/a.ts": 2 });
    assert.deepEqual(Object.keys(metricOf(metrics, "errorSubclasses").toBaseline({})), ["errorSubclassTotal", "errorSubclasses"]);
    assert.deepEqual(Object.keys(metricOf(metrics, "errorCodeShape").toBaseline({})), ["errorCodeShapeTotal", "errorCodeShape"]);
    assert.deepEqual(Object.keys(metricOf(metrics, "errorStatusDecisions").toBaseline({})), ["errorStatusDecisionTotal", "errorStatusDecisions"]);
    assert.deepEqual(Object.keys(metricOf(metrics, "errorCodeOwner").toBaseline({})), ["errorCodeOwnerTotal", "errorCodeOwner"]);
    for (const id of ["errorSubclasses", "errorCodeShape", "errorStatusDecisions", "errorCodeOwner"]) {
      const metric = metricOf(metrics, id);
      assert.deepEqual(metric.fromBaseline({ [id]: { "x.ts": 3 }, other: { "x.ts": 9 } }), { "x.ts": 3 }, id);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("the table's file is one of the files the entry reads text of, and no other is", () => {
  assert.equal(errorOwnersWantsText(ERROR_OWNERS_FILE), true);
  assert.equal(errorOwnersWantsText("tooling/gates/error-owners.json.bak"), false);
  assert.equal(errorOwnersWantsText("tooling/gates/limits.json"), false);
});
