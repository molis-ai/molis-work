import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { imagesManifest, createImagesActionHandlers } from "@molis-ai/molis-work-plugin-images";
import type { ImagesHostService } from "./images-service-host.js";
export function imagesActionProvider(host: ImagesHostService): ActionProviderRegistration {
  return { provider: { provider_id: imagesManifest.plugin_id, plugin_id: imagesManifest.plugin_id, title: imagesManifest.name, kind: "plugin" },
    definitions: imagesManifest.actions!, handlers: createImagesActionHandlers({ service: () => host.get(), authConnections: () => host.authConnections(), validateConnection: input => host.validateConnection(input) }) };
}
