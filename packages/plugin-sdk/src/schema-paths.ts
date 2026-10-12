// Where a dotted path, or a field name, is found in an action's input or output schema. The cross-reference checks
// (`action-cross-references.ts`) ask this when a declaration points into a schema: an undo input read from the command's output,
// a job id, a status field, a result object. Only what a schema says outright counts, so a plugin that points into an open object
// (`{ "type": "object" }`) has to describe the field first. Not exported from the package.
//
// Read: `properties`; the branches `allOf`, `anyOf` and `oneOf` (a name found in any branch counts); and a `$ref` that points inside
// the same schema (`#`, `#/definitions/…`, `#/$defs/…`). Nothing else: `patternProperties`, `additionalProperties`, `if`/`then`,
// and a `$ref` to another document are not followed.

type Schema = Record<string, unknown>;

/** A schema that applies at one level of a value, and whether it applies to every value (not just to one branch of an `anyOf`). */
interface Level { readonly schema: Schema; readonly always: boolean }

const BRANCHES = ["allOf", "anyOf", "oneOf"] as const;

/** Whether `path` (names joined by dots) leads to a property the schema declares. A missing schema declares nothing. */
export function schemaPathExists(schema: unknown, path: string): boolean {
  return isSchema(schema) && path.length > 0 && reaches(schema, schema, path.split("."));
}

/** The names a schema declares at its top level, and the ones it requires of every value (`anyOf`/`oneOf` require nothing). */
export function schemaFields(schema: unknown): { properties: string[]; required: string[] } {
  const levels = isSchema(schema) ? [...levelsOf(schema, schema, new Set(), true)] : [];
  return {
    properties: [...new Set(levels.flatMap(level => isSchema(level.schema.properties) ? Object.keys(level.schema.properties) : []))],
    required: [...new Set(levels.filter(level => level.always).flatMap(level => strings(level.schema.required)))],
  };
}

function reaches(root: Schema, schema: Schema, segments: readonly string[]): boolean {
  const [name, ...rest] = segments;
  return [...levelsOf(root, schema, new Set(), true)].some(({ schema: level }) => {
    if (!isSchema(level.properties) || !Object.hasOwn(level.properties, name!)) return false;
    const next = level.properties[name!];
    return rest.length === 0 || (isSchema(next) && reaches(root, next, rest));
  });
}

/** The schema and every schema it stands for at the same level: what its `$ref` leads to and its branches. */
function* levelsOf(root: Schema, schema: Schema, seen: Set<Schema>, always: boolean): Generator<Level> {
  if (seen.has(schema)) return;
  seen.add(schema);
  yield { schema, always };
  const target = typeof schema.$ref === "string" ? internalRef(root, schema.$ref) : undefined;
  if (target) yield* levelsOf(root, target, seen, always);
  for (const branch of BRANCHES) {
    const members = Array.isArray(schema[branch]) ? schema[branch] as unknown[] : [];
    for (const member of members) if (isSchema(member)) yield* levelsOf(root, member, seen, always && branch === "allOf");
  }
}

/** The schema a `$ref` such as `#/definitions/note` names inside `root`, or nothing when it names anything else. */
function internalRef(root: Schema, ref: string): Schema | undefined {
  if (ref === "#") return root;
  if (!ref.startsWith("#/")) return undefined;
  let node: unknown = root;
  for (const part of ref.slice(2).split("/")) {
    const name = decodePointer(part);
    if (!isSchema(node) || !Object.hasOwn(node, name)) return undefined;
    node = node[name];
  }
  return isSchema(node) ? node : undefined;
}

function decodePointer(part: string): string {
  try { return decodeURIComponent(part).replaceAll("~1", "/").replaceAll("~0", "~"); }
  catch { return part; }
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isSchema(value: unknown): value is Schema {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
