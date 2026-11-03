import type { PluginOwnerFilesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Shelf's own files under the Home: the catalog, the copies on the shelf and the folders of its jobs. Nothing else is Shelf's to write. */
export const SHELF_OWNER_FILES: PluginOwnerFilesDeclaration = {
  store_name: "shelf",
  entries: [{ name: "catalog.json", kind: "file" }, { name: "files", kind: "directory" }, { name: "jobs", kind: "directory" }],
  read_permission: "shelf:read",
  write_permission: "shelf:write",
};
