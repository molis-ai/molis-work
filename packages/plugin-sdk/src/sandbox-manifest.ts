/**
 * The Manifest of a plugin that runs in the Host's sandbox. Every sandbox plugin has the same shape of Manifest: one local
 * entrypoint, one call route, the private storage grant, one `stage` view. The plugin studio builds it for what it generates and the
 * Host rebuilds it from a sandbox package to check the package's own Manifest against it; this is the one place that writes it.
 */
import { createHash } from 'node:crypto';
import { PLUGIN_PROJECTS_EXIST_PERMISSION, pluginErrors, type HomePluginDatabaseDeclaration, type PluginDatabaseDeclaration, type PluginManifest, type PluginOwnerFileEntry, type SandboxPackageManifest } from '@molis-ai/molis-work-contracts/platform/plugin';
import { sandboxAgentDeclarations } from './sandbox-agent-declarations.js';
import type { SandboxEffects, SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { PLUGIN_PRESENTATION_CAPABILITY, type TextRef } from '@molis-ai/molis-work-contracts/platform/ui';
import type { PluginIconName } from './ui/icon.js';
import { databaseDeclarationProblems } from './database-declarations.js';
import { connectionDeclarationProblems } from './connection-declarations.js';
import { ownerFilesDeclarationProblems } from './owner-files-declaration.js';
import { assertSandboxUpgradeValidator, sandboxActionId, sandboxOperationActions, sandboxPackageBuildId, sandboxUpgradeOperation } from './sandbox-actions.js';
import { sandboxUiDeclaration } from './sandbox-ui.js';
import { sandboxStateMachineDeclarations } from './sandbox-state-machines.js';
import { sandboxLocaleProblems } from './locale-declarations.js';

/** The names of a sandboxed package's image permissions: the Host's own, in the Manifest only as rows derived from `effects.imageGeneration` (BL-491). */
export const SANDBOX_IMAGE_PERMISSIONS = Object.freeze({ read: 'image-api:read', write: 'image-api:write', generate: 'image-api:generate' });
const MODEL_READ = 'model:read', MODEL_INVOKE = 'model:invoke';

type DerivedEffects = Pick<SandboxEffects, 'storage' | 'background' | 'projects' | 'model' | 'modelSettings' | 'imageGeneration' | 'homeDatabase' | 'projectDatabase' | 'connections' | 'materials' | 'ownerFiles' | 'networkDomains' | 'secretRefs' | 'capabilities'>;
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
  return ['storage:private', ...(effects?.projects?.includes('exist') ? [PLUGIN_PROJECTS_EXIST_PERMISSION] : []), ...serviceRows(effects).map(row => row.permission),
    ...projectedRows(effects).map(row => row.permission)];
}

type PermissionRow = NonNullable<PluginManifest['permissions']>[number];
/**
 * Switches for effects a sandboxed package's signed Manifest has no row for (BL-701, user decision 2026-11-09 A). The Host projects them
 * from the verified release onto its installation, beside the Manifest and never into it, so the signed bytes and digest stay as they are.
 * Each is optional and starts off: what the person approved at installation is the most it can reach, the switch whether it may now.
 */
const PROJECTED_ROWS: ReadonlyArray<readonly [keyof SandboxEffects, string, string]> = [
  ['networkDomains', 'network:request', '访问这个插件安装时获准的网站'],
  ['secretRefs', 'secret:use', '在获准的请求里使用为这个插件保存的密钥'],
  ['capabilities', 'capabilities:call', '调用安装时获准的平台能力'],
  ['background', 'background:start', '在后台运行安装时获准的工作'],
  ['connections', 'connections:use', '通过你绑定的服务账号发请求'],
];

function projectedRows(effects: Partial<Record<keyof SandboxEffects, readonly string[]>> | undefined, declared: ReadonlySet<string> = new Set(['connections:use'])): PermissionRow[] {
  return PROJECTED_ROWS.filter(([key, permission]) => effects?.[key]?.length && !declared.has(permission))
    .map(([, permission, reason]) => ({ permission, reason, required: false }));
}

/**
 * The installation's switches beyond its Manifest's rows, from what its verified release asks for (`effects`, the union of its operations'):
 * the Host attaches them to the sandboxed definition it builds and the Runtime counts them in the grants it may hold (BL-701). An
 * integration's Manifest has no `connections:use` row, so its source connection is one of them; an app's Manifest already has it.
 */
export function sandboxProjectedPermissions(manifest: Pick<PluginManifest, 'permissions'>, effects: Partial<Record<keyof SandboxEffects, readonly string[]>> | undefined): PermissionRow[] {
  return projectedRows(effects, new Set(manifest.permissions.map(row => row.permission)));
}

