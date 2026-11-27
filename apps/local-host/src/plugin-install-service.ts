import type { InstalledPackageRepair } from './installed-plugin-common.js';
import { projectDirectoryWords } from '@molis-ai/molis-work-ui-host';
import { isPluginSceneName } from '@molis-ai/molis-work-contracts/platform/plugin-agent';
import { cutHead } from '@molis-ai/molis-work-plugin-sdk/whole-units';
import { builtinActiveSkillScenes, SKILL_SCENES_MAX, skillAudienceActive, skillSceneChoicesOf, type ActiveSkillScene } from './memory/memory-plugin-scene.js';
import { directoryWordResolver, manifestWordResolver, registeredInstallationText } from './ui-text-provider.js';
import { activeLocale } from './web-locale.js';
/**
 * Installing a plugin from a signed package (ac-trust T2, specs/archive/repository-anti-corruption/slices/ac-trust-install.md §3.1): a sandbox
 * package, or the content package of a plugin with only declarations (specs/skill-packs/contract-design.md §3, §5). One path for every
 * package: a preview that checks it and tells the person what installing means, then a confirmation that pins the publisher (when the
 * person says so), keeps the package and installs it under the trust that pin gives. Nothing is written before the package has been
 * verified and read: a package that is unsigned, signed by a key its Manifest does not name, altered, from a revoked publisher, or not in
 * its format stops at the preview, and the confirmation takes only a preview the Host itself made.
 */
import { randomUUID } from 'node:crypto';
import { ActionError, requireSynchronous, type ActionExecutionContext } from '@molis-ai/molis-work-contracts/platform/actions';
import { HOST_PLUGIN_ID_PREFIX, PLATFORM_ID_PREFIX, pluginErrors, type PluginManifest, type PluginPackageBundle, type SandboxAgentBody } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SurfaceInstallationRef } from '@molis-ai/molis-work-contracts/services/surface-composition';
import type { SkillInstallPreview, SkillSceneChoice } from '@molis-ai/molis-work-contracts/services/skills';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { PluginInstalledPermissionView, PluginInstalledView, PluginInstallPreview, PluginPublisherPin, PluginUninstallTarget, ProjectPluginInstalledView } from '@molis-ai/molis-work-contracts/platform/plugin-trust';
import { declarationsNeedingConsent, verifyPluginPackageSignature, type PluginConsentLedger } from '@molis-ai/molis-work-plugin-runtime';
import type { InstalledRelease, PackageInstallChoices, PackageInstallSecret } from './installed-release.js';
import { consentsChanged } from './consent-revision.js';
import type { LocalPackageSignInput } from '@molis-ai/molis-work-contracts/platform/plugin-trust';
import { assertSafeManifestPatterns, readKeptPackage, type KeptPackage, type KeptSandboxPackage } from './sandbox-package.js';
import { skillInstallPreviews } from './skill-install-preview.js';
import { packagedRelease, type SandboxPackageStore } from './sandbox-package-store.js';
import { assertHomePackageAllowed } from './home-package-admission.js';
import { HOST_PLUGIN_IDS, RELEASE_PACKAGE_IDS } from './host-plugin-ids.js';
import { assertUpgradeOf, upgradeRefusal } from './package-upgrade.js';
import { isPendingUninstall } from './installed-plugin-lifecycle.js';
import { installedPluginViews, jobViews, permissionViews, type InstalledPluginEntry } from './plugin-installed-view.js';
import type { PermissionSwitchTarget } from './plugin-installed-view.js';
import { sandboxProjectedPermissions, sandboxRequestedPermissions } from '@molis-ai/molis-work-plugin-sdk';
import { assertConnectorText, connectorWords } from "./connector-words.js";
import { validateSandboxHomeSchema } from './plugin-sandbox-home-library.js';
import { assertSurfacePresentation, withSurfacePresentationCheck, type SurfaceInstallCatalog } from './surface-installation.js';
import { readBundledPackages } from './bundled-packages.js';
import type { PackageControlOutcome } from './uninstall-retained.js';

/** A preview waits this long for its confirmation, and at most this many wait at once. */
const PREVIEW_TTL_MS = 15 * 60_000;
const MAX_PREVIEWS = 16;

export type ProjectPackageControl = { plugin_id: string } & (
  | { action: 'enable'; expected_installation: SurfaceInstallationRef & { scope: 'project' }; caller: ActionExecutionContext }
  | { action: 'disable' | 'uninstall'; keep_data: boolean; target?: PluginUninstallTarget; assertCurrent?: () => void }
);

