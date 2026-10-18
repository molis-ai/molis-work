import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabaseDeclaration, PluginDefinition, PluginFilesDeclaration, PluginImageGenerationDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createImagesActionHandlers } from "./actions.js";
import { imagesManifest } from "./manifest.js";
import { imagesRoutes } from "./routes.js";
import { ImagesService } from "./service.js";
import { IMAGES_STORE_BASELINE } from "./store.js";
import { imagesUiContribution } from "./ui.js";

export const IMAGES_DATABASE: PluginDatabaseDeclaration = { store_name: "images", ...IMAGES_STORE_BASELINE,
  read_permission: "storage:private", write_permission: "storage:private" };
export const IMAGES_FILES: PluginFilesDeclaration = { store_name: "images", directory: "assets", max_file_bytes: 20 * 1024 * 1024,
  read_permission: "storage:private", write_permission: "storage:private" };
export const IMAGES_IMAGE_GENERATION: PluginImageGenerationDeclaration = { store_name: "images",
  read_permission: "images:connections:read", write_permission: "images:connections:write", generate_permission: "images:generate" };

export function createImagesPlugin(): PluginDefinition {
  let service: ImagesService | undefined;
  return { manifest: imagesManifest, async start(context) {
    context.requireGrant("storage:private");
    const { database, files, imageGeneration, background } = context.services ?? {};
    if (!database || !files || !imageGeneration || !background) throw new ActionError("actions.unredeemed", "宿主未提供图片运行服务");
    const current = new ImagesService({ database, files, imageGeneration, background });
    service = current;
    let recovering = true;
    const check = () => {
      if (!recovering || service !== current) throw new ActionError("actions.plugin_unavailable", "图片启动恢复已结束");
      context.requireGrant("storage:private");
    };
    try { await current.recover({ beforeEffect: async () => check(), assert_authority_current: check }); }
    catch (error) { current.close(); throw error; }
    finally { recovering = false; }
    return { kind: "app", views: [imagesUiContribution], actions: createImagesActionHandlers({ service: () => current }),
      routes: imagesRoutes(context), onProjectDeleted: projectId => current.cancelProject(projectId) };
  }, async stop() { service?.close(); service = undefined; } };
}
