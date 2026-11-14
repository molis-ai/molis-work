import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginManifestDigest } from "@molis-ai/molis-work-plugin-runtime";
import { pluginTextReader, type PluginTextReader } from "@molis-ai/molis-work-ui-host";
import type { HomePluginPlatform } from "./home-plugins.js";
import { runningInstalledPluginPlatform } from "./installed-plugin-host.js";
import type { LocalProjectDatabase } from "./project-database.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { runningProjectPlatform } from "./project-plugins.js";

type Scope = Pick<HomePluginPlatform, "supervisor" | "runtime">;
/** A running release's Manifest and its own language files, read from the activation the page's words come from. */
export type RunningPluginText = { readonly manifest: PluginManifest; readonly reader: PluginTextReader | null };
/** Which release a word belongs to: the plugin, and the signature or installation its record names. */
export type RunningRelease = { readonly plugin_id: string; readonly signature?: string; readonly install_id?: string };

/**
 * One live release, checking the durable identity before using the activation's language files: the installation record is running
 * this very Manifest (generation, version, signature, digest), and the release is the one asked for. Built-in, installed or made in
 * the studio alike: the words come from the running activation, as the plugin directory takes them.
 */
export function runningPluginText(platform: Scope | null | undefined, release: RunningRelease): RunningPluginText | null {
  const source = platform?.supervisor.activeInstance(release.plugin_id)?.source?.();
  if (!platform || !source) return null;
  const { activation, manifest } = source, record = platform.runtime.get(activation.install_id);
  if (release.signature !== undefined && manifest.publisher.signature !== release.signature) return null;
  if (release.install_id !== undefined && activation.install_id !== release.install_id) return null;
  if (record.state !== "running" || record.plugin_id !== release.plugin_id || manifest.plugin_id !== record.plugin_id
    || record.installation_generation !== activation.installation_generation || manifest.version !== record.version
    || manifest.publisher.signature !== record.publisher_signature || pluginManifestDigest(manifest) !== record.manifest_digest) return null;
  return { manifest, reader: pluginTextReader(activation) };
}

/** The running release behind a word in a project: its own Runtime, its installed plugins, then a Home plugin it reaches. */
export function runningPluginTextIn({ store, localHost, projectId }: {
  store: LocalProjectDatabase; localHost: MolisWorkLocalHost; projectId: string;
}): (release: RunningRelease) => Promise<RunningPluginText | null> {
  let platforms: Promise<readonly [Scope | null, Scope | null]> | undefined;
  let homePlatform: Promise<HomePluginPlatform | undefined> | undefined;
  let reach: Promise<(pluginId: string) => boolean | undefined> | undefined;
  return async release => {
    platforms ??= Promise.all([runningProjectPlatform(store, projectId), runningInstalledPluginPlatform(store, projectId)]);
    const [project, installed] = await platforms;
    const found = runningPluginText(project, release) ?? runningPluginText(installed, release);
    if (found) return found;
    homePlatform ??= localHost.homePlugins?.ready({ start: false }).catch(() => undefined);
    const home = await homePlatform;
    if (!home?.supervisor.activeInstance(release.plugin_id)) return null;
    reach ??= localHost.projectPluginReach(projectId).catch(() => () => false);
    return (await reach)(release.plugin_id) ? runningPluginText(home, release) : null;
  };
}

/** Outside a project only the Home's own plugins run. */
export function runningHomePluginText(localHost: MolisWorkLocalHost): (release: RunningRelease) => Promise<RunningPluginText | null> {
  let homePlatform: Promise<HomePluginPlatform | undefined> | undefined;
  return async release => {
    homePlatform ??= localHost.homePlugins?.ready({ start: false }).catch(() => undefined);
    return runningPluginText(await homePlatform, release);
  };
}
