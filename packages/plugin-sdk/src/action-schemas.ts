// Generic only so an action's input type can be read from its schema (specs/action-input-contracts §4.5): the values are what they always were.

/** A closed action object. Passing an empty required list makes each declared field optional. */
export function objectSchema<const P extends Readonly<Record<string, unknown>>, const R extends readonly string[] = readonly (keyof P & string)[]>(properties: P, required?: R) {
  return { type: "object" as const, properties, required: (required ?? Object.keys(properties)) as R, additionalProperties: false as const };
}

export function arraySchema<const I>(items: I) {
  return { type: "array" as const, items };
}

export function nullableSchema<const S>(schema: S) {
  return { anyOf: [schema, { type: "null" as const }] as const };
}
