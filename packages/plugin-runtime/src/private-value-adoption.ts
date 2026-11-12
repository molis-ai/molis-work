import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { readPluginRuntimeRecords } from "./repository.js";
import type { PluginRuntimeDatabase } from "./repository.js";

type Adoption = NonNullable<PluginRegistration["private_value_adoption"]>;
/** One private value a plugin's adoption rewrites: its install, key, and exact old and new values. */
export interface PrivateValueChange { readonly install_id: string; readonly key: string; readonly from: string; readonly to: string }
export interface PrivateValueAdoptionPlan { readonly changes: readonly PrivateValueChange[]; readonly refused: readonly string[] }

/**
 * What a built-in plugin's own conversion would do to its private values in one project library (Plugin Runtime owns
 * `plugin_private_values` and the install records; the plugin owns the shapes). Only the exact official install counts: same plugin
 * id and publisher signature, vouched for by the Host. A value the conversion cannot read refuses the project, naming the key.
 */
export function planPrivateValueAdoption(db: Pick<PluginRuntimeDatabase, "prepare">, registration: Pick<PluginRegistration, "manifest" | "private_value_adoption">): PrivateValueAdoptionPlan {
  const adoption: Adoption | undefined = registration.private_value_adoption;
  if (!adoption) return { changes: [], refused: [] };
  const { manifest } = registration, changes: PrivateValueChange[] = [], refused: string[] = [];
  const installs = readPluginRuntimeRecords(db).filter(record => record.plugin_id === manifest.plugin_id && record.publisher_signature === manifest.publisher.signature && record.publisher_trust === "host");
  for (const { install_id } of installs) {
    const rows = db.prepare("SELECT item_key, item_value FROM plugin_private_values WHERE install_id = ? ORDER BY item_key").all(install_id) as { item_key: string; item_value: string }[];
    for (const { item_key: key, item_value: from } of rows) {
      if (!adoption.prefixes.some(prefix => key.startsWith(prefix))) continue;
      try {
        const to = adoption.convert(key, from);
        if (to !== null && to !== from) changes.push({ install_id, key, from, to });
      } catch (error) {
        refused.push(`${manifest.plugin_id} private value ${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return { changes, refused };
}

/** Write a plan's changes, each only over the exact value the plan read; returns how many were written, or throws on any that moved. */
export function applyPrivateValueAdoption(db: Pick<PluginRuntimeDatabase, "prepare">, plan: PrivateValueAdoptionPlan): number {
  const update = db.prepare("UPDATE plugin_private_values SET item_value = ? WHERE install_id = ? AND item_key = ? AND item_value = ?");
  for (const change of plan.changes) {
    const result = update.run(change.to, change.install_id, change.key, change.from) as { changes?: number | bigint };
    if (Number(result.changes) !== 1) throw new Error(`private value ${change.key} changed while it was adopted`);
  }
  return plan.changes.length;
}

/** One private value carried from a retired official install to a platform producer's own values: exact old row, new key, and what it held. */
export interface PrivateValueMove { readonly from_install: string; readonly from_key: string; readonly to_install: string; readonly to_key: string; readonly value: string }

/**
 * Where a retired official plugin's project-level value goes (the Files reading position to the materials service): only rows of the exact
 * official install (plugin id, publisher signature, host trust), only a value `accept` reads, and only when the target does not already
 * hold the same. The source row stays as it was; what it held has no actor, and none is made up for it.
 */
export function planPrivateValueMove(db: Pick<PluginRuntimeDatabase, "prepare">, input: {
  readonly from: { readonly plugin_id: string; readonly signature: string; readonly key: string };
  readonly to: { readonly system_id: string; readonly key: string };
  accept(value: string): boolean;
}): { readonly moves: readonly PrivateValueMove[]; readonly refused: readonly string[] } {
  if (!/^system\.[a-z][a-z0-9_.-]*$/u.test(input.to.system_id)) throw new Error("a value moves only to a platform producer");
  const installs = readPluginRuntimeRecords(db).filter(record => record.plugin_id === input.from.plugin_id && record.publisher_signature === input.from.signature && record.publisher_trust === "host");
  const read = db.prepare("SELECT item_value FROM plugin_private_values WHERE install_id = ? AND item_key = ?");
  const moves: PrivateValueMove[] = [];
  for (const { install_id } of installs) {
    const value = (read.get(install_id, input.from.key) as { item_value: string } | undefined)?.item_value;
    if (value === undefined || !input.accept(value)) continue;
    if ((read.get(input.to.system_id, input.to.key) as { item_value: string } | undefined)?.item_value === value) continue;
    moves.push({ from_install: install_id, from_key: input.from.key, to_install: input.to.system_id, to_key: input.to.key, value });
  }
  // A project has one official install; two would be two preferences for one place, and neither is the project's.
  if (moves.length > 1) return { moves: [], refused: [`${input.from.plugin_id} private value ${input.from.key}: ${moves.length} official installs hold one`] };
  return { moves, refused: [] };
}

/** Write planned moves, each only while its source still holds the value planned; returns how many were written. */
export function applyPrivateValueMove(db: Pick<PluginRuntimeDatabase, "prepare">, moves: readonly PrivateValueMove[]): number {
  const write = db.prepare(`INSERT INTO plugin_private_values (install_id, item_key, item_value)
    SELECT ?, ?, item_value FROM plugin_private_values WHERE install_id = ? AND item_key = ? AND item_value = ?
    ON CONFLICT (install_id, item_key) DO UPDATE SET item_value = excluded.item_value`);
  for (const move of moves) {
    const result = write.run(move.to_install, move.to_key, move.from_install, move.from_key, move.value) as { changes?: number | bigint };
    if (Number(result.changes) !== 1) throw new Error(`private value ${move.from_key} changed while it was moved`);
  }
  return moves.length;
}
