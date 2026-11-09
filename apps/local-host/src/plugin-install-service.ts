/**
 * Installing a plugin from a signed package (ac-trust T2, specs/archive/repository-anti-corruption/slices/ac-trust-install.md §3.1): a sandbox
 * package, or the content package of a plugin with only declarations (specs/skill-packs/contract-design.md §3, §5). One path for every
 * package: a preview that checks it and tells the person what installing means, then a confirmation that pins the publisher (when the
 * person says so), keeps the package and installs it under the trust that pin gives. Nothing is written before the package has been
 * verified and read: a package that is unsigned, signed by a key its Manifest does not name, altered, from a revoked publisher, or not in
 * its format stops at the preview, and the confirmation takes only a preview the Host itself made.
 */
import { randomUUID } from 'node:crypto';
import { ActionError, type ActionExecutionContext } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors, type PluginPackageBundle, type SandboxAgentBody } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SkillInstallPreview } from '@molis-ai/molis-work-contracts/services/skills';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { PluginInstalledPermissionView, PluginInstalledView, PluginInstallPreview, PluginPublisherPin } from '@molis-ai/molis-work-contracts/platform/plugin-trust';
import { declarationsNeedingConsent, verifyPluginPackageSignature, type PluginConsentLedger } from '@molis-ai/molis-work-plugin-runtime';
import type { InstalledRelease } from './installed-release.js';
import { consentsChanged } from './consent-revision.js';
import { readKeptPackage, type KeptPackage, type KeptSandboxPackage } from './sandbox-package.js';
import { skillInstallPreviews } from './skill-install-preview.js';
import { packagedRelease, type SandboxPackageStore } from './sandbox-package-store.js';
import { assertHomePackageAllowed } from './home-package-admission.js';
import { HOST_PLUGIN_IDS } from './host-plugin-ids.js';
import { assertUpgradeOf, upgradeRefusal } from './package-upgrade.js';
import { installedPluginViews, jobViews, permissionViews, type InstalledPluginEntry } from './plugin-installed-view.js';
import type { PermissionSwitchTarget } from './plugin-installed-view.js';
import { sandboxRequestedPermissions } from '@molis-ai/molis-work-plugin-sdk';
import { validateSandboxHomeSchema } from './plugin-sandbox-home-library.js';
import { readBundledPackages } from './bundled-packages.js';

/** A preview waits this long for its confirmation, and at most this many wait at once. */
const PREVIEW_TTL_MS = 15 * 60_000;
const MAX_PREVIEWS = 16;

export interface PluginInstallPorts {
  skillStates?(scopeRef: string, installId: string): ReadonlyMap<string, import("@molis-ai/molis-work-contracts/services/skills").SkillState>;
  ledger: PluginConsentLedger;
  packages: SandboxPackageStore;
  /** Installs a release in the project the person is in. */
  installInProject(projectId: string, release: InstalledRelease, assertCurrent?: () => void): Promise<void>;
  /** Installs a release in the Home: one instance every project shares, which a package asks for in its Manifest (`runtime.scope`, BL-628). */
  installInHome(release: InstalledRelease, assertCurrent?: () => void): Promise<void>;
  /**
   * Refuses an integration package (BL-530) whose plugin id, services or integrations the Home's registry already has from another,
   * built-in or installed (`plugin.integration_declaration_conflict`, naming the id and its holder).
   */
  assertIntegrationsFree?(manifest: KeptSandboxPackage['manifest']): Promise<void>;
  /** The plugins installed in the project, each with the Manifest it was installed with. */
  installed(projectId: string): Promise<InstalledPluginEntry[]>;
  /** Whether some provider offers this action in the project now: what the preview says of each of a package's `requires`. A Host without it previews no package that requires any. */
  offers?(projectId: string, reference: { capability_id: string; version: number }): boolean;
  /** Switches one installation of a signed package off or on, or takes it off; answers the state it is in afterwards. */
  control(projectId: string, pluginId: string, action: 'disable' | 'enable' | 'uninstall', input: { keep_data: boolean }): Promise<string>;
  /** Switches one optional permission of an installation in the project and restarts it on the new grants (`PluginRuntime.regrant`); a Host that cannot leaves it out. */
  regrant?(projectId: string, installId: string, permission: string, granted: boolean, expected?: PermissionSwitchTarget): Promise<void>;
  /** The same two for the plugins that run as the Home's own instance (BL-700); a Host without a Home leaves them out. */
  homeInstalled?(): Promise<InstalledPluginEntry[]>;
  homeRegrant?(installId: string, permission: string, granted: boolean, expected?: PermissionSwitchTarget): Promise<void>;
  /** Switches a signed package installed in the Home off or on, or takes it off (BL-715); answers its state afterwards. A Host without a Home leaves it out. */
  homeControl?(pluginId: string, action: 'disable' | 'enable' | 'uninstall', input: { keep_data: boolean }): Promise<string>;
  /** The release's folder of the packages it ships uninstalled (`bundledPackagesDirectory`); a Host without one ships none. */
  bundledDirectory?: string;
  now?(): string;
}

