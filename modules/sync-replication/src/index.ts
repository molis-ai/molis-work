import {withSyncMutation,type SyncMutationScope} from './mutation-scope.js';
import { withSyncCycleDatabase,withSyncDatabase } from './database.js';
import type { SpaceSyncPolicy, SyncQuotaStatus } from '@molis-ai/molis-work-contracts/modules/sync-replication';
import type { SyncEvent, SyncReplicaAdapter, SyncContentCodec, SyncBlobReference, SyncLocalProtection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
export {partitionedReplica} from './partitioned-replica.js';
export {SYNC_HOME_STORE,SYNC_STORE_BASELINE} from './database.js';
export {hasProtectedSyncPayloads} from './local-protection.js';
import {pinSyncProtection} from './local-protection.js';

export type SyncSelection = SpaceSyncPolicy['selections'][number];
export {syncNamespace} from './namespace.js';
import {syncNamespace} from './namespace.js';
export type SyncRestoreTier = 'catalog' | 'version-store' | 'reference-owner' | 'default';
export interface SyncRegistration {
  selection:SyncSelection; title:string;
  /** Host-declared collection group used by settings UI without prefix guessing. */
  group?:'platform'|'plugin';
  /** Declarative restore ordering tier (`catalog` -> `version-store` -> `reference-owner` -> `default`). Defaults to `reference-owner` when `hasReference` is provided, else `default`. */
  restoreTier?:SyncRestoreTier;
  /** Passive current owner reference check; separate from cloud selection. */
  hasReference?(projectId:string,assetId:string,version?:number):boolean;
  /** Synchronous lifecycle projection only; false is unavailable, never a successful empty replica. */
  available?():boolean;
  /** Trusted exact identities from the same declaration; never inferred from network payloads. */
  dependencies?:readonly SyncSelection[];
  content?:SyncContentCodec;
  /** Owner-declared local navigation, never inferred from remote content. */
  locate?(key:string):string|null;
  /** Trusted local-only protection, fixed by the owner's current baseline and composition. */
  protection?:SyncLocalProtection;
  refresh():Promise<void>;
  /** Trusted derived exports prepared before freezing upload values. Failed keys remain queued independently. */
  prepareUploads?():Promise<readonly {key:string;error:unknown}[]>;
  withReplica<T>(run:(replica:SyncReplicaAdapter)=>T):T;
  prepare(event:SyncEvent,options?:{retry?:boolean}):Promise<void>;
  /** Hold owner lifecycle admission across asynchronous waits; invoke commit exactly once under that reservation. */
  withMutation?<T>(scope:SyncMutationScope,commit:()=>T):Promise<T>;
}
export interface SyncAuthority { signal:AbortSignal; assertCurrent():void; accessToken():Promise<string> }

export { parseSpaceSyncPolicy } from "./policy.js";
import { parseSpaceSyncPolicy } from "./policy.js";
import { syncDevicePreference } from './device.js';
import { syncError } from './sync-errors.js';
import { validateSyncEndpoint } from './endpoint.js';
import { parseSyncQuota, syncResponseMessage, isSyncQuotaError } from './quota.js';
import {blobTransfer,blobReference,type BlobChannel} from './blob-transfer.js';
import {syncItemFailures,itemFailureKey,isPermanentItemFailure,isTemporaryOwnerFailure} from './item-failures.js';
import {assertSyncDependencies,unavailableSyncSelections} from './selection-dependencies.js';
import {syncRegistrations,assertSyncRegistration} from './registrations.js';
import {retainConflict} from './conflict-retention.js';
import {decodeContent} from './decode-content.js';
import {cloudHistory} from './cloud-history.js';
import {parseSyncRound} from './round.js';
import {conflictPage, syncProgress} from './progress.js';
import {syncScheduler} from './scheduler.js';
import {isTransportBackoff,syncTransportBackoff} from './transport-backoff.js';
import {syncTransport} from './transport.js';
export { resolveSyncEndpoint } from './endpoint.js';

export class PersonalSync {
  private running:Promise<void>|null=null;
  private controller=new AbortController();
  private error:string|null=null;
  private lastSuccess:string|null=null;
  private quota:SyncQuotaStatus|null=null;
  private lastProgress:ReturnType<typeof syncProgress>|null=null;
  private indicatorDirty=false;
  private localChangePending=false;
  private transfers=new Set<{kind:'cycle'|'conflict';done:number;total:number}>();
  private closed=false;
  private changingDevice=false;
  private cycleAbort:AbortController|null=null;
  private backoff=syncTransportBackoff();
  private transport=syncTransport({
    endpoint:()=>this.options.endpoint,fetch:()=>this.options.fetch??fetch,abort:()=>this.controller.signal,
    cycleAbort:()=>this.cycleAbort?.signal,
    onBackoff:()=>{this.cycleAbort?.abort();},
    authority:()=>this.options.authority,assert:()=>this.assert(),
    backoff:this.backoff,onWrite:()=>{this.writes++;},
  });
  private send=this.transport.send;
  private request=this.transport.request;
  private scheduler=syncScheduler(()=>void this.run(),()=>!!this.running,()=>this.backoff.delay(),()=>this.options.authority.signal.aborted);
  private writes=0;
  private device:ReturnType<typeof syncDevicePreference>;
  private registry:ReturnType<typeof syncRegistrations>;
  readonly history:ReturnType<typeof cloudHistory>;
  constructor(private options:{home:string;spaceId:string;endpoint:string;authority:SyncAuthority;registrations:SyncRegistration[];discover?:()=>Promise<readonly SyncRegistration[]>;fetch?:typeof fetch}) {
    validateSyncEndpoint(options.endpoint);
    this.db(()=>{});
    this.device=syncDevicePreference(options.home,options.spaceId);
    this.device.read();
    this.registry=syncRegistrations(options.registrations,options.discover,()=>this.assert());
    this.history=cloudHistory({home:options.home,run:()=>this.run(),scope:namespace=>{
      const registration=this.selected(namespace),policyRevision=this.policy().revision,signal=this.controller.signal;
      const check=()=>{assertSyncRegistration(registration,()=>this.assert());this.selected(namespace);if(signal.aborted||this.policy().revision!==policyRevision)throw syncError('scope','同步状态已变化，原件已保留');};
      return {registration,policyRevision,channel:{assert:check,json:(route,body)=>this.request(route,body,body===undefined?'GET':'POST',check),binary:async(route,body)=>{const response=await this.send(route,body===undefined?undefined:Buffer.from(body),body===undefined?'GET':'PUT','application/octet-stream',check);if(!response.ok)throw syncError('invalid','同步附件读取失败');const bytes=new Uint8Array(await response.arrayBuffer());check();if(bytes.byteLength>4*1024*1024)throw syncError('limit','同步附件分块过大');return bytes;}}};
    }});
  }
  private db<T>(run:(db:import('node:sqlite').DatabaseSync)=>T):T {
    return withSyncDatabase(this.options.home,run);
  }
  private trackTransfer(kind:'cycle'|'conflict') {
    const progress={kind,done:0,total:0};
    this.transfers.add(progress);
    const onProgress:NonNullable<BlobChannel['onProgress']>=delta=>{
      progress.total+=delta.total;
      progress.done=Math.min(progress.total,progress.done+delta.done);
    };
    return {onProgress,finish:()=>this.transfers.delete(progress)};
  }
  private get transferBytes(){
    const total={done:0,total:0};
    const conflicts=[...this.transfers].filter(progress=>progress.kind==='conflict');
    for(const progress of conflicts.length?conflicts:this.transfers){
      total.done+=progress.done;
      total.total+=progress.total;
    }
    return total.total>0?total:null;
  }
  private get isRunning(){return !!this.running||this.transfers.size>0;}
  private assert(){this.options.authority.assertCurrent();if(this.closed||this.controller.signal.aborted)throw syncError('scope','同步已停止');}
  policy():SpaceSyncPolicy {
    this.assert();
    const json=this.db(db=>db.prepare('SELECT json FROM sync_policy WHERE id=1').get()?.json);
    return json?parseSpaceSyncPolicy(JSON.parse(String(json)),this.options.spaceId):{spaceId:this.options.spaceId,revision:0,selections:[]};
  }
  private cache(value:unknown):SpaceSyncPolicy {
    const policy=parseSpaceSyncPolicy(value,this.options.spaceId);this.assert();
    this.db(db=>db.prepare('INSERT INTO sync_policy VALUES (1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(policy)));return policy;
  }
  async save(policy:unknown){
    if(this.running)await this.running;
    await this.registry.refresh();
    const parsed=parseSpaceSyncPolicy(policy,this.options.spaceId);
    const known=new Set(this.registry.current().map(r=>syncNamespace(r.selection)));
    const old=new Set(this.policy().selections.map(syncNamespace));
    if(parsed.selections.some(s=>!known.has(syncNamespace(s))&&!old.has(syncNamespace(s))))throw new Error('此同步格式尚未接入');
    for(const registration of this.registry.current())if(parsed.selections.some(s=>syncNamespace(s)===syncNamespace(registration.selection)))assertSyncDependencies(registration,this.registry.current(),parsed);
    const result=this.cache(await this.request('/v1/policy',parsed,'PUT'));
    if(this.device.read().automatic===true)await this.run();return result;
  }
  async refreshCatalog(){await this.registry.refresh();this.assert();}
  start(){
    this.assert();
    if(this.device.read().automatic===true&&!this.changingDevice)this.scheduler.start();
  }
  notifyLocalChange(){
    try{this.assert();}catch{return;}
    this.localChangePending=true;
    this.indicatorDirty=true;
    this.scheduler.notifyLocalChange();
  }
  close(){this.closed=true;this.scheduler.stop();this.controller.abort();}
  async setDevice(automatic:unknown){
    this.assert();
    if(typeof automatic!=='boolean')throw syncError('invalid','请选择是否自动同步');
    if(this.changingDevice)throw syncError('busy','同步设置正在保存，请稍后重试');
    this.device.write(automatic);this.changingDevice=true;
    this.scheduler.stop();
    this.controller.abort();
    try{
      await this.running;
      this.options.authority.assertCurrent();
      if(this.closed)throw syncError('scope','同步已停止');
      this.controller=new AbortController();this.error=null;
    }finally{this.changingDevice=false;}
    if(automatic)this.start();
  }
  run():Promise<void>{
    if(this.running)return this.running;
    this.scheduler.running();
    const signal=AbortSignal.any([this.options.authority.signal,this.controller.signal]);
    this.running=withSyncCycleDatabase(this.options.home,signal,async()=>{
      try{return await this.cycle();}
      finally{
        // Keep status discovery off the resident indicator's polling path.
        if(!signal.aborted)try{this.status();}catch{this.lastProgress=null;}
      }
    }).then(active=>{
      this.backoff.succeeded();
      this.scheduler.completed(active);
      this.error=null;this.lastSuccess=new Date().toISOString();
    },error=>{
      this.scheduler.completed(true);
      this.error=error instanceof Error?error.message:'同步失败';
    }).finally(()=>{this.running=null;this.scheduler.resume();});
    return this.running;
  }
  private async cycle(){
    await this.registry.refresh();
    const startedWrites=this.writes,summary=parseSyncRound(await this.request('/v1/round'),this.options.spaceId);
    const policy=this.cache(summary.policy),quota=this.quota=summary.quota;
    let quotaFull=quota.usedBytes>=quota.limitBytes;
    let pulled=false,received=this.localChangePending;
    this.localChangePending=false;
    const errors=unavailableSyncSelections(this.registry.current(),policy);
    const budget={remaining:32};
    const selectedRegistrations=this.registry.current().filter(r=>policy.selections.some(s=>syncNamespace(s)===syncNamespace(r.selection)));
    const layers=partitionSyncLayers(selectedRegistrations);
    const {onProgress,finish}=this.trackTransfer('cycle');
    const syncOne=async(registration:SyncRegistration)=>{
      const namespace=syncNamespace(registration.selection);
      const check=()=>assertSyncRegistration(registration,()=>this.assert());
      const blobs=blobTransfer(this.options.home,{assert:check,onProgress,json:<T>(route:string,body?:unknown)=>this.request<T>(route,body,body===undefined?'GET':'POST',check),binary:async(route,body)=>{
        const response=await this.send(route,body?Buffer.from(body):undefined,body?'PUT':'GET','application/octet-stream',check);
        if(!response.ok)throw syncError('invalid','同步附件传输失败');const bytes=new Uint8Array(await response.arrayBuffer());check();if(bytes.byteLength>4*1024*1024)throw syncError('limit','同步附件分块过大');return bytes;
      }},budget);
      try {
      assertSyncDependencies(registration,this.registry.current(),policy);
      pinSyncProtection(this.options.home,namespace,check,registration.protection);
      await registration.refresh();check();
      const transientKeys=new Set<string>();
      await withSyncMutation(registration,{kind:'retry-waiting'},check,r=>r.retryWaiting?.());
      const incoming=async(wire:SyncEvent&{attachments?:SyncBlobReference[]},retry=false)=>{
        const event=await decodeContent(registration,wire,reference=>blobs.download(namespace,reference,registration.protection));check();await registration.prepare(event,{retry});await registration.refresh();check();
        await withSyncMutation(registration,{kind:'receive',event,retry},check,r=>r.receive(event,{retry}));check();syncItemFailures(this.options.home,check,registration.protection).acknowledge(namespace,event);blobs.forget(namespace,event.operationId);blobs.release(namespace,wire.attachments??[]);received=true;
      };
      await replayDeferred(namespace,syncItemFailures(this.options.home,check,registration.protection),wire=>incoming(wire,true),check,received);
      const preparation=await registration.prepareUploads?.()??[];check();for(const failed of preparation){transientKeys.add(failed.key);errors.push(registration.title+': '+(failed.error instanceof Error?failed.error.message:'内容导出暂不可用'));}
      let drained=false;
      let pulls=40,pushes=40,first=true,more=false;
      while(pulls>0||pushes>0){
        const failures=syncItemFailures(this.options.home,check,registration.protection);
        const after=Math.max(registration.withReplica(r=>r.cursor()),failures.cursor(namespace));
        if(first&&summary.heads.get(namespace)!<after)throw syncError('conflict','云端同步版本已回退，请先核对服务恢复状态；本机原件和队列已保留');
        const pull=pulls>0&&(!first||summary.heads.get(namespace)!>after);
        first=false;
        const result:{events:SyncEvent[];more:boolean}=pull
          ?await this.request<{events:SyncEvent[];more:boolean}>(`/v1/changes?namespace=${encodeURIComponent(namespace)}&after=${after}`,undefined,'GET',check)
          :{events:[],more};
        if(pull)pulls--;
        more=result.more;
        if(!Array.isArray(result.events)||result.events.length>20)throw new Error('SYNC_INVALID_BATCH');
        pulled ||= result.events.length>0;
        let previous=after;
        for(const wire of result.events as (SyncEvent&{attachments?:SyncBlobReference[]})[]){
          if(!Number.isSafeInteger(wire.revision)||wire.revision<=previous||typeof wire.key!=='string'||!wire.key||wire.key.length>500)throw new Error('SYNC_INVALID_CURSOR');
          try{
            await incoming(wire);
          }catch(error){check();if(isTransportBackoff(error))throw error;failures.save(namespace,wire.key,'download',error,wire,!isPermanentItemFailure(error)||isSyncQuotaError(error));}
          previous=wire.revision;
        }
        if(pull&&more&&!result.events.length)throw new Error('SYNC_EMPTY_PAGE');
        if(pushes===0){
          if(!more||pulls===0)break;
          continue;
        }
        await registration.refresh();check();await withSyncMutation(registration,{kind:'retry-waiting'},check,r=>r.retryWaiting?.());
        let next;try{next=registration.withReplica(r=>r.next({deletionsOnly:quotaFull,excludeKeys:[...failures.list(namespace).map(item=>item.key),...transientKeys]}));}
        catch(error){check();const key=itemFailureKey(error);if(!key)throw error;
          pushes--;
          if(isPermanentItemFailure(error))failures.save(namespace,key,'upload',error);else{transientKeys.add(key);errors.push(registration.title+': '+(error instanceof Error?error.message:'同步资产暂时不可用'));}continue;}
        if(!next){
          if(more&&pulls>0)continue;
          drained=!more;break;
        }
        pushes--;
        try{const encoded=registration.content&&next.value!==null?registration.content.encode(next.key,next.value):{value:next.value,blobs:[]};
          for(const source of encoded.blobs)await blobs.upload(namespace,next.operationId,source);
          try{const receipt=await this.request<{accepted:boolean;revision:number}>('/v1/changes',{namespace,policyRevision:policy.revision,mutation:{...next,value:encoded.value},attachments:encoded.blobs.map(blobReference)},'POST',check);
            if(receipt.accepted!==true||!Number.isSafeInteger(receipt.revision)||receipt.revision<=next.base)throw syncError('invalid','同步回执版本无效');
            check();registration.withReplica(r=>r.acknowledge(next.key,next.operationId,receipt.revision));blobs.forget(namespace,next.operationId);}
          catch(error){blobs.forget(namespace,next.operationId);throw error;}}
        catch(error){check();if(isTransportBackoff(error))throw error;if(isSyncQuotaError(error)){quotaFull=true;}else if(isPermanentItemFailure(error)){failures.save(namespace,next.key,'upload',error);}else if(isTemporaryOwnerFailure(error)){transientKeys.add(next.key);errors.push(registration.title+': '+(error instanceof Error?error.message:'同步资产暂时不可用'));}else throw error;}
        // Receipts settle frozen prefixes, but every remote event is still consumed in log order.
      }
      check();registration.withReplica(r=>r.maintain?.());check();
      if(!drained)errors.push(registration.title+': 本轮仍有内容待同步，请继续同步；原件和进度已保留');
      if(quotaFull&&registration.withReplica(r=>r.counts().pending)>0)errors.push(registration.title+': '+syncResponseMessage('SYNC_QUOTA_EXCEEDED'));
      const failed=syncItemFailures(this.options.home,()=>this.assert()).list(namespace);if(failed.length)errors.push(registration.title+': '+failed.length+' 项需要处理 · '+failed.slice(0,3).map(item=>item.reason).join('；'));
      } catch(error) {
        this.assert(); // Revocation aborts the whole cycle; an owner format error does not block unrelated collections.
        if(isTransportBackoff(error))throw error;
        errors.push(registration.title+': '+(error instanceof Error?error.message:'同步失败'));
      }
    };
    const cycleAbort = new AbortController();
    this.cycleAbort = cycleAbort;
    try {
      for (const layer of layers) {
        await runBounded(layer, 3, syncOne, () => cycleAbort.abort());
      }
    } finally {
      if (this.cycleAbort === cycleAbort) {
        this.cycleAbort = null;
      }
      finish();
    }
    if(this.writes!==startedWrites)this.quota=parseSyncQuota(await this.request('/v1/quota'));
    if(errors.length)throw new Error(errors.join('\n'));
    return pulled||this.writes!==startedWrites;
  }
  status(){
    const policy=this.policy();
    const selected = new Set(policy.selections.map(syncNamespace));
    const collections = this.registry.current().map(r => {
      const namespace = syncNamespace(r.selection);
      const group = r.group ?? 'plugin';
      return selected.has(namespace)
        ? { selection: r.selection, title: r.title, group, ...r.withReplica(a => ({ pending: a.counts().pending, ...conflictPage(a.conflicts()) })), failures: syncItemFailures(this.options.home, () => this.assert()).list(namespace) }
        : { selection: r.selection, title: r.title, group, pending: 0, ...conflictPage([]), failures: [] };
    });
    const running=this.isRunning,progress=syncProgress({policy,collections,running,error:this.error,lastSuccess:this.lastSuccess});
    this.lastProgress=progress;
    this.indicatorDirty=false;
    return {policy,device:this.device.read(),quota:this.quota,running,error:this.error,lastSuccess:this.lastSuccess,collections,progress,transfer:this.transferBytes,unavailable:policy.selections.filter(s=>!this.registry.current().some(r=>syncNamespace(r.selection)===syncNamespace(s)))};
  }
  indicatorStatus(){
    this.assert();
    const running=this.isRunning;
    const snapshot=(this.indicatorDirty&&!running)?this.status().progress:(this.lastProgress??this.status().progress);
    const progress={...snapshot,complete:!running&&!this.error&&!!this.lastSuccess&&snapshot.selected>0
      &&!snapshot.pending&&!snapshot.conflicts&&!snapshot.waiting&&!snapshot.failures&&!snapshot.unavailable};
    return {running,error:this.error,lastSuccess:this.lastSuccess,progress,transfer:this.transferBytes};
  }
  async retryItem(namespace:string,key:string,direction:'upload'|'download'){
    if(this.running)await this.running;this.assert();
    const registration=this.registry.current().find(r=>syncNamespace(r.selection)===namespace);
    if(!registration||!this.policy().selections.some(s=>syncNamespace(s)===namespace)||!['upload','download'].includes(direction))throw syncError('scope','此同步集合已关闭或不存在');
    const check=()=>assertSyncRegistration(registration,()=>this.assert()),failures=syncItemFailures(this.options.home,check,registration.protection);
    pinSyncProtection(this.options.home,namespace,check,registration.protection);
    if(direction==='download'){
      const wire=failures.event(namespace,key);if(!wire)throw syncError('invalid','待重试资产不存在');
      const transfer=blobTransfer(this.options.home,{assert:check,json:(route,body)=>this.request(route,body,body===undefined?'GET':'POST',check),binary:async(route,body)=>{const response=await this.send(route,body===undefined?undefined:Buffer.from(body),body===undefined?'GET':'PUT','application/octet-stream',check);if(!response.ok)throw syncError('invalid','同步附件读取失败');const bytes=new Uint8Array(await response.arrayBuffer());check();return bytes;}});
      const event=await decodeContent(registration,wire,ref=>transfer.download(namespace,ref,registration.protection));check();await registration.prepare(event,{retry:true});await registration.refresh();check();await withSyncMutation(registration,{kind:'receive',event,retry:true},check,r=>r.receive(event,{retry:true}));check();transfer.release(namespace,(wire as SyncEvent&{attachments?:SyncBlobReference[]}).attachments??[]);
    }
    failures.clear(namespace,key,direction);await this.run();
  }
  async resolve(namespace:string,key:string,choice:'local'|'remote',revision?:number,state?:string){
    if(this.running)await this.running;
    const registration=this.selected(namespace),policyRevision=this.policy().revision,signal=this.controller.signal;
    const check=()=>{assertSyncRegistration(registration,()=>this.assert());this.selected(namespace);if(signal.aborted||this.policy().revision!==policyRevision)throw syncError('scope','同步状态已变化，原件已保留');};
    await registration.refresh();check();
    const {onProgress,finish}=this.trackTransfer('conflict');
    try{
      const channel:BlobChannel={
        assert:check,onProgress,
        json:(route,body)=>this.request(route,body,body===undefined?'GET':'POST',check),
        binary:async(route,body)=>{
          const response=await this.send(route,body===undefined?undefined:Buffer.from(body),body===undefined?'GET':'PUT','application/octet-stream',check);
          if(!response.ok)throw syncError('invalid','同步附件传输失败');
          const bytes=new Uint8Array(await response.arrayBuffer());
          check();
          return bytes;
        },
      };
      const inspection=await retainConflict({home:this.options.home,namespace,key,choice,revision,state,policyRevision,registration,channel});
      if(choice==='remote')await registration.content?.prepare?.(key,inspection.remote);
      check();
      await withSyncMutation(registration,{kind:'resolve',key,choice,revision:inspection.revision,state:inspection.state},check,r=>r.resolve(key,choice,inspection.revision,inspection.state));
    }finally{
      finish();
    }
    await this.run();
  }
  private selected(namespace:string){this.assert();const registration=this.registry.current().find(r=>syncNamespace(r.selection)===namespace);if(!registration||!this.policy().selections.some(s=>syncNamespace(s)===namespace))throw syncError('scope','此同步集合已关闭或不存在');return registration;}
  listConflicts(namespace: string, after?: import('./progress.js').ConflictCursor) {
    return this.selected(namespace).withReplica(replica => conflictPage(replica.conflicts(), after));
  }
  inspectConflict(namespace:string,key:string){const registration=this.selected(namespace),view=registration.withReplica(r=>r.inspectConflict?.(key)??null);return view?{...view,location:registration.locate?.(key)??registration.withReplica(r=>r.locate?.(key)??null)}:null;}
  recoveries(namespace:string){return this.selected(namespace).withReplica(r=>r.recoveries?.()??[]);}
  inspectRecovery(namespace:string,id:string){const registration=this.selected(namespace),view=registration.withReplica(r=>r.inspectRecovery?.(id)??null);return view?{...view,location:registration.locate?.(view.key)??registration.withReplica(r=>r.locate?.(view.key)??null)}:null;}
  async restoreRecovery(namespace:string,id:string,choice:'local'|'remote',revision:number){
    if(this.running)await this.running;
    const registration=this.selected(namespace),policyRevision=this.policy().revision;
    const check=()=>{assertSyncRegistration(registration,()=>this.assert());this.selected(namespace);if(this.policy().revision!==policyRevision)throw syncError('scope','同步状态已变化，原件已保留');};
    await registration.refresh();check();
    const inspection=registration.withReplica(r=>r.inspectRecovery?.(id)??null);
    if(!inspection||inspection.revision!==revision)throw syncError('conflict','保留版本已变化，请重新查看');
    await registration.content?.prepare?.(inspection.key,choice==='local'?inspection.local:inspection.remote);check();
    await withSyncMutation(registration,{kind:'restore-recovery',id,choice,revision},check,r=>{if(!r.restoreRecovery)throw syncError('unsupported','此集合未提供版本恢复');r.restoreRecovery(id,choice,revision);});await this.run();
  }

  async trash(before?:number){this.assert();return this.request('/v1/trash'+(before===undefined?'':'?before='+encodeURIComponent(String(before))));}
  quotaBreakdown=()=>this.request('/v1/quota/breakdown');
  async restoreTrash(namespace:string,key:string,revision:number,operationId:string){const registration=this.selected(namespace);await this.request('/v1/trash/restore',{namespace,key,revision,operationId,policyRevision:this.policy().revision},'POST',()=>assertSyncRegistration(registration,()=>this.assert()));await this.run();}
  async purgeTrash(namespace:string,key:string,revision:number,confirm:boolean){const registration=this.selected(namespace);await this.request('/v1/trash/purge',{namespace,key,revision,confirm},'POST',()=>assertSyncRegistration(registration,()=>this.assert()));await this.run();}
}

async function replayDeferred(namespace:string,failures:ReturnType<typeof syncItemFailures>,receive:(event:SyncEvent)=>Promise<void>,assert:()=>void,dependencyChanged:boolean){
  for(const wire of failures.deferred(namespace,dependencyChanged)){
    assert();try{await receive(wire);}catch(error){assert();if(isTransportBackoff(error))throw error;failures.save(namespace,wire.key,'download',error,wire,!isPermanentItemFailure(error)||isSyncQuotaError(error));}
  }
}

const RESTORE_TIER_RANK: Record<SyncRestoreTier, number> = {
  catalog: 0,
  'version-store': 1,
  'reference-owner': 2,
  default: 3,
};

const restoreTierOf = (registration: SyncRegistration): SyncRestoreTier =>
  registration.restoreTier ?? (typeof registration.hasReference === 'function' ? 'reference-owner' : 'default');

/** Group selected registrations into topological layers by declared `restoreTier` and explicit `dependencies` so independent collections sync in parallel. */
function partitionSyncLayers(registrations:readonly SyncRegistration[]):SyncRegistration[][]{
  if(registrations.length<=1)return registrations.length?[[...registrations]]:[];
  const byNs=new Map(registrations.map(r=>[syncNamespace(r.selection),r]));
  const tierRank=new Map(registrations.map(r=>[syncNamespace(r.selection),RESTORE_TIER_RANK[restoreTierOf(r)]]));
  const deps=new Map<string,Set<string>>();
  for(const r of registrations){
    const ns=syncNamespace(r.selection);
    const rank=tierRank.get(ns)!;
    const set=new Set<string>();
    for(const dep of r.dependencies??[]){const d=syncNamespace(dep);if(d!==ns&&byNs.has(d))set.add(d);}
    for(const [otherNs,otherRank] of tierRank)if(otherNs!==ns&&otherRank<rank)set.add(otherNs);
    deps.set(ns,set);
  }
  const layers:SyncRegistration[][]=[];
  const done=new Set<string>();
  const remaining=new Set(byNs.keys());
  while(remaining.size){
    const ready=[...remaining].filter(ns=>[...deps.get(ns)!].every(d=>done.has(d)));
    if(!ready.length){
      layers.push([...remaining].map(ns=>byNs.get(ns)!));
      break;
    }
    layers.push(ready.map(ns=>byNs.get(ns)!));
    for(const ns of ready){
      done.add(ns);
      remaining.delete(ns);
    }
  }
  return layers;
}

async function runBounded<T>(items:readonly T[],concurrency:number,work:(item:T)=>Promise<void>,onBackoff?:()=>void){
  if(items.length<=1){
    if(items[0])await work(items[0]);
    return;
  }
  let index=0;
  let failure:unknown=null;
  let failed=false;
  const worker=async()=>{
    while(!failed&&index<items.length){
      const item=items[index++]!;
      try{
        await work(item);
      }catch(error){
        if(!failed){
          failed=true;
          failure=error;
          if(isTransportBackoff(error))onBackoff?.();
        }
        return;
      }
    }
  };
  await Promise.all(Array.from({length:Math.min(concurrency,items.length)},worker));
  if(failed)throw failure;
}