/**
 * The switches one operation needs before its code runs (BL-701). A background launcher's `effects` already hold its targets'
 * (`sandboxOperationEffects`). The Manifest's own rows are not among them: the Host's client for each service checks those at each call.
 */
export function sandboxOperationSwitches(effects: Partial<Record<keyof SandboxEffects, readonly string[]>> | undefined): string[] {
  return projectedRows(effects).map(row => row.permission);
}

/** Exact per-operation service permissions. A read-only operation cannot borrow a write grant held by its installation. */
export function sandboxOperationPermissions(effects: DerivedEffects | undefined, hasProjectDatabase = false): string[] {
  return [...(effects?.background?.length || effects?.homeDatabase?.length || hasProjectDatabase && effects?.projectDatabase?.length || effects?.ownerFiles?.length ? ['storage:private'] : []), ...serviceRows(effects).map(row => row.permission)];
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
  upgradeCompatibility?: PluginManifest['upgrade_compatibility'];
  /** A package's own declaration, for one whose contract says nothing of states; a contract that does is the only source (SMP-11). */
  stateMachines?: PluginManifest['state_machines'];
  /**
   * Where the plugin runs: absent for a project, `{ scope: "home" }` for one instance every project shares (BL-628). A published package
   * writes its checked target scope. Whether the Home takes it is the install's to decide (S-80), not the form's.
   */
  runtime?: PluginManifest['runtime'];
  /** The icon of the plugin's page in the navigation; absent means the Host's default. */
  icon?: PluginIconName;
  /** Validated contract effects; the Manifest's optional permission rows are derived from them (`sandboxDerivedPermissions`). */
  effects?: DerivedEffects;
  /** The validated contract is required for background launchers. Its static action projection is signed with the package. */
  contract?: SandboxPluginContract;
  /** A studio release already has a build identity and integer action version; distributed packages use their publisher identity. */
  actionIdentity?: { buildId: string; version: number };
  /** Validated wire text declarations, projected once by the public SDK. */
  textDeclarations?: Pick<SandboxPackageManifest, 'plugin_id' | 'agent' | 'methods' | 'name_text' | 'summary' | 'summary_text'>;
  stageTitleText?: TextRef;
  /** The author chooses only version/schema; the store and read/write names are deterministic platform output. */
  homeDatabase?: Pick<HomePluginDatabaseDeclaration, 'version' | 'schema' | 'upgrades'>;
  projectDatabase?: Pick<PluginDatabaseDeclaration, 'version' | 'schema' | 'upgrades'>;
  connections?: PluginManifest['connections'];
  ownerFiles?: readonly PluginOwnerFileEntry[];
}