/**
 * A package this release ships uninstalled, as the person's list shows it (`plugins.bundled.list@1`): who it is, what it says it is,
 * and who signed it, with whether the person has pinned or taken back that publisher. Installing it is `preview` with `bundled`.
 */
export interface BundledPluginView {
  plugin_id: string;
  version: string;
  name: string;
  name_en: string | null;
  summary: string | null;
  runtime_scope: 'home' | 'project';
  publisher: { publisher_id: string; key_id: string; pinned_label: string | null; revoked: boolean };
}

/** The packages this release ships, and each file in their folder the Host would not take, with why. */
export interface BundledPluginList {
  plugins: BundledPluginView[];
  refused: Array<{ file: string; code: string; message: string }>;
}

/** What a preview checks: a signed package handed in whole, or one this release ships, named by its id and the version the person saw. */
export type PluginInstallPreviewInput = { bundle: unknown } | { bundled: { plugin_id: string; version: string } };

export interface PluginInstallPreviewResult {
  preview_id: string;
  name: string;
  /** Where confirming installs it: the Home (one instance for every project, which reads no project's content) or the project the person is in. */
  runtime_scope: 'home' | 'project';
  preview: PluginInstallPreview;
  /** What the plugin's operations ask for in all: confirming approves exactly this. */
  effects: SandboxEffects;
  publisher: { key_id: string; pinned_label: string | null };
  /** The role materials the package ships, and in an upgrade how each changed. Its methods are Skills, listed in `skills`. */
  agent_bodies?: Array<{ kind: 'role'; name: string; excerpt: string; body: string; total_chars: number; truncated: boolean; change?: 'added' | 'changed' | 'removed' }>;
  /** Every Skill the package declares (its Manifest's `methods`), and in an upgrade what changed (specs/skill-packs/contract-design.md §5). */
  skills?: SkillInstallPreview[];
  /** The actions the Manifest `requires`, each with whether a provider offers it in this project now. */
  requires?: PluginRequirementPreview[];
  /**
   * Only an integration package's: the exact origins its requests with the person's account may reach, per service it declared them for
   * (S-95, BL-691). They are part of the signed package, so they stay what the person saw: another set comes only with another package and its own preview.
   */
  origins?: Array<{ service_id: string; title: string; origins: string[] }>;
}

/** One of a Manifest's `requires`, as the preview says it: an unmet required one makes its Skills unavailable, an unmet optional one only less. */
export interface PluginRequirementPreview { capability_id: string; version: number; optional: boolean; reason: string; satisfied: boolean }

interface Held { bundle: PluginPackageBundle; pkg: KeptPackage; runtime_scope: 'home' | 'project'; key_id: string; spki: string; project_id: string; actor_id: string; expires: number }

const scopeOf = (manifest: KeptSandboxPackage['manifest']): 'home' | 'project' => manifest.runtime?.scope === 'home' ? 'home' : 'project';

