import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createImagesActionHandlers } from "./actions.js";
import { imagesManifest } from "./manifest.js";
import { IMAGES_FILES_READ, IMAGES_FILES_WRITE } from "./owner-files.js";
import { imagesRoutes } from "./routes.js";
import { ImagesService } from "./service.js";
import { imagesUiContribution } from "./ui.js";

export function createImagesPlugin(): PluginDefinition {
  let service: ImagesService | undefined;
  return { manifest: imagesManifest, async start(context) {
    context.requireGrant("storage:private");
    const { database, ownerFiles, imageGeneration, background } = context.services ?? {};
    if (!database || !ownerFiles || !imageGeneration || !background) throw new ActionError("actions.unredeemed", "宿主未提供图片运行服务");
    const current = new ImagesService({ database, files: ownerFiles, imageGeneration, background });
    service = current;
    let recovering = true;
    const control = (...needed: string[]) => {
      const check = () => {
        if (!recovering || service !== current) throw new ActionError("actions.plugin_unavailable", "图片启动恢复已结束");
        for (const permission of needed) context.requireGrant(permission);
      };
      return { beforeEffect: async () => check(), assert_authority_current: check };
    };
    try {
      await current.recover(control("storage:private"));
      // Clearing unreferenced files is tidying that can wait: an installation whose `images:read` was revoked still starts (its routes are refused by their own gate).
      // `images:files:write` is a required grant, so the Runtime has already refused a start without it.
      if (context.grants.includes(IMAGES_FILES_READ)) await current.reclaimAssets(control("storage:private", IMAGES_FILES_WRITE));
    }
    catch (error) { current.close(); throw error; }
    finally { recovering = false; }
    return { kind: "app", views: [imagesUiContribution], actions: createImagesActionHandlers({ service: () => current }),
      routes: imagesRoutes(context) };
  }, async stop() { service?.close(); service = undefined; } };
}
