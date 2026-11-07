import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { bindActionHandler, inputSchemaFor, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { bindActionHandler as sdkBindActionHandler, defineAction, inputSchemaFor as sdkInputSchemaFor } from "@molis-ai/molis-work-plugin-sdk";

const FIXTURE = fileURLToPath(new URL("./fixtures/action-input-types.ts", import.meta.url));
const REJECTS = /\/\/ rejects: (.+)$/u;

/** The errors of one file, compiled the way packages are (strict, NodeNext), against the built `.d.ts` a plugin author would get. */
function compile(file: string): Map<number, string[]> {
  const program = ts.createProgram([file], { noEmit: true, strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, lib: ["lib.es2022.d.ts"], types: ["node"], skipLibCheck: true });
  const errors = new Map<number, string[]>();
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    assert.equal(diagnostic.file?.fileName, file, `an error outside the fixture: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
    const line = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!).line;
    errors.set(line, [...(errors.get(line) ?? []), ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")]);
  }
  return errors;
}

test("AIC-10: the fixture compiles except its marked lines, and each of those is refused for the reason it names", { timeout: 120_000 }, () => {
  const lines = readFileSync(FIXTURE, "utf8").split("\n");
  const errors = compile(FIXTURE);
  const expected = lines.flatMap((text, line) => {
    const reason = REJECTS.exec(text)?.[1];
    return reason ? [{ line, reason }] : [];
  });
  // A rejection that compiles is a let-through; an error on another line means an accepted case is refused (a false alarm, or a typo).
  assert.deepEqual([...errors.keys()].filter(line => !expected.some(item => item.line === line)).map(line => `${line + 1}: ${errors.get(line)!.join(" | ")}`), [], "lines refused that should compile");
  const wrong = expected.filter(({ line, reason }) => !errors.get(line)?.some(message => message.includes(reason)))
    .map(({ line, reason }) => `${line + 1}: wanted "${reason}", got ${JSON.stringify(errors.get(line) ?? "no error")}`);
  assert.deepEqual(wrong, [], "lines that should be refused for the named reason");
  // Every kind the spec's AIC-10 lists stays covered; the fixture cannot quietly shrink to a few rejections.
  const reasons = expected.map(item => item.reason);
  for (const [reason, atLeast] of [["schema 比接口松", 8], ["接口比 schema 宽", 4], ["接口有 schema 不认识的键", 7], ["schema 有接口没写的键", 7]] as const) {
    assert.ok(reasons.filter(item => item === reason).length >= atLeast, `${reason}: at least ${atLeast} cases`);
  }
});

const caller = { actor_id: "actor", project_id: null, audience: "user", permissions: [], beforeEffect: async () => undefined } as ActionExecutionContext;
const definition: ActionDefinition<{ readonly id: string }, string> = { capability_id: "fixture.get", version: 3, operation: "query", action: {
  title: "t", description: "d", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [], input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
} };

test("AIC-10: bindActionHandler hands over the input and caller, names the action, and leaves the handler's own timing alone", async () => {
  const seen: unknown[] = [];
  const binding = bindActionHandler(definition, (input, context) => { seen.push(input, context); return input.id; });
  assert.deepEqual(Object.keys(binding).sort(), ["capability_id", "handle", "version"]);
  assert.equal(binding.capability_id, "fixture.get");
  assert.equal(binding.version, 3);
  const input = { id: "a" };
  // Synchronous stays synchronous: a provider that declares `execution: "sync"` runs inside a transaction, where a promise is refused.
  assert.equal(binding.handle(caller, input), "a");
  assert.equal(seen[0], input);
  assert.equal(seen[1], caller);
  const failing = bindActionHandler(definition, async () => { throw new Error("refused"); });
  await assert.rejects(Promise.resolve(failing.handle(caller, input)), /refused/u);

  const availability = () => ({ available: false, code: "fixture.off", reason: "off" }) as const;
  const extra = bindActionHandler(definition, input => input.id, { execution: "sync", availability });
  assert.equal(extra.execution, "sync");
  assert.equal(extra.availability, availability);
});

test("AIC-10: inputSchemaFor gives back the schema it was handed, so wrapping a definition cannot change its action hash", () => {
  const schema = { type: "object", properties: { a: { type: "string" } }, required: ["a"] } as const;
  assert.equal(inputSchemaFor<{ a: string }>()(schema), schema);
});

test("AIC-10: defineAction built from a schema alone runs the handler with (context, input), and still checks the declaration", () => {
  const action = { title: "t", description: "d", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [] } as const;
  const declared = { capability_id: "fixture.read", version: 1, operation: "query", action: { ...action, input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false } } } as const;
  const { definition: copied, handler } = defineAction(declared, (context, input) => `${context.actor_id}:${input.id}`);
  assert.deepEqual(copied, declared);
  assert.notEqual(copied, declared);
  assert.equal(handler.capability_id, "fixture.read");
  assert.equal(handler.handle(caller, { id: "a" }), "actor:a");
  const typed = defineAction(definition, (_context, input) => input.id);
  assert.equal(typed.handler.handle(caller, { id: "b" }), "b");
  assert.throws(() => defineAction({ ...declared, version: 0 }, () => "never"));
});

test("AIC-11: a plugin author gets the same tools from the SDK, not a second copy", () => {
  assert.equal(sdkBindActionHandler, bindActionHandler);
  assert.equal(sdkInputSchemaFor, inputSchemaFor);
});
