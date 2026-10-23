import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { CHARACTER_ACTION_PERMISSIONS } from "@molis-ai/molis-work-module-characters";
import { HOME_ACTION_PERMISSIONS } from "./home-actions.js";
import { CONNECTOR_ACCOUNT_PERMISSIONS } from "./connector-account-actions.js";
import { CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE } from "./connector-management-actions.js";
import { connectorRecordActions } from "./connector-record-actions.js";
import { NATIVE_CONTENT_PERMISSIONS } from "./content-action-providers.js";
import { EXTERNAL_MCP_PERMISSION } from "./mcp-tool-actions.js";
import { SEARCH_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/search";
import { PLACEMENT_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/placement";
import { MEMORY_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/memory";
import { KNOWLEDGE_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/knowledge";

/**
 * What the person at this computer holds over the Host's own native plugins, read from the actions those
 * manifests declare — a native plugin that declares a new action needs no change here. A plugin the Plugin Runtime
 * assembles is not the Host's own, whatever its `kind`: its actions reach the person only through its running
 * installation's grants (`localWebActionContext`). The Home ones carry `runtime` in the catalog and are left out here;
 * the project ones have no catalog mark yet, and their providers name an installation, which is judged by grants alone.
 */
const NATIVE_OWNER_PERMISSIONS = [...new Set(BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.kind === "native" && !entry.runtime)
  .flatMap(entry => (entry.manifest.actions ?? []).flatMap(definition => definition.action.permissions)))];

/** Host-owned services and the native actions a Host registers outside a manifest (content stores, Characters). */
const HOST_OWNER_PERMISSIONS = [...HOME_ACTION_PERMISSIONS, ...CONNECTOR_ACCOUNT_PERMISSIONS, ...NATIVE_CONTENT_PERMISSIONS,
  ...CHARACTER_ACTION_PERMISSIONS, ...SEARCH_PERMISSIONS, ...KNOWLEDGE_PERMISSIONS, ...PLACEMENT_PERMISSIONS, ...MEMORY_PERMISSIONS,
  "functions:invoke", "functions:manage", EXTERNAL_MCP_PERMISSION, "projects:settings", CONNECTOR_MANAGEMENT_READ, CONNECTOR_MANAGEMENT_WRITE, ...connectorRecordActions.read.action.permissions];

export const LOCAL_OWNER_PERMISSIONS: readonly string[] = [...new Set([...NATIVE_OWNER_PERMISSIONS, ...HOST_OWNER_PERMISSIONS])];
