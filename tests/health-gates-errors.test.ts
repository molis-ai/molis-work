import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { ACTION_ERROR_CODE } from "@molis-ai/molis-work-contracts/platform/actions";
// @ts-expect-error the gate modules are plain .mjs
import { CODE_SHAPE, measureErrors } from "../scripts/gates/error-scan.mjs";
// @ts-expect-error the gate modules are plain .mjs
import { errorOwnerProblems, readOwnerTable } from "../scripts/gates/error-owners.mjs";

// specs/repository-anti-corruption W3-02-B (scripts/gates/error-*.mjs, tooling/gates/error-owners.json): the error model's four numbers
// compared with the merge-base, and the table that says whose error a code is. As in tests/health-gates-structure.test.ts, each rule is
// mutation-verified on a small scratch repository: one violation added on a branch makes `--base main` fail, `--update` (the laundering
// move) neither hides it nor is accepted when it is given the merge-base, and what a rule must NOT flag stays green.
//   errorSubclasses       a class that extends an `…Error`
//   errorCodeShape        a code literal that is not `<owner>.<reason>` in lower-case words
//   errorStatusDecisions  a 400–599 number that a test of an error chooses (outside the plugin SDK's errors.ts)
//   errorCodeOwner        a code that does not start with the name of the owner of the file that raises it (platform codes apart)
//   errorOwnerTable       the table's own rules, and "only stricter" against the merge-base's table
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo = "";

const git = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: repo, encoding: "utf8", stdio: "pipe" });
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const append = (file: string, text: string) => put(file, read(file) + text);
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};
const lines = (...parts: string[]) => `${parts.join("\n")}\n`;
const REASON = "A reason that says why these paths belong to this owner, long enough for the table.";
const owners = (extra: Record<string, unknown> = {}) => ({
  alpha: { paths: ["modules/alpha/"], reason: REASON },
  beta: { paths: ["modules/beta/", "apps/local-host/src/beta-*"], reason: REASON },
  host: { paths: ["apps/local-host/src/"], reason: REASON },
  sdk: { paths: ["packages/plugin-sdk/"], reason: REASON },
  ...extra,
});
const ownersExcept = (...names: string[]) => Object.fromEntries(Object.entries(owners()).filter(([name]) => !names.includes(name)));
const tableText = (table: Record<string, unknown> = {}) => JSON.stringify({ note: "fixture", platform: { prefixes: ["actions", "placement"], reason: REASON }, owners: owners(), ...table }, null, 2) + "\n";
const TABLE = "tooling/gates/error-owners.json";
const KINDS = "packages/contracts/src/platform/action-errors.ts";

// The fixture: one of everything is already in the base (so growth in a file that has a record is tested as well as in a new file),
// and a few things the rules must leave alone.
before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-error-gates-"));
  git("init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 2000, classLines: 2000, classMethods: 200, functionLines: 2000, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put(TABLE, tableText());
  put(KINDS, lines(
    "export class ActionError extends Error { constructor(readonly code: string, message: string, options: object = {}) { super(message); void options; } }",
    "export const ACTION_ERROR_KINDS = {",
    '  "actions.forbidden": "forbidden", "actions.missing": "not_found", "placement.same_location": "invalid",',
    "} as const;",
    "export const ACTION_ERROR_CODE = /^[a-z][a-z0-9_]*(\\.[a-z0-9_]+)+$/u;"));
  put("modules/alpha/src/errors.ts", lines(
    "export class AlphaError extends Error { constructor(readonly code: string, message: string) { super(message); } }",
    "export class MessageFirstError extends Error { constructor(message: string, readonly code: string) { super(message); } }",
    "export class PlainError extends Error {}"));
  put("modules/alpha/src/service.ts", lines(
    'import { ActionError } from "../../../packages/contracts/src/platform/action-errors.js";',
    'import { AlphaError, MessageFirstError, PlainError } from "./errors.js";',
    "export const run = (kind: number) => {",
    '  if (kind === 1) throw new AlphaError("alpha.not_found", "找不到");',
    '  if (kind === 2) throw new MessageFirstError("a sentence. it has dots. and spaces", "alpha.conflict");',
    '  if (kind === 3) throw new ActionError("actions.forbidden", "不可以");',
    '  if (kind === 4) throw new ActionError("placement.same_location", "同一个位置");',
    '  if (kind === 5) throw new PlainError("Not A Code. Just a sentence.");',
    "};"));
  // What is already wrong in the base: a second subclass, a bad code (also the wrong owner), and a status chosen by a code.
  put("modules/alpha/src/legacy.ts", lines(
    'import { AlphaError } from "./errors.js";',
    "export class LegacyError extends Error {}",
    'export const legacy = () => new AlphaError("Alpha_Legacy", "旧");',
    'export const statusOf = (error: { code?: string }) => (error.code === "alpha.gone" ? 404 : 400);'));
  put("modules/beta/src/index.ts", lines('import { ActionError } from "../../../packages/contracts/src/platform/action-errors.js";', 'export const beta = () => new ActionError("beta.invalid", "无效");'));
  put("plugins/native/one/src/index.ts", lines(
    'import { ActionError } from "../../../../packages/contracts/src/platform/action-errors.js";',
    'declare function defineErrorCodes(prefix: string, reasons: Record<string, string>): Record<string, (message: string) => Error>;',
    'export const oneErrors = defineErrorCodes("one", { not_found: "not_found", family_item: "invalid" });',
    'export const two = () => new ActionError("one.family.reason", "家族");'));
  put("plugins/native/text-stats/src/index.ts", lines('import { ActionError } from "../../../../packages/contracts/src/platform/action-errors.js";', 'export const stats = () => new ActionError("text_stats.invalid", "无效");'));
  put("apps/local-host/src/host.ts", lines('import { ActionError } from "../../../packages/contracts/src/platform/action-errors.js";', 'export const refuse = () => new ActionError("host.request_refused", "拒绝");'));
  put("apps/local-host/src/beta-edge.ts", lines('import { ActionError } from "../../../packages/contracts/src/platform/action-errors.js";', 'export const edge = () => new ActionError("beta.refused", "拒绝");'));
  // The one place that turns a kind into a status; it may decide on the code.
  put("packages/plugin-sdk/src/errors.ts", lines("export const actionHttpStatus = (error: { code?: string }) => (error.code === \"x.y\" ? 409 : error instanceof Error ? 500 : 400);"));
  // Look-alikes that are none of the four.
  put("apps/local-host/src/clean.ts", lines(
    "declare const response: { status: number }; declare const req: { method: string }; declare const error: { code?: string; kind?: string }; declare function respond(code: number, body: object): void;",
    "export const a = response.status === 404 || response.status >= 500;",
    "export const b = [404, 405].includes(response.status);",
    "export const c = req.method === \"POST\" ? 400 : 404;",
    "export const d = () => 400;",
    "export const e = error.code === \"x\" ? 399 : 600;",
    "export const f = (note: string) => (error.code === \"x\" ? note.slice(0, 500) : note);",
    "export const g = error.kind === \"conflict\" ? 409 : 400;",
    "export const h = -403;",
    "export class ErrorBoundary extends Component {}", "declare class Component {}",
    'export const i = new Error("Bad_Code is not a code, it is a sentence.");',
    "export const j = (cause: string) => new Error(`alpha.${cause}`);",
    "export const k = () => respond(204, {});"));
  put("specs/demo/spec.md", "# Demo\n\n状态：进行中\n");
  git("add", "-A");
  const first = gate("--update");
  assert.equal(first.code, 0, first.out);
  commit("base");
});
after(() => { if (repo) rmSync(repo, { recursive: true, force: true }); });