export interface PluginInstallPorts {
  /**
   * This Home's own publisher identity, for the bundled packages the release ships unsigned (`BundledDraft`): the id it signs under
   * (null before the Home has one) and the signing itself, done within the caller's authority. A Host without it lists and installs no draft.
   */
  localSigner?: { keyId(): string | null; sign(draft: LocalPackageSignInput, caller: InstallAuthority): Promise<PluginPackageBundle> };
  skillStates?(scopeRef: string, installId: string): ReadonlyMap<string, import("@molis-ai/molis-work-contracts/services/skills").SkillState>;
  /** Whether a scene the package declares is one this running Home's memory does not list yet (BL-b44-coding-scene-enum). */
  sceneAfterRestart?(scene: unknown): boolean;
  /** Active plugin scenes registered in the target scope (`null` for Home, or a project id); without it, built-in scenes only. */
  activeSkillScenes?(projectId: string | null, locale?: string): Promise<ReadonlyMap<string, ActiveSkillScene>>;
  ledger: PluginConsentLedger;
  packages: SandboxPackageStore;
  /** Installs a release in the current project. The owner runs `complete` synchronously after refresh and authority checks, inside its compensation window. */
  installInProject(projectId: string, release: InstalledRelease, assertCurrent?: () => void, complete?: () => void, choices?: PackageInstallChoices): Promise<void>;
  /** Installs a release in the Home: one instance every project shares, which a package asks for in its Manifest (`runtime.scope`, BL-628). */
  installInHome(release: InstalledRelease, assertCurrent?: () => void, complete?: () => void, choices?: PackageInstallChoices): Promise<void>;
  /** The names of the keys already saved for a plugin where the package installs (a project, or the Home: null); never a value. A Host without it says none. */
  savedSecrets?(projectId: string | null, pluginId: string): Promise<readonly string[]>;
  runHomeInstallation?<Result>(operation: (assertOpen: () => void) => Promise<Result>): Promise<Result>;
  presentationCatalog?(projectId: string | null): Promise<SurfaceInstallCatalog>;
  /**
   * Refuses an integration package (BL-530) whose plugin id, services or integrations the Home's registry already has from another,
   * built-in or installed (`plugin.integration_declaration_conflict`, naming the id and its holder).
   */
  assertIntegrationsFree?(manifest: PluginManifest): Promise<void>;
  /** The plugins installed in the project, each with the Manifest it was installed with. */
  installed(projectId: string): Promise<InstalledPluginEntry[]>;
  /** Whether some provider offers this action in the project now: what the preview says of each of a package's `requires`. A Host without it previews no package that requires any. */
  offers?(projectId: string, reference: { capability_id: string; version: number }): boolean;
  /** Switches one installation of a signed package off or on, or takes it off; answers the state it is in afterwards. */
  control(projectId: string, input: ProjectPackageControl): Promise<PackageControlOutcome>;
  /** Repairs exactly the installation granted by a protected settings entry. */
  repair?(input: InstalledPackageRepair, caller: ActionExecutionContext): Promise<{ plugin_id: string; version: string }>;
  /** Switches one optional permission of an installation in the project and restarts it on the new grants (`PluginRuntime.regrant`); a Host that cannot leaves it out. */
  regrant?(projectId: string, installId: string, permission: string, granted: boolean, expected?: PermissionSwitchTarget): Promise<void>;
  /** The same two for the plugins that run as the Home's own instance (BL-700); a Host without a Home leaves them out. */
  homeInstalled?(): Promise<InstalledPluginEntry[]>;
  homeRegrant?(installId: string, permission: string, granted: boolean, expected?: PermissionSwitchTarget): Promise<void>;
  /** Switches a signed package installed in the Home off or on, or takes it off (BL-715); answers its state afterwards. A Host without a Home leaves it out. */
  homeControl?(pluginId: string, action: 'disable' | 'enable' | 'uninstall', input: { keep_data: boolean; target?: PluginUninstallTarget }, caller?: InstallAuthority): Promise<PackageControlOutcome>;
  /** The release's folder of the packages it ships uninstalled (`bundledPackagesDirectory`); a Host without one ships none. */
  bundledDirectory?: string;
  /** Synchronously notified when a publisher pin is revoked so live work terminals and open installations stop immediately (S-87). */
  onPublisherRevoked?(keyId: string): void;
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
  summary: string | null;
  runtime_scope: 'home' | 'project';
  dual_instance?: true;
  publisher: { publisher_id: string; key_id: string; pinned_label: string | null; revoked: boolean };
  /** `true`: the release ships it unsigned and this Home signs it with its own publisher identity when the person installs it; `key_id` is that identity's, empty before the Home has one. */
  signed_here?: true;
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
  /** True when confirming installs both a Home half and a project half (PEQ-06). */
  dual_instance?: true;
  preview: PluginInstallPreview;
  /** What the plugin's operations ask for in all: confirming approves exactly this. */
  effects: SandboxEffects;
  /** `local`: signed with this Home's own publisher identity (a package made on this computer). */
  publisher: { key_id: string; pinned_label: string | null; local?: true };
  /** The keys the package's requests name (`effects.secretRefs`), each with whether one is saved where it installs; never a value. */
  secrets?: Array<{ name: string; saved: boolean }>;
  /** The role materials the package ships, and in an upgrade how each changed. Its methods are Skills, listed in `skills`. */
  agent_bodies?: Array<{ kind: 'role'; name: string; excerpt: string; body: string; total_chars: number; truncated: boolean; change?: 'added' | 'changed' | 'removed' }>;
  /** Every Skill the package declares (its Manifest's `methods`), and in an upgrade what changed (specs/skill-packs/contract-design.md §5). */
  skills?: SkillInstallPreview[];
  /** Active plugin scenes (plus this package's own declared scene, if any) for formatting `skills` in the install review. */
  skill_scenes?: SkillSceneChoice[];
  /** The actions the Manifest `requires`, each with whether a provider offers it in this project now. */
  requires?: PluginRequirementPreview[];
  /**
   * Only an integration package's: the exact origins its requests with the person's account may reach, per service it declared them for
   * (S-95, BL-691). They are part of the signed package, so they stay what the person saw: another set comes only with another package and its own preview.
   */
  origins?: Array<{ service_id: string; title: string; origins: string[] }>;
  /** The package declares a scene this running Molis Work does not list yet: its memories in that scene start after the next restart (BL-b44-coding-scene-enum). */
  memory_scene_after_restart?: true;
}

/** One of a Manifest's `requires`, as the preview says it: an unmet required one makes its Skills unavailable, an unmet optional one only less. */
export interface PluginRequirementPreview { capability_id: string; version: number; optional: boolean; reason: string; satisfied: boolean }

type PreviewOwner = { project_id: string; actor_id: string };
type InstallAuthority = Pick<ActionExecutionContext, 'beforeEffect' | 'signal' | 'assert_authority_current'> & { locale?: string };

