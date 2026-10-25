/**
 * Installing a plugin from a signed sandbox package (ac-trust T2, specs/repository-anti-corruption/slices/ac-trust-install.md §3.1). One path
 * for every package: a preview that checks it and tells the person what installing means, then a confirmation that pins the publisher
 * (when the person says so), keeps the package and installs it under the trust that pin gives. Nothing is written before the package has
 * been verified and read: a package that is unsigned, signed by a key its Manifest does not name, altered, from a revoked publisher, or not in
 * the sandbox package format stops at the preview, and the confirmation takes only a preview the Host itself made.
 */
import { randomUUID } from 'node:crypto';
import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors, type PluginPackageBundle } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { PluginInstalledView, PluginInstallPreview, PluginPublisherPin } from '@molis-ai/molis-work-contracts/platform/plugin-trust';
import { declarationsNeedingConsent, verifyPluginPackageSignature, type PluginConsentLedger } from '@molis-ai/molis-work-plugin-runtime';
import type { InstalledRelease } from './installed-release.js';
import { consentsChanged } from './consent-revision.js';
import { readSandboxPackage, type SandboxPackage } from './sandbox-package.js';
import { packagedRelease, type SandboxPackageStore } from './sandbox-package-store.js';
import { installedPluginViews, jobViews, permissionViews, type InstalledPluginEntry } from './plugin-installed-view.js';

/** A preview waits this long for its confirmation, and at most this many wait at once. */
const PREVIEW_TTL_MS = 15 * 60_000;
const MAX_PREVIEWS = 16;

export interface PluginInstallPorts {
  ledger: PluginConsentLedger;
  packages: SandboxPackageStore;
  /** Installs a release in the project the person is in. */
  install(projectId: string, release: InstalledRelease): Promise<void>;
  /** The plugins installed in the project, each with the Manifest it was installed with. */
  installed(projectId: string): Promise<InstalledPluginEntry[]>;
  now?(): string;
}

export interface PluginInstallPreviewResult {
  preview_id: string;
  name: string;
  preview: PluginInstallPreview;
  /** What the plugin's operations ask for in all: confirming approves exactly this. */
  effects: SandboxEffects;
  publisher: { key_id: string; pinned_label: string | null };
}

interface Held { bundle: PluginPackageBundle; pkg: SandboxPackage; key_id: string; spki: string; project_id: string; actor_id: string; expires: number }

export class PluginInstallService {
  private readonly held = new Map<string, Held>();
  constructor(private readonly ports: PluginInstallPorts) {}

  private now(): string { return this.ports.now?.() ?? new Date().toISOString(); }

  private pinOf(keyId: string): PluginPublisherPin | undefined { return this.ports.ledger.publishers().find(pin => pin.key_id === keyId); }

  /** Checks a package and says what installing it means. Writes nothing durable: the preview is held in memory for the confirmation. */
  preview(input: { bundle: unknown }, who: { project_id: string; actor_id: string }): PluginInstallPreviewResult {
    const { bundle, key_id, public_key_spki_base64 } = verifyPluginPackageSignature(input.bundle);
    const pkg = readSandboxPackage(bundle.payload);
    const pin = this.pinOf(key_id);
    if (pin?.revoked_at) throw pluginErrors.publisher_revoked('这个发布者的固定已被撤销，它的包不能再安装');
    const { manifest } = pkg;
    for (const [id, entry] of this.held) if (entry.expires <= Date.now()) this.held.delete(id);
    if (this.held.size >= MAX_PREVIEWS) this.held.delete(this.held.keys().next().value as string);
    const preview_id = randomUUID();
    this.held.set(preview_id, { bundle, pkg, key_id, spki: public_key_spki_base64, project_id: who.project_id, actor_id: who.actor_id, expires: Date.now() + PREVIEW_TTL_MS });
    return { preview_id, name: manifest.name, effects: pkg.permissions, publisher: { key_id, pinned_label: pin?.label ?? null },
      preview: { plugin_id: manifest.plugin_id, version: manifest.version, trust: 'pinned', publisher_signature: manifest.publisher.signature, publisher_pinned: pin !== undefined,
        permissions: permissionViews(manifest), declarations: declarationsNeedingConsent(manifest, () => undefined), jobs: jobViews(manifest) } };
  }

  /**
   * Installs what a preview showed. The preview is used up by this call, whatever happens. A publisher the person has not pinned is pinned
   * here only when they said so (`pin_label`); the install then runs under that pin.
   */
  async confirm(input: { preview_id: string; consent: boolean; pin_label?: string }, who: { project_id: string; actor_id: string }): Promise<{ plugin_id: string; version: string; publisher_key_id: string }> {
    const held = this.held.get(input.preview_id);
    this.held.delete(input.preview_id);
    if (!held || held.expires <= Date.now() || held.project_id !== who.project_id || held.actor_id !== who.actor_id) throw pluginErrors.preview_unknown('没有这次安装的预览，或它已过期；请重新预览');
    if (input.consent !== true) throw pluginErrors.consent_required('安装前请确认插件要使用的权限');
    const pin = this.pinOf(held.key_id);
    if (pin?.revoked_at) throw pluginErrors.publisher_revoked('这个发布者的固定已被撤销，它的包不能再安装');
    if (!pin) {
      const label = input.pin_label?.trim();
      if (!label) throw pluginErrors.publisher_untrusted('这个发布者还没有被固定：要装它的包，请先确认信任它');
      if (label.length > 80) throw new ActionError('actions.input_invalid', '发布者的名称不超过 80 个字');
      this.ports.ledger.pinPublisher({ key_id: held.key_id, public_key_spki_base64: held.spki, label, pinned_at: this.now(), pinned_by: who.actor_id });
      consentsChanged();
    }
    const directory = this.ports.packages.save(held.bundle, held.pkg);
    await this.ports.install(held.project_id, packagedRelease(held.pkg, directory, this.now()));
    return { plugin_id: held.pkg.manifest.plugin_id, version: held.pkg.manifest.version, publisher_key_id: held.key_id };
  }

  publishers(): PluginPublisherPin[] { return this.ports.ledger.publishers(); }

  /**
   * Takes a publisher back (BL-559, S-87): its pin is revoked for good, and every installation of a package it signed stops running, its data
   * kept. The stop is each project's own: an installation is denied at its next effect, and stopped when its project next looks.
   */
  revokePublisher(keyId: string): PluginPublisherPin {
    const pin = this.ports.ledger.revokePublisher(keyId, this.now());
    if (!pin) throw pluginErrors.publisher_untrusted('没有固定过这个发布者');
    consentsChanged();
    return pin;
  }

  /** The project's installed plugins as their detail page shows them: trust, permissions, jobs and the person's agreements. */
  async installed(projectId: string): Promise<PluginInstalledView[]> { return installedPluginViews(await this.ports.installed(projectId), this.ports.ledger); }
}
