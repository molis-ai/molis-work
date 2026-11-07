import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { countHandlerInputCasts } from "../scripts/gates/handler-input-casts.mjs";

// AIC-20 (specs/action-input-contracts, roadmap decision 29): `as` on an action handler's input, counted per file, may only fall
// while the N22 slices migrate; N22-G deletes this count and this file. The definitions are in scripts/gates/handler-input-casts.mjs.
// The mutations run the real gate on a scratch repository, as tests/health-gates-source-counts.test.ts does: one violation on a
// branch makes `--base main` fail, and `--update` neither hides it nor is accepted when it is given the merge-base.
const script = fileURLToPath(new URL("../scripts/check-health-gates.mjs", import.meta.url));
let repo = "";

const gitAt = (dir: string, ...args: string[]) => execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "user.name=gates", "-c", "user.email=gates@example.invalid", ...args],
  { cwd: dir, encoding: "utf8", stdio: "pipe" });
const git = (...args: string[]) => gitAt(repo, ...args);
const put = (file: string, text: string) => { mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); writeFileSync(path.join(repo, file), text); };
const read = (file: string) => readFileSync(path.join(repo, file), "utf8");
const commit = (message: string) => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", message); };
const gate = (...args: string[]) => {
  const run = spawnSync(process.execPath, [script, "--root", repo, ...args], { encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
};

const counted: Array<[string, string, number]> = [
  ["handle as a property, with an arrow function", "export const a = { handle: (context, input) => run(input as X) };", 1],
  ["handle as a property, with a function expression", "export const a = { handle: function (context, input) { return run(input as X); } };", 1],
  ["handle as a method", "export const a = { async handle(context, input) { const value = input as X; return value; } };", 1],
  ["handle as a method of a class, and as a class field", "export class A { handle(context, input) { return input as X; } }\nexport class B { handle = (context, input) => input as X; }", 2],
  ["handle inside a package's own small define", "const define = (definition, run) => ({ ...definition, handle: (context, input) => run(input as I, context) });", 1],
  ["every cast in one handler, whatever the parameter is called", "export const a = { handle: (context, raw) => { const b = raw as X; const c = (raw as Y).id; return [b, c]; } };", 2],
  ["in parentheses, with a non-null assertion, and the angle-bracket form", "export const a = { handle: (context, input) => [(input) as X, input! as Y, <Z>input] };", 3],
  ["a double cast through unknown is one", "export const a = { handle: (context, input) => input as unknown as X };", 1],
  ["a function wrapped in a cast of its own", "export const a = { handle: ((context, input) => input as X) as Handler };", 1],
  ["the input of a function passed to bindActionHandler", "export const a = bindActionHandler(definition, (input, caller) => run(input as X, caller));", 1],
  ["bindActionHandler as a member call", "export const a = sdk.bindActionHandler(definition, input => input as X);", 1],
  ["the input of a function passed to bindOwnerPluginAction", "export const a = bindOwnerPluginAction(context, action, (_input: unknown) => { const { id } = _input as { id: string }; return id; });", 1],
  ["a nested handler with the same name counts once", "export const a = { handle: (context, input) => ({ handle: (inner, input) => input as X }) };", 1],
  ["a nested handler with another name: each its own", "export const a = { handle: (context, input) => ({ handle: (inner, other) => [input as X, other as Y] }) };", 2],
];
const notCounted: Array<[string, string]> = [
  ["the first parameter of handle (the caller, not the input)", "export const a = { handle: (context, input) => run(context as X, input) };"],
  ["the second parameter of the function given to bindActionHandler (the caller)", "export const a = bindActionHandler(definition, (input, caller) => run(input, caller as X));"],
  ["the definition given to bindOwnerPluginAction", "export const a = bindOwnerPluginAction(context, definition as X, input => input);"],
  ["a nested function that binds the name again", "export const a = { handle: (context, input) => run(input).map(input => input as X) };"],
  ["a nested function that destructures the name again", "export const a = { handle: (context, input) => run(input).map(({ input }) => input as X) };"],
  ["the store layer: a cast in the function the handler calls", "const store = { save(input) { return input as X; } };\nexport const a = { handle: (context, input) => store.save(input) };"],
  ["another function that is not a handler", "export const a = (context, input) => input as X;\nexport const b = register(definition, input => input as X);"],
  ["a cast on a field of the input (not seen: tooling/gates/README.md)", "export const a = bindActionHandler(definition, input => input.kind as Kind);"],
  ["a cast on another variable (not seen: tooling/gates/README.md)", "export const a = { handle: (context, input) => { const raw = input; return raw as X; } };"],
  ["a destructured parameter (not seen: tooling/gates/README.md)", "export const a = { handle: (context, { id }) => id as string };"],
  ["a handler given by name (not seen: tooling/gates/README.md)", "const run = (context, input) => input as X;\nexport const a = { handle: run };"],
  ["the words in a string or a comment", "// handle: (context, input) => input as X\nexport const a = 'handle: (context, input) => input as X';"],
];
for (const [name, text, expected] of counted) {
  test(`AIC-20 definition, counted: ${name}`, () => assert.equal(countHandlerInputCasts("snippet.ts", text), expected));
}
for (const [name, text] of notCounted) {
  test(`AIC-20 definition, not counted: ${name}`, () => assert.equal(countHandlerInputCasts("snippet.ts", text), 0));
}

const ONE_HANDLER = "export const one = { handle: (context: unknown, input: unknown) => input as { id: string } };\n";

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-handler-input-casts-"));
  gitAt(repo, "init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 400, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("plugins/native/alpha/src/actions.ts", ONE_HANDLER);
  put("plugins/native/alpha/src/clean.ts", "export const clean = bindActionHandler(definition, (input) => input);\n");
  put("specs/demo/spec.md", "# Demo\n\n状态：进行中\n");
  gitAt(repo, "add", "-A");
  assert.equal(gate("--update").code, 0);
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

const violations: Array<{ name: string; mutate: () => void; expect: RegExp }> = [
  { name: "a new file with a cast on a handler's input", mutate: () => put("plugins/native/beta/src/actions.ts", ONE_HANDLER),
    expect: /`as` on an action handler's input in plugins\/native\/beta\/src\/actions\.ts 0 → 1/ },
  { name: "one more cast in a file that has one", mutate: () => put("plugins/native/alpha/src/actions.ts", `${read("plugins/native/alpha/src/actions.ts")}export const two = { handle: (context: unknown, input: unknown) => input as { name: string } };\n`),
    expect: /`as` on an action handler's input in plugins\/native\/alpha\/src\/actions\.ts 1 → 2/ },
  { name: "a cast on the input of a function given to bindOwnerPluginAction", mutate: () => put("plugins/native/alpha/src/clean.ts", "export const clean = bindOwnerPluginAction(context, action, (_input: unknown) => _input as { id: string });\n"),
    expect: /`as` on an action handler's input in plugins\/native\/alpha\/src\/clean\.ts 0 → 1/ },
  { name: "a cast on the input of a function given to bindActionHandler, in an example", mutate: () => put("examples/sample/plugin.ts", "export const sample = bindActionHandler(definition, input => input as { id: string });\n"),
    expect: /`as` on an action handler's input in examples\/sample\/plugin\.ts 0 → 1/ },
];
for (const scenario of violations) {
  test(`AIC-20 mutation: ${scenario.name} fails against the merge-base, and --update does not hide it`, () => {
    branch("violation", scenario.mutate);
    const caught = gate("--base", "main");
    assert.equal(caught.code, 1, caught.out);
    assert.match(caught.out, scenario.expect);

    const refused = gate("--update", "--base", "main");
    assert.equal(refused.code, 1, refused.out);
    assert.match(refused.out, /Baseline not written/);
    assert.equal(gate("--update").code, 0);
    commit("update baseline");
    assert.equal(gate().code, 0, "the local check against the rewritten baseline is satisfied");
    const still = gate("--base", "main");
    assert.equal(still.code, 1, still.out);
    assert.match(still.out, scenario.expect);
  });
}

test("AIC-20 mutation: tests are not counted", () => {
  branch("tests", () => {
    put("tests/handler.test.ts", ONE_HANDLER);
    put("tests/fixtures/handler.ts", ONE_HANDLER);
    put("plugins/native/alpha/tests/handler.ts", ONE_HANDLER);
    put("plugins/native/alpha/src/handler.test.ts", ONE_HANDLER);
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.doesNotMatch(run.out, /Lower than/, "nothing went down either");
});

test("AIC-20 mutation: fewer casts pass and --update accepts them; a moved file keeps its record", () => {
  branch("fewer", () => put("plugins/native/alpha/src/actions.ts", "export const one = bindActionHandler(definition, (input) => input);\n"));
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /Lower than the merge-base: handlerInputCasts/);
  assert.equal(gate("--update", "--base", "main").code, 0, "lowering with the merge-base given is accepted");

  branch("moved", () => git("mv", "plugins/native/alpha/src/actions.ts", "plugins/native/alpha/src/moved-actions.ts"));
  const moved = gate("--base", "main");
  assert.equal(moved.code, 0, moved.out);
});

test("AIC-20 the report lists the count per file, next to the merge-base's", () => {
  git("checkout", "-q", "-f", "main");
  const text = gate("--report", "--base", "main").out;
  assert.match(text, /`as` on action handler inputs \(interim, until N22-G\): 1 in 1 files/);
  const json = JSON.parse(gate("--report", "--json", "--base", "main").out);
  assert.deepEqual(json.head.handlerInputCasts, { "plugins/native/alpha/src/actions.ts": 1 });
  assert.deepEqual(json.base.handlerInputCasts, json.head.handlerInputCasts);
});
