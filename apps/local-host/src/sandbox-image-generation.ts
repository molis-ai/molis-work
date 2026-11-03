import type { PluginDefinition, PluginImageGenerationClient, PluginImageGenerationDeclaration, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createPluginImageGenerationClient, type PluginImageGenerationPort } from "@molis-ai/molis-work-plugin-runtime";
import { sandboxNotAuthorized } from "@molis-ai/molis-work-plugin-sandbox";
import { forgetConnectorPluginBindings, withConnectorConnections } from "./connector-connection-store.js";
import type { PluginPlatformHome } from "./home-side.js";
import { createPluginImageGenerationPort } from "./plugin-image-generation-service.js";
import { imageBaseUrl, imageConnectionSnapshot, imagePortErrors } from "./plugin-image-connections.js";
import { sandboxImageNamespace } from "./sandbox-home-names.js";
import { SANDBOX_IMAGE_PERMISSIONS } from "./sandbox-plugin-manifest.js";

// A Home package's image generation (`sdk.imageGeneration`, PG-017 BL-491, S-60). The Manifest has no `image_generation` block for a sandboxed package: the
// package asks with `effects.imageGeneration` and the Host derives the declaration, the permission names (rows derived from the effects) and the namespace the
// package's slots are bound under (32 hex digits of the installation id's SHA-256, the key the package's files and model choice use too; a reserved name no library may take). The runtime's client does the rest, unchanged.
//
// What differs from a shipped plugin is the address. The shared port pins a connection to the first address it is used at; a package must never be the first,
// or it could point the person's key at a place of its choosing. So `bind` and `generate` here need the connection to be pinned already, to the origin the call names,
// by the person's own use of it (the Images picker), and refuse with `sandbox.not_authorized` otherwise without touching the connection's table. The broker has
// already checked that the origin is one of the operation's approved `networkDomains`.

const refused = sandboxNotAuthorized;

/** Whether `pinned` (what the store says the connection is pinned to) is the origin of `baseUrl`; anything else is a refusal that changes nothing. */
function requirePinnedTo(pinned: string | null, baseUrl: string): void {
  const origin = new URL(imageBaseUrl(baseUrl)).origin;
  if (pinned === null) throw refused("这条图片连接还没有用在任何服务地址上，请先在图片设置里用它一次");
  if (pinned !== origin) throw refused(`这条图片连接已固定在 ${pinned}，插件不能把它用到 ${origin}`);
}

function assertPinnedTo(home: string, connectionId: string | null, baseUrl: string): void {
  if (!connectionId) throw refused("这个图片用途还没有绑定连接");
  requirePinnedTo(withConnectorConnections(home, store => store.targetOrigin(connectionId)), baseUrl);
}

function pinnedPort(home: string, namespace: string): PluginImageGenerationPort {
  const shared = createPluginImageGenerationPort(home, namespace);
  return {
    ...shared,
    // Checked and written in one pass over the store, and never through `assertTarget`, which would pin an address that is not yet pinned.
    bind: (target, connectionId) => withConnectorConnections(home, store => {
      const selected = store.require(connectionId, "image-api");
      if (store.state(selected) !== "connected") throw imagePortErrors.image_connection_unavailable("所选图像连接不可用");
      requirePinnedTo(store.targetOrigin(connectionId), target.base_url);
      store.bind({ scopeId: "home", pluginId: namespace, slotId: target.slot_id, serviceId: "image-api", connectionId });
    }),
    generate: (request, dispatch) => {
      assertPinnedTo(home, imageConnectionSnapshot(home, namespace, request).connection_id, request.base_url);
      return shared.generate(request, dispatch);
    },
  };
}

export function sandboxImageDeclaration(installId: string): PluginImageGenerationDeclaration {
  return { store_name: sandboxImageNamespace(installId), read_permission: SANDBOX_IMAGE_PERMISSIONS.read, write_permission: SANDBOX_IMAGE_PERMISSIONS.write, generate_permission: SANDBOX_IMAGE_PERMISSIONS.generate };
}

export function sandboxImageGenerationFor(home: Pick<PluginPlatformHome, "directory"> | null | undefined, definition: PluginDefinition, context: PluginStartContext,
  assertActive: () => void): PluginImageGenerationClient | undefined {
  if (!home || definition.execution !== "sandbox") return undefined;
  const asked: readonly string[] = Object.values(SANDBOX_IMAGE_PERMISSIONS);
  if (!definition.manifest.permissions.some(entry => asked.includes(entry.permission))) return undefined;
  const declaration = sandboxImageDeclaration(context.install_id);
  return createPluginImageGenerationClient(definition.manifest, pinnedPort(home.directory, declaration.store_name),
    { install_id: context.install_id, installation_generation: context.installation_generation, assertActive, requireGrant: permission => context.requireGrant(permission) }, declaration);
}

/** An uninstall that keeps no data: every binding of the package's image slots goes; the person's accounts stay. */
export function forgetSandboxImageBindings(home: string, installId: string): void {
  forgetConnectorPluginBindings(home, "home", sandboxImageNamespace(installId));
}
