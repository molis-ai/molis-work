/** A closed action object. Passing an empty required list makes each declared field optional. */
export function objectSchema(properties: Record<string, unknown>, required: readonly string[] = Object.keys(properties)) {
  return { type: "object" as const, properties, required, additionalProperties: false as const };
}

export function arraySchema(items: unknown) {
  return { type: "array" as const, items };
}

export function nullableSchema(schema: unknown) {
  return { anyOf: [schema, { type: "null" }] };
}
