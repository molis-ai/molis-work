import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
// @ts-expect-error the gate modules are plain .mjs
import { countHandlerInputCasts, countHandwrittenInputs } from "../scripts/gates/action-input-counts.mjs";

// AIC-20 (specs/action-input-contracts, roadmap decision 29): `as` on an action handler's input and input types written by hand at a
// definition, counted per file, may only fall while the N22 slices migrate; N22-G deletes both counts and this file. The definitions
// are in scripts/gates/action-input-counts.mjs.
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

// Each case is a set of files; the expected counts are per file, and a file left out counts 0.
const WRAPPER = "export function define<I, O>(id: string) { return createActionDefinition<I, O>(id); }\n";
const inputs: Array<[string, Record<string, string>, Record<string, number>]> = [
  ["createActionDefinition written directly", { "a.ts": "export const a = createActionDefinition<{ id: string }, O>('a'); export const b = createActionDefinition<Input, O>('b');" }, { "a.ts": 2 }],
  ["createActionDefinition as a member call", { "a.ts": "export const a = sdk.createActionDefinition<Input, O>('a');" }, { "a.ts": 1 }],
  ["createActionDefinition imported under another name", { "a.ts": "import { createActionDefinition as make } from 'sdk';\nexport const a = make<Input, O>('a');" }, { "a.ts": 1 }],
  ["a wrapper written as a function", { "a.ts": `${WRAPPER}export const a = define<{ id: string }, O>('a');` }, { "a.ts": 1 }],
  ["a wrapper written as an arrow function", { "a.ts": "const define = <I, O>(id: string) => createActionDefinition<I, O>(id);\nexport const a = define<Input, O>('a');" }, { "a.ts": 1 }],
  ["a curried wrapper that passes on its own type parameter", { "a.ts": "const define = <I, O>() => (id: string) => createActionDefinition<I, O>(id);\nexport const a = define<Input, O>()('a');" }, { "a.ts": 1 }],
  ["a wrapper whose input is not its first type parameter", { "a.ts": "const define = <O, I>(id: string) => createActionDefinition<I, O>(id);\nexport const a = define<O, Input>('a'); export const b = define<O>('b');" }, { "a.ts": 1 }],
  ["a helper that builds the literal itself and declares the return type", { "a.ts": "function define<I, O>(id: string): ActionDefinition<I, O> { return { capability_id: id }; }\nexport const a = define<Input, O>('a');" }, { "a.ts": 1 }],
  ["an exported wrapper through a named import, renamed or not", { "w.ts": WRAPPER, "a.ts": "import { define } from './w.js';\nexport const a = define<Input, O>('a');", "b.ts": "import { define as action } from './barrel.js';\nexport const b = action<Input, O>('b');" }, { "a.ts": 1, "b.ts": 1 }],
  ["a wrapper exported in an export list", { "w.ts": "function make<I, O>(id: string) { return createActionDefinition<I, O>(id); }\nexport { make as define };\n", "a.ts": "import { define } from './w.js';\nexport const a = define<Input, O>('a');" }, { "a.ts": 1 }],
  ["InferActionInput, directly and through a wrapper", { "a.ts": `${WRAPPER}export const a = createActionDefinition<InferActionInput<typeof s>, O>('a'); export const b = define<InferActionInput<typeof s>, O>('b');` }, {}],
  ["no type arguments", { "a.ts": `${WRAPPER}export const a = createActionDefinition('a'); export const b = define('b');` }, {}],
  ["the curried form of the design: define<O>()(…)", { "a.ts": "const define = <O>() => <const S>(id: string, input: S) => createActionDefinition<InferActionInput<S>, O>(id, input);\nexport const a = define<Output>()('a', s);" }, {}],
  ["a function of the same name that passes on nothing", { "a.ts": "function define<I, O>(id: string) { return register<I, O>(id); }\nexport const a = define<Input, O>('a');" }, {}],
  ["the same name as a wrapper in another file, not imported", { "w.ts": WRAPPER, "a.ts": "declare function define<I, O>(id: string): void;\nexport const a = define<Input, O>('a');" }, {}],
  ["a type parameter of the enclosing function is the wrapper, not a hand-written type", { "a.ts": WRAPPER }, {}],
  ["not seen, in tooling/gates/README.md: a namespace import of a wrapper", { "w.ts": WRAPPER, "a.ts": "import * as ns from './w.js';\nexport const a = ns.define<Input, O>('a');" }, {}],
  ["not seen, in tooling/gates/README.md: a wrapper on an object", { "a.ts": "const kit = { define: <I, O>(id: string) => createActionDefinition<I, O>(id) };\nexport const a = kit.define<Input, O>('a');" }, {}],
  ["not seen, in tooling/gates/README.md: a wrapper of a wrapper", { "a.ts": `${WRAPPER}const outer = <I, O>(id: string) => define<I, O>(id);\nexport const a = outer<Input, O>('a');` }, {}],
  ["not seen, in tooling/gates/README.md: a variable annotated ActionDefinition<X>", { "a.ts": "export const a: ActionDefinition<Input, O> = { capability_id: 'a' };" }, {}],
];
for (const [name, files, expected] of inputs) {
  test(`AIC-20 definition, hand-written input: ${name}`, () => assert.deepEqual(countHandwrittenInputs(new Map(Object.entries(files))), expected));
}

