import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { FEED_OUT_RULES_SCHEMA_SQL } from "./out-rules.js";
import { FEED_ITEMS_SCHEMA_SQL } from "./store/items/schema.js";
import { LISTENER_SCHEMA_SQL } from "./store/listener.js";
import { SIGNALS_SCHEMA_SQL } from "./store/signals.js";
import { SOURCES_SCHEMA_SQL } from "./store/sources.js";

/**
 * Feed's tables in each project's library (`databases.project`, PG-020): its out rules, the Feed items, the Sources, the Signals
 * and the Listener Host's runs and deliveries. One declaration, one store: all twelve are Feed's. The platform makes the tables the
 * first time the library opens with Feed and refuses to open it again if its version or shape has changed, stopping only Feed.
 */
export const FEED_PROJECT_DATABASE: PluginDatabaseDeclaration = {
  store_name: "feed",
  version: /* @version database.feed_project_database */ 1,
  schema: [FEED_OUT_RULES_SCHEMA_SQL, FEED_ITEMS_SCHEMA_SQL, SOURCES_SCHEMA_SQL, SIGNALS_SCHEMA_SQL, LISTENER_SCHEMA_SQL].join("\n"),
  read_permission: "storage:private",
  write_permission: "storage:private",
};
