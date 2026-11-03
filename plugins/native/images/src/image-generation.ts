import type { PluginImageGenerationDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

/** The namespace Images' image connections are bound in and the permissions that read, bind and generate; carried by Images' Manifest (`image_generation`). */
export const IMAGES_IMAGE_GENERATION: PluginImageGenerationDeclaration = { store_name: "images",
  read_permission: "images:connections:read", write_permission: "images:connections:write", generate_permission: "images:generate" };