const ONE_HANDLER = "export const one = { handle: (context: unknown, input: unknown) => input as { id: string } };\n";

before(() => {
  repo = mkdtempSync(path.join(tmpdir(), "molis-handler-input-casts-"));
  gitAt(repo, "init", "-q", "-b", "main");
  put("tooling/gates/limits.json", JSON.stringify({ file: 400, classLines: 300, classMethods: 25, functionLines: 150, vendoredPrologueSdk: 2 }, null, 2) + "\n");
  put("plugins/native/alpha/src/actions.ts", ONE_HANDLER);
  put("plugins/native/alpha/src/clean.ts", "export const clean = bindActionHandler(definition, (input) => input);\n");
  put("plugins/native/alpha/src/definitions.ts", `${WRAPPER}export const one = define<{ id: string }, void>('one');\n`);
  put("plugins/native/alpha/src/literal.ts", "function define<I, O>(id: string): ActionDefinition<I, O> { return { capability_id: id }; }\nexport const one = define<{ id: string }, void>('one');\n");
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
  { name: "a new file that writes an input type into createActionDefinition", mutate: () => put("plugins/native/beta/src/definitions.ts", "export const one = createActionDefinition<{ id: string }, void>('one');\n"),
    expect: /input types written by hand where an action is defined in plugins\/native\/beta\/src\/definitions\.ts 0 → 1/ },
  { name: "one more hand-written input through a wrapper in a file that has one", mutate: () => put("plugins/native/alpha/src/definitions.ts", `${read("plugins/native/alpha/src/definitions.ts")}export const two = define<{ name: string }, void>('two');\n`),
    expect: /input types written by hand where an action is defined in plugins\/native\/alpha\/src\/definitions\.ts 1 → 2/ },
  { name: "a hand-written input through a wrapper exported from another file", mutate: () => put("plugins/native/alpha/src/importer.ts", "import { define } from './definitions.js';\nexport const three = define<{ name: string }, void>('three');\n"),
    expect: /input types written by hand where an action is defined in plugins\/native\/alpha\/src\/importer\.ts 0 → 1/ },
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
    put("tests/definition.test.ts", "export const one = createActionDefinition<{ id: string }, void>('one');\n");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.doesNotMatch(run.out, /Lower than/, "nothing went down either");
});

test("AIC-20 mutation: what is not hand-written, and a public contract's interface, pass", () => {
  branch("not-handwritten", () => {
    put("plugins/native/beta/src/definitions.ts", "export const one = createActionDefinition<InferActionInput<typeof s>, void>('one');\nexport const two = createActionDefinition('two');\n");
    put("packages/contracts/src/services/thing.ts", "export const one = createActionDefinition<ThingInput, void>('one');\n");
  });
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
});

// #1933 moves the two helpers of modules/judgment-rules from a literal to createActionDefinition: the same hand-written inputs, not new ones.
test("AIC-20 mutation: a helper that moves from its own literal to createActionDefinition keeps its count", () => {
  branch("moves", () => put("plugins/native/alpha/src/literal.ts", `${WRAPPER}export const one = define<{ id: string }, void>('one');\n`));
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.doesNotMatch(run.out, /handwrittenActionInputs/);
});

test("AIC-20 mutation: fewer hand-written inputs pass", () => {
  branch("fewer-inputs", () => put("plugins/native/alpha/src/definitions.ts", `${WRAPPER}export const one = define<InferActionInput<typeof s>, void>('one');\n`));
  const run = gate("--base", "main");
  assert.equal(run.code, 0, run.out);
  assert.match(run.out, /Lower than the merge-base: handwrittenActionInputs/);
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
  assert.match(text, /Action input types written by hand at the definition \(interim, until N22-G\): 2 in 2 files/);
  assert.deepEqual(json.head.handwrittenActionInputs, { "plugins/native/alpha/src/definitions.ts": 1, "plugins/native/alpha/src/literal.ts": 1 });
  assert.deepEqual(json.base.handwrittenActionInputs, json.head.handwrittenActionInputs);
});