const branch = (name: string, mutate: () => void) => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", name);
  mutate();
  commit(name);
};

type Scenario = { name: string; mutate: () => void; expect: RegExp[]; absent?: RegExp[]; launder?: boolean };
const IMPORT_ACTION = 'import { ActionError } from "../../../packages/contracts/src/platform/action-errors.js";\n';
const IMPORT_ALPHA = 'import { AlphaError, MessageFirstError } from "./errors.js";\n';
const violations: Scenario[] = [
  // ---- errorSubclasses --------------------------------------------------------------------------------------------------------
  { name: "a new class that extends Error", launder: true, mutate: () => put("modules/alpha/src/more.ts", "export class MoreError extends Error {}\n"),
    expect: [/Error subclasses in modules\/alpha\/src\/more\.ts 0 → 1 \(line 1: MoreError extends Error\)/] },
  { name: "a class that extends a built-in error type", mutate: () => put("modules/alpha/src/range.ts", "export class WindowError extends RangeError {}\n"), expect: [/Error subclasses in modules\/alpha\/src\/range\.ts 0 → 1/] },
  { name: "a class that extends ActionError", mutate: () => put("modules/alpha/src/child.ts", `${IMPORT_ACTION}export class ChildActionError extends ActionError {}\n`), expect: [/Error subclasses in modules\/alpha\/src\/child\.ts 0 → 1/] },
  { name: "a class expression and a default export that extend an error", mutate: () => put("modules/alpha/src/expr.ts", "export const Made = class extends Error {};\nexport default class extends TypeError {}\n"), expect: [/Error subclasses in modules\/alpha\/src\/expr\.ts 0 → 2/] },
  { name: "a class that extends a qualified error", mutate: () => put("modules/alpha/src/qualified.ts", "import * as errors from \"./errors.js\";\nexport class Wrapped extends errors.AlphaError {}\n"), expect: [/Error subclasses in modules\/alpha\/src\/qualified\.ts 0 → 1/] },
  { name: "a second class in the file of the model, and a class of the model's name anywhere else", mutate: () => {
    append(KINDS, "export class SecondError extends Error {}\n");
    put("modules/alpha/src/copy.ts", "export class ActionError extends Error {}\n");
  }, expect: [/Error subclasses in packages\/contracts\/src\/platform\/action-errors\.ts 0 → 1 \(line 6: SecondError extends Error\)/, /Error subclasses in modules\/alpha\/src\/copy\.ts 0 → 1/] },
  { name: "another subclass in a file that already has one", mutate: () => append("modules/alpha/src/legacy.ts", "export class SecondError extends Error {}\n"), expect: [/Error subclasses in modules\/alpha\/src\/legacy\.ts 1 → 2/] },
  { name: "a class in a fixtures directory of production code (the structure gates read those too)", mutate: () => put("modules/alpha/src/fixtures/hidden.ts", "export class HiddenError extends Error {}\n"), expect: [/Error subclasses in modules\/alpha\/src\/fixtures\/hidden\.ts 0 → 1/] },

  // ---- errorCodeShape ---------------------------------------------------------------------------------------------------------
  { name: "an upper-case code", launder: true, mutate: () => put("modules/alpha/src/shape1.ts", `${IMPORT_ALPHA}export const x = () => new AlphaError("BAD_CODE", "坏");\n`),
    expect: [/error codes that are not lower-case words joined by dots in modules\/alpha\/src\/shape1\.ts 0 → 1 \(line 2: "BAD_CODE"\)/] },
  { name: "a code with no dot", mutate: () => put("modules/alpha/src/shape2.ts", `${IMPORT_ACTION}export const x = () => new ActionError("nodot", "坏");\n`), expect: [/error codes that are not lower-case words joined by dots in modules\/alpha\/src\/shape2\.ts 0 → 1/] },
  { name: "a code with a capital in a later word, and one with a dash", mutate: () => put("modules/alpha/src/shape3.ts", `${IMPORT_ACTION}export const x = () => [new ActionError("alpha.Bad", "坏"), new ActionError("alpha.bad-word", "坏")];\n`),
    expect: [/modules\/alpha\/src\/shape3\.ts 0 → 2/] },
  { name: "a bad code once more in a file that already has one", mutate: () => append("modules/alpha/src/legacy.ts", 'export const again = () => new AlphaError("Another_One", "旧");\n'), expect: [/error codes that are not lower-case words joined by dots in modules\/alpha\/src\/legacy\.ts 1 → 2/] },
  { name: "a bad reason declared with defineErrorCodes", mutate: () => append("plugins/native/one/src/index.ts", 'export const more = defineErrorCodes("one", { Bad: "invalid" });\n'), expect: [/error codes that are not lower-case words joined by dots in plugins\/native\/one\/src\/index\.ts 0 → 1 \(line 5: "one\.Bad"\)/] },
  { name: "a bad code given to an error factory", mutate: () => put("modules/alpha/src/shape4.ts", 'declare const context: { error(code: string, message: string): Error };\nexport const x = () => context.error("Alpha.bad", "坏");\n'),
    expect: [/modules\/alpha\/src\/shape4\.ts 0 → 1 \(line 2: "Alpha\.bad"\)/] },
  { name: "a bad code in the second argument of a class that takes its message first", mutate: () => put("modules/alpha/src/shape5.ts", `${IMPORT_ALPHA}export const x = () => new MessageFirstError("a sentence", "BadSecond");\n`), expect: [/modules\/alpha\/src\/shape5\.ts 0 → 1 \(line 2: "BadSecond"\)/] },
  { name: "a bad code given to a class that inherits its constructor", mutate: () => put("modules/alpha/src/shape6.ts", `${IMPORT_ALPHA}export class ChildError extends AlphaError {}\nexport const x = () => new ChildError("Nope", "坏");\n`),
    expect: [/modules\/alpha\/src\/shape6\.ts 0 → 1 \(line 3: "Nope"\)/, /Error subclasses in modules\/alpha\/src\/shape6\.ts 0 → 1/] },

  // ---- errorStatusDecisions ---------------------------------------------------------------------------------------------------
  { name: "a status chosen by the code in a ternary", launder: true, mutate: () => put("apps/local-host/src/status1.ts", 'declare function sendJson(response: object, status: number, body: object): void;\nexport const f = (response: object, error: { code?: string }) => sendJson(response, error.code === "alpha.gone" ? 404 : 400, {});\n'),
    expect: [/HTTP statuses chosen by a test of an error in apps\/local-host\/src\/status1\.ts 0 → 2 \(line 2: 404; line 2: 400\)/] },
  { name: "a status returned for an instanceof test", mutate: () => put("apps/local-host/src/status2.ts", 'declare class NotFound extends Error {}\nexport const f = (error: unknown) => {\n  if (error instanceof NotFound) return 404;\n  return 500;\n};\n'),
    expect: [/in apps\/local-host\/src\/status2\.ts 0 → 1 \(line 3: 404\)/] },
  { name: "statuses chosen by a switch on the code", mutate: () => put("apps/local-host/src/status3.ts", 'export const f = (error: { code: string }) => {\n  switch (error.code) {\n    case "a.b": return 404;\n    case "a.c": return 409;\n    default: return 500;\n  }\n};\n'),
    expect: [/in apps\/local-host\/src\/status3\.ts 0 → 3/] },
  { name: "a status handed to respond inside an if on the code", mutate: () => put("apps/local-host/src/status4.ts", 'declare function respond(response: object, status: number, body: object): void;\nexport const f = (response: object, error: { code: string }) => {\n  if (error.code === "a.b") { respond(response, 404, {}); return; }\n  respond(response, 500, {});\n};\n'),
    expect: [/in apps\/local-host\/src\/status4\.ts 0 → 1 \(line 3: 404\)/] },
  { name: "a status written into an error that is built for a code", mutate: () => put("apps/local-host/src/status5.ts", 'declare class HttpError extends Error { constructor(code: string, message: string, status: number) }\nexport const f = (error: { code: string }) => { if (error.code === "a.b") throw new HttpError("a.b", "x", 409); };\n'),
    expect: [/in apps\/local-host\/src\/status5\.ts 0 → 1 \(line 2: 409\)/] },
  { name: "a status chosen through a name that was computed from the code", mutate: () => put("apps/local-host/src/status6.ts", 'declare function respond(status: number, body: object): void;\nexport const f = (error: { code: string }) => {\n  const conflict = /stale/.test(error.code);\n  respond(conflict ? 409 : 400, {});\n};\n'),
    expect: [/in apps\/local-host\/src\/status6\.ts 0 → 2 \(line 4: 409; line 4: 400\)/] },
  { name: "a table of statuses keyed by a code", mutate: () => put("apps/local-host/src/status7.ts", 'export const STATUS = { "alpha.gone": 404, "alpha.busy": 409 };\n'), expect: [/in apps\/local-host\/src\/status7\.ts 0 → 2/] },
  { name: "a status in an object property chosen by an instanceof test", mutate: () => put("apps/local-host/src/status8.ts", 'declare class Gone extends Error {}\nexport const f = (error: unknown) => ({ status: error instanceof Gone ? 404 : 500, ok: false });\n'), expect: [/in apps\/local-host\/src\/status8\.ts 0 → 2/] },
  { name: "a status chosen by an error test in a package that is not the SDK", mutate: () => put("packages/plugin-runtime/src/errors.ts", 'export const actionHttpStatus = (error: { code?: string }) => (error.code === "x.y" ? 409 : 400);\n'), expect: [/in packages\/plugin-runtime\/src\/errors\.ts 0 → 2/] },
  { name: "one more decision in a file that already has some", mutate: () => append("modules/alpha/src/legacy.ts", 'export const second = (error: { code?: string }) => (error.code === "alpha.busy" ? 409 : 500);\n'), expect: [/in modules\/alpha\/src\/legacy\.ts 2 → 4/] },

  // ---- errorCodeOwner ---------------------------------------------------------------------------------------------------------
  { name: "a module raises another owner's code", launder: true, mutate: () => put("modules/alpha/src/owner1.ts", `${IMPORT_ACTION}export const x = () => new ActionError("beta.not_found", "没有");\n`),
    expect: [/error codes that do not start with their owner's name in modules\/alpha\/src\/owner1\.ts 0 → 1 \(line 2: "beta\.not_found" in alpha's file\)/] },
  { name: "a plugin raises another plugin's code", mutate: () => put("plugins/native/one/src/owner2.ts", `${IMPORT_ACTION.replace("../../../", "../../../../")}export const x = () => new ActionError("two.invalid", "无效");\n`),
    expect: [/in plugins\/native\/one\/src\/owner2\.ts 0 → 1 \(line 2: "two\.invalid" in one's file\)/] },
  { name: "a Host file raises a plugin's code", mutate: () => put("apps/local-host/src/owner3.ts", `${IMPORT_ACTION}export const x = () => new ActionError("jelly.invalid", "无效");\n`),
    expect: [/in apps\/local-host\/src\/owner3\.ts 0 → 1 \(line 2: "jelly\.invalid" in host's file\)/] },
  { name: "a file nobody owns raises a code of its own", mutate: () => put("tooling/other/src/owner4.ts", `${IMPORT_ACTION.replace("../../../", "../../../../")}export const x = () => new ActionError("other.invalid", "无效");\n`),
    expect: [/in tooling\/other\/src\/owner4\.ts 0 → 1 \(line 2: "other\.invalid" in a file nobody owns\)/] },
  { name: "an actions.* code that has no row in the platform table", mutate: () => put("modules/alpha/src/owner5.ts", `${IMPORT_ACTION}export const x = () => new ActionError("actions.made_up", "编的");\n`), expect: [/in modules\/alpha\/src\/owner5\.ts 0 → 1 \(line 2: "actions\.made_up"/] },
  { name: "an old-style snake code is not its owner's name", mutate: () => put("modules/alpha/src/owner6.ts", `${IMPORT_ALPHA}export const x = () => new AlphaError("alpha_not_found", "没有");\n`),
    expect: [/error codes that do not start with their owner's name in modules\/alpha\/src\/owner6\.ts 0 → 1 \(line 2: "alpha_not_found"/, /error codes that are not lower-case words joined by dots in modules\/alpha\/src\/owner6\.ts 0 → 1/] },
  { name: "a plugin directory with a hyphen is owned under its underscore name, and a Host file with an owner's glob under that owner", mutate: () => {
    put("plugins/native/text-stats/src/owner7.ts", `${IMPORT_ACTION.replace("../../../", "../../../../")}export const x = () => new ActionError("text.invalid", "无效");\n`);
    put("apps/local-host/src/beta-owner7.ts", `${IMPORT_ACTION}export const x = () => new ActionError("host.invalid", "无效");\n`);
  }, expect: [/in plugins\/native\/text-stats\/src\/owner7\.ts 0 → 1 \(line 2: "text\.invalid" in text_stats's file\)/, /in apps\/local-host\/src\/beta-owner7\.ts 0 → 1 \(line 2: "host\.invalid" in beta's file\)/] },
  { name: "another foreign code in a file that already has one", mutate: () => append("modules/alpha/src/legacy.ts", 'export const foreign = () => new AlphaError("beta.refused", "拒绝");\n'), expect: [/error codes that do not start with their owner's name in modules\/alpha\/src\/legacy\.ts 1 → 2/] },

  // ---- the table's own rules (no baseline: they fail whatever the merge-base says) -----------------------------------------------
  { name: "a table that is not JSON", mutate: () => put(TABLE, "{ not json"), expect: [/error owner table: tooling\/gates\/error-owners\.json is not valid JSON/] },
  { name: "an owner without a reason", mutate: () => put(TABLE, tableText({ owners: owners({ gamma: { paths: ["modules/alpha/src/errors.ts"], reason: "short" } }) })), expect: [/error owner table: .*gamma: "reason" needs at least 20 characters/] },
  { name: "a path that matches no tracked file", mutate: () => put(TABLE, tableText({ owners: owners({ gamma: { paths: ["modules/gone/"], reason: REASON } }) })), expect: [/gamma: modules\/gone\/ matches no tracked file/] },
  { name: "a path listed under two owners", mutate: () => put(TABLE, tableText({ owners: owners({ gamma: { paths: ["modules/alpha/"], reason: REASON } }) })), expect: [/modules\/alpha\/ is under both "alpha" and "gamma"/] },
  { name: "an owner named actions", mutate: () => put(TABLE, tableText({ owners: owners({ actions: { paths: ["modules/alpha/src/errors.ts"], reason: REASON } }) })), expect: [/actions: "actions" is the platform's prefix/] },
  { name: "an owner name that is not one lower-case word", mutate: () => put(TABLE, tableText({ owners: owners({ "Bad-Name": { paths: ["modules/alpha/src/errors.ts"], reason: REASON } }) })), expect: [/Bad-Name: an owner's name is one lower-case word/] },
  { name: "two owners whose paths tie on one file", mutate: () => {
    put("modules/shared/src/ab.ts", "export const x = 1;\n");
    put(TABLE, tableText({ owners: owners({ gamma: { paths: ["modules/shared/src/a*.ts"], reason: REASON }, delta: { paths: ["modules/shared/src/*b.ts"], reason: REASON } }) }));
  }, expect: [/modules\/shared\/src\/ab\.ts is claimed by "gamma" and "delta" with equally specific paths/] },
  { name: "a row in the platform table whose prefix is not a platform prefix", mutate: () => put(KINDS, read(KINDS).replace('"placement.same_location": "invalid",', '"placement.same_location": "invalid", "alpha.not_found": "not_found",')),
    expect: [/ACTION_ERROR_KINDS has a row for "alpha\.not_found", whose prefix "alpha" is not a platform prefix/] },
  { name: "a platform prefix with no row", mutate: () => put(TABLE, tableText({ platform: { prefixes: ["actions", "placement", "files"], reason: REASON } })), expect: [/platform prefix "files" has no row in ACTION_ERROR_KINDS/] },
  { name: "a table with a section the gate does not know", mutate: () => put(TABLE, tableText({ exceptions: {} })), expect: [/unknown section "exceptions"/] },

  // ---- the table only gets stricter (against the merge-base's table) -------------------------------------------------------------
  { name: "a file that had an owner is given another one", launder: true, mutate: () => put(TABLE, tableText({ owners: owners({ gamma: { paths: ["modules/alpha/src/service.ts"], reason: REASON } }) })),
    expect: [/error owner table: modules\/alpha\/src\/service\.ts was the alpha owner's at the merge-base and is the gamma owner's now/] },
  { name: "a directory handed from one owner to another", mutate: () => put(TABLE, tableText({ owners: { ...owners(), alpha: { paths: ["modules/beta/"], reason: REASON }, beta: { paths: ["modules/alpha/", "apps/local-host/src/beta-*"], reason: REASON } } })),
    expect: [/error owner table: modules\/alpha\/src\/service\.ts was the alpha owner's at the merge-base and is the beta owner's now/] },
  // Taking an owner away is as loose as giving another: the counts are measured with the working tree's table on both sides, so a file that
  // is nobody's now counts every code of its own on both sides and no number grows. Only the comparison of the tables sees it.
  { name: "an owner's entry is taken out of the table, so its files that are still there have none", launder: true, mutate: () => put(TABLE, tableText({ owners: ownersExcept("beta") })),
    expect: [/error owner table: modules\/beta\/src\/index\.ts was the beta owner's at the merge-base and has no owner now/, /error owner table: apps\/local-host\/src\/beta-edge\.ts was the beta owner's at the merge-base and is the host owner's now/,
      /; an owner is fixed once it is given, and taking it away \(an entry removed, a path narrowed\) is as loose as giving another/],
    absent: [/error codes that do not start with their owner's name in modules\/beta\/src\/index\.ts/] },
  { name: "a path is narrowed out of an owner's entry, so the files it matched have none", mutate: () => put(TABLE, tableText({ owners: owners({ alpha: { paths: ["modules/alpha/src/errors.ts"], reason: REASON } }) })),
    expect: [/error owner table: modules\/alpha\/src\/service\.ts was the alpha owner's at the merge-base and has no owner now/, /error owner table: modules\/alpha\/src\/legacy\.ts was the alpha owner's at the merge-base and has no owner now/],
    absent: [/error owner table: modules\/alpha\/src\/errors\.ts/, /error codes that do not start with their owner's name in modules\/alpha\/src\/service\.ts/] },
  { name: "the glob of an entry is taken out, so a Host file falls back to the Host's directory", mutate: () => put(TABLE, tableText({ owners: owners({ beta: { paths: ["modules/beta/"], reason: REASON } }) })),
    expect: [/error owner table: apps\/local-host\/src\/beta-edge\.ts was the beta owner's at the merge-base and is the host owner's now/], absent: [/modules\/beta\/src\/index\.ts/] },
  { name: "a new platform prefix", mutate: () => {
    put(TABLE, tableText({ platform: { prefixes: ["actions", "placement", "alpha"], reason: REASON } }));
    put(KINDS, read(KINDS).replace('"placement.same_location": "invalid",', '"placement.same_location": "invalid", "alpha.not_found": "not_found",'));
  }, expect: [/error owner table: "alpha" is a platform prefix now, so anyone may raise codes that start with it/] },
];

for (const scenario of violations) {
  test(`${scenario.name} fails against the merge-base${scenario.launder ? ", and --update does not hide it" : ""}`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    for (const pattern of scenario.expect) assert.match(caught.out, pattern);
    for (const pattern of scenario.absent ?? []) assert.doesNotMatch(caught.out, pattern);
    if (!scenario.launder) return;

    // The laundering move: lift the committed baseline to the head's numbers in the same branch.
    const refused = gate("--update", "--base", "main");
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /Baseline not written/);
    assert.equal(git("status", "--porcelain"), "", "a refused --update leaves baseline.json alone");
    assert.equal(gate("--update").code, 0);
    commit("update baseline");
    assert.equal(gate().code, 0, "the local check against the committed baseline is satisfied by the rewrite");
    const still = gate("--base", "main");
    assert.equal(still.code, 1, still.out);
    for (const pattern of scenario.expect) assert.match(still.out, pattern);
  });
}

test("what the rules must not flag stays green against the merge-base", () => {
  branch("allowed", () => {
    put("modules/alpha/src/fine.ts", lines(
      IMPORT_ACTION.trimEnd(), IMPORT_ALPHA.trimEnd(),
      "declare const context: { error(code: string, message: string, details?: object): Error };",
      "",
      "declare const logger: { error(code: string, message: string): void };",
      // Codes that are right: the owner's name, a second word after it, a platform code, a protocol platform code.
      'export const a = [new AlphaError("alpha.not_found", "x"), new ActionError("alpha.family.reason", "x"), new ActionError("actions.missing", "x"), new ActionError("placement.same_location", "x")];',
      'export const b = context.error("alpha.conflict", "有冲突", { n: 1 });',
      // Not codes: sentences, a message in the message slot, a value that is not a literal, a log call, a factory with one argument.
      'export const c = [new Error("Bad_Code is a sentence."), new MessageFirstError("Looks_Like_Code", "alpha.ok")];',
      "export const d = (code: string, cause: string) => [new AlphaError(code, \"x\"), new AlphaError(`alpha.${cause}`, \"x\"), new Error(code)];",
      'export const e = () => { logger.error("not.a.Code", "log line"); console.error("Also.Not", "log"); };',
      'export const f = () => context.error("Not a code, a sentence", "x");',
      'export const g = (error: Error) => context.error("lonely");'));
    put("modules/alpha/src/errors.ts", read("modules/alpha/src/errors.ts") + "export class HelperThing { error = 1 }\nexport class Widget extends Base {}\ndeclare class Base {}\n");
    put("modules/alpha/src/errors.test.ts", "export class TestError extends Error {}\nexport const x = new Error('x');\nexport const s = (e: { code: string }) => e.code === 'x' ? 404 : 400;\n");
    put("modules/alpha/src/fixtures/not-here.d.ts", "export declare class DeclaredError extends Error {}\n");
    put("plugins/native/one/src/ok.ts", lines(IMPORT_ACTION.replace("../../../", "../../../../").trimEnd(), 'export const ok = new ActionError("one.invalid", "x");'));
    put("modules/beta/src/ok.ts", lines(IMPORT_ACTION.replace("../../../", "../../../../").trimEnd(), 'export const ok = new ActionError("beta.invalid", "x");'));
    put("apps/local-host/src/beta-ok.ts", lines(IMPORT_ACTION.trimEnd(), 'export const ok = new ActionError("beta.fine", "x");'));
    put("packages/plugin-sdk/src/errors.ts", read("packages/plugin-sdk/src/errors.ts") + 'export const more = (error: { code?: string }) => (error.code === "x.z" ? 404 : 400);\n');
    put("packages/plugin-sdk/src/index.ts", lines(IMPORT_ACTION.replace("../../../", "../../../").trimEnd(), 'export const sdk = new ActionError("sdk.invalid", "x");'));
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /\d+ error subclasses, \d+ badly shaped error codes, \d+ error status decisions, \d+ error codes without their owner's name, \d+ error owners/);
  assert.doesNotMatch(run.out, /errorOwnerTable|Lower than/, "the table is not a number that can fall, and nothing here fell");
});

test("changes that shrink or only move things pass against the merge-base, and --update lowers the baseline", () => {
  branch("tidy", () => {
    put("modules/alpha/src/legacy.ts", lines(
      'import { AlphaError } from "./errors.js";',
      'export const legacy = () => new AlphaError("alpha.legacy", "旧");',
      'export const statusOf = (error: { code?: string }) => ({ ok: error.code === "alpha.gone" });'));
    // A file that moves keeps its record, and moving it to the other owner's directory is for the counts to judge, not the table.
    mkdirSync(path.join(repo, "modules/alpha/src/moved"), { recursive: true });
    git("mv", "modules/alpha/src/service.ts", "modules/alpha/src/moved/service.ts");
    put("modules/alpha/src/moved/service.ts", read("modules/alpha/src/moved/service.ts").replaceAll('"./errors.js"', '"../errors.js"').replace("../../../packages", "../../../../packages"));
    put(TABLE, tableText({ owners: owners({ gamma: { paths: ["tooling/other/"], reason: REASON } }) }));
    put("tooling/other/src/ok.ts", lines(IMPORT_ACTION.replace("../../../", "../../../../").trimEnd(), 'export const ok = new ActionError("gamma.invalid", "x");')); // a new owner for new files
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /Lower than the merge-base: .*errorSubclasses.*errorCodeShape.*errorStatusDecisions.*errorCodeOwner/);
  assert.equal(gate("--update", "--base", "main").code, 0, "lowering the baseline with the merge-base given is accepted");
});

test("an entry that leaves with its files, and a file that moves out of its owner's reach, are not a loosening of the table", () => {
  branch("leaves", () => {
    // beta has no file left, so its entry goes with them (a path that matches no file would have to go anyway).
    git("rm", "-q", "modules/beta/src/index.ts", "apps/local-host/src/beta-edge.ts");
    put(TABLE, tableText({ owners: ownersExcept("beta") }));
    // A file that moves to a place nobody owns is judged by its own counts (it has no code of its own here), not by the comparison of the tables.
    mkdirSync(path.join(repo, "tooling/other"), { recursive: true });
    git("mv", "modules/alpha/src/errors.ts", "tooling/other/errors.ts");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.doesNotMatch(run.out, /error owner table/);
  const report = JSON.parse(gate("--report", "--json", "--base", "main").out);
  assert.ok(report.head.errorOwnerTable.assignment.unowned.includes("tooling/other/errors.ts"), "the moved file is nobody's now");
  assert.equal(report.head.errorOwnerTable.assignment.files["modules/alpha/src/errors.ts"], undefined);
  assert.equal(report.base.errorOwnerTable.assignment.files["modules/alpha/src/errors.ts"], "alpha");
});

test("giving a file that nobody owned an owner of its own changes no number: the table is the same on both sides of the count", () => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", "stray-base");
  put("tooling/other/src/stray.ts", `${IMPORT_ACTION.replace("../../../", "../../../../")}export const stray = () => new ActionError("other.stray", "无主");\n`);
  commit("a file nobody owns, with a code of its own");
  git("checkout", "-q", "-B", "stray-head");
  put(TABLE, tableText({ owners: owners({ other: { paths: ["tooling/other/"], reason: REASON } }) }));
  commit("give it an owner");
  const run = gate("--base", "stray-base");
  assert.equal(run.code, 0, run.out);
  assert.doesNotMatch(run.out, /Lower than the merge-base: .*errorCodeOwner/, "the count did not fall: the old side is measured with the new table as well");
  const report = JSON.parse(gate("--report", "--json", "--base", "stray-base").out);
  assert.deepEqual(report.head.errorCodeOwner, report.base.errorCodeOwner);
  assert.deepEqual(report.head.errorCodeOwner, { "modules/alpha/src/legacy.ts": 1 });
});

test("the change that introduces the table passes against a merge-base that does not have it, and from then on it is compared", () => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", "predates");
  git("rm", "-q", TABLE);
  commit("before the table");
  git("checkout", "-q", "-B", "introduces");
  git("checkout", "main", "--", TABLE);
  commit("introduce the table");
  assert.equal(gate("--base", "predates").code, 0, gate("--base", "predates").out);
  put(TABLE, tableText({ owners: owners({ gamma: { paths: ["modules/alpha/src/service.ts"], reason: REASON } }) }));
  commit("reassign");
  const widened = gate("--base", "introduces~1");
  assert.equal(widened.code, 1, widened.out);
  assert.match(widened.out, /modules\/alpha\/src\/service\.ts was the alpha owner's at the merge-base and is the gamma owner's now/);
});

test("a repository without the table counts no owners and has no table problems", () => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  git("checkout", "-q", "-B", "no-table");
  git("rm", "-q", TABLE);
  commit("no table");
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

test("the report prints the four numbers and the table", () => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  const report = JSON.parse(gate("--report", "--json", "--base", "main").out);
  assert.deepEqual(report.head.errorSubclasses, { "modules/alpha/src/errors.ts": 3, "modules/alpha/src/legacy.ts": 1 }, "ActionError in the contracts is the model, not a subclass");
  assert.deepEqual(report.head.errorCodeShape, { "modules/alpha/src/legacy.ts": 1 });
  assert.deepEqual(report.head.errorStatusDecisions, { "modules/alpha/src/legacy.ts": 2 });
  assert.deepEqual(report.head.errorCodeOwner, { "modules/alpha/src/legacy.ts": 1 });
  assert.deepEqual(report.head.errorOwnerTable.problems, []);
  assert.equal(report.head.errorOwnerTable.assignment.files["plugins/native/text-stats/src/index.ts"], "text_stats");
  assert.equal(report.head.errorOwnerTable.assignment.files["apps/local-host/src/beta-edge.ts"], "beta");
  assert.equal(report.head.errorOwnerTable.assignment.files["apps/local-host/src/host.ts"], "host");
  assert.deepEqual(report.head.errorOwnerTable.assignment.prefixes, ["actions", "placement"]);
  assert.deepEqual(report.head.errorOwnerTable.assignment.unowned, ["packages/contracts/src/platform/action-errors.ts"], "the source files nobody owns are listed");
  const text = gate("--report", "--base", "main").out;
  assert.match(text, /Error subclasses: 4 in 2 files/);
  assert.match(text, /Error codes that do not start with their owner's name: 1 in 1 files/);
  assert.match(text, /Error owner table \(tooling\/gates\/error-owners\.json\): 6 owners over \d+ source files \(1 more that nobody owns\), platform prefixes actions, placement/);
});

test("the baseline holds the four counts with their totals, and nothing of the table", () => {
  git("checkout", "-q", "-f", "main");
  git("clean", "-fdq");
  const baseline = JSON.parse(read("tooling/gates/baseline.json"));
  assert.deepEqual([baseline.errorSubclassTotal, baseline.errorCodeShapeTotal, baseline.errorStatusDecisionTotal, baseline.errorCodeOwnerTotal], [4, 1, 2, 1]);
  assert.deepEqual(baseline.errorSubclasses, { "modules/alpha/src/errors.ts": 3, "modules/alpha/src/legacy.ts": 1 });
  assert.deepEqual(baseline.errorCodeShape, { "modules/alpha/src/legacy.ts": 1 });
  assert.deepEqual(baseline.errorStatusDecisions, { "modules/alpha/src/legacy.ts": 2 });
  assert.deepEqual(baseline.errorCodeOwner, { "modules/alpha/src/legacy.ts": 1 });
  assert.deepEqual(Object.keys(baseline).filter((key) => /^error/.test(key)).sort(), ["errorCodeOwner", "errorCodeOwnerTotal", "errorCodeShape", "errorCodeShapeTotal", "errorStatusDecisionTotal", "errorStatusDecisions", "errorSubclassTotal", "errorSubclasses"]);
});

// The table is required of the repository the script belongs to, and only of it: the scratch repositories above have none and are left alone.
// Only running the entry from a copy of the repository layout shows that it asks (a `required: false` in the entry keeps every other case green).
test("the entry run from a copy of the repository layout fails when the owner table is missing and passes when it is there", () => {
  const checkout = fileURLToPath(new URL("..", import.meta.url));
  const own = mkdtempSync(path.join(tmpdir(), "molis-error-gates-own-"));
  const at = (...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args], { cwd: own, encoding: "utf8", stdio: "pipe" });
  try {
    at("init", "-q", "-b", "main");
    cpSync(path.join(checkout, "scripts"), path.join(own, "scripts"), { recursive: true });
    // Two files switch on checks that need the specs of this repository: the layout is the script's own, not the documents'.
    rmSync(path.join(own, "scripts/workspace-packages.mjs")); rmSync(path.join(own, "scripts/gates/README.md"));
    symlinkSync(path.join(checkout, "node_modules"), path.join(own, "node_modules"), "dir");
    writeFileSync(path.join(own, ".gitignore"), "node_modules\n");
    mkdirSync(path.join(own, "tooling/gates/lint"), { recursive: true });
    writeFileSync(path.join(own, "tooling/gates/limits.json"), JSON.stringify({ file: 800, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
    for (const file of ["biome.jsonc", "tooling/gates/lint/no-empty-catch.grit", "tooling/gates/lint/no-double-cast.grit"]) copyFileSync(path.join(checkout, file), path.join(own, file));
    mkdirSync(path.join(own, "packages/a/src"), { recursive: true });
    writeFileSync(path.join(own, "packages/a/src/index.ts"), "export const a = 1;\n");
    at("add", "-A"); at("commit", "-q", "-m", "the layout without an owner table");
    const entry = path.join(own, "scripts/check-health-gates.mjs");
    const run = (...args: string[]) => { const done = spawnSync(process.execPath, [entry, ...args], { cwd: own, encoding: "utf8" }); return { code: done.status, out: `${done.stdout}${done.stderr}` }; };
    assert.equal(run("--update").code, 0, "writing a baseline does not judge");
    const missing = run();
    assert.equal(missing.code, 1, missing.out);
    assert.match(missing.out, /error owner table: tooling\/gates\/error-owners\.json is missing/);
    assert.doesNotMatch(missing.out, /biome\.jsonc is missing/, "the rest of the layout is in order");
    writeFileSync(path.join(own, TABLE), JSON.stringify({ platform: { prefixes: ["actions"], reason: REASON }, owners: {} }, null, 2) + "\n");
    at("add", "-A"); at("commit", "-q", "-m", "with the table");
    assert.equal(run("--update").code, 0);
    const present = run();
    assert.equal(present.code, 0, present.out);
  } finally { rmSync(own, { recursive: true, force: true }); }
});

// ---- the definitions, on this repository and against the contracts ---------------------------------------------------------------
test("the code shape the gate reads is the contracts' ACTION_ERROR_CODE", () => {
  assert.equal(CODE_SHAPE.source, ACTION_ERROR_CODE.source);
  assert.equal(CODE_SHAPE.flags, ACTION_ERROR_CODE.flags);
});

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const repositorySnapshot = () => {
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 1 << 30 }).split("\0").filter(Boolean);
  return { files, read: (file: string) => { try { return readFileSync(path.join(repositoryRoot, file), "utf8"); } catch { return null; } } };
};

test("on this repository the owner table has no problems, and the scan follows the error classes' constructors", () => {
  const snapshot = repositorySnapshot();
  assert.deepEqual(errorOwnerProblems(snapshot, { required: true }), []);
  const { table } = readOwnerTable(snapshot);
  assert.ok(table.owners.length > 20);
  const isSource = (file: string) => /^(apps|horizontal|modules|packages|plugins|server|tooling)\//.test(file) && /\.(ts|mts)$/.test(file) && !file.endsWith(".d.ts") && !/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(file) && !/\.test\.(ts|mts)$/.test(file);
  const found = measureErrors(snapshot, isSource);
  const sites = Object.values(found.sites as Record<string, Array<{ code: string }>>).flat();
  // A floor against a scan that silently reads nothing. The number falls as W3-02 removes error classes and their sites (2,000+ on
  // main 774acaf57, 1,733 after I8); what proves the scan reads the declarations are the known-site checks below.
  assert.ok(sites.length > 1500, `the scan finds the code sites of the error classes (${sites.length})`);
  assert.equal(found.subclasses["packages/contracts/src/platform/action-errors.ts"], undefined, "ActionError, the model's own class, is not counted as a subclass of it");
  // The one class of the repository that took its message first and its code second, FeedDomainError, is gone (W3-02-E); the message-first order is pinned
  // by the mutation case "a bad code in the second argument of a class that takes its message first". What the repository shows live is that the scan reads
  // the codes of the declarations that replaced it.
  const codesIn = (file: string) => (found.sites as Record<string, Array<{ code: string }>>)[file]?.map((site) => site.code) ?? [];
  assert.ok(codesIn("plugins/native/feed/src/contract/feed.ts").includes("feed.item_not_found"), "the codes of feedErrors (defineErrorCodes) are read");
  assert.ok(codesIn("plugins/native/schedule/src/error.ts").includes("schedule.task_invalid"), "the codes of scheduleErrors (defineErrorCodes) are read");
});
