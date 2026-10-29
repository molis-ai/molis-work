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
import type { PluginInstalledPermissionView, PluginInstalledView, PluginInstallPreview, PluginPublisherPin } from '@molis-ai/molis-work-contracts/platform/plugin-trust';
import { declarationsNeedingConsent, verifyPluginPackageSignature, type PluginConsentLedger } from '@molis-ai/molis-work-plugin-runtime';
import type { InstalledRelease } from './installed-release.js';
import { consentsChanged } from './consent-revision.js';
import { readKeptSandboxPackage, type KeptSandboxPackage } from './sandbox-package.js';
import { packagedRelease, type SandboxPackageStore } from './sandbox-package-store.js';
import { assertHomePackageAllowed } from './home-package-admission.js';
import { HOST_PLUGIN_IDS } from './host-plugin-ids.js';
import { installedPermissionViews, installedPluginViews, jobViews, permissionViews, type InstalledPluginEntry } from './plugin-installed-view.js';

/** A preview waits this long for its confirmation, and at most this many wait at once. */
const PREVIEW_TTL_MS = 15 * 60_000;
const MAX_PREVIEWS = 16;

export interface PluginInstallPorts {
  ledger: PluginConsentLedger;
  packages: SandboxPackageStore;
  /** Installs a release in the project the person is in. */
  installInProject(projectId: string, release: InstalledRelease): Promise<void>;
  /** Installs a release in the Home: one instance every project shares, which a package asks for in its Manifest (`runtime.scope`, BL-628). */
  installInHome(release: InstalledRelease): Promise<void>;
  /**
   * Refuses an integration package (BL-530) whose plugin id, services or integrations the Home's registry already has from another,
   * built-in or installed (`plugin.integration_declaration_conflict`, naming the id and its holder).
   */
  assertIntegrationsFree?(manifest: KeptSandboxPackage['manifest']): Promise<void>;
  /** The plugins installed in the project, each with the Manifest it was installed with. */
  installed(projectId: string): Promise<InstalledPluginEntry[]>;
  /** Switches one installation of a signed package off or on, or takes it off; answers the state it is in afterwards. */
  control(projectId: string, pluginId: string, action: 'disable' | 'enable' | 'uninstall', input: { keep_data: boolean }): Promise<string>;
  /** Switches one optional permission of an installation in the project and restarts it on the new grants (`PluginRuntime.regrant`); a Host that cannot leaves it out. */
  regrant?(projectId: string, installId: string, permission: string, granted: boolean): Promise<void>;
  /** The same two for the plugins that run as the Home's own instance (BL-700); a Host without a Home leaves them out. */
  homeInstalled?(): Promise<InstalledPluginEntry[]>;
  homeRegrant?(installId: string, permission: string, granted: boolean): Promise<void>;
  now?(): string;
}

export interface PluginInstallPreviewResult {
  preview_id: string;
  name: string;
  /** Where confirming installs it: the Home (one instance for every project, which reads no project's content) or the project the person is in. */
  runtime_scope: 'home' | 'project';
  preview: PluginInstallPreview;
  /** What the plugin's operations ask for in all: confirming approves exactly this. */
  effects: SandboxEffects;
  publisher: { key_id: string; pinned_label: string | null };
  /**
   * Only an integration package's: the exact origins its requests with the person's account may reach, per service it declared them for
   * (S-95, BL-691). They are part of the signed package, so they stay what the person saw: another set comes only with another package and its own preview.
   */
  origins?: Array<{ service_id: string; title: string; origins: string[] }>;
}

interface Held { bundle: PluginPackageBundle; pkg: KeptSandboxPackage; runtime_scope: 'home' | 'project'; key_id: string; spki: string; project_id: string; actor_id: string; expires: number }

const scopeOf = (manifest: KeptSandboxPackage['manifest']): 'home' | 'project' => manifest.runtime?.scope === 'home' ? 'home' : 'project';

/**
 * A plugin id the Host's build ships, or one on its dotted path (`io.a.b` and `io.a.b.c`), is the Host's (S-75.2): a package takes neither,
 * in either range. The Runtime refuses it again when it installs; here it is refused at the preview, before anything is written (S-84).
 */
const assertNotHostId = (pluginId: string): void => {
  const reserved = [...HOST_PLUGIN_IDS].find(id => id === pluginId || id.startsWith(`${pluginId}.`) || pluginId.startsWith(`${id}.`));
  if (reserved) throw pluginErrors.id_namespace_conflict(`插件 ID ${pluginId} 与随宿主发布的 ${reserved} 冲突`);
};

export class PluginInstallService {
  private readonly held = new Map<string, Held>();
  constructor(private readonly ports: PluginInstallPorts) {}

