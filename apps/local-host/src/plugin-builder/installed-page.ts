import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { usesPluginFieldWords } from "@molis-ai/molis-work-design-system";
import { projectDirectoryWords } from "@molis-ai/molis-work-ui-host";
import type { InstalledRelease } from "../installed-release.js";
import { installedVersion } from "../installed-release.js";
import { pluginPagesFor } from "../plugin-page-authority.js";
import { directoryWordResolver } from "../ui-text-provider.js";
import { inDesignOrder } from "../plugin-builder-surface.js";
import { studioWordReader } from "./studio-words.js";
import { generatedPluginManifest } from "./installed.js";

/** The signed or local release already selected by this instance, never a catalog lookup by name. */
function installedWords(release: InstalledRelease) {
  const { pluginId, design, packaged } = release;
  return packaged ? packaged.localePacks ?? null : studioWordReader(design, { plugin_id: pluginId, kind: "app", ui: design.contract.ui ?? {} });
}

export function installedPluginWords(release: InstalledRelease) {
  return projectDirectoryWords(release.packaged?.manifest ?? generatedPluginManifest(release), directoryWordResolver(installedWords(release)));
}

/** Both the lazy workbench mount and the standalone carrier use the same proof, immutable view and call route. */
export function installedPluginPage(input: { home: string; actorId: string; projectId: string | null; prefix: string; release: InstalledRelease;
  running(): PluginInstanceRecord | undefined; assertProject?(): Promise<void>; scope: "home" | "project" }) {
  const { release, projectId, prefix } = input, record = input.running();
  const unavailable = () => new ActionError("actions.provider_changed", "插件的已安装版本已更改，请重新打开");
  if (!record || record.state !== "running" || record.plugin_id !== release.pluginId || record.version !== installedVersion(release)
    || record.publisher_signature !== (release.packaged?.manifest.publisher.signature ?? "agent-built:" + release.buildId)) throw unavailable();
  const { install_id, installation_generation, manifest_digest } = record;
  const authorization = pluginPagesFor(input.home).open(release.pluginId, projectId, input.actorId, input.assertProject, undefined, {
    install_id, installation_generation, project_id: input.scope === "home" ? null : projectId,
    assertCurrent() {
      const current = input.running();
      if (!current || current.state !== "running" || current.install_id !== install_id
        || current.installation_generation !== installation_generation || current.manifest_digest !== manifest_digest) throw unavailable();
    },
  });
  const { design } = release, words = installedWords(release);
  const view = { contract: design.contract, nodes: inDesignOrder(design, release.nodes), presentation: design.presentation,
    connected: design.contract.operations.map(item => item.id), deriveFieldWords: usesPluginFieldWords(design.contract, words?.pack(words.default)) };
  return { authorization, page: { mode: "installed", plugin_id: release.pluginId, call: prefix + "/api/plugins/" + release.pluginId + "/call", view } };
}
