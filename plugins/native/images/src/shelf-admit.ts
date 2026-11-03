import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

/** The id of the Shelf action Images consumes; Images' Manifest names it in `capabilities.consumes`. */
export const SHELF_ADMIT_ID = "shelf.items.admit";

/**
 * Images' view of `shelf.items.admit@2` (PG-111: Shelf's contract lives in Shelf, so Images names the action by its id and keeps only
 * what it needs to ask: a file name, its type and its bytes). Shelf's own definition governs the call: the Host runs the provider's
 * schemas and permissions, and the permissions below are the ones Images asks its user to grant for the save.
 */
export const shelfAdmit: ActionDefinition<{ filename: string; mime: string; bytes_base64: string }, { item: { item_id: string; name: string } }> = {
  capability_id: SHELF_ADMIT_ID, version: 2, operation: "command",
  action: {
    title: "放进 Shelf", description: "把一个文件副本放进置物架", kind: "operation", scope: "home", scheduling: "concurrent",
    audiences: ["user", "workflow", "agent", "mcp"], permissions: ["shelf:read", "shelf:write", "materials:read"], subject_kinds: ["shelf_item"],
    input_schema: { type: "object", properties: { filename: { type: "string" }, mime: { type: "string" }, bytes_base64: { type: "string" } },
      required: ["filename", "mime", "bytes_base64"], additionalProperties: false },
  },
};