interface Held extends PreviewOwner {
  bundle: PluginPackageBundle;
  pkg: KeptPackage;
  view: PluginInstallPreviewResult;
  spki: string;
  expires: number;
}

/** What confirming answers: the installed plugin, and the optional switches of an upgrade that could not be moved (the upgrade itself stands). */
export interface PluginInstallConfirmResult { plugin_id: string; version: string; publisher_key_id: string; permission_changes_failed?: string[] }
export interface PluginInstallConfirmInput {
  preview_id: string;
  consent: boolean;
  pin_label?: string;
  /**
   * The optional permissions that are to be on once this is installed, of those the preview listed as optional and requested. A first
   * installation starts with them; an upgrade moves each switch that differs from the installation's. Absent: a first installation
   * holds only what is required, an upgrade keeps its switches.
   */
  optional_permissions?: string[];
}

/**
 * Keys the person typed in the trusted confirmation, held for the one `confirm` of their preview (the id is the Host's own random one
 * and is used up by that call). They never ride in an action's input: the confirmation's own Host route puts them here, and the
 * lifecycle seals them.
 */
const stagedSecrets = new Map<string, { secrets: PackageInstallSecret[]; expires: number }>();
export function stageInstallSecrets(previewId: string, secrets: readonly PackageInstallSecret[]): void {
  const now = Date.now();
  for (const [id, entry] of stagedSecrets) if (entry.expires <= now) stagedSecrets.delete(id);
  if (stagedSecrets.size >= MAX_PREVIEWS) stagedSecrets.delete(stagedSecrets.keys().next().value!);
  stagedSecrets.set(previewId, { secrets: secrets.map(secret => ({ ...secret })), expires: now + PREVIEW_TTL_MS });
}
function takeInstallSecrets(previewId: string): PackageInstallSecret[] {
  const entry = stagedSecrets.get(previewId);
  stagedSecrets.delete(previewId);
  return entry && entry.expires > Date.now() ? entry.secrets : [];
}

export function assertInstallAuthority(caller?: InstallAuthority): void {
  const signal = caller?.signal;
  if (signal?.aborted) {
    const reason: unknown = signal.reason;
    throw reason instanceof ActionError ? reason : new ActionError('actions.cancelled', '这次插件操作已取消');
  }
  requireSynchronous(caller?.assert_authority_current?.());
}

function requireHeldPreview(held: Held | undefined, who: PreviewOwner): Held {
  if (!held || held.expires <= Date.now() || held.project_id !== who.project_id || held.actor_id !== who.actor_id) throw pluginErrors.preview_unknown('没有这次安装的预览，或它已过期；请重新预览');
  return held;
}

const scopeOf = (manifest: KeptSandboxPackage['manifest']): 'home' | 'project' => manifest.runtime?.scope === 'home' ? 'home' : 'project';
const isDualPackage = (manifest: KeptSandboxPackage['manifest']): boolean => manifest.runtime?.scope === 'home' && manifest.runtime.dual_instance === true;
const rangeOf = (manifest: KeptSandboxPackage['manifest']): 'dual' | 'home' | 'project' => isDualPackage(manifest) ? 'dual' : scopeOf(manifest);

/** Two different ids on one dotted path (`io.a.b` and `io.a.b.c`), one below the other: the Runtime's test for ids that may not share a path (S-75). */
const nested = (a: string, b: string): boolean => a.startsWith(`${b}.`) || b.startsWith(`${a}.`);

/**
 * A plugin id the Host's build ships, or one on its dotted path (`io.a.b` and `io.a.b.c`), is the Host's (S-75.2): a package takes neither,
 * in either range. The Runtime refuses it again when it installs; here it is refused at the preview, before anything is written (S-84).
 */
