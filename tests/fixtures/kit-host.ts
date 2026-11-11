import type { TestContext } from "node:test";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { KIT_READ_PERMISSION, kitCatalogActions, type KitCatalog } from "@molis-ai/molis-work-contracts/services/kit";
import { SKILLS_PERMISSIONS } from "@molis-ai/molis-work-contracts/services/skills";
import { PLUGIN_INSTALL_PERMISSIONS, molisWorkHostProjectReference, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { codingProductHost } from "./coding-product-host.js";
import { cogniaModelResponse } from "./cognia-model-response.js";
import { signedContentPackage } from "./content-package.js";
import { newPublisher } from "./sandbox-package.js";

// A real Host with Coding, a project, and the person who reads the AI kit (specs/capability-pack/contract-design.md §4, §7): shared by the
// kit catalog, export and security tests.

export async function kitHost(t: TestContext) {
  const f = await codingProductHost(t, async () => cogniaModelResponse("好的。"));
  const client = f.host.actionClient(molisWorkHostProjectReference({ databasePath: f.project.database_path, projectId: f.project.project_id }));
  const person: ActionCallContext = { actor_id: "web-user", project_id: f.project.project_id, audience: "user",
    user_action: { source: "management", conversation_ref: "kit", message_ref: "confirm" },
    permissions: ["artifact:read", "artifact:write", "storage:private", ...PLUGIN_INSTALL_PERMISSIONS, ...SKILLS_PERMISSIONS, KIT_READ_PERMISSION] };
  const invoke = <Output = unknown>(definition: { capability_id: string; version: number }, input: unknown, caller: ActionCallContext = person) =>
    client.invoke(caller, { capability_id: definition.capability_id, version: definition.version }, input) as Promise<Output>;
  const install = async (bundle: PluginPackageBundle | object = signedContentPackage(newPublisher())) => {
    const preview = await invoke<{ preview_id: string }>(pluginInstallActions.preview, { bundle });
    return invoke<{ plugin_id: string; version: string; publisher_key_id: string }>(pluginInstallActions.confirm, { preview_id: preview.preview_id, consent: true, pin_label: "Example" });
  };
  const kit = (caller: ActionCallContext = person) => invoke<KitCatalog>(kitCatalogActions.list, {}, caller);
  return { f, client, person, invoke, install, kit };
}