function sandboxResources(input: SandboxManifestInput): Pick<PluginManifest, 'databases' | 'connections' | 'owner_files'> {
  const { effects, homeDatabase, projectDatabase, connections, ownerFiles } = input;
  const refuse = (message: string): never => { throw pluginErrors.declaration_invalid('沙箱资源：' + message); };
  if (!!homeDatabase !== !!effects?.homeDatabase?.length || projectDatabase && !effects?.projectDatabase?.length || !!connections !== !!effects?.connections?.length || !!ownerFiles !== !!effects?.ownerFiles?.length) {
    refuse('库、连接槽和文件条目必须与操作实际声明的 effects 一致');
  }
  if (homeDatabase && input.runtime?.scope !== 'home') refuse('Home 库只给 Home 范围的包');
  const dualInstance = input.runtime?.scope === 'home' && input.runtime.dual_instance === true;
  if (projectDatabase && input.runtime?.scope === 'home' && !dualInstance) refuse('Home 范围的包没有项目库');
  if (dualInstance && input.contract?.operations.some(op => op.effects.projectDatabase?.length && (op.effects.homeDatabase?.length || op.effects.modelSettings?.length || op.effects.imageGeneration?.length))) {
    refuse('双实例包的单个操作不能同时声明项目库与 Home 专属效果（homeDatabase、modelSettings、imageGeneration）');
  }
  const storeName = 'sbxdb-' + createHash('sha256').update(input.pluginId).digest('hex').slice(0, 32);
  const library = (scope: Pick<PluginDatabaseDeclaration, 'schema' | 'version' | 'upgrades'>, read_permission: string, write_permission: string) => ({
    store_name: storeName, version: scope.version, schema: scope.schema, read_permission, write_permission,
    ...(scope.upgrades === undefined ? {} : { upgrades: scope.upgrades }),
  });
  const databases = homeDatabase || projectDatabase ? {
    ...(homeDatabase ? { home: library(homeDatabase, HOME_READ, HOME_WRITE) } : {}),
    ...(projectDatabase ? { project: library(projectDatabase, 'storage:private', 'storage:private') } : {}),
  } : undefined;
  const resources: Pick<PluginManifest, 'databases' | 'connections' | 'owner_files'> = {
    ...(databases ? { databases } : {}),
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

function localeFields(pluginId: string, contract?: SandboxPluginContract): Pick<PluginManifest['ui'], 'locales'> {
  if (contract?.ui === undefined) return {};
  const problems = sandboxLocaleProblems({ pluginId, ui: contract.ui });
  if (problems.length) throw pluginErrors.declaration_invalid(problems.join('；'));
  return { locales: contract.ui.locales };
}

function directoryFields(input?: Pick<PluginManifest, 'name_text' | 'summary' | 'summary_text'>) {
  return {
    ...(input?.name_text === undefined ? {} : { name_text: input.name_text }),
    ...(input?.summary === undefined ? {} : { summary: input.summary }),
    ...(input?.summary_text === undefined ? {} : { summary_text: input.summary_text }),
  };
}

function sandboxUpgradeFields(input: Pick<SandboxManifestInput, 'upgradesFrom' | 'upgradeCompatibility'>): Pick<PluginManifest, 'upgrade_compatibility'> {
  const { upgradesFrom, upgradeCompatibility } = input;
  if (upgradesFrom?.length && upgradeCompatibility) throw pluginErrors.declaration_invalid('只可提供一份升级来源声明');
  if (upgradeCompatibility !== undefined) return { upgrade_compatibility: upgradeCompatibility };
  return upgradesFrom?.length ? { upgrade_compatibility: { compatible_from_versions: [...upgradesFrom] } } : {};
}

function contractStateMachines(contract: SandboxPluginContract): PluginManifest['state_machines'] {
  try { return sandboxStateMachineDeclarations(contract); }
  catch (error) { throw pluginErrors.declaration_invalid(error instanceof Error ? error.message : '状态申报无效'); }
}

export function sandboxPluginManifest(input: SandboxManifestInput): PluginManifest {
  if (input.contract) {
    if (input.contract.pluginId !== input.pluginId) throw pluginErrors.declaration_invalid('合同与 Manifest 的插件身份不一致');
    input = { ...input, effects: effectsFromContract(input.contract) };
  }
  assertSandboxUpgradeValidator(sandboxUpgradeFields(input), input.contract);
  const { contribution_id: uiId } = sandboxUiDeclaration(input);
  const stateMachines = input.contract?.state_machines === undefined ? input.stateMachines : contractStateMachines(input.contract);
  if (input.effects?.background?.length && !input.contract) throw pluginErrors.declaration_invalid('后台操作需要完整合同来派生动作');
  const actionIdentity = input.actionIdentity ?? { buildId: sandboxPackageBuildId(input.pluginId, input.publisher.signature), version: 1 };
  const actions = input.contract && (input.contract.presentation !== undefined || input.contract.settings_entries !== undefined || input.contract.operations.some(operation =>
    operation.background_job || operation.effects.background?.length || operation.external !== undefined || operation.read_protocol !== undefined || operation.action_protocol !== undefined || operation.trusted_review !== undefined
    || operation.start !== undefined))
    ? sandboxOperationActions({ contract: input.contract, ...actionIdentity,
      title: input.name, scope: input.runtime?.scope === 'home' ? 'home' : 'project', dualInstance: input.runtime?.scope === 'home' && input.runtime.dual_instance === true,
      upgradeOperation: sandboxUpgradeOperation(sandboxUpgradeFields(input)), hasProjectDatabase: !!input.projectDatabase }) : undefined;
  const workTerminals = input.contract?.operations
    .filter(operation => operation.read_protocol?.kind === 'work_terminal_prompt')
    .map(operation => ({
      subject_kind: (operation.read_protocol as { kind: 'work_terminal_prompt'; subject_kind: string }).subject_kind,
      prompt_action: sandboxActionId(actionIdentity.buildId, operation.id),
    }));
  const settingsEntries = (() => {
    const declared = input.contract?.settings_entries;
    if (!declared) return undefined;
    const readOp = input.contract!.operations.find(op => op.id === declared.read_operation);
    const writeOp = input.contract!.operations.find(op => op.id === declared.write_operation);
    if (readOp?.action_protocol?.kind !== 'settings' || readOp.action_protocol.role !== 'read') {
      throw pluginErrors.declaration_invalid('settings_entries.read_operation 必须指向合同中 action_protocol.kind=settings 且 role=read 的查询操作');
    }
    if (writeOp?.action_protocol?.kind !== 'settings' || writeOp.action_protocol.role !== 'write') {
      throw pluginErrors.declaration_invalid('settings_entries.write_operation 必须指向合同中 action_protocol.kind=settings 且 role=write 的命令操作');
    }
    return {
      entries: structuredClone(declared.entries),
      read: { capability_id: sandboxActionId(actionIdentity.buildId, declared.read_operation), version: actionIdentity.version },
      write: { capability_id: sandboxActionId(actionIdentity.buildId, declared.write_operation), version: actionIdentity.version },
    };
  })();
  return {
    schema_version: /* @version manifest.schema */ 1, host_api_version: /* @version host.api */ 1, plugin_id: input.pluginId, version: input.version, name: input.name, kind: 'app',
    publisher: input.publisher,
    ...(actions ? { actions } : {}),
    ...(workTerminals?.length ? { work_terminals: workTerminals } : {}),
    ...(settingsEntries ? { settings_entries: settingsEntries } : {}),
    ...(input.contract?.presentation === undefined ? {} : { presentation: input.contract.presentation }),
    ...directoryFields(input.textDeclarations),
    ...(input.textDeclarations ? sandboxAgentDeclarations(input.textDeclarations) : {}),
    entrypoints: [{ deployment: 'local', entrypoint: './plugin.mjs' }],
    ...sandboxUpgradeFields(input),
    ...(stateMachines === undefined ? {} : { state_machines: stateMachines }),
    ...(input.runtime ? { runtime: input.runtime } : {}),
    ...sandboxResources(input),
    permissions: [{ permission: 'storage:private', required: true, reason: '保存这个插件自己的数据' }, ...sandboxDerivedPermissions(input.effects)],
    capabilities: { provides: [], consumes: input.presentation ? [PLUGIN_PRESENTATION_CAPABILITY.capability_id] : [] }, artifacts: { produces: [], consumes: [] },
    ...(input.presentation ? { requires: [{ ...PLUGIN_PRESENTATION_CAPABILITY, reason: '此插件需要整页组合与详情渲染器 v1' }] } : {}),
    routes: [{ route_id: 'studio.call', method: 'POST', path: '/call' }],
    ui: { ...localeFields(input.pluginId, input.contract), contributions: [uiId], views: [{ view_id: 'app', slot: 'stage', title: input.name,
      ...(input.stageTitleText === undefined ? {} : { title_text: input.stageTitleText }), contribution_id: uiId, ...(input.icon ? { icon: input.icon } : {}) }] },
  };
}

export interface SandboxIntegrationManifestInput {
  pluginId: string;
  version: string;
  name: string;
  publisher: PluginManifest['publisher'];
  upgradesFrom?: readonly string[];
  stateMachines?: PluginManifest['state_machines'];
  /** The services and integrations the package declares, as an Integration Plugin writes them; the rest of the Manifest is the Host's. */
  connection_services: NonNullable<PluginManifest['connection_services']>;
  integrations: NonNullable<PluginManifest['integrations']>;
  source_presentations?: NonNullable<PluginManifest['source_presentations']>;
  /** The contract projects the producer's words; this does not give an integration a page. */
  contract?: SandboxPluginContract;
  textDeclarations?: Pick<PluginManifest, 'name_text' | 'summary' | 'summary_text'>;
}

/**
 * The Manifest of a sandboxed integration (BL-530): an Integration Plugin with one local entrypoint and the private storage grant, its
 * own services and integrations, the Home as where it runs (`runtime.scope`, as every package of the Home writes it, BL-628), and nothing
 * to show: no route, no view.
 */
export function sandboxIntegrationManifest(input: SandboxIntegrationManifestInput): PluginManifest {
  return {
    schema_version: /* @version manifest.schema */ 1, host_api_version: /* @version host.api */ 1, plugin_id: input.pluginId, version: input.version, name: input.name, kind: 'integration',
    ...directoryFields(input.textDeclarations),
    publisher: input.publisher,
    entrypoints: [{ deployment: 'local', entrypoint: './plugin.mjs' }],
    ...sandboxUpgradeFields({ upgradesFrom: input.upgradesFrom }),
    ...(input.stateMachines === undefined ? {} : { state_machines: input.stateMachines }),
    permissions: [{ permission: 'storage:private', required: true, reason: '保存这个插件自己的数据' }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] },
    ui: { ...localeFields(input.pluginId, input.contract), contributions: [] },
    // An integration's sources are the Home's: one registry, which every project's Feed reads (BL-530).
    runtime: { scope: 'home' },
    connection_services: input.connection_services, integrations: input.integrations,
    ...(input.source_presentations ? { source_presentations: [...input.source_presentations] } : {}),
  };
}

/** The effects a contract asks for in all: the union of what each of its operations declares. */
export function effectsFromContract(contract: SandboxPluginContract): SandboxEffects {
  const result: Record<string, string[]> = {};
  for (const operation of contract.operations) for (const [key, values] of Object.entries(operation.effects)) result[key] = [...new Set([...(result[key] ?? []), ...(values ?? [])])].sort();
  return result as SandboxEffects;
}
