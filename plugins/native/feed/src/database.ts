import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FEED_OUT_RULES_SCHEMA_SQL } from "./out-rules.js";

/**
 * Feed's own table in each project's library (`databases.project`, PG-020): its out rules. The items, sources and runs it shows
 * are Modules' facts in the library's baseline, not Feed's. The platform makes the table the first time the library opens with
 * Feed and refuses to open it again if its version or shape has changed, stopping only Feed.
 */
export const FEED_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "feed",
  version: 1,
  schema: FEED_OUT_RULES_SCHEMA_SQL,
  read_permission: "storage:private",
  write_permission: "storage:private",
};
