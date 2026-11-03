import { ActionError } from '@molis-ai/molis-work-contracts/platform/actions';
import type { PluginInstanceRecord, PluginSyncBinding, PluginSyncCollection, PluginSyncIdentity } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SyncContentCodec, SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { PluginHostLifecycle } from './lifecycle.js';
import { pluginManifestDigest } from './identity.js';

export interface RuntimeSyncCollection extends PluginSyncIdentity {
  readonly hasReference?: (projectId: string, assetId: string, version?: number) => boolean;
  readonly prepareUploads?: () => Promise<readonly {key:string;error:unknown}[]>;
  readonly collection: PluginSyncCollection;
  readonly dependencies: readonly PluginSyncCollection[];
  /** Passive current-lifecycle projection for a Host directory, without reading any business content. */
  available(): boolean;
  readonly replica: SyncReplicaAdapter;
  readonly content?: SyncContentCodec;
  readonly copy?: (direction: 'source' | 'target') => import('@molis-ai/molis-work-contracts/services/placement').ProjectCopyOwner;
}
export interface RuntimeSyncAuthority {
  authorize(): void;
  record(installId: string): PluginInstanceRecord | null;
}

/** Resolve only an already enabled installation. Discovery never installs, grants or revives a disabled plugin. */
export async function bindRuntimeSyncCollection(lifecycle: PluginHostLifecycle, pluginId: string, collectionId: string, authority: RuntimeSyncAuthority, options: {readonly activeOnly?:boolean} = {}): Promise<RuntimeSyncCollection | null> {
  authority.authorize();
  const manifest = lifecycle.manifest(pluginId), collection = manifest?.sync?.collections.find(row => row.id === collectionId);
  if (!manifest || !collection || !lifecycle.enabledPluginIds().includes(pluginId)) return null;
  const instance = options.activeOnly ? lifecycle.activeInstance?.(pluginId) : await lifecycle.ensureStarted(pluginId); authority.authorize();
  if (!instance) return null;
  const binding = instance.contribution.sync?.find(row => row.collection_id === collectionId);
  if (!binding) return null;
  const installed = authority.record(instance.install_id), digest = pluginManifestDigest(manifest);
  const check = () => {
    authority.authorize();
    if (!instance.active()) throw new ActionError('actions.forbidden', '同步插件实例已停止或已替换');
    const current = authority.record(instance.install_id), currentManifest = lifecycle.manifest(pluginId);
    if (!installed || !current || current.state !== 'running' || current.install_id !== instance.install_id || current.plugin_id !== manifest.plugin_id || current.installation_generation !== installed.installation_generation
      || current.version !== installed.version || current.publisher_id !== manifest.publisher.publisher_id
      || current.publisher_signature !== manifest.publisher.signature || !current.grants.includes('storage:private')
      || !currentManifest || pluginManifestDigest(currentManifest) !== digest) throw new ActionError('actions.forbidden', '同步安装、授权或数据格式已变化');
  };
  check();
  return Object.freeze({ plugin_id: manifest.plugin_id, publisher_id: manifest.publisher.publisher_id, publisher_signature: manifest.publisher.signature,
    collection: frozenCollection(collection), dependencies: Object.freeze(manifest.sync!.collections.filter(row => collection.requires.includes(row.id)).map(frozenCollection)),
    available() { try { check(); return true; } catch { return false; /* Directory state, never a replacement authorization. */ } }, ...guardBinding(binding, check) });
}

function frozenCollection(collection: PluginSyncCollection): PluginSyncCollection {
  return Object.freeze({ ...collection, requires: Object.freeze([...collection.requires]) });
}

function guardBinding(binding: PluginSyncBinding, check: () => void): Pick<RuntimeSyncCollection, 'replica' | 'content' | 'copy' | 'prepareUploads' | 'hasReference'> {
  const source = binding.replica;
  const invoke = <T>(run: () => T): T => { check(); const result = run(); check(); return result; };
  const replica: SyncReplicaAdapter = {
    authorizeKey:(key,value)=>invoke(()=>{if(!source.authorizeKey)throw new ActionError('actions.forbidden','同步主人尚未声明标识授权');source.authorizeKey(key,value);}),
    next: options => invoke(() => source.next(options)), acknowledge: (key, id, revision) => invoke(() => source.acknowledge(key, id, revision)),
    receive: (event, options) => invoke(() => source.receive(event, options)), cursor: () => invoke(() => source.cursor()),
    counts: () => invoke(() => source.counts()), conflicts: () => invoke(() => source.conflicts()),
    resolve: (key, choice, revision, state) => invoke(() => source.resolve(key, choice, revision, state)),
    ...(source.maintain?{maintain:()=>invoke(()=>source.maintain!())}:{}),
    ...(source.locate ? { locate: key => invoke(() => source.locate!(key)) } : {}),
    ...(source.hasProjectChanges ? { hasProjectChanges: id => invoke(() => source.hasProjectChanges!(id)) } : {}),
    ...(source.retryWaiting ? { retryWaiting: () => invoke(() => source.retryWaiting!()) } : {}),
    ...(source.inspectConflict ? { inspectConflict: key => invoke(() => source.inspectConflict!(key)) } : {}),
    ...(source.recoveries ? { recoveries: () => invoke(() => source.recoveries!()) } : {}),
    ...(source.inspectRecovery ? { inspectRecovery: id => invoke(() => source.inspectRecovery!(id)) } : {}),
    ...(source.restoreRecovery ? { restoreRecovery: (id, choice, revision) => invoke(() => source.restoreRecovery!(id, choice, revision)) } : {}),
  };
  const content = binding.content;
  const copy = binding.copy ? (direction: 'source' | 'target') => {
    const owner = invoke(() => binding.copy!(direction));
    return { ...(owner.prepare ? {async prepare(asset: import('@molis-ai/molis-work-contracts/services/placement').ProjectCopyAsset) { check(); await owner.prepare!(asset); check(); }} : {}), kinds: Object.freeze([...owner.kinds]), read: reference => invoke(() => owner.read(reference)),
      snapshot: projectId => invoke(() => owner.snapshot(projectId)), references: asset => invoke(() => owner.references(asset)),
      fork: (asset, identity) => invoke(() => owner.fork(asset, identity)), apply: asset => invoke(() => owner.apply(asset)),
    } satisfies import('@molis-ai/molis-work-contracts/services/placement').ProjectCopyOwner;
  } : undefined;
  return { ...(binding.hasReference ? {hasReference(projectId:string,assetId:string,version?:number){
    if(!projectId||projectId.length>80||!assetId||assetId.length>200||version!==undefined&&(!Number.isSafeInteger(version)||version<1))throw new ActionError('actions.input_invalid','同步引用标识无效');
    const result=invoke(()=>binding.hasReference!(projectId,assetId,version));
    if(typeof result!=='boolean')throw new ActionError('actions.input_invalid','引用主人须返回存在性判断');return result;
  }} : {}), ...(binding.prepareUploads ? {async prepareUploads(){check();const result=await binding.prepareUploads!();check();return result;}} : {}), replica: Object.freeze(replica), ...(copy ? {copy} : {}), ...(content ? { content: Object.freeze({
    ...(content.prepare ? {async prepare(key:string,value:unknown) { check(); await content.prepare!(key,value); check(); }} : {}),
    encode: (key, value) => invoke(() => content.encode(key, value)),
    async decode(key, value, read) {
      check(); const result = await content.decode(key, value, async reference => { check(); const bytes = await read(reference); check(); return bytes; }); check(); return result;
    },
  } satisfies SyncContentCodec) } : {}) };
}
