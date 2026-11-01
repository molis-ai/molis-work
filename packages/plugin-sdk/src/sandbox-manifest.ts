/**
 * The Manifest of a plugin that runs in the Host's sandbox. Every sandbox plugin has the same shape of Manifest: one local
 * entrypoint, one call route, the private storage grant, one `stage` view. The plugin studio builds it for what it generates and the
 * Host rebuilds it from a sandbox package to check the package's own Manifest against it; this is the one place that writes it.
 */
import { createHash } from 'node:crypto';
import { PLUGIN_PROJECTS_EXIST_PERMISSION, pluginErrors, type HomePluginDatabaseDeclaration, type PluginManifest, type PluginOwnerFileEntry, type SandboxPackageManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { sandboxAgentDeclarations } from './sandbox-agent-declarations.js';
import type { SandboxEffects, SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { PLUGIN_PRESENTATION_CAPABILITY } from '@molis-ai/molis-work-contracts/platform/ui';
import type { PluginIconName } from './ui/icon.js';
import { databaseDeclarationProblems } from './database-declarations.js';
import { connectionDeclarationProblems } from './connection-declarations.js';
import { ownerFilesDeclarationProblems } from './owner-files-declaration.js';

/** The names of a sandboxed package's image permissions: the Host's own, in the Manifest only as rows derived from `effects.imageGeneration` (BL-491). */
export const SANDBOX_IMAGE_PERMISSIONS = Object.freeze({ read: 'image-api:read', write: 'image-api:write', generate: 'image-api:generate' });
const MODEL_READ = 'model:read', MODEL_INVOKE = 'model:invoke';

type DerivedEffects = Pick<SandboxEffects, 'projects' | 'model' | 'modelSettings' | 'imageGeneration' | 'homeDatabase' | 'connections' | 'materials' | 'ownerFiles'>;
const HOME_READ = 'home-database:read', HOME_WRITE = 'home-database:write', FILE_READ = 'owner-files:read', FILE_WRITE = 'owner-files:write';

/**
 * The Manifest's permission rows a contract's effects derive: the package writes only the effects, and the Host writes the rows (so the two never disagree).
 * Each is optional: the person approves it at installation, and a call that needs one the person did not approve is refused by the Host's client.
 */
export function sandboxDerivedPermissions(effects: DerivedEffects | undefined): NonNullable<PluginManifest['permissions']> {
  if (!effects) return [];
  return [...(effects.projects?.includes('exist') ? [{ permission: PLUGIN_PROJECTS_EXIST_PERMISSION, reason: '检查已持有的项目编号是否仍存在', required: false }] : []), ...serviceRows(effects, true)];
}

/** Actual requested rows, distinct from the read/write pair a resource's shape declares. Recomputed from the saved validated contract. */
export function sandboxRequestedPermissions(effects: DerivedEffects | undefined): string[] {
  return ['storage:private', ...(effects?.projects?.includes('exist') ? [PLUGIN_PROJECTS_EXIST_PERMISSION] : []), ...serviceRows(effects).map(row => row.permission)];
}

/** Exact per-operation service permissions. A read-only operation cannot borrow a write grant held by its installation. */
export function sandboxOperationPermissions(effects: DerivedEffects | undefined): string[] {
  return [...(effects?.homeDatabase?.length || effects?.ownerFiles?.length ? ['storage:private'] : []), ...serviceRows(effects).map(row => row.permission)];
}

function serviceRows(effects: DerivedEffects | undefined, shape = false): Array<{ permission: string; reason: string; required: false }> {
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
  if (effects.homeDatabase?.length) {
    if (shape || effects.homeDatabase.includes('read')) add(HOME_READ, '读取这个插件自己的 Home 库');
    if (shape || effects.homeDatabase.includes('write')) add(HOME_WRITE, '写入这个插件自己的 Home 库');
  }
  if (effects.ownerFiles?.length) {
    if (shape || effects.ownerFiles.includes('read')) add(FILE_READ, '读取这个插件自己声明的文件');
    if (shape || effects.ownerFiles.includes('write')) add(FILE_WRITE, '写入这个插件自己声明的文件');
  }
  if (effects.connections?.length) add('connections:use', '通过你绑定的服务账号发请求');
  for (const [effect, reason] of [['read', '读取交给这个插件的文档内容'], ['fetch', '读取本次批准的网站内容'], ['fetch_local', '读取本机页面'], ['original', '保留并读取你交给这个插件的原文件']] as const) {
    if (effects.materials?.includes(effect)) add('materials:' + effect, reason);
  }
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
   * Where the plugin runs: absent for a project, `{ scope: "home" }` for one instance every project shares (BL-628). A published package
   * writes its checked target scope. Whether the Home takes it is the install's to decide (S-80), not the form's.
   */
  runtime?: PluginManifest['runtime'];
  /** The icon of the plugin's page in the navigation; absent means the Host's default. */
  icon?: PluginIconName;
  /** Validated contract effects; the Manifest's optional permission rows are derived from them (`sandboxDerivedPermissions`). */
  effects?: DerivedEffects;
  /** Validated wire text declarations, projected once by the public SDK. */
  textDeclarations?: SandboxPackageManifest;
  /** The author chooses only version/schema; the store and read/write names are deterministic platform output. */
  homeDatabase?: Pick<HomePluginDatabaseDeclaration, 'version' | 'schema'>;
  connections?: PluginManifest['connections'];
  ownerFiles?: readonly PluginOwnerFileEntry[];
}

function sandboxResources(input: SandboxManifestInput): Pick<PluginManifest, 'databases' | 'connections' | 'owner_files'> {
  const { effects, homeDatabase, connections, ownerFiles } = input;
  const refuse = (message: string): never => { throw pluginErrors.declaration_invalid('沙箱资源：' + message); };
  if (!!homeDatabase !== !!effects?.homeDatabase?.length || !!connections !== !!effects?.connections?.length || !!ownerFiles !== !!effects?.ownerFiles?.length) {
    refuse('库、连接槽和文件条目必须与操作实际声明的 effects 一致');
  }
  if (homeDatabase && input.runtime?.scope !== 'home') refuse('Home 库只给 Home 范围的包');
  const resources: Pick<PluginManifest, 'databases' | 'connections' | 'owner_files'> = {
    ...(homeDatabase ? { databases: { home: { store_name: 'sbxdb-' + createHash('sha256').update(input.pluginId).digest('hex').slice(0, 32),
      version: homeDatabase.version, schema: homeDatabase.schema, read_permission: HOME_READ, write_permission: HOME_WRITE } } } : {}),
    ...(connections ? { connections } : {}),
    ...(ownerFiles ? { owner_files: { store_name: 'files', entries: ownerFiles, read_permission: FILE_READ, write_permission: FILE_WRITE } } : {}),
  };
  const permissions = new Set(['storage:private', ...sandboxDerivedPermissions(effects).map(row => row.permission)]);
  const problems = [...databaseDeclarationProblems(resources.databases, permissions), ...connectionDeclarationProblems(connections, permissions),
    ...ownerFilesDeclarationProblems(resources.owner_files, permissions)];
  if (problems.length) refuse(problems.join('；'));
  const slots = new Set(connections?.slots.map(slot => slot.slot_id));
  if (effects?.connections?.some(id => !slots.has(id)) || connections?.slots.some(slot => !effects?.connections?.includes(slot.slot_id))) {
    refuse('每个连接槽都须被操作请求，每个连接效果都须有声明的槽');
  }
  return resources;
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
    ...sandboxResources(input),
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

/** The effects a contract asks for in all: the union of what each of its operations declares. */
export function effectsFromContract(contract: SandboxPluginContract): SandboxEffects {
  const result: Record<string, string[]> = {};
  for (const operation of contract.operations) for (const [key, values] of Object.entries(operation.effects)) result[key] = [...new Set([...(result[key] ?? []), ...(values ?? [])])].sort();
  return result as SandboxEffects;
}

