/** JSON Schema is preserved at the boundary; providers must not invent output guarantees. */
export type ActionSchema = Readonly<Record<string, unknown>>;