/** Two different ids on one dotted path (`io.a.b` and `io.a.b.c`), one below the other: the Runtime's test for ids that may not share a path (S-75). */
const nested = (a: string, b: string): boolean => a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/**
 * A plugin id the Host's build ships, or one on its dotted path (`io.a.b` and `io.a.b.c`), is the Host's (S-75.2): a package takes neither,
 * in either range. The Runtime refuses it again when it installs; here it is refused at the preview, before anything is written (S-84).
 */
const assertNotHostId = (pluginId: string): void => {
  const reserved = [...HOST_PLUGIN_IDS].find(id => id === pluginId || nested(id, pluginId));
  if (reserved) throw pluginErrors.id_namespace_conflict(`插件 ID ${pluginId} 与随宿主发布的 ${reserved} 冲突`);
};

/**
 * An installed plugin of another publisher on the dotted path of a package's plugin id (`io.a.b` and `io.a.b.c`, either one below the other) refuses the
 * package: only the same pinned key's ids may nest (S-75). The Runtime refuses it again when it installs; here it is refused at the confirmation, before
 * the publisher is pinned or the package is kept (S-84). `installed` is what the package's Runtime holds that is not uninstalled.
 */
const assertIdPathFree = (pluginId: string, keyId: string, installed: readonly InstalledPluginEntry[]): void => {
  const holder = installed.find(({ record }) => record.plugin_id !== pluginId && nested(record.plugin_id, pluginId)
    && (record.publisher_trust !== 'pinned' || record.publisher_signature !== keyId));
  if (holder) throw pluginErrors.id_namespace_conflict(`插件 ID ${pluginId} 与另一个发布者已装的 ${holder.record.plugin_id} 在同一条点分路径上，不能安装`);
};

/** A package's role materials as the preview lists them, and in an upgrade how each changed against the installed package's. */
function rolePreviews(bodies: readonly SandboxAgentBody[], installed?: readonly SandboxAgentBody[]): NonNullable<PluginInstallPreviewResult['agent_bodies']> {
  const roles = (all: readonly SandboxAgentBody[]) => all.filter(body => body.kind === 'role'), next = roles(bodies), old = installed && roles(installed);
  const preview = (body: SandboxAgentBody, change?: 'added' | 'changed' | 'removed') => ({ kind: 'role' as const, name: body.name, excerpt: Array.from(body.body).slice(0, 200).join(''), body: body.body, total_chars: Array.from(body.body).length, truncated: Array.from(body.body).length > 200, ...(change ? { change } : {}) });
  const previews = next.map(body => {
    const previous = old?.find(item => item.entry_id === body.entry_id);
    return preview(body, old === undefined ? undefined : !previous ? 'added' : previous.body !== body.body ? 'changed' : undefined);
  });
  for (const body of old ?? []) if (!next.some(item => item.entry_id === body.entry_id)) previews.push(preview(body, 'removed'));
  return previews;
}

export class PluginInstallService {
  private readonly held = new Map<string, Held>();
  constructor(private readonly ports: PluginInstallPorts) {}

  private now(): string { return this.ports.now?.() ?? new Date().toISOString(); }

  private pinOf(keyId: string): PluginPublisherPin | undefined { return this.ports.ledger.publishers().find(pin => pin.key_id === keyId); }

  /** The packages this release ships, read and verified now; listing them installs nothing and registers nothing. */
  async bundled(): Promise<BundledPluginList> {
    const { packages, refused } = this.ports.bundledDirectory ? await readBundledPackages(this.ports.bundledDirectory) : { packages: [], refused: [] };
    const pins = this.ports.ledger.publishers();
    return {
      plugins: packages.map(({ manifest, key_id }) => {
        const pin = pins.find(item => item.key_id === key_id);
        return { plugin_id: manifest.plugin_id, version: manifest.version, name: manifest.name, name_en: manifest.name_en ?? null, summary: manifest.summary ?? null,
          runtime_scope: scopeOf(manifest), publisher: { publisher_id: manifest.publisher.publisher_id, key_id, pinned_label: pin?.label ?? null, revoked: Boolean(pin?.revoked_at) } };
      }),
      refused: refused.map(({ file, error }) => ({ file, code: error.code, message: error.message })),
    };
  }