const assertNotHostId = (pluginId: string, fromRelease: boolean): void => {
  const reserved = [...HOST_PLUGIN_IDS].find(id => id === pluginId || nested(id, pluginId));
  if (reserved) throw pluginErrors.id_namespace_conflict(`插件 ID ${pluginId} 与随宿主发布的 ${reserved} 冲突`);
  // S-reserved-host-prefix: the Host's prefix is taken only by what the release itself carries, and only from its own bundled folder.
  if (pluginId.startsWith(PLATFORM_ID_PREFIX))
    throw pluginErrors.id_namespace_conflict(`插件 ID ${pluginId} 用了平台自己的前缀 ${PLATFORM_ID_PREFIX}，请换成你自己的名字`);
  if (pluginId.startsWith(HOST_PLUGIN_ID_PREFIX) && !(fromRelease && RELEASE_PACKAGE_IDS.has(pluginId)))
    throw pluginErrors.id_namespace_conflict(`插件 ID ${pluginId} 用了只给随宿主发布的插件的前缀 ${HOST_PLUGIN_ID_PREFIX}，请换成你自己的名字`);
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

function checkExistingInstall(entries: readonly InstalledPluginEntry[], manifest: KeptSandboxPackage['manifest'], keyId: string, inHome: boolean, allowSameVersion = false): InstalledPluginEntry | undefined {
  const present = entries.find(item => item.record.plugin_id === manifest.plugin_id && (!inHome || item.record.publisher_trust === 'pinned'));
  if (present && isPendingUninstall(present.record)) throw pluginErrors.uninstall_cleanup_pending('上次卸载还没有清理完：请先在设置里重试卸载，再安装');
  if (present && present.record.publisher_signature !== keyId) {
    throw pluginErrors.definition_conflict(`这个插件已经由另一个发布者装进了${inHome ? ' Home' : '这个项目'}，两边不能互相替换：先卸载，再装`);
  }
  assertIdPathFree(manifest.plugin_id, keyId, entries);
  if (present && !(allowSameVersion && present.record.version === manifest.version)) {
    assertUpgradeOf(manifest, present.record.version);
  }
  return present;
}

export class PluginInstallService {
  private readonly held = new Map<string, Held>();
  constructor(private readonly ports: PluginInstallPorts) {}

  private now(): string { return this.ports.now?.() ?? new Date().toISOString(); }

  private pinOf(keyId: string): PluginPublisherPin | undefined { return this.ports.ledger.publishers().find(pin => pin.key_id === keyId); }

  /** The packages this release ships, read and verified now; listing them installs nothing and registers nothing. */
  async bundled(): Promise<BundledPluginList> {
    const { packages, drafts, refused } = this.ports.bundledDirectory ? await readBundledPackages(this.ports.bundledDirectory) : { packages: [], drafts: [], refused: [] };
    const pins = this.ports.ledger.publishers();
    const locale = activeLocale();
    const view = (manifest: PluginManifest, key_id: string, localePacks: KeptPackage['localePacks']): BundledPluginView => {
      const pin = pins.find(item => item.key_id === key_id);
      const { name, summary } = projectDirectoryWords(manifest, localePacks && locale ? directoryWordResolver(localePacks, locale) : undefined);
      return { plugin_id: manifest.plugin_id, version: manifest.version, name, summary: summary ?? null,
        runtime_scope: scopeOf(manifest), ...(isDualPackage(manifest) ? { dual_instance: true as const } : {}), publisher: { publisher_id: manifest.publisher.publisher_id, key_id, pinned_label: pin?.label ?? null, revoked: Boolean(pin?.revoked_at) } };
    };
    // A draft is this Home's to sign: it is listed only where this Host can sign one, under the identity it would be signed with.
    const here = this.ports.localSigner ? this.ports.localSigner.keyId() ?? '' : null;
    return {
      plugins: [...packages.map(({ manifest, key_id, localePacks }) => view(manifest, key_id, localePacks)),
        ...(here === null ? [] : drafts.map(({ manifest, localePacks }) => ({ ...view(manifest, here, localePacks), signed_here: true as const })))],
      refused: refused.map(({ file, error }) => ({ file, code: error.code, message: error.message })),
    };
  }

  /**
   * The bundle a bundled package is, as its file lies now: the one the person saw in the list (`version`), or the refusal its file
   * raises. It is then previewed as any package is, signature and all.
   */
  private async bundledBundle(reference: { plugin_id: string; version: string }, caller?: InstallAuthority): Promise<unknown> {
    if (!this.ports.bundledDirectory) throw pluginErrors.definition_missing('这个安装包没有随包带上的插件');
    const { packages, drafts, refused } = await readBundledPackages(this.ports.bundledDirectory);
    const found = packages.find(item => item.manifest.plugin_id === reference.plugin_id) ?? (this.ports.localSigner ? drafts.find(item => item.manifest.plugin_id === reference.plugin_id) : undefined);
    if (!found) throw refused.find(item => item.file === `${reference.plugin_id}.json` || item.file === `${reference.plugin_id}.draft.json`)?.error ?? pluginErrors.definition_missing(`这个安装包没有随包带上 ${reference.plugin_id}`);
    const { version } = found.manifest;
    if (version !== reference.version) throw pluginErrors.definition_missing(`随包带上的 ${reference.plugin_id} 是 ${version}，不是 ${reference.version}：请重新打开列表`);
    if ('bundle' in found) return found.bundle;
    // Shipped unsigned: signed now with this Home's publisher identity, for this person's preview, then read as any signed package.
    if (!caller) throw new ActionError('actions.forbidden', '给随包带上的待签插件签名需要本人这一次的操作');
    return this.ports.localSigner!.sign(found.draft, caller);
  }

  /** Checks a package and says what installing it means. Writes nothing durable: the preview is held in memory for the confirmation. */
  async preview(input: PluginInstallPreviewInput, who: PreviewOwner, caller?: InstallAuthority): Promise<PluginInstallPreviewResult> {
    const { bundle, key_id, public_key_spki_base64 } = verifyPluginPackageSignature('bundled' in input ? await this.bundledBundle(input.bundled, caller) : input.bundle);
    this.assertPublisherStanding(key_id);
    assertSafeManifestPatterns(bundle.payload.manifest);
    const pkg = readKeptPackage(bundle.payload);
    const { manifest } = pkg, runtime_scope = scopeOf(manifest), dual = isDualPackage(manifest);
    if (runtime_scope === 'home') assertHomePackageAllowed(manifest);
    if (manifest.databases?.home) await validateSandboxHomeSchema(manifest.databases.home);
    if (manifest.databases?.partition) await validateSandboxHomeSchema(manifest.databases.partition);
    this.assertScopeKept(manifest, message => pluginErrors.declaration_invalid(message));
    if (manifest.kind === "integration") assertConnectorText(manifest, { reader: pkg.localePacks });
    await this.assertIntegrationsFree(manifest);
    assertNotHostId(manifest.plugin_id, 'bundled' in input);
    const rows = runtime_scope === 'home' ? await this.ports.homeInstalled?.() ?? [] : await this.ports.installed(who.project_id);
    if (manifest.presentation !== undefined) assertSurfacePresentation(manifest, await this.presentationCatalog(runtime_scope === 'home' ? null : who.project_id));
    const current = rows.find(({ record }) => record.plugin_id === manifest.plugin_id && record.publisher_signature === manifest.publisher.signature && record.state !== 'uninstalled');
    // Only an upgrade has bodies to compare: any other package is refused at the confirmation (S-84), even when the kept one is gone.
    const installed = current && !upgradeRefusal(manifest, current.record.version) ? this.ports.packages.load(manifest.plugin_id, manifest.publisher.signature, current.record.version).packaged : undefined;
    const skills = skillInstallPreviews(pkg, installed), agent_bodies = rolePreviews('agentBodies' in pkg ? pkg.agentBodies : [], installed && (installed.agentBodies ?? []));
    const locale = caller?.locale ?? activeLocale();
    const resolve = manifestWordResolver(pkg.localePacks, locale);
    const name = projectDirectoryWords(manifest, resolve).name;
    let skill_scenes: SkillSceneChoice[] | undefined;
    if ((manifest.methods?.length ?? 0) > 0 || skills.length > 0) {
      const activeScenes = await this.activeSkillScenesFor(runtime_scope, who.project_id, locale ?? undefined);
      this.assertMethodsAudienceActive(manifest, installed, activeScenes);
      if (skills.length > 0) {
        skill_scenes = skillSceneChoicesOf(activeScenes);
        if (isPluginSceneName(manifest.memory_scene) && !activeScenes.has(manifest.memory_scene)) {
          const ownChoice: SkillSceneChoice = { scene: manifest.memory_scene, name: cutHead(name.trim(), 200) || manifest.memory_scene, scope: runtime_scope };
          skill_scenes = [...skill_scenes.slice(0, SKILL_SCENES_MAX - 1), ownChoice];
        }
      }
    }
    if (current) {
      // A pack's Skills keep their state in the scope the pack installs into: the personal space for a home pack, this project otherwise.
      const states = this.ports.skillStates?.(runtime_scope === "home" ? "home" : who.project_id, current.record.install_id);
      for (const skill of skills) skill.state = states?.get(skill.skill_id) ?? "off";
    }
    const requires = (manifest.requires ?? []).map(({ capability_id, version, optional, reason }) => ({ capability_id, version, optional: optional === true, reason,
      satisfied: this.offers(who.project_id, { capability_id, version }) }));
    if (caller) await caller.beforeEffect();
    assertInstallAuthority(caller);
    const pin = this.assertPublisherStanding(key_id);
    const word = connectorWords(manifest.plugin_id, pkg.localePacks);
    const preview_id = randomUUID();
    const refs = pkg.permissions.secretRefs ?? [], saved = refs.length && current ? await this.ports.savedSecrets?.(runtime_scope === 'home' ? null : who.project_id, manifest.plugin_id) ?? [] : [];
    const view: PluginInstallPreviewResult = { preview_id, name, runtime_scope, ...(dual ? { dual_instance: true as const } : {}), ...(agent_bodies.length ? { agent_bodies } : {}), ...(skills.length ? { skills } : {}), ...(skill_scenes ? { skill_scenes } : {}), ...(requires.length ? { requires } : {}),
      ...(this.ports.sceneAfterRestart?.(manifest.memory_scene) ? { memory_scene_after_restart: true as const } : {}),
      effects: pkg.permissions, publisher: { key_id, pinned_label: pin?.label ?? null, ...(this.ports.localSigner?.keyId() === key_id ? { local: true as const } : {}) },
      ...(refs.length ? { secrets: refs.map(name => ({ name, saved: saved.includes(name) })) } : {}),
      preview: { plugin_id: manifest.plugin_id, version: manifest.version, trust: 'pinned', publisher_signature: manifest.publisher.signature, publisher_pinned: pin !== undefined,
        permissions: permissionViews(
          manifest,
          manifest.kind === 'app' ? sandboxRequestedPermissions(pkg.permissions) : undefined,
          sandboxProjectedPermissions(manifest, pkg.permissions, 'contract' in pkg ? pkg.contract.permission_reasons : undefined),
          resolve,
        ), declarations: declarationsNeedingConsent(manifest, () => undefined), jobs: jobViews(manifest) },
      ...manifest.kind === 'integration' ? { origins: (manifest.connection_services ?? []).flatMap(service => service.origins
        ? [{ service_id: service.service_id, title: word(service.title), origins: [...service.origins] }] : []) } : {} };
    const now = Date.now();
    for (const [id, entry] of this.held) if (entry.expires <= now) this.held.delete(id);
    if (this.held.size >= MAX_PREVIEWS) this.held.delete(this.held.keys().next().value!);
    this.held.set(preview_id, { bundle, pkg, view, spki: public_key_spki_base64, project_id: who.project_id, actor_id: who.actor_id, expires: now + PREVIEW_TTL_MS });
    return structuredClone(view);
  }

  /** Read what the person would have seen at preview, with the same owner and expiry checks as confirmation. */
  readPreview(previewId: string, who: PreviewOwner): PluginInstallPreviewResult {
    return structuredClone(requireHeldPreview(this.held.get(previewId), who).view);
  }

  private assertPublisherStanding(keyId: string): PluginPublisherPin | undefined {
    const pin = this.pinOf(keyId);
    if (pin?.revoked_at) throw pluginErrors.publisher_revoked('这个发布者的固定已被撤销，它的包不能再安装');
    return pin;
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

  /** A plugin id keeps the range its first kept package gave it: a package of another range is refused rather than run where its Manifest never asked (BL-628, PEQ-06). */
  private assertScopeKept(manifest: KeptSandboxPackage['manifest'], refuse: (message: string) => Error): void {
    const kept = this.ports.packages.scopeOf(manifest.plugin_id, manifest.publisher.signature), range = rangeOf(manifest);
    if (kept !== undefined && kept !== range) {
      const label = kept === 'dual' ? '双实例' : kept === 'home' ? 'Home' : '项目';
      throw refuse(`插件 ${manifest.plugin_id} 已经以「${label}」范围装过，它的范围不能更换：请给这个包换一个插件 ID`);
    }
  }

  private async activeSkillScenesFor(runtimeScope: 'home' | 'project', projectId: string, locale?: string): Promise<ReadonlyMap<string, ActiveSkillScene>> {
    return this.ports.activeSkillScenes
      ? await this.ports.activeSkillScenes(runtimeScope === 'home' ? null : projectId, locale)
      : builtinActiveSkillScenes();
  }

  private assertMethodsAudienceActive(
    manifest: KeptPackage['manifest'],
    installed: NonNullable<InstalledRelease['packaged']> | undefined,
    activeScenes: ReadonlyMap<string, ActiveSkillScene>,
  ): void {
    for (const method of manifest.methods ?? []) {
      const preserved = installed?.manifest.methods?.some(old => old.skill_id === method.skill_id && old.applies_to === method.applies_to) ?? false;
      if (!preserved && !skillAudienceActive(method.applies_to, activeScenes, manifest.memory_scene)) {
        throw pluginErrors.declaration_invalid(`方法 ${method.skill_id} 的 applies_to「${method.applies_to}」不是这里有的场景：只能是 assistant、both，或这个插件或当前已启用插件申报的场景名`);
      }
    }
  }

  private async presentationCatalog(projectId: string | null): Promise<SurfaceInstallCatalog> {
    const catalog = await this.ports.presentationCatalog?.(projectId);
    if (!catalog || catalog.projectId !== projectId) throw pluginErrors.declaration_invalid('这个宿主核对不了完整的呈现动作目录');
    return catalog;
  }

  /**
   * `complete` is a trusted owner commit supplied by Host composition, never by the preview or action input.
   * Installs what a preview showed. The preview is used up by this call, whatever happens. A publisher the person has not pinned is pinned
   * here only when they said so (`pin_label`); the install then runs under that pin.
   */
  async confirm(input: PluginInstallConfirmInput, who: PreviewOwner, caller?: ActionExecutionContext, complete?: () => void): Promise<PluginInstallConfirmResult> {
    const entry = this.held.get(input.preview_id), secrets = takeInstallSecrets(input.preview_id);
    this.held.delete(input.preview_id);
    const held = requireHeldPreview(entry, who);
    if (input.consent !== true) throw pluginErrors.consent_required('安装前请确认插件要使用的权限');
    const chosen = this.chosen(held, input.optional_permissions, secrets);
    const { runHomeInstallation } = this.ports;
    if (held.view.runtime_scope === 'home' && runHomeInstallation) {
      return runHomeInstallation(assertOpen => this.confirmHeld(held, input.pin_label, who.actor_id, chosen, caller, assertOpen, complete));
    }
    if (held.view.runtime_scope === 'home' && held.pkg.manifest.presentation !== undefined) throw pluginErrors.declaration_invalid('这个宿主没有 Home 安装串行入口');
    return this.confirmHeld(held, input.pin_label, who.actor_id, chosen, caller, undefined, complete);
  }

  /**
   * What the person chose besides agreeing, checked against what the preview showed: a switch only for a permission the preview listed
   * as optional and requested, a key only for a reference the package names. Anything else is refused before the publisher is pinned or
   * the package kept. A package installed as two halves takes no switches here: its halves are switched in the settings.
   */
  private chosen(held: Held, optional: readonly string[] | undefined, secrets: readonly PackageInstallSecret[]): { optional?: string[]; secrets: readonly PackageInstallSecret[] } {
    const offered = held.view.preview.permissions.filter(row => !row.required && row.requested).map(row => row.permission);
    if (optional?.some(permission => !offered.includes(permission))) throw pluginErrors.grant_denied('这个包没有请求这项可选权限，不能在安装时打开');
    if (optional?.length && held.view.dual_instance) throw pluginErrors.grant_denied('这个插件在个人空间和项目里各有一半，可选权限装好后在设置里开');
    const refs = held.pkg.permissions.secretRefs ?? [];
    if (secrets.some(secret => !refs.includes(secret.name)) || new Set(secrets.map(secret => secret.name)).size !== secrets.length) throw new ActionError('actions.input_invalid', '密钥和这个包声明的不一致');
    return { ...(optional ? { optional: [...new Set(optional)] } : {}), secrets };
  }

  private async confirmHeld(held: Held, pinLabel: string | undefined, actorId: string, chosen: { optional?: string[]; secrets: readonly PackageInstallSecret[] }, caller?: ActionExecutionContext, assertOpen?: () => void, complete?: () => void): Promise<PluginInstallConfirmResult> {
    const { runtime_scope, dual_instance, publisher: { key_id } } = held.view;
    const dual = isDualPackage(held.pkg.manifest);
    // The range the person saw is the range of the package: checked again, as another preview may have been confirmed since.
    if (scopeOf(held.pkg.manifest) !== runtime_scope || (dual_instance === true) !== dual) throw pluginErrors.preview_unknown('预览之后这个包的运行范围变了，请重新预览');
    this.assertScopeKept(held.pkg.manifest, message => pluginErrors.preview_unknown(message + '；请重新预览'));
    // Another package may have taken one of its ids since the preview.
    await this.assertIntegrationsFree(held.pkg.manifest);
    this.assertPublisherStanding(key_id);
    // Each scope checks its own installations. Only the installed publisher can upgrade a signed package; another publisher is refused
    // before it can be pinned or kept. An id belonging to the Host's own plugins was already refused at preview.
    const inHome = runtime_scope === 'home';
    const homeEntries = inHome ? await (this.ports.homeInstalled?.() ?? []) : [];
    const projectEntries = (!inHome || dual) ? await this.ports.installed(held.project_id) : [];
    const homePresent = inHome ? checkExistingInstall(homeEntries, held.pkg.manifest, key_id, true, dual) : undefined;
    const projectPresent = (!inHome || dual) ? checkExistingInstall(projectEntries, held.pkg.manifest, key_id, false, false) : undefined;
    const upgraded = homePresent && homePresent.record.version !== held.pkg.manifest.version ? homePresent : projectPresent;
    const currentInstalled = upgraded
      ? this.ports.packages.load(upgraded.record.plugin_id, upgraded.record.publisher_signature, upgraded.record.version).packaged
      : undefined;
    if (upgraded) {
      // The installed package may have moved since the preview: its Skills' versions are asked again against the one installed now (SKC-04).
      skillInstallPreviews(held.pkg, currentInstalled);
    }
    if ((held.pkg.manifest.methods?.length ?? 0) > 0) {
      // A scene plugin active at preview may have been disabled, uninstalled, or revoked before confirmation.
      const activeScenes = await this.activeSkillScenesFor(runtime_scope, held.project_id, caller?.locale ?? activeLocale() ?? undefined);
      this.assertMethodsAudienceActive(held.pkg.manifest, currentInstalled, activeScenes);
    }
    const catalog = held.pkg.manifest.presentation === undefined ? undefined : await this.presentationCatalog(inHome ? null : held.project_id);
    await caller?.beforeEffect();
    const assertCurrent = () => { assertOpen?.(); assertInstallAuthority(caller); };
    assertCurrent();
    const keep = async () => {
      assertCurrent();
      this.assertScopeKept(held.pkg.manifest, message => pluginErrors.preview_unknown(message + '；请重新预览'));
      // The caller may have waited while the publisher was revoked, so use the live pin at the commit boundary.
      const currentPin = this.assertPublisherStanding(key_id);
      if (!currentPin) {
        const label = pinLabel?.trim();
        if (!label) throw pluginErrors.publisher_untrusted('这个发布者还没有被固定：要装它的包，请先确认信任它');
        if (label.length > 80) throw new ActionError('actions.input_invalid', '发布者的名称不超过 80 个字');
        this.ports.ledger.pinPublisher({ key_id, public_key_spki_base64: held.spki, label, pinned_at: this.now(), pinned_by: actorId });
        consentsChanged();
      }
      const directory = this.ports.packages.save(held.bundle, held.pkg);
      const release = packagedRelease(held.pkg, directory, this.now());
      // The installation owner checks authority and commits the dependent owner's state inside its compensation window.
      const present = inHome ? homePresent : projectPresent;
      // A first installation starts with the switches the person chose; an upgrade keeps its own and moves the ones that differ afterwards.
      const choices: PackageInstallChoices = { ...(chosen.secrets.length ? { secrets: chosen.secrets } : {}), ...(!present && chosen.optional?.length ? { optional: chosen.optional } : {}) };
      if (dual) {
        const homeAlreadySame = homePresent?.record.version === held.pkg.manifest.version;
        const dualChoices: PackageInstallChoices | undefined = chosen.secrets.length ? { secrets: chosen.secrets } : undefined;
        if (!homeAlreadySame) await this.ports.installInHome(release, assertCurrent, undefined, dualChoices);
        try { await this.ports.installInProject(held.project_id, release, assertCurrent, complete, dualChoices); }
        catch (error) {
          if (!homePresent && this.ports.homeControl) {
            await this.ports.homeControl(held.pkg.manifest.plugin_id, 'uninstall', { keep_data: false }).catch(() => undefined);
            throw error;
          }
          if (homePresent && !homeAlreadySame) {
            let previousHomeManifest: PluginManifest | undefined;
            try {
              previousHomeManifest = this.ports.packages.load(homePresent.record.plugin_id, homePresent.record.publisher_signature, homePresent.record.version).packaged?.manifest;
            } catch {
              previousHomeManifest = undefined;
            }
            const homeDbChanged = Boolean(
              previousHomeManifest?.databases?.home && held.pkg.manifest.databases?.home
              && previousHomeManifest.databases.home.version !== held.pkg.manifest.databases.home.version,
            );
            const detail = error instanceof Error ? error.message : String(error);
            const partialDetails = {
              ...(error instanceof ActionError && error.details ? error.details : {}),
              dual_partial_upgrade: true,
              plugin_id: held.pkg.manifest.plugin_id,
              project_id: held.project_id,
              home_version: held.pkg.manifest.version,
              previous_home_version: homePresent.record.version,
              home_database_upgraded: homeDbChanged,
            };
            const partialMessage = homeDbChanged
              ? `个人空间部分已升级到 ${held.pkg.manifest.version} 且数据库结构已变更，无法自动回退；项目部分升级失败：${detail}`
              : `个人空间部分已升级到 ${held.pkg.manifest.version}，但项目部分升级失败（请重试或修复该项目半边）：${detail}`;
            if (error instanceof ActionError) {
              throw new ActionError(error.code, partialMessage, { kind: error.kind, details: partialDetails, cause: error });
            }
            throw pluginErrors.upgrade_activation_failed(partialMessage, partialDetails);
          }
          throw error;
        }
      } else if (inHome) await this.ports.installInHome(release, assertCurrent, complete, choices);
      else await this.ports.installInProject(held.project_id, release, assertCurrent, complete, choices);
      const installed = { plugin_id: held.pkg.manifest.plugin_id, version: held.pkg.manifest.version, publisher_key_id: key_id };
      if (!present || !chosen.optional) return installed;
      // The upgrade stands whatever happens to a switch: each one that differs is moved as the settings move it, and one that fails is named.
      const failed: string[] = [], held_now = new Set(present.record.grants), wanted = new Set(chosen.optional);
      for (const row of held.view.preview.permissions) {
        if (row.required || !row.requested || held_now.has(row.permission) === wanted.has(row.permission)) continue;
        try {
          assertCurrent();
          if (inHome) await this.setHomePermission(present.record.install_id, row.permission, wanted.has(row.permission));
          else await this.setPermission(held.project_id, present.record.install_id, row.permission, wanted.has(row.permission));
        } catch { failed.push(row.permission); }
      }
      return failed.length ? { ...installed, permission_changes_failed: failed } : installed;
    };
    return catalog ? withSurfacePresentationCheck(held.pkg.manifest, catalog, keep) : keep();
  }

  /** Switches a signed-package installation of the project off or on, or takes it off (BL-623); a plugin that did not come from a signed package is not touched here. */
  async control(input: ProjectPackageControl, who: { project_id: string }, caller?: InstallAuthority): Promise<PackageControlOutcome> {
    return this.ports.control(who.project_id, input.action === 'enable' ? input : { ...input, assertCurrent: () => assertInstallAuthority(caller) });
  }

  /** The same for a signed package installed in the Home, from the Host settings door (BL-715). */
  async controlHome(action: 'disable' | 'enable' | 'uninstall', input: { plugin_id: string; keep_data: boolean; target?: PluginUninstallTarget }, caller?: InstallAuthority): Promise<PackageControlOutcome> {
    const { homeControl } = this.ports;
    if (!homeControl) throw pluginErrors.state_invalid('这个宿主没有个人空间');
    return homeControl(input.plugin_id, action, { keep_data: input.keep_data, ...input.target ? { target: input.target } : {} }, caller);
  }

  async repair(input: InstalledPackageRepair, caller: ActionExecutionContext): Promise<{ plugin_id: string; version: string }> {
    if (!this.ports.repair) throw pluginErrors.state_invalid('这个宿主没有插件包恢复入口');
    return this.ports.repair(input, caller);
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
    this.ports.onPublisherRevoked?.(keyId);
    return pin;
  }

  /**
   * The person's switch for one optional permission of a plugin installed in this project (PG-002, S-94). The installation must be one of the
   * project's; what the Manifest does not declare, or a required one switched off, is refused by the Runtime (`plugin.grant_denied`).
   * Answers the installation's permissions as they stand after, and whether anything changed.
   */
  async setPermission(projectId: string, installId: string, permission: string, granted: boolean, locale?: string): Promise<{ install_id: string; permissions: PluginInstalledPermissionView[]; changed: boolean }> {
    const { regrant } = this.ports;
    return this.switchPermission(() => this.ports.installed(projectId), regrant && (expected => regrant(projectId, installId, permission, granted, expected)), installId, permission, granted, locale);
  }

  /** The same switch for a plugin that runs as the Home's own instance, shared by every project (BL-700, S-94). */
  async setHomePermission(installId: string, permission: string, granted: boolean, locale?: string): Promise<{ install_id: string; permissions: PluginInstalledPermissionView[]; changed: boolean }> {
    const { homeInstalled, homeRegrant } = this.ports;
    if (!homeInstalled) throw pluginErrors.state_invalid('这个宿主没有个人空间');
    return this.switchPermission(homeInstalled, homeRegrant && (expected => homeRegrant(installId, permission, granted, expected)), installId, permission, granted, locale);
  }

  private async switchPermission(list: () => Promise<InstalledPluginEntry[]>, regrant: ((expected: PermissionSwitchTarget) => Promise<void>) | undefined, installId: string,
    permission: string, granted: boolean, locale?: string): Promise<{ install_id: string; permissions: PluginInstalledPermissionView[]; changed: boolean }> {
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
    return { install_id: installId, permissions: this.views([after], locale)[0]!.permissions.slice(),
      changed: after.record.grants.length !== held.size || after.record.grants.some(grant => !held.has(grant)) };
  }

  private requested(entry: InstalledPluginEntry): readonly string[] | undefined {
    if (entry.record.execution !== 'sandbox' || entry.record.publisher_trust !== 'pinned' || entry.manifest?.kind !== 'app') return undefined;
    const saved = this.ports.packages.load(entry.record.plugin_id, entry.record.publisher_signature, entry.record.version);
    return sandboxRequestedPermissions(saved.permissions);
  }

  private localeReaderFor(entry: InstalledPluginEntry) {
    if (entry.record.publisher_trust === 'host') return registeredInstallationText(entry.record);
    if (entry.record.publisher_trust !== 'pinned') return null;
    try {
      return this.ports.packages.load(entry.record.plugin_id, entry.record.publisher_signature, entry.record.version).packaged?.localePacks ?? null;
    } catch {
      return null;
    }
  }

  private views(entries: InstalledPluginEntry[], locale?: string): PluginInstalledView[] {
    const targetLocale = locale ?? activeLocale();
    return installedPluginViews(entries.map(entry => {
      try { return { ...entry, requestedPermissions: this.requested(entry) }; }
      catch (error) { const code = (error as { code?: unknown } | null)?.code; return { ...entry, manifest: undefined, recoveryCode: typeof code === 'string' ? code : 'plugin.package_invalid' }; }
    }), this.ports.ledger, entry => manifestWordResolver(this.localeReaderFor(entry), targetLocale));
  }

  /** The Home's own plugins as the settings page shows them: the same view as a project's, for the instance every project shares. */
  async homeInstalled(locale?: string): Promise<PluginInstalledView[]> {
    return this.views(await (this.ports.homeInstalled?.() ?? []), locale);
  }

  /** The project's installed plugins as their detail page shows them: trust, permissions, jobs and the person's agreements. */
  async installed(projectId: string, locale?: string): Promise<ProjectPluginInstalledView[]> {
    const entries = await this.ports.installed(projectId);
    return this.views(entries, locale).map((view, index) => {
      const { installation_generation, manifest_digest } = entries[index]!.record;
      return { ...view, installation_generation, manifest_digest };
    });
  }
}