  private now(): string { return this.ports.now?.() ?? new Date().toISOString(); }

  private pinOf(keyId: string): PluginPublisherPin | undefined { return this.ports.ledger.publishers().find(pin => pin.key_id === keyId); }

  /** Checks a package and says what installing it means. Writes nothing durable: the preview is held in memory for the confirmation. */
  async preview(input: { bundle: unknown }, who: { project_id: string; actor_id: string }): Promise<PluginInstallPreviewResult> {
    const { bundle, key_id, public_key_spki_base64 } = verifyPluginPackageSignature(input.bundle);
    const pkg = readKeptSandboxPackage(bundle.payload);
    const pin = this.pinOf(key_id);
    if (pin?.revoked_at) throw pluginErrors.publisher_revoked('这个发布者的固定已被撤销，它的包不能再安装');
    const { manifest } = pkg, runtime_scope = scopeOf(manifest);
    if (runtime_scope === 'home') assertHomePackageAllowed(manifest);
    this.assertScopeKept(manifest, message => pluginErrors.declaration_invalid(message));
    await this.assertIntegrationsFree(manifest);
    assertNotHostId(manifest.plugin_id);
    for (const [id, entry] of this.held) if (entry.expires <= Date.now()) this.held.delete(id);
    if (this.held.size >= MAX_PREVIEWS) this.held.delete(this.held.keys().next().value as string);
    const preview_id = randomUUID();
    this.held.set(preview_id, { bundle, pkg, runtime_scope, key_id, spki: public_key_spki_base64, project_id: who.project_id, actor_id: who.actor_id, expires: Date.now() + PREVIEW_TTL_MS });
    return { preview_id, name: manifest.name, runtime_scope, effects: pkg.permissions, publisher: { key_id, pinned_label: pin?.label ?? null },
      preview: { plugin_id: manifest.plugin_id, version: manifest.version, trust: 'pinned', publisher_signature: manifest.publisher.signature, publisher_pinned: pin !== undefined,
        permissions: permissionViews(manifest), declarations: declarationsNeedingConsent(manifest, () => undefined), jobs: jobViews(manifest) },
      ...manifest.kind === 'integration' ? { origins: (manifest.connection_services ?? []).flatMap(service => service.origins
        ? [{ service_id: service.service_id, title: service.title, origins: [...service.origins] }] : []) } : {} };
  }

  private async assertIntegrationsFree(manifest: KeptSandboxPackage['manifest']): Promise<void> {
    if (manifest.kind !== 'integration') return;
    if (!this.ports.assertIntegrationsFree) throw pluginErrors.home_scope_unavailable('这里装不了集成包：没有可登记它的 Home');
    await this.ports.assertIntegrationsFree(manifest);
  }

  /** A plugin id keeps the range its first kept package gave it: a package of another range is refused rather than run where its Manifest never asked (BL-628). */
  private assertScopeKept(manifest: KeptSandboxPackage['manifest'], refuse: (message: string) => Error): void {
    const kept = this.ports.packages.scopeOf(manifest.plugin_id), scope = scopeOf(manifest);
    if (kept !== undefined && kept !== scope) {
      throw refuse(`插件 ${manifest.plugin_id} 已经以「${kept === 'home' ? 'Home' : '项目'}」范围装过，它的范围不能更换：请给这个包换一个插件 ID`);
    }
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
    // The range the person saw is the range of the package: checked again, as another preview may have been confirmed since.
    if (scopeOf(held.pkg.manifest) !== held.runtime_scope) throw pluginErrors.preview_unknown('预览之后这个包的运行范围变了，请重新预览');
    this.assertScopeKept(held.pkg.manifest, message => pluginErrors.preview_unknown(message + '；请重新预览'));
    // Another package may have taken one of its ids since the preview.
    await this.assertIntegrationsFree(held.pkg.manifest);
    const pin = this.pinOf(held.key_id);
    if (pin?.revoked_at) throw pluginErrors.publisher_revoked('这个发布者的固定已被撤销，它的包不能再安装');
    // In a project, a package of a plugin already installed there is its upgrade, and only its own publisher's: another publisher's is refused
    // before it can be pinned or kept, in a project or the Home. A Home package looks at the Home's installations of signed packages (an id of
    // the Host's own plugins was refused at the preview), a project's at the project's. The Home does not upgrade a package in place (S-80,
    // BL-628): its own publisher's is refused here too, before it is kept, with the code the Home's install answers.
    const inHome = held.runtime_scope === 'home';
    const entries = inHome ? await (this.ports.homeInstalled?.() ?? []) : await this.ports.installed(held.project_id);
    const present = entries.find(item => item.record.plugin_id === held.pkg.manifest.plugin_id && (!inHome || item.record.publisher_trust === 'pinned'));
    if (present && present.record.publisher_signature !== held.key_id) {
      throw pluginErrors.definition_conflict(`这个插件已经由另一个发布者装进了${inHome ? ' Home' : '这个项目'}，两边不能互相替换：先卸载，再装`);
    }
    if (present && inHome) throw pluginErrors.state_invalid('这个插件已经装在 Home 里。Home 里的签名包不就地升级：先卸载（可保留数据），再装新包');
    if (!pin) {
      const label = input.pin_label?.trim();
      if (!label) throw pluginErrors.publisher_untrusted('这个发布者还没有被固定：要装它的包，请先确认信任它');
      if (label.length > 80) throw new ActionError('actions.input_invalid', '发布者的名称不超过 80 个字');
      this.ports.ledger.pinPublisher({ key_id: held.key_id, public_key_spki_base64: held.spki, label, pinned_at: this.now(), pinned_by: who.actor_id });
      consentsChanged();
    }
    const directory = this.ports.packages.save(held.bundle, held.pkg);
    const release = packagedRelease(held.pkg, directory, this.now());
    if (held.runtime_scope === 'home') await this.ports.installInHome(release);
    else await this.ports.installInProject(held.project_id, release);
    return { plugin_id: held.pkg.manifest.plugin_id, version: held.pkg.manifest.version, publisher_key_id: held.key_id };
  }