  /**
   * The bundle a bundled package is, as its file lies now: the one the person saw in the list (`version`), or the refusal its file
   * raises. It is then previewed as any package is, signature and all.
   */
  private async bundledBundle(reference: { plugin_id: string; version: string }): Promise<unknown> {
    if (!this.ports.bundledDirectory) throw pluginErrors.definition_missing('这个安装包没有随包带上的插件');
    const { packages, refused } = await readBundledPackages(this.ports.bundledDirectory);
    const found = packages.find(item => item.manifest.plugin_id === reference.plugin_id);
    if (!found) throw refused.find(item => item.file === `${reference.plugin_id}.json`)?.error ?? pluginErrors.definition_missing(`这个安装包没有随包带上 ${reference.plugin_id}`);
    const { version } = found.manifest;
    if (version !== reference.version) throw pluginErrors.definition_missing(`随包带上的 ${reference.plugin_id} 是 ${version}，不是 ${reference.version}：请重新打开列表`);
    return found.bundle;
  }

  /** Checks a package and says what installing it means. Writes nothing durable: the preview is held in memory for the confirmation. */
  async preview(input: PluginInstallPreviewInput, who: { project_id: string; actor_id: string }): Promise<PluginInstallPreviewResult> {
    const { bundle, key_id, public_key_spki_base64 } = verifyPluginPackageSignature('bundled' in input ? await this.bundledBundle(input.bundled) : input.bundle);
    const pkg = readKeptPackage(bundle.payload);
    const pin = this.pinOf(key_id);
    if (pin?.revoked_at) throw pluginErrors.publisher_revoked('这个发布者的固定已被撤销，它的包不能再安装');
    const { manifest } = pkg, runtime_scope = scopeOf(manifest);
    if (runtime_scope === 'home') assertHomePackageAllowed(manifest);
    if (manifest.databases?.home) await validateSandboxHomeSchema(manifest.databases.home);
    this.assertScopeKept(manifest, message => pluginErrors.declaration_invalid(message));
    await this.assertIntegrationsFree(manifest);
    assertNotHostId(manifest.plugin_id);
    for (const [id, entry] of this.held) if (entry.expires <= Date.now()) this.held.delete(id);
    if (this.held.size >= MAX_PREVIEWS) this.held.delete(this.held.keys().next().value as string);
    const rows = runtime_scope === 'home' ? await this.ports.homeInstalled?.() ?? [] : await this.ports.installed(who.project_id);
    const current = rows.find(({ record }) => record.plugin_id === manifest.plugin_id && record.publisher_signature === manifest.publisher.signature && record.state !== 'uninstalled');
    // Only an upgrade has bodies to compare: any other package is refused at the confirmation (S-84), even when the kept one is gone.
    const installed = current && !upgradeRefusal(manifest, current.record.version) ? this.ports.packages.load(manifest.plugin_id, manifest.publisher.signature, current.record.version).packaged : undefined;
    const skills = skillInstallPreviews(pkg, installed), agent_bodies = rolePreviews('agentBodies' in pkg ? pkg.agentBodies : [], installed && (installed.agentBodies ?? []));
    if (current) {
      // A pack's Skills keep their state in the scope the pack installs into: the personal space for a home pack, this project otherwise.
      const states = this.ports.skillStates?.(runtime_scope === "home" ? "home" : who.project_id, current.record.install_id);
      for (const skill of skills) skill.state = states?.get(skill.skill_id) ?? "off";
    }
    const requires = (manifest.requires ?? []).map(({ capability_id, version, optional, reason }) => ({ capability_id, version, optional: optional === true, reason,
      satisfied: this.offers(who.project_id, { capability_id, version }) }));
    const preview_id = randomUUID();
    this.held.set(preview_id, { bundle, pkg, runtime_scope, key_id, spki: public_key_spki_base64, project_id: who.project_id, actor_id: who.actor_id, expires: Date.now() + PREVIEW_TTL_MS });
    return { preview_id, name: manifest.name, runtime_scope, ...(agent_bodies.length ? { agent_bodies } : {}), ...(skills.length ? { skills } : {}), ...(requires.length ? { requires } : {}),
      effects: pkg.permissions, publisher: { key_id, pinned_label: pin?.label ?? null },
      preview: { plugin_id: manifest.plugin_id, version: manifest.version, trust: 'pinned', publisher_signature: manifest.publisher.signature, publisher_pinned: pin !== undefined,
        permissions: permissionViews(manifest, manifest.kind === 'app' ? sandboxRequestedPermissions(pkg.permissions) : undefined), declarations: declarationsNeedingConsent(manifest, () => undefined), jobs: jobViews(manifest) },
      ...manifest.kind === 'integration' ? { origins: (manifest.connection_services ?? []).flatMap(service => service.origins
        ? [{ service_id: service.service_id, title: service.title, origins: [...service.origins] }] : []) } : {} };
  }

