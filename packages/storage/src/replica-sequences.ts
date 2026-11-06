/** Technical sequence conversion. Owner JSON fields named `fields` contain user data, not journal metadata. */
export function mapReplicaSequences(value: unknown, fields: readonly string[], convert: (value: unknown) => string | number): unknown {
  const walk = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (fields.includes(key) && item !== null) return [key, convert(item)];
      if (key === 'fields' || key === 'body') return [key, item];
      if (key.endsWith('_json') && typeof item === 'string') return [key, JSON.stringify(walk(JSON.parse(item)))];
      return [key, walk(item)];
    }));
  };
  return walk(value);
}
