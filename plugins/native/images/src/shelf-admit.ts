import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";

/** The fields of Shelf's input that Images sends: a file copy. */
export interface ShelfAdmitFile { readonly filename: string; readonly mime: string; readonly bytes_base64: string }

/**
 * Images' 放进 Shelf calls Shelf's `shelf.items.admit` by the id it is listed under in the action directory (Images' Manifest consumes it).
 * Shelf owns the definition (its module's contract); this is Images' own declaration of what it uses of it: the id and version it asks for,
 * that it is a command, the permissions the call asks of its caller (which Images' Manifest asks the person for, optionally), and the input
 * fields it sends. The Host resolves the provider and checks the input against Shelf's registered definition, never this one;
 * `tests/plugin-contract-ownership.test.ts` (RAC-854) keeps the two from drifting apart.
 */
export const IMAGES_SHELF_ADMIT: ActionDefinition<ShelfAdmitFile, unknown> = {
  capability_id: "shelf.items.admit", version: 2, operation: "command",
  action: {
    title: "放进 Shelf", description: "把一个文件副本放进置物架", kind: "operation", scope: "home", scheduling: "concurrent", audiences: ["user", "workflow", "agent", "mcp"],
    permissions: ["shelf:read", "shelf:write", "materials:read"], subject_kinds: ["shelf_item"],
    input_schema: {
      type: "object",
      properties: { filename: { type: "string" }, bytes_base64: { type: "string" }, mime: { type: "string" } },
      required: ["filename", "bytes_base64", "mime"], additionalProperties: false,
    },
    output_schema: { type: "object" },
  },
};