  /** Switches a signed-package installation of the project off or on, or takes it off (BL-623); a plugin that did not come from a signed package is not touched here. */
  async control(action: 'disable' | 'enable' | 'uninstall', input: { plugin_id: string; keep_data: boolean }, who: { project_id: string }): Promise<string> {
    return this.ports.control(who.project_id, input.plugin_id, action, { keep_data: input.keep_data });
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

  /**
   * The person's switch for one optional permission of a plugin installed in this project (PG-002, S-94). The installation must be one of the
   * project's; what the Manifest does not declare, or a required one switched off, is refused by the Runtime (`plugin.grant_denied`).
   * Answers the installation's permissions as they stand after, and whether anything changed.
   */
  async setPermission(projectId: string, installId: string, permission: string, granted: boolean): Promise<{ install_id: string; permissions: PluginInstalledPermissionView[]; changed: boolean }> {
    const { regrant } = this.ports;
    return this.switchPermission(() => this.ports.installed(projectId), regrant && (() => regrant(projectId, installId, permission, granted)), installId);
  }

  /** The same switch for a plugin that runs as the Home's own instance, shared by every project (BL-700, S-94). */
  async setHomePermission(installId: string, permission: string, granted: boolean): Promise<{ install_id: string; permissions: PluginInstalledPermissionView[]; changed: boolean }> {
    const { homeInstalled, homeRegrant } = this.ports;
    if (!homeInstalled) throw pluginErrors.state_invalid('这个宿主没有个人空间');
    return this.switchPermission(homeInstalled, homeRegrant && (() => homeRegrant(installId, permission, granted)), installId);
  }

  private async switchPermission(list: () => Promise<InstalledPluginEntry[]>, regrant: (() => Promise<void>) | undefined, installId: string): Promise<{ install_id: string; permissions: PluginInstalledPermissionView[]; changed: boolean }> {
    const find = async () => (await list()).find(entry => entry.record.install_id === installId);
    const before = await find();
    if (!before?.manifest) throw pluginErrors.definition_missing('这里没有这个插件的安装，或读不到它安装时的声明');
    if (!regrant) throw pluginErrors.state_invalid('这个宿主不能改插件的授权');
    await regrant();
    const after = await find();
    if (!after?.manifest) throw pluginErrors.definition_missing('这个插件的安装已经不在');
    const held = new Set(before.record.grants);
    return { install_id: installId, permissions: installedPermissionViews(after.manifest, after.record.grants),
      changed: after.record.grants.length !== held.size || after.record.grants.some(grant => !held.has(grant)) };
  }

  /** The Home's own plugins as the settings page shows them: the same view as a project's, for the instance every project shares. */
  async homeInstalled(): Promise<PluginInstalledView[]> {
    return installedPluginViews(await (this.ports.homeInstalled?.() ?? []), this.ports.ledger);
  }

  /** The project's installed plugins as their detail page shows them: trust, permissions, jobs and the person's agreements. */
  async installed(projectId: string): Promise<PluginInstalledView[]> { return installedPluginViews(await this.ports.installed(projectId), this.ports.ledger); }
}
