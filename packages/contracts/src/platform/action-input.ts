import type { ActionDefinition, ActionExecutionContext, ActionHandlerBinding, ActionSchema } from "./actions.js";

/**
 * Connect a definition and its handler. The Kernel has checked the input against the definition's schema before `handle` runs, so the
 * input is taken as its declared type here and a new handler writes no `input as X` of its own. Handlers written earlier keep theirs until
 * the N22 slices migrate them (specs/action-input-contracts §4.3, §8.2).
 */
export function bindActionHandler<I, O>(definition: ActionDefinition<I, O>, run: (input: I, caller: ActionExecutionContext) => O | Promise<O>,
  extra?: Pick<ActionHandlerBinding, "execution" | "availability">): ActionHandlerBinding {
  return { capability_id: definition.capability_id, version: definition.version, ...extra, handle: (caller, input) => run(input as I, caller) };
}

// Action input types, read from a schema written as a literal (specs/action-input-contracts §4.2). Types only: an author installs
// contracts and the SDK and nothing else (§4.1). What cannot be read ($ref, conditions without `type`) stays `unknown`, never `any`.
type Simple<T> = T extends "string" ? string : T extends "integer" | "number" ? number : T extends "boolean" ? boolean
  : T extends "null" ? null : T extends "object" ? Record<string, unknown> : T extends "array" ? unknown[] : unknown;
type Expand<T> = T extends object ? { [K in keyof T]: T[K] } & {} : T;
type Prop<P, R extends readonly string[]> = Expand<{ readonly [K in keyof P & R[number]]: InferActionInput<P[K]> }
  & { readonly [K in Exclude<keyof P, R[number]>]?: InferActionInput<P[K]> }>;
export type InferActionInput<S> =
  S extends { readonly const: infer C } ? C
  : S extends { readonly enum: readonly (infer E)[] } ? E
  : S extends { readonly oneOf: readonly (infer U)[] } ? (U extends unknown ? InferActionInput<U> : never)
  : S extends { readonly anyOf: readonly (infer U)[] } ? (U extends unknown ? InferActionInput<U> : never)
  : S extends { readonly type: readonly (infer T)[] } ? (T extends unknown ? InferActionInput<Omit<S, "type"> & { readonly type: T }> : never)
  : S extends { readonly type: "array"; readonly maxItems: 0 } ? []
  : S extends { readonly type: "array"; readonly items: infer I extends readonly unknown[] } ? (S extends { readonly minItems: infer N extends number } ? OptionalFrom<{ -readonly [K in keyof I]: InferActionInput<I[K]> }, N> : { -readonly [K in keyof I]: InferActionInput<I[K]> })
  : S extends { readonly type: "array"; readonly minItems: infer N extends number; readonly maxItems: infer M extends number; readonly items: infer I } ? (number extends N ? InferActionInput<I>[] : N extends M ? RepeatTuple<InferActionInput<I>, N> : InferActionInput<I>[])
  : S extends { readonly type: "array"; readonly items: infer I } ? InferActionInput<I>[]
  : S extends { readonly type: "object"; readonly properties: infer P } ? Prop<P, S extends { readonly required: infer R extends readonly string[] } ? (string extends R[number] ? readonly [] : R) : readonly []>
  : S extends { readonly type: "object"; readonly additionalProperties: infer A } ? (A extends object ? Readonly<Record<string, InferActionInput<A>>> : Readonly<Record<string, unknown>>)
  : S extends { readonly type: infer T } ? (string extends T ? unknown : Simple<T>)
  : unknown;
type OptionalFrom<T extends readonly unknown[], Min extends number, Head extends unknown[] = []> =
  Head["length"] extends Min ? [...Head, ...Partial<T>] : T extends readonly [infer F, ...infer R] ? OptionalFrom<R, Min, [...Head, F]> : Head;
type RepeatTuple<T, N extends number, Acc extends unknown[] = []> =
  Acc["length"] extends N ? Acc : Acc["length"] extends 8 ? T[] : RepeatTuple<T, N, [...Acc, T]>;

// `inputSchemaFor` holds a handwritten public interface and its schema to one shape (§4.3). A bare `I extends InferActionInput<S>` reports
// read-only arrays and open objects that are not wrong, so the strict direction is computed from the schema's side: the schema, not the
// interface, decides how deep it goes (an interface-driven recursion hits TS2589 on `ArtifactVersionRecord`). Assignability cannot see an
// extra key, so keys are walked separately, both ways, position by position through tuples, stopping at a union branch.
type StrictTarget<T> = unknown extends T ? T
  : string extends keyof T ? (unknown extends T[keyof T] ? object : { readonly [K in keyof T]: StrictTarget<T[K]> })
  : { readonly [K in keyof T]: StrictTarget<T[K]> };
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type DeepExcess<I, T> =
  unknown extends T ? never
  : true extends IsUnion<NonNullable<T>> ? never
  : NonNullable<I> extends readonly unknown[] ? (NonNullable<T> extends readonly unknown[] ? ElementExcess<NonNullable<I>, NonNullable<T>> : never)
  : NonNullable<I> extends object ? (NonNullable<T> extends object
      ? (string extends keyof NonNullable<I> ? never : string extends keyof NonNullable<T> ? (unknown extends NonNullable<T>[string & keyof NonNullable<T>] ? keyof NonNullable<I> : never)
        : Exclude<keyof NonNullable<I>, keyof NonNullable<T>> | { [K in keyof NonNullable<I> & keyof NonNullable<T>]-?: DeepExcess<NonNullable<I>[K], NonNullable<T>[K]> }[keyof NonNullable<I> & keyof NonNullable<T>])
      : never)
  : never;
type ElementExcess<I extends readonly unknown[], T extends readonly unknown[]> = { [K in keyof I]-?: K extends keyof T ? DeepExcess<I[K], T[K]> : never }[number];
type InputMatches<I, S> = [InferActionInput<S>] extends [I]
  ? [I] extends [StrictTarget<InferActionInput<S>>]
    ? [DeepExcess<I, InferActionInput<S>>] extends [never]
      ? [DeepExcess<InferActionInput<S>, I>] extends [never] ? unknown : "schema 有接口没写的键"
      : "接口有 schema 不认识的键"
    : "接口比 schema 宽"
  : "schema 比接口松";
/** A public interface and its schema are two facts, so the compiler holds them together. Returns `ActionSchema`: the literal stays out of `.d.ts`. */
export const inputSchemaFor = <I>() => <const S extends ActionSchema>(schema: S & InputMatches<I, S>): ActionSchema => schema;

type AllKeys<U> = U extends unknown ? keyof U : never;
type ValueOf<U, K extends PropertyKey> = U extends unknown ? (K extends keyof U ? U[K] : never) : never;
type IsRequired<U, K extends PropertyKey> = [U] extends [U extends unknown ? (K extends keyof U ? (Pick<U, K> extends Required<Pick<U, K>> ? U : never) : never) : never] ? true : false;
/**
 * A discriminated union flattened to the one object its flat schema describes, written at the definition so it shows there: keys and field
 * types stay checked, which fields may appear together stays with the handler. Not a union: unchanged, so it cannot loosen another definition.
 */
export type FlatUnion<U> = Expand<{ [K in AllKeys<U> as IsRequired<U, K> extends true ? K : never]: ValueOf<U, K> }
  & { [K in AllKeys<U> as IsRequired<U, K> extends true ? never : K]?: Exclude<ValueOf<U, K>, undefined> }>;
