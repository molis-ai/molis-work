/**
 * What the Host runs an installed sandbox plugin from. The studio's release is one kind of it; a signed package read by `readSandboxPackage`
 * is the other (`packaged`). Nothing here names how either was made.
 */
import type { AgentRelease } from './installed-plugin-host.js';
import type { PluginInstanceRecord, PluginManifest, SandboxAgentBody } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { PluginTrust } from '@molis-ai/molis-work-contracts/platform/plugin-trust';
import type { PluginLocaleReader } from '@molis-ai/molis-work-plugin-runtime';
import type { ContentPackage } from '@molis-ai/molis-work-plugin-sdk';

/** Trusted Host completion inside the existing install/upgrade compensation window. */
export interface InstalledPackageControl {
  /** The retained installation whose data the person explicitly agreed to discard in this preview. */
  expectedKeptGeneration?: string;
  /** A dual install finishes its Home half inside the project half's successful commit. */
  installProjectHalf?(commitHome: () => void): Promise<void>;
  assertCurrent?(): void;
  scopeOpen?(): boolean;
  refresh?(): Promise<void>;
  /** The owning service's synchronous commit, after every asynchronous preparation and authority check. */
  complete?(): void;
  /** The optional permissions the person switched on in the confirmation: a first installation starts with them. */
  optional?: readonly string[];
  /** The keys the person typed in the confirmation, each for a reference the release declares; the lifecycle seals them. */
  secrets?: readonly PackageInstallSecret[];
}

/** One key the person typed for a package: the reference the package names, the request header it goes in, and its value. */
export interface PackageInstallSecret { readonly name: string; readonly header: string; readonly value: string }

/** What the person chose in the confirmation besides agreeing (`PluginInstallService.confirm`). */
export type PackageInstallChoices = Pick<InstalledPackageControl, 'optional' | 'secrets' | 'expectedKeptGeneration' | 'installProjectHalf'>;

export const HOME_INSTALL_SCOPE = '~home';

export const releaseVersion = (version: number) => `${version}.0.0`;

/**
 * A packaged release runs under the Manifest it declared (checked against the sandbox form when the package was read) and the trust the
 * Host gave its install.
 */
export type InstalledRelease = AgentRelease & {
  readonly packaged?: {
    readonly manifest: PluginManifest;
    readonly trust: PluginTrust;
    readonly entrypointSha256?: string;
    readonly agentBodies?: readonly SandboxAgentBody[];
    readonly blueprint?: ContentPackage['blueprint'];
    readonly localePacks?: PluginLocaleReader | null;
  };
};

/** The version the plugin's installation record carries. */
export const installedVersion = (release: InstalledRelease): string => release.packaged?.manifest.version ?? releaseVersion(release.version);

type InstalledEdition = Pick<PluginInstanceRecord, 'install_id' | 'installation_generation' | 'version' | 'manifest_digest'>;

export function sameInstalledRelease(expected: InstalledEdition, actual: InstalledEdition | null | undefined): boolean {
  return actual?.install_id === expected.install_id && actual.installation_generation === expected.installation_generation
    && actual.version === expected.version && actual.manifest_digest === expected.manifest_digest;
}
