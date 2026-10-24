/**
 * A plugin's names in the project's shared tables (the key of a ledger edge; the journal's event types and operations, which
 * `plugin-project-journal.ts` names the same way) are stored as `<plugin_id>:<name>`. The plugin passes and reads back the bare
 * `<name>`; it never sees the namespace and cannot pass it. The id is the installation's own, taken from its Manifest when the
 * service is built and never from an input, so one plugin cannot write, claim or read a name that belongs to another (S-66).
 *
 * The separator is a colon because `PLUGIN_ID` has none, so no plugin's namespace can be a prefix of another's; a dot would let
 * `io.molis.work.a` cover the names of `io.molis.work.a.b` (BL-506).
 */
export function pluginNamespace(owner: string): { named(name: string): string; bare(name: string): string; owns(name: string): boolean } {
  if (owner.includes(":")) throw new Error(`插件号 ${owner} 含冒号，不能做命名空间`);
  const prefix = `${owner}:`;
  return Object.freeze({
    named: (name: string) => prefix + name,
    bare: (name: string) => name.slice(prefix.length),
    owns: (name: string) => name.startsWith(prefix),
  });
}
