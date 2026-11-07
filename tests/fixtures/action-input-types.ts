// specs/action-input-contracts AIC-10: compiled by tests/action-input-types.test.ts, never run. Tests are not type-checked otherwise, so a
// bare `@ts-expect-error` here would prove nothing unless something compiles it, and would accept any error at all. Each rejection instead
// ends with a "rejects" comment naming its words: the test asserts that exact line is refused with those words, and that no other line has an error.
import { bindActionHandler, inputSchemaFor, withActionEffect, type ActionDefinition, type ActionSchema, type FlatUnion, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { arraySchema, createActionDefinition, defineAction, nullableSchema, objectSchema } from "@molis-ai/molis-work-plugin-sdk";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const same = <_T extends true>(): void => undefined;
type Infer<S> = InferActionInput<S>;

/* ---------- InferActionInput ---------- */

// Required, optional, read-only.
same<Equal<Infer<{ readonly type: "object"; readonly properties: { readonly a: { readonly type: "string" }; readonly b: { readonly type: "integer" } }; readonly required: readonly ["a"] }>, { readonly a: string; readonly b?: number }>>();
// `required` that is not a literal makes nothing required, so a helper that lost its literals is reported rather than trusted.
same<Equal<Infer<{ readonly type: "object"; readonly properties: { readonly a: { readonly type: "string" } }; readonly required: string[] }>, { readonly a?: string }>>();
// Scalars.
same<Equal<Infer<{ readonly type: "number" }>, number>>();
same<Equal<Infer<{ readonly type: "boolean" }>, boolean>>();
same<Equal<Infer<{ readonly type: "null" }>, null>>();
// enum, const, oneOf, anyOf, a list of types.
same<Equal<Infer<{ readonly enum: readonly ["a", "b"] }>, "a" | "b">>();
same<Equal<Infer<{ readonly const: "a" }>, "a">>();
same<Equal<Infer<{ readonly oneOf: readonly [{ readonly type: "string" }, { readonly type: "integer" }] }>, string | number>>();
same<Equal<Infer<{ readonly anyOf: readonly [{ readonly type: "string" }, { readonly type: "null" }] }>, string | null>>();
same<Equal<Infer<{ readonly type: readonly ["string", "null"] }>, string | null>>();
// Arrays are mutable: most store signatures take mutable arrays (§4.5).
same<Equal<Infer<{ readonly type: "array"; readonly items: { readonly type: "string" } }>, string[]>>();
same<Equal<Infer<{ readonly type: "array"; readonly minItems: 1; readonly maxItems: 3; readonly items: { readonly type: "string" } }>, string[]>>();
// additionalProperties.
same<Equal<Infer<{ readonly type: "object"; readonly additionalProperties: { readonly type: "integer" } }>, Readonly<Record<string, number>>>>();
same<Equal<Infer<{ readonly type: "object"; readonly additionalProperties: false }>, Readonly<Record<string, unknown>>>>();
// `{ type: "object" }` alone: a field reads as unknown, so using it as a string is an error and it never becomes `any`.
same<Equal<Infer<{ readonly type: "object" }>, Record<string, unknown>>>();
declare const openObject: Infer<{ readonly type: "object" }>;
export const openValue: string = openObject.field; // rejects: Type 'unknown' is not assignable to type 'string'
// The three ways a definition writes a tuple.
same<Equal<Infer<{ readonly type: "array"; readonly maxItems: 0 }>, []>>();
same<Equal<Infer<{ readonly type: "array"; readonly minItems: 2; readonly maxItems: 2; readonly items: readonly [{ readonly type: "string" }, { readonly type: "integer" }] }>, [string, number]>>();
same<Equal<Infer<{ readonly type: "array"; readonly minItems: 1; readonly items: readonly [{ readonly type: "string" }, { readonly type: "integer" }] }>, [string, number?]>>();
same<Equal<Infer<{ readonly type: "array"; readonly minItems: 1; readonly maxItems: 1; readonly items: { readonly type: "string" } }>, [string]>>();
same<Equal<Infer<{ readonly type: "array"; readonly minItems: 3; readonly maxItems: 3; readonly items: { readonly type: "string" } }>, [string, string, string]>>();
// No `minItems`: the run-time check accepts a short tuple, so the type does not promise the elements. `minItems` written: as it says.
same<Equal<Infer<{ readonly type: "array"; readonly items: readonly [{ readonly type: "string" }, { readonly type: "integer" }] }>, [string?, number?]>>();
same<Equal<Infer<{ readonly type: "array"; readonly maxItems: 2; readonly items: readonly [{ readonly type: "string" }, { readonly type: "integer" }] }>, [string?, number?]>>();
same<Equal<Infer<{ readonly type: "array"; readonly minItems: 0; readonly items: readonly [{ readonly type: "string" }, { readonly type: "integer" }] }>, [string?, number?]>>();
same<Equal<Infer<{ readonly type: "array"; readonly minItems: 2; readonly items: readonly [{ readonly type: "string" }, { readonly type: "integer" }] }>, [string, number]>>();
// A fixed length over 8 falls back to an array.
same<Equal<Infer<{ readonly type: "array"; readonly minItems: 9; readonly maxItems: 9; readonly items: { readonly type: "string" } }>, string[]>>();
// What cannot be read stays unknown: $ref, conditions without `type`, properties beside a top-level oneOf, the erased upper bound.
same<Equal<Infer<{ readonly $ref: "#/x" }>, unknown>>();
same<Equal<Infer<{ readonly allOf: readonly [{ readonly type: "string" }] }>, unknown>>();
same<Equal<Infer<ActionSchema>, unknown>>();
same<Equal<Infer<{ readonly properties: { readonly a: { readonly type: "string" } }; readonly oneOf: readonly [{ readonly required: readonly ["a"] }] }>, unknown>>();
// With `type` written, `properties` beside a top-level oneOf or anyOf are read: every keyword at one level must hold, so the fields alone never claim more than the run-time check.
same<Equal<Infer<{ readonly type: "object"; readonly properties: { readonly a: { readonly type: "string" }; readonly b: { readonly type: "string" } }; readonly oneOf: readonly [{ readonly required: readonly ["a"] }, { readonly required: readonly ["b"] }] }>, { readonly a?: string; readonly b?: string }>>();
same<Equal<Infer<{ readonly type: "object"; readonly properties: { readonly a: { readonly type: "string" }; readonly b: { readonly type: "string" } }; readonly anyOf: readonly [{ readonly required: readonly ["a"] }, { readonly required: readonly ["b"] }] }>, { readonly a?: string; readonly b?: string }>>();
// `required` beside them still counts, and what a branch requires does not.
same<Equal<Infer<{ readonly type: "object"; readonly properties: { readonly a: { readonly type: "string" }; readonly r: { readonly type: "integer" } }; readonly required: readonly ["r"]; readonly oneOf: readonly [{ readonly required: readonly ["a"] }] }>, { readonly a?: string; readonly r: number }>>();
// Nested, the way `goals.tree.submit` writes its `payload`.
same<Equal<Infer<{ readonly type: "object"; readonly properties: { readonly payload: { readonly type: "object"; readonly properties: { readonly a: { readonly type: "string" } }; readonly anyOf: readonly [{ readonly required: readonly ["a"] }] } }; readonly required: readonly ["payload"] }>, { readonly payload: { readonly a?: string } }>>();
// A oneOf of whole branches, with no `properties` beside it, is still their union.
same<Equal<Infer<{ readonly oneOf: readonly [{ readonly type: "object"; readonly properties: { readonly a: { readonly type: "string" } }; readonly required: readonly ["a"] }, { readonly type: "null" }] }>, { readonly a: string } | null>>();
// A length is fixed only when both bounds are literals: `maxItems: LIMITS.x` with a plain number says nothing about how many there are.
same<Equal<Infer<{ readonly type: "array"; readonly minItems: 1; readonly maxItems: number; readonly items: { readonly type: "string" } }>, string[]>>();
same<Equal<Infer<{ readonly type: "array"; readonly minItems: number; readonly maxItems: 1; readonly items: { readonly type: "string" } }>, string[]>>();
// The comparison itself can say no: without this, the lines above would prove nothing.
same<Equal<Infer<{ readonly type: "string" }>, number>>(); // rejects: 'false' does not satisfy the constraint 'true'

/* ---------- inputSchemaFor: accepted, no false alarms ---------- */

inputSchemaFor<{ a: string; b?: number }>()({ type: "object", properties: { a: { type: "string" }, b: { type: "integer" } }, required: ["a"], additionalProperties: false });
// Read-only array in the interface, mutable in what is inferred.
inputSchemaFor<{ readonly tags: readonly string[] }>()({ type: "object", properties: { tags: { type: "array", items: { type: "string" } } }, required: ["tags"] });
// An open object on both sides.
interface OpenRecord { readonly payload: Record<string, unknown> }
inputSchemaFor<OpenRecord>()({ type: "object", properties: { payload: { type: "object" } }, required: ["payload"] });
inputSchemaFor<{ readonly payload: object }>()({ type: "object", properties: { payload: { type: "object" } }, required: ["payload"] });
// A union branch: the schema's union is compared as a whole, and key walking stops there.
inputSchemaFor<{ readonly v: { kind: "a"; a: string } | { kind: "b"; b: string } }>()({ type: "object", properties: { v: { oneOf: [{ type: "object", properties: { kind: { const: "a" }, a: { type: "string" } }, required: ["kind", "a"] }, { type: "object", properties: { kind: { const: "b" }, b: { type: "string" } }, required: ["kind", "b"] }] } }, required: ["v"] });
// Tuples, in all three forms, with an interface naming the positions.
inputSchemaFor<[]>()({ type: "array", maxItems: 0 });
inputSchemaFor<[id: string, input: { a: string }]>()({ type: "array", minItems: 2, maxItems: 2, items: [{ type: "string" }, { type: "object", properties: { a: { type: "string" } }, required: ["a"] }], additionalItems: false });
inputSchemaFor<[id: string, input?: { a: string }]>()({ type: "array", minItems: 1, maxItems: 2, items: [{ type: "string" }, { type: "object", properties: { a: { type: "string" } }, required: ["a"] }], additionalItems: false });
inputSchemaFor<[id: string]>()({ type: "array", minItems: 1, maxItems: 1, items: { type: "string" } });
inputSchemaFor<[id?: string, limit?: number]>()({ type: "array", items: [{ type: "string" }, { type: "integer" }] });

/* ---------- inputSchemaFor: refused, by the check that should refuse it ---------- */

// Schema looser than the interface: the schema lets in what the handler cannot take.
inputSchemaFor<{ a: string }>()({ type: "object" }); // rejects: schema 比接口松
inputSchemaFor<{ a: string }>()({ type: "object", properties: { a: { type: "string" } } }); // rejects: schema 比接口松
// A field's type does not match.
inputSchemaFor<{ a: string }>()({ type: "object", properties: { a: { type: "integer" } }, required: ["a"] }); // rejects: schema 比接口松
// `required` lost its literals while the interface has a required field.
declare const widenedRequired: string[];
inputSchemaFor<{ a: string }>()({ type: "object", properties: { a: { type: "string" } }, required: widenedRequired }); // rejects: schema 比接口松
// Interface wider than the schema: a caller writes what the interface allows and is refused at run time.
inputSchemaFor<{ a?: string }>()({ type: "object", properties: { a: { type: "string" } }, required: ["a"] }); // rejects: 接口比 schema 宽
inputSchemaFor<{ a: "x" | "y" }>()({ type: "object", properties: { a: { enum: ["x"] } }, required: ["a"] }); // rejects: 接口比 schema 宽
// Interface keys the schema does not know: at the top, nested, in array elements, in each position of a tuple, optional and required.
inputSchemaFor<{ a: string; extra?: string }>()({ type: "object", properties: { a: { type: "string" } }, required: ["a"] }); // rejects: 接口有 schema 不认识的键
inputSchemaFor<{ a: { b: string; extra?: string } }>()({ type: "object", properties: { a: { type: "object", properties: { b: { type: "string" } }, required: ["b"] } }, required: ["a"] }); // rejects: 接口有 schema 不认识的键
inputSchemaFor<{ a: { b: string; extra?: string }[] }>()({ type: "object", properties: { a: { type: "array", items: { type: "object", properties: { b: { type: "string" } }, required: ["b"] } } }, required: ["a"] }); // rejects: 接口有 schema 不认识的键
inputSchemaFor<[first: { a: string; extra?: string }, second: { b: string }]>()({ type: "array", minItems: 2, maxItems: 2, items: [{ type: "object", properties: { a: { type: "string" } }, required: ["a"] }, { type: "object", properties: { b: { type: "string" } }, required: ["b"] }] }); // rejects: 接口有 schema 不认识的键
inputSchemaFor<[first: { a: string }, second: { b: string; extra?: string }]>()({ type: "array", minItems: 2, maxItems: 2, items: [{ type: "object", properties: { a: { type: "string" } }, required: ["a"] }, { type: "object", properties: { b: { type: "string" } }, required: ["b"] }] }); // rejects: 接口有 schema 不认识的键
inputSchemaFor<[first: string, second?: { b: string; extra?: string }]>()({ type: "array", minItems: 1, maxItems: 2, items: [{ type: "string" }, { type: "object", properties: { b: { type: "string" } }, required: ["b"] }] }); // rejects: 接口有 schema 不认识的键
// A required key the schema does not have is an extra key too; the schema then lets in what the interface cannot take, so that check speaks first.
inputSchemaFor<{ a: string; extra: string }>()({ type: "object", properties: { a: { type: "string" } }, required: ["a"] }); // rejects: schema 比接口松
inputSchemaFor<{ a: { b: string; extra: string } }>()({ type: "object", properties: { a: { type: "object", properties: { b: { type: "string" } }, required: ["b"] } }, required: ["a"] }); // rejects: schema 比接口松
inputSchemaFor<[first: { a: string; extra: string }, second: { b: string }]>()({ type: "array", minItems: 2, maxItems: 2, items: [{ type: "object", properties: { a: { type: "string" } }, required: ["a"] }, { type: "object", properties: { b: { type: "string" } }, required: ["b"] }] }); // rejects: schema 比接口松
// An action that takes nothing: `Record<string, never>` is its right interface, and a named key is noticed either way round.
inputSchemaFor<Record<string, never>>()({ type: "object", properties: {}, additionalProperties: false });
inputSchemaFor<{ extra?: string }>()({ type: "object", properties: {}, additionalProperties: false }); // rejects: 接口有 schema 不认识的键
inputSchemaFor<Record<string, never>>()({ type: "object", properties: { extra: { type: "string" } }, additionalProperties: false }); // rejects: schema 比接口松
// An all-optional interface over a bare `{ type: "object" }`: assignable both ways, so only the key walk sees it.
inputSchemaFor<{ a?: string }>()({ type: "object" }); // rejects: 接口有 schema 不认识的键
// Schema keys the interface does not have: at the top, nested, in array elements, in each position of a tuple.
inputSchemaFor<{ a: string }>()({ type: "object", properties: { a: { type: "string" }, extra: { type: "string" } }, required: ["a"] }); // rejects: schema 有接口没写的键
inputSchemaFor<{ a: { b: string } }>()({ type: "object", properties: { a: { type: "object", properties: { b: { type: "string" }, extra: { type: "string" } }, required: ["b"] } }, required: ["a"] }); // rejects: schema 有接口没写的键
inputSchemaFor<{ a: { b: string }[] }>()({ type: "object", properties: { a: { type: "array", items: { type: "object", properties: { b: { type: "string" }, extra: { type: "string" } }, required: ["b"] } } }, required: ["a"] }); // rejects: schema 有接口没写的键
inputSchemaFor<[first: { a: string }, second: { b: string }]>()({ type: "array", minItems: 2, maxItems: 2, items: [{ type: "object", properties: { a: { type: "string" }, extra: { type: "string" } }, required: ["a"] }, { type: "object", properties: { b: { type: "string" } }, required: ["b"] }] }); // rejects: schema 有接口没写的键
inputSchemaFor<[first: { a: string }, second: { b: string }]>()({ type: "array", minItems: 2, maxItems: 2, items: [{ type: "object", properties: { a: { type: "string" } }, required: ["a"] }, { type: "object", properties: { b: { type: "string" }, extra: { type: "string" } }, required: ["b"] }] }); // rejects: schema 有接口没写的键
// An open interface over a schema that names its keys.
inputSchemaFor<{ a: Record<string, unknown> }>()({ type: "object", properties: { a: { type: "object", properties: { b: { type: "string" } } } }, required: ["a"] }); // rejects: schema 有接口没写的键
// Tuple length or element does not match.
inputSchemaFor<[a: string, b: string]>()({ type: "array", minItems: 1, maxItems: 1, items: { type: "string" } }); // rejects: schema 比接口松
inputSchemaFor<[a: string]>()({ type: "array", minItems: 2, maxItems: 2, items: { type: "string" } }); // rejects: schema 比接口松
inputSchemaFor<[a: string]>()({ type: "array", minItems: 1, maxItems: 1, items: { type: "integer" } }); // rejects: schema 比接口松
// An interface that needs both elements over a schema that does not require them: the schema lets in `[]`.
inputSchemaFor<[id: string, limit: number]>()({ type: "array", items: [{ type: "string" }, { type: "integer" }] }); // rejects: schema 比接口松
inputSchemaFor<[id: string, limit: number]>()({ type: "array", maxItems: 2, items: [{ type: "string" }, { type: "integer" }], additionalItems: false }); // rejects: schema 比接口松
// A schema that lost its literals: there is nothing to compare, and an interface with fields is refused rather than trusted.
declare const erased: ActionSchema;
inputSchemaFor<{ a: string }>()(erased); // rejects: schema 比接口松

// Returns the erased upper bound: no literal reaches a `.d.ts`.
const returned = inputSchemaFor<{ a: string }>()({ type: "object", properties: { a: { type: "string" } }, required: ["a"] });
same<Equal<typeof returned, ActionSchema>>();

/* ---------- FlatUnion ---------- */

type Started = { kind: "new"; title: string; note?: string } | { kind: "resume"; session: string; note?: string };
const flatSchemaFields = { kind: { enum: ["new", "resume"] }, title: { type: "string" }, session: { type: "string" }, note: { type: "string" } } as const;
same<Equal<FlatUnion<Started>, { kind: "new" | "resume"; note?: string; title?: string; session?: string }>>();
inputSchemaFor<FlatUnion<Started>>()({ type: "object", properties: flatSchemaFields, required: ["kind"], additionalProperties: false });
// Not a union: unchanged, so it cannot loosen another definition.
same<Equal<FlatUnion<{ a: string; b?: number }>, { a: string; b?: number }>>();
// A key too many, a field of the wrong type, a discriminant value that does not match, a key required that one branch does not have.
inputSchemaFor<FlatUnion<Started>>()({ type: "object", properties: { ...flatSchemaFields, extra: { type: "string" } }, required: ["kind"] }); // rejects: schema 有接口没写的键
inputSchemaFor<FlatUnion<Started>>()({ type: "object", properties: { ...flatSchemaFields, title: { type: "integer" } }, required: ["kind"] }); // rejects: schema 比接口松
inputSchemaFor<FlatUnion<Started>>()({ type: "object", properties: { ...flatSchemaFields, kind: { enum: ["new"] } }, required: ["kind"] }); // rejects: 接口比 schema 宽
inputSchemaFor<FlatUnion<Started>>()({ type: "object", properties: flatSchemaFields, required: ["kind", "title"] }); // rejects: 接口比 schema 宽
// Flattening is written at the definition: a bare union over a flat schema is refused.
inputSchemaFor<Started>()({ type: "object", properties: flatSchemaFields, required: ["kind"] }); // rejects: schema 比接口松

/* ---------- `properties` beside a top-level oneOf or anyOf (§4.2) ---------- */

// `projects.directories.set_output` is `oneOf` and `goals.tree.submit`'s `payload` is `anyOf`. The union is flattened at the definition, like any flat schema.
const stringField = { type: "string" } as const;
type Target = { expected_revision: number } & ({ workspace_id: string } | { workspace_path: string });
const targetFields = { expected_revision: { type: "integer" }, workspace_id: stringField, workspace_path: stringField } as const;
const onePerTarget = [{ required: ["workspace_id"] }, { required: ["workspace_path"] }] as const;
inputSchemaFor<FlatUnion<Target>>()({ type: "object", properties: targetFields, required: ["expected_revision"], oneOf: onePerTarget, additionalProperties: false });
inputSchemaFor<FlatUnion<Target>>()({ type: "object", properties: targetFields, required: ["expected_revision"], anyOf: onePerTarget, additionalProperties: false });
// The checks do not loosen beside either keyword: too many keys either way round, a field of the wrong type, a key missing from `required`, a key required that a branch does not have.
inputSchemaFor<FlatUnion<Target> & { extra?: string }>()({ type: "object", properties: targetFields, required: ["expected_revision"], oneOf: onePerTarget }); // rejects: 接口有 schema 不认识的键
inputSchemaFor<FlatUnion<Target> & { extra?: string }>()({ type: "object", properties: targetFields, required: ["expected_revision"], anyOf: onePerTarget }); // rejects: 接口有 schema 不认识的键
inputSchemaFor<FlatUnion<Target>>()({ type: "object", properties: { ...targetFields, extra: stringField }, required: ["expected_revision"], oneOf: onePerTarget }); // rejects: schema 有接口没写的键
inputSchemaFor<FlatUnion<Target>>()({ type: "object", properties: { ...targetFields, extra: stringField }, required: ["expected_revision"], anyOf: onePerTarget }); // rejects: schema 有接口没写的键
inputSchemaFor<FlatUnion<Target>>()({ type: "object", properties: { ...targetFields, workspace_id: { type: "integer" } }, required: ["expected_revision"], oneOf: onePerTarget }); // rejects: schema 比接口松
inputSchemaFor<FlatUnion<Target>>()({ type: "object", properties: { ...targetFields, workspace_id: { type: "integer" } }, required: ["expected_revision"], anyOf: onePerTarget }); // rejects: schema 比接口松
inputSchemaFor<FlatUnion<Target>>()({ type: "object", properties: targetFields, oneOf: onePerTarget }); // rejects: schema 比接口松
inputSchemaFor<FlatUnion<Target>>()({ type: "object", properties: targetFields, anyOf: onePerTarget }); // rejects: schema 比接口松
inputSchemaFor<FlatUnion<Target>>()({ type: "object", properties: targetFields, required: ["expected_revision", "workspace_id"], oneOf: onePerTarget }); // rejects: 接口比 schema 宽
inputSchemaFor<FlatUnion<Target>>()({ type: "object", properties: targetFields, required: ["expected_revision", "workspace_id"], anyOf: onePerTarget }); // rejects: 接口比 schema 宽
// A branch's `required` makes nothing required in the type: an interface that promises the field, or a bare union, is refused rather than trusted.
inputSchemaFor<{ expected_revision: number; workspace_id: string; workspace_path?: string }>()({ type: "object", properties: targetFields, required: ["expected_revision"], oneOf: onePerTarget }); // rejects: schema 比接口松
inputSchemaFor<Target>()({ type: "object", properties: targetFields, required: ["expected_revision"], oneOf: onePerTarget }); // rejects: schema 比接口松
inputSchemaFor<Target>()({ type: "object", properties: targetFields, required: ["expected_revision"], anyOf: onePerTarget }); // rejects: schema 比接口松

/* ---------- A limit that is not a literal (§4.2) ---------- */

declare const limit: number;
inputSchemaFor<string[]>()({ type: "array", minItems: 1, maxItems: limit, items: { type: "string" } });
inputSchemaFor<[only: string]>()({ type: "array", minItems: 1, maxItems: limit, items: { type: "string" } }); // rejects: schema 比接口松

/* ---------- bindActionHandler ---------- */

// The version follows the id or closes the argument list, and is required: the factories have no default.
const definition = createActionDefinition<{ readonly id: string }, { readonly ok: boolean }>("fixture.get", "query", { title: "t", description: "d", audiences: ["user"], permissions: [], subject_kinds: [], input_schema: { type: "object" } }, 1);
createActionDefinition("fixture.get", "query", { title: "t", description: "d", audiences: ["user"], permissions: [], subject_kinds: [], input_schema: { type: "object" } }); // rejects: Expected 4 arguments, but got 3
bindActionHandler(definition, input => ({ ok: input.id.length > 0 }));
bindActionHandler(definition, async (input, caller) => ({ ok: input.id === caller.actor_id }), { availability: () => ({ available: true }) });
bindActionHandler(definition, () => ({ ok: true }), { execution: "sync" });
// The handler is held to the definition's input and output.
bindActionHandler(definition, (input: { readonly other: number }) => ({ ok: input.other > 0 })); // rejects: not assignable
bindActionHandler(definition, () => ({ ok: "yes" })); // rejects: not assignable
bindActionHandler(definition, () => ({ ok: true }), { execution: "async" }); // rejects: not assignable
bindActionHandler(definition, () => ({ ok: true }), { capability_id: "fixture.other" }); // rejects: Object literal may only specify known properties
// A definition `withActionEffect` wrapped keeps its types.
bindActionHandler(withActionEffect(definition, "read"), input => ({ ok: input.id.length > 0 }));

/* ---------- The writing a package migrates to (§4.5), held here so the pilot starts from something that compiles ---------- */

const text = { type: "string" } as const;
const define = <O>() => <const S extends ActionSchema>(suffix: string, version: number, input_schema: S) =>
  createActionDefinition<InferActionInput<S>, O>(`fixture.${suffix}`, "query", { title: "t", description: "d", audiences: ["user"], permissions: [], subject_kinds: [], input_schema }, version);
const migrated = define<{ readonly ok: boolean }>()("get", 1, objectSchema({ id: text, note: nullableSchema(text), limit: { type: "integer" } }, ["id", "note"]));
same<Equal<typeof migrated, ActionDefinition<{ readonly id: string; readonly note: string | null; readonly limit?: number }, { readonly ok: boolean }>>>();
bindActionHandler(migrated, input => ({ ok: input.id.length > 0 && input.note !== "" && (input.limit ?? 0) >= 0 }));
bindActionHandler(migrated, input => ({ ok: input.missing })); // rejects: Property 'missing' does not exist
// An object with every field required is the default, and an empty list makes them all optional.
const allRequired = define<unknown>()("all", 1, objectSchema({ id: text, note: text }));
same<Equal<typeof allRequired, ActionDefinition<{ readonly id: string; readonly note: string }, unknown>>>();
const noneRequired = define<unknown>()("none", 1, objectSchema({ id: text }, []));
same<Equal<typeof noneRequired, ActionDefinition<{ readonly id?: string }, unknown>>>();
// An action that takes nothing.
const nothing = define<unknown>()("nothing", 1, objectSchema({}));
same<Equal<typeof nothing, ActionDefinition<{}, unknown>>>();
// The SDK's three helpers keep what they are handed: nested, as arrays, and through a spread the way plugins extend a fragment.
const nested = define<unknown>()("nested", 1, objectSchema({ tags: arraySchema(text), owner: objectSchema({ id: text }), parent: nullableSchema(objectSchema({ id: text })), kind: { enum: ["a", "b"] } }, ["tags", "owner"]));
same<Equal<typeof nested, ActionDefinition<{ readonly tags: string[]; readonly owner: { readonly id: string }; readonly parent?: { readonly id: string } | null; readonly kind?: "a" | "b" }, unknown>>>();
const extended = define<unknown>()("extended", 1, objectSchema({ ids: { ...arraySchema(text), uniqueItems: true } }));
same<Equal<typeof extended, ActionDefinition<{ readonly ids: string[] }, unknown>>>();
// What the helpers build is held to an interface like a schema written out, and each way of being wrong is refused.
inputSchemaFor<{ tags: string[]; note?: string | null }>()(objectSchema({ tags: arraySchema(text), note: nullableSchema(text) }, ["tags"]));
inputSchemaFor<{ a: number }>()(objectSchema({ a: text })); // rejects: schema 比接口松
inputSchemaFor<{ a: string }>()(objectSchema({ a: text }, [])); // rejects: schema 比接口松
inputSchemaFor<{ a?: string }>()(objectSchema({ a: text })); // rejects: 接口比 schema 宽
inputSchemaFor<{ a: string[]; extra?: string }>()(objectSchema({ a: arraySchema(text) }, ["a"])); // rejects: 接口有 schema 不认识的键
inputSchemaFor<{ a: string }>()(objectSchema({ a: text, extra: text }, ["a"])); // rejects: schema 有接口没写的键
inputSchemaFor<{ a: number[] }>()(objectSchema({ a: arraySchema(text) })); // rejects: schema 比接口松
inputSchemaFor<{ a: string }>()(objectSchema({ a: nullableSchema(text) })); // rejects: schema 比接口松
bindActionHandler(nested, input => input.missing); // rejects: Property 'missing' does not exist
// Properties only known at run time: no literal to read, so nothing is required and a field reads as unknown, never as `any`.
declare const runtimeProperties: Record<string, unknown>;
const dynamic = define<unknown>()("dynamic", 1, objectSchema(runtimeProperties));
bindActionHandler(dynamic, input => { const id: string | undefined = input.id; return id; }); // rejects: Type 'unknown' is not assignable
// A fragment that lost its literals gives `unknown`, and using it is an error, never a silent `any`.
const widened = define<unknown>()("widened", 1, { type: "object", properties: { id: { type: "string" } as Record<string, unknown> } });
bindActionHandler(widened, input => { const id: string | undefined = input.id; return id; }); // rejects: Type 'unknown' is not assignable

/* ---------- defineAction ---------- */

const metadata = { title: "t", description: "d", kind: "query", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [] } as const;
// No `Input` written: it comes from the schema.
const inferred = defineAction({ capability_id: "fixture.read", version: 1, operation: "query", action: { ...metadata, input_schema: { type: "object", properties: { id: { type: "string" }, limit: { type: "integer" } }, required: ["id"], additionalProperties: false } } }, (_context, input) => {
  same<Equal<typeof input, { readonly id: string; readonly limit?: number }>>();
  return input.id;
});
same<Equal<typeof inferred.definition, ActionDefinition<{ readonly id: string; readonly limit?: number }, string>>>();
defineAction({ capability_id: "fixture.read", version: 1, operation: "query", action: { ...metadata, input_schema: { type: "object", properties: { id: { type: "string" } } } } }, (_context, input) => input.missing); // rejects: Property 'missing' does not exist
// A definition already typed has an erased schema, and keeps the input it was typed with (and never reads `unknown` from the erased schema).
const typed = defineAction(definition, (_context, input) => {
  same<Equal<typeof input, { readonly id: string }>>();
  return { ok: true };
});
same<Equal<typeof typed.definition, ActionDefinition<{ readonly id: string }, { readonly ok: boolean }>>>();
defineAction(definition, (_context, input) => input.missing); // rejects: Property 'missing' does not exist
