import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { usesPluginFieldWords } from "@molis-ai/molis-work-design-system";
import { projectDirectoryWords } from "@molis-ai/molis-work-ui-host";
import type { InstalledRelease } from "./installed-release.js";
import { installedInstanceOperations, installedVersion } from "./installed-release.js";
import { pluginPagesFor, type installedPageSelection } from "./plugin-page-authority.js";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { assertStageInstallation } from "./installed-stage-identity.js";
import { directoryWordResolver } from "./ui-text-provider.js";
import { inDesignOrder } from "./plugin-builder-surface.js";
/** The signed release already selected by this instance, never a catalog lookup by name. Only signed packages are installed (47-1 B). */
function signed(release: InstalledRelease) {
  if (!release.packaged) throw new ActionError("actions.provider_changed", "插件的已安装版本已更改，请重新打开");
  return release.packaged;
}
const installedWords = (release: InstalledRelease) => signed(release).localePacks ?? null;

export function installedPluginWords(release: InstalledRelease) {
  return projectDirectoryWords(signed(release).manifest, directoryWordResolver(installedWords(release)));
}

/** Both the lazy workbench mount and the standalone carrier use the same proof, immutable view and call route. */
export function installedPluginPage(input: { home: string; actorId: string; projectId: string | null; prefix: string; release: InstalledRelease;
  running(): PluginInstanceRecord | undefined; assertProject?(): Promise<void>; scope: "home" | "project";
  /** The installation the person saw, when the page was asked for one; a different one is refused, never substituted. */
  expected?: SurfaceInstallationRef;
  /** The exact signed release, with its declared object slots, a stage of the workbench drew. */
  selection?: ReturnType<typeof installedPageSelection> }) {
  const { release, projectId, prefix } = input, record = input.running();
  const unavailable = () => new ActionError("actions.provider_changed", "插件的已安装版本已更改，请重新打开");
  if (!record || record.state !== "running" || record.plugin_id !== release.pluginId || record.version !== installedVersion(release)
    || !release.packaged || record.publisher_signature !== release.packaged.manifest.publisher.signature) throw unavailable();
  if (input.expected) assertStageInstallation(input.scope, record, input.expected);
  const { install_id, installation_generation, manifest_digest } = record;
  const authorization = pluginPagesFor(input.home).open(release.pluginId, projectId, input.actorId, input.assertProject, undefined, input.selection ?? {
    install_id, installation_generation, project_id: input.scope === "home" ? null : projectId,
    assertCurrent() {
      const current = input.running();
      if (!current || current.state !== "running" || current.install_id !== install_id
        || current.installation_generation !== installation_generation || current.manifest_digest !== manifest_digest) throw unavailable();
    },
  });
  const { design } = release, words = installedWords(release);
  const view = { contract: design.contract, nodes: inDesignOrder(design, release.nodes), presentation: design.presentation,
    connected: installedInstanceOperations(release, input.scope).map(item => item.id), deriveFieldWords: usesPluginFieldWords(design.contract, words?.pack(words.default)) };
  return { authorization, page: { mode: "installed", plugin_id: release.pluginId, call: prefix + "/api/plugins/" + release.pluginId + "/call", view } };
}
