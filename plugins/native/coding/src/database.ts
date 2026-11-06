import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CODING_SCHEMA_SQL } from "./store.js";

/**
 * Coding's own tables in each project's library (`databases.project`, PG-020): the platform makes them the first time the library
 * opens with Coding and refuses to open them again if their version or shape has changed, stopping only Coding.
 */
export const CODING_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "coding",
  version: 3,
  schema: CODING_SCHEMA_SQL,
  read_permission: "storage:private",
  write_permission: "storage:private",
};
