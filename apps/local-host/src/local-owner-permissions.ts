import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { EXPERIMENTS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-experiments";
import { SHELF_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-shelf";
import { WORK_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-work";
import { HOME_ACTION_PERMISSIONS } from "./home-actions.js";
import { HOME_TALK_PERMISSIONS } from "./home-talk-actions.js";
import { CONNECTOR_ACCOUNT_PERMISSIONS } from "./connector-account-actions.js";
import { NATIVE_CONTENT_PERMISSIONS } from "./content-action-providers.js";
import { EXTERNAL_MCP_PERMISSION } from "./mcp-tool-actions.js";
import { SEARCH_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/search";
import { PLACEMENT_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/placement";
import { MEMORY_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/memory";

/**
 * What the person at this computer holds over the Host's own native plugins, read from the actions those
 * manifests declare — a native plugin that declares a new action needs no change here. Runtime plugins are
 * not included: their installed grants are added per call by `localWebActionContext`.
 */
const NATIVE_OWNER_PERMISSIONS = [...new Set(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.kind === "native")
  .flatMap(entry => (entry.manifest.actions ?? []).flatMap(definition => definition.action.permissions)))];

/** Host-owned services and the native actions a Host registers outside a manifest (Experiments, Shelf's personal store, content stores). */
const HOST_OWNER_PERMISSIONS = [...HOME_ACTION_PERMISSIONS, ...HOME_TALK_PERMISSIONS, ...CONNECTOR_ACCOUNT_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS,
  ...EXPERIMENTS_ACTION_PERMISSIONS, ...SHELF_ACTION_PERMISSIONS, ...WORK_ACTION_PERMISSIONS, ...SEARCH_PERMISSIONS, ...PLACEMENT_PERMISSIONS, ...MEMORY_PERMISSIONS,
  "functions:invoke", "functions:manage", EXTERNAL_MCP_PERMISSION, "projects:settings"];

export const LOCAL_OWNER_PERMISSIONS: readonly string[] = [...new Set([...NATIVE_OWNER_PERMISSIONS, ...HOST_OWNER_PERMISSIONS])];
