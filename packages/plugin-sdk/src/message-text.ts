/**
 * A message with its `{name}` values filled in, the one way the platform and plugins fill them. `{name|one|other}` is the
 * word that agrees with the number given as `name`: `one` when it is 1, `other` otherwise, so English counts read right
 * ("{count} {count|file|files}" → "1 file", "3 files"). Chinese has no such word and does not write it. A name with no value
 * stays as written, and a value is put in as it is, never read again for names of its own. Self-contained, so a page's
 * script can carry it with `toString()`.
 */
export function fillMessage(text: string, values?: Readonly<Record<string, string | number>>): string {
  if (!values) return text;
  return text.replace(/\{([^{}|]+)(?:\|([^{}|]*)\|([^{}|]*))?\}/g, (all: string, name: string, one?: string, other?: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) return all;
    const value = values[name]!;
    return one === undefined ? String(value) : Number(value) === 1 ? one : other!;
  });
}
