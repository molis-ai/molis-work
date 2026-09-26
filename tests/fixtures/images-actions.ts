import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { imagesManifest, createImagesActionHandlers, IMAGES_ACTION_PERMISSIONS, type ImagesService } from "@molis-ai/molis-work-plugin-images";
export function imagesTestClient(service: ImagesService, projectId: string) {
  const registry = new ActionService();
  registry.registerProvider({ provider: { provider_id: imagesManifest.plugin_id, title: "Images", kind: "plugin" }, definitions: imagesManifest.actions!,
    handlers: createImagesActionHandlers({ service: () => service, authConnections: () => [], validateConnection: () => {} }) });
  return bindActionClient(registry, () => ({ actor_id: "test", project_id: projectId || null, audience: "user", permissions: IMAGES_ACTION_PERMISSIONS }));
}
