/**
 * What the Host runs an installed sandbox plugin from. The studio's release is one kind of it; a signed package read by `readSandboxPackage`
 * is the other (`packaged`). Nothing here names how either was made.
 */
import type { AgentRelease } from '@molis-ai/molis-work-plugin-builder';
import type { PluginManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginTrust } from '@molis-ai/molis-work-contracts/platform/plugin-trust';

export const releaseVersion = (version: number) => `${version}.0.0`;

/**
 * A packaged release runs under the Manifest it declared (checked against the sandbox form when the package was read) and the trust the
 * Host gave its install.
 */
export type InstalledRelease = AgentRelease & { readonly packaged?: { readonly manifest: PluginManifest; readonly trust: PluginTrust } };

/** The version the plugin's installation record carries. */
export const installedVersion = (release: InstalledRelease): string => release.packaged?.manifest.version ?? releaseVersion(release.version);