  private offers(projectId: string, reference: { capability_id: string; version: number }): boolean {
    if (!this.ports.offers) throw pluginErrors.state_invalid('这个宿主核对不了插件依赖的动作，装不了写了 requires 的包');
    return this.ports.offers(projectId, reference);
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
  async confirm(input: { preview_id: string; consent: boolean; pin_label?: string }, who: { project_id: string; actor_id: string }, caller?: ActionExecutionContext): Promise<{ plugin_id: string; version: string; publisher_key_id: string }> {
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
    // Each scope checks its own installations. Only the installed publisher can upgrade a signed package; another publisher is refused
    // before it can be pinned or kept. An id belonging to the Host's own plugins was already refused at preview.
    const inHome = held.runtime_scope === 'home';
    const entries = inHome ? await (this.ports.homeInstalled?.() ?? []) : await this.ports.installed(held.project_id);
    const present = entries.find(item => item.record.plugin_id === held.pkg.manifest.plugin_id && (!inHome || item.record.publisher_trust === 'pinned'));
    if (present && present.record.publisher_signature !== held.key_id) {
      throw pluginErrors.definition_conflict(`这个插件已经由另一个发布者装进了${inHome ? ' Home' : '这个项目'}，两边不能互相替换：先卸载，再装`);
    }
    // The two refusals the install makes after the package is kept, asked here instead: an id on the dotted path of another publisher's installed
    // plugin (the Runtime's, S-75), and a package of the plugin's own publisher that is not its upgrade (the install lifecycle's, BL-623).
    assertIdPathFree(held.pkg.manifest.plugin_id, held.key_id, entries);
    if (present) {
      assertUpgradeOf(held.pkg.manifest, present.record.version);
      // The installed package may have moved since the preview: its Skills' versions are asked again against the one installed now (SKC-04).
      skillInstallPreviews(held.pkg, this.ports.packages.load(present.record.plugin_id, present.record.publisher_signature, present.record.version).packaged);
    }
    await caller?.beforeEffect();
    const assertCurrent = () => { caller?.signal?.throwIfAborted(); caller?.assert_authority_current?.(); };
    assertCurrent();
    // The caller may have waited while the publisher was revoked, so use the live pin at the commit boundary.
    const currentPin = this.pinOf(held.key_id);
    if (currentPin?.revoked_at) throw pluginErrors.publisher_revoked('这个发布者的固定已被撤销，它的包不能再安装');
    if (!currentPin) {
      const label = input.pin_label?.trim();
      if (!label) throw pluginErrors.publisher_untrusted('这个发布者还没有被固定：要装它的包，请先确认信任它');
      if (label.length > 80) throw new ActionError('actions.input_invalid', '发布者的名称不超过 80 个字');
      this.ports.ledger.pinPublisher({ key_id: held.key_id, public_key_spki_base64: held.spki, label, pinned_at: this.now(), pinned_by: who.actor_id });
      consentsChanged();
    }
    const directory = this.ports.packages.save(held.bundle, held.pkg);
    const release = packagedRelease(held.pkg, directory, this.now());
    if (held.runtime_scope === 'home') await this.ports.installInHome(release, assertCurrent);
    else await this.ports.installInProject(held.project_id, release, assertCurrent);
    return { plugin_id: held.pkg.manifest.plugin_id, version: held.pkg.manifest.version, publisher_key_id: held.key_id };
  }

  /** Switches a signed-package installation of the project off or on, or takes it off (BL-623); a plugin that did not come from a signed package is not touched here. */
  async control(action: 'disable' | 'enable' | 'uninstall', input: { plugin_id: string; keep_data: boolean }, who: { project_id: string }): Promise<string> {
    return this.ports.control(who.project_id, input.plugin_id, action, { keep_data: input.keep_data });
  }

  /** The same for a signed package installed in the Home, from the Host settings door (BL-715). */
  async controlHome(action: 'disable' | 'enable' | 'uninstall', input: { plugin_id: string; keep_data: boolean }): Promise<string> {
    const { homeControl } = this.ports;
    if (!homeControl) throw pluginErrors.state_invalid('这个宿主没有个人空间');
    return homeControl(input.plugin_id, action, { keep_data: input.keep_data });
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
    return this.switchPermission(() => this.ports.installed(projectId), regrant && (expected => regrant(projectId, installId, permission, granted, expected)), installId, permission, granted);
  }

  /** The same switch for a plugin that runs as the Home's own instance, shared by every project (BL-700, S-94). */
  async setHomePermission(installId: string, permission: string, granted: boolean): Promise<{ install_id: string; permissions: PluginInstalledPermissionView[]; changed: boolean }> {
    const { homeInstalled, homeRegrant } = this.ports;
    if (!homeInstalled) throw pluginErrors.state_invalid('这个宿主没有个人空间');
    return this.switchPermission(homeInstalled, homeRegrant && (expected => homeRegrant(installId, permission, granted, expected)), installId, permission, granted);
  }

  private async switchPermission(list: () => Promise<InstalledPluginEntry[]>, regrant: ((expected: PermissionSwitchTarget) => Promise<void>) | undefined, installId: string,
    permission: string, granted: boolean): Promise<{ install_id: string; permissions: PluginInstalledPermissionView[]; changed: boolean }> {
    const find = async () => (await list()).find(entry => entry.record.install_id === installId);
    const before = await find();
    if (!before?.manifest) throw pluginErrors.definition_missing('这里没有这个插件的安装，或读不到它安装时的声明');
    if (granted) {
      const requested = this.requested(before);
      if (requested !== undefined && !requested.includes(permission)) throw pluginErrors.grant_denied('这个权限只是资源形状声明，本次操作没有请求，不能授予');
    }
    if (!regrant) throw pluginErrors.state_invalid('这个宿主不能改插件的授权');
    await regrant(before.record);
    const after = await find();
    if (!after?.manifest) throw pluginErrors.definition_missing('这个插件的安装已经不在');
    const held = new Set(before.record.grants);
    return { install_id: installId, permissions: this.views([after])[0]!.permissions.slice(),
      changed: after.record.grants.length !== held.size || after.record.grants.some(grant => !held.has(grant)) };
  }

  private requested(entry: InstalledPluginEntry): readonly string[] | undefined {
    if (entry.record.execution !== 'sandbox' || entry.record.publisher_trust !== 'pinned' || entry.manifest?.kind !== 'app') return undefined;
    const saved = this.ports.packages.load(entry.record.plugin_id, entry.record.publisher_signature, entry.record.version);
    return sandboxRequestedPermissions(saved.permissions);
  }

  private views(entries: InstalledPluginEntry[]): PluginInstalledView[] {
    return installedPluginViews(entries.map(entry => {
      try { return { ...entry, requestedPermissions: this.requested(entry) }; }
      catch (error) { return { ...entry, manifest: undefined, recoveryError: error instanceof Error ? error.message : String(error) }; }
    }), this.ports.ledger);
  }

  /** The Home's own plugins as the settings page shows them: the same view as a project's, for the instance every project shares. */
  async homeInstalled(): Promise<PluginInstalledView[]> {
    return this.views(await (this.ports.homeInstalled?.() ?? []));
  }

  /** The project's installed plugins as their detail page shows them: trust, permissions, jobs and the person's agreements. */
  async installed(projectId: string): Promise<PluginInstalledView[]> { return this.views(await this.ports.installed(projectId)); }
}
