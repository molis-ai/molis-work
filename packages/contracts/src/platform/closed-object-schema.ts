/**
 * A closed object schema that keeps its literals, so `inputSchemaFor` can read it (specs/action-input-contracts §4.5). Every field is required
 * unless `required` says otherwise. For the contracts' own schemas: no subpath exports it, and authors have the SDK's `objectSchema`.
 */
export const closedObjectSchema = <const P extends Readonly<Record<string, unknown>>, const R extends readonly (keyof P & string)[] = readonly (keyof P & string)[]>(properties: P, required?: R) =>
  ({ type: "object", properties, required: (required ?? Object.keys(properties)) as R, additionalProperties: false } as const);
