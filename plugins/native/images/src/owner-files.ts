import type { PluginOwnerFilesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** What lets the actions that make and remove the generated images write them; reading them is `images:read`. */
export const IMAGES_FILES_WRITE = "images:files:write";
export const IMAGES_FILES_READ = "images:read";

/** The generated images, one file each, under `images/assets/` in the Home, beside the plugin's own library. */
export const IMAGES_ASSETS = "assets";

export const IMAGES_OWNER_FILES: PluginOwnerFilesDeclaration = {
  store_name: "images", entries: [{ name: IMAGES_ASSETS, kind: "directory" }], read_permission: IMAGES_FILES_READ, write_permission: IMAGES_FILES_WRITE,
};
