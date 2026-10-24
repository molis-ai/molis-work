import { GOALS_JOURNAL_NAMESPACE } from "@molis-ai/molis-work-contracts/modules/goals";

/**
 * The statements that take a library this build made back to what a build before the namespace (Goals S9-2) left: Goals' event
 * types, object types, idempotency operation names and ledger keys without their prefix, and Goals' store recorded as version 1.
 * They are the inverse of `scripts/maintenance/goals-namespace-prefix.mjs` on a library made here, for rehearsals in one-off
 * directories only; the SQL runs on either SQLite binding.
 */
const NS = GOALS_JOURNAL_NAMESPACE;
const cut = NS.length + 1;
const prefixed = (column: string) => `substr(${column}, 1, ${NS.length}) = '${NS}'`;

export const UNPREFIX_GOALS_NAMES_SQL = [
  `UPDATE events SET type = substr(type, ${cut}), object_type = substr(object_type, ${cut}) WHERE ${prefixed("type")} AND ${prefixed("object_type")}`,
  `UPDATE idempotency_records SET operation = substr(operation, ${cut}) WHERE ${prefixed("operation")}`,
  `UPDATE context_edges SET edge_key = substr(edge_key, ${cut}) WHERE ${prefixed("edge_key")}`,
  `UPDATE input_bindings SET source_edge_key = substr(source_edge_key, ${cut}) WHERE ${prefixed("source_edge_key")}`,
  `UPDATE plugin_project_databases SET version = 1 WHERE plugin_id = '${NS.slice(0, -1)}'`,
].join(";\n");
