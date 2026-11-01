/**
 * The Manifest of a plugin that runs in the Host's sandbox. Every sandbox plugin has the same shape of Manifest: one local
 * entrypoint, one call route, the private storage grant, one `stage` view. The plugin studio builds it for what it generates and the
 * Host rebuilds it from a sandbox package to check the package's own Manifest against it; this is the one place that writes it.
 */
import { PLUGIN_PROJECTS_EXIST_PERMISSION, type PluginManifest, type SandboxPackageManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { sandboxAgentDeclarations } from '@molis-ai/molis-work-plugin-sdk';
import type { SandboxEffects } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { PLUGIN_PRESENTATION_CAPABILITY } from '@molis-ai/molis-work-design-system';
import type { PluginIconName } from '@molis-ai/molis-work-plugin-sdk/ui';

/** The names of a sandboxed package's image permissions: the Host's own, in the Manifest only as rows derived from `effects.imageGeneration` (BL-491). */
export const SANDBOX_IMAGE_PERMISSIONS = Object.freeze({ read: 'image-api:read', write: 'image-api:write', generate: 'image-api:generate' });
const MODEL_READ = 'model:read', MODEL_INVOKE = 'model:invoke';

type DerivedEffects = Pick<SandboxEffects, 'projects' | 'model' | 'modelSettings' | 'imageGeneration'>;

/**
 * The Manifest's permission rows a contract's effects derive: the package writes only the effects, and the Host writes the rows (so the two never disagree).
 * Each is optional: the person approves it at installation, and a call that needs one the person did not approve is refused by the Host's client.
 */
export function sandboxDerivedPermissions(effects: DerivedEffects | undefined): NonNullable<PluginManifest['permissions']> {
  if (!effects) return [];
  return [...(effects.projects?.includes('exist') ? [{ permission: PLUGIN_PROJECTS_EXIST_PERMISSION, reason: '检查已持有的项目编号是否仍存在', required: false }] : []), ...serviceRows(effects)];
}

/** The model and image permissions an operation's effects need: what the Runtime's scope names for its call (`exposed-actions.ts`), never what a caller must hold. */
export function sandboxOperationPermissions(effects: DerivedEffects | undefined): string[] { return serviceRows(effects).map(row => row.permission); }

function serviceRows(effects: DerivedEffects | undefined): Array<{ permission: string; reason: string; required: false }> {
  if (!effects) return [];
  const rows: Array<{ permission: string; reason: string }> = [];
  const add = (permission: string, reason: string) => { if (!rows.some(row => row.permission === permission)) rows.push({ permission, reason }); };
  if (effects.model?.includes('read') || effects.modelSettings?.includes('read')) add(MODEL_READ, '查看有哪些模型可用，不调用模型');
  if (effects.model?.includes('invoke')) add(MODEL_INVOKE, '调用你配置的模型');
  if (effects.modelSettings?.includes('save')) add(MODEL_INVOKE, '在你启用的模型里选一个给它用');
  const images = effects.imageGeneration;
  if (images?.includes('read')) add(SANDBOX_IMAGE_PERMISSIONS.read, '查看你的图片连接');
  if (images?.includes('bind')) add(SANDBOX_IMAGE_PERMISSIONS.write, '选择它用哪个图片连接（只能用你已经设好地址的连接）');
  if (images?.includes('generate')) { add(SANDBOX_IMAGE_PERMISSIONS.generate, '用你的图片连接生成图片，可能产生费用'); add(MODEL_INVOKE, '生成图片会用到你的图片账户'); }
  return rows.map(row => ({ ...row, required: false }));
}

export const sandboxUiContribution = (pluginId: string) => pluginId + '.ui.v1';

export interface SandboxManifestInput {
  pluginId: string;
  version: string;
  /** What the person sees as the plugin's name (and its page title). */
  name: string;
  publisher: PluginManifest['publisher'];
  /** Whether the plugin lays its pages out with the Host's page-composition renderer. */
  presentation: boolean;
  /** Versions this one upgrades from; empty or absent for a first release. */
  upgradesFrom?: readonly string[];
  /**
   * Where the plugin runs: absent for a project, `{ scope: "home" }` for one instance every project shares (BL-628). Only a signed package
   * writes it; the studio's own plugins are always a project's. Whether the Home takes it is the install's to decide (S-80), not the form's.
   */
  runtime?: PluginManifest['runtime'];
  /** The icon of the plugin's page in the navigation; absent means the Host's default. */
  icon?: PluginIconName;
  /** Validated contract effects; the Manifest's optional permission rows are derived from them (`sandboxDerivedPermissions`). */
  effects?: DerivedEffects;
  /** Validated wire text declarations, projected once by the public SDK. */
  textDeclarations?: SandboxPackageManifest;
}

export function sandboxPluginManifest(input: SandboxManifestInput): PluginManifest {
  const uiId = sandboxUiContribution(input.pluginId);
  return {
    schema_version: 2, host_api_version: 2, plugin_id: input.pluginId, version: input.version, name: input.name, kind: 'app',
    publisher: input.publisher,
    ...(input.textDeclarations ? sandboxAgentDeclarations(input.textDeclarations) : {}),
    entrypoints: [{ deployment: 'local', entrypoint: './plugin.mjs' }],
    ...(input.upgradesFrom?.length ? { upgrade_compatibility: { compatible_from_versions: [...input.upgradesFrom] } } : {}),
    ...(input.runtime ? { runtime: input.runtime } : {}),
    permissions: [{ permission: 'storage:private', required: true, reason: '保存这个插件自己的数据' }, ...sandboxDerivedPermissions(input.effects)],
    capabilities: { provides: [], consumes: input.presentation ? [PLUGIN_PRESENTATION_CAPABILITY.capability_id] : [] }, artifacts: { produces: [], consumes: [] },
    ...(input.presentation ? { requires: [{ ...PLUGIN_PRESENTATION_CAPABILITY, reason: '此插件需要整页组合与详情渲染器 v1' }] } : {}),
    routes: [{ route_id: 'studio.call', method: 'POST', path: '/call' }],
    ui: { contributions: [uiId], views: [{ view_id: 'app', slot: 'stage', title: input.name, contribution_id: uiId, ...(input.icon ? { icon: input.icon } : {}) }] },
  };
}

export interface SandboxIntegrationManifestInput {
  pluginId: string;
  version: string;
  name: string;
  publisher: PluginManifest['publisher'];
  upgradesFrom?: readonly string[];
  /** The services and integrations the package declares, as an Integration Plugin writes them; the rest of the Manifest is the Host's. */
  connection_services: NonNullable<PluginManifest['connection_services']>;
  integrations: NonNullable<PluginManifest['integrations']>;
}

/**
 * The Manifest of a sandboxed integration (BL-530): an Integration Plugin with one local entrypoint and the private storage grant, its
 * own services and integrations, the Home as where it runs (`runtime.scope`, as every package of the Home writes it, BL-628), and nothing
 * to show: no route, no view.
 */
export function sandboxIntegrationManifest(input: SandboxIntegrationManifestInput): PluginManifest {
  return {
    schema_version: 2, host_api_version: 2, plugin_id: input.pluginId, version: input.version, name: input.name, kind: 'integration',
    publisher: input.publisher,
    entrypoints: [{ deployment: 'local', entrypoint: './plugin.mjs' }],
    ...(input.upgradesFrom?.length ? { upgrade_compatibility: { compatible_from_versions: [...input.upgradesFrom] } } : {}),
    permissions: [{ permission: 'storage:private', required: true, reason: '保存这个插件自己的数据' }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { contributions: [] },
    // An integration's sources are the Home's: one registry, which every project's Feed reads (BL-530).
    runtime: { scope: 'home' },
    connection_services: input.connection_services, integrations: input.integrations,
  };
}
