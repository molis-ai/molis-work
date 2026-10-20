import {withSyncMutation,type SyncMutationScope} from './mutation-scope.js';
import { openSyncDatabase } from './database.js';
import type { SpaceSyncPolicy, SyncQuotaStatus } from '@molis-ai/molis-work-contracts/modules/sync-replication';
import type { SyncEvent, SyncReplicaAdapter, SyncContentCodec, SyncBlobReference, SyncLocalProtection } from '@molis-ai/molis-work-contracts/platform/sync-transport';
export {partitionedReplica} from './partitioned-replica.js';
export {SYNC_HOME_STORE,SYNC_STORE_BASELINE} from './database.js';
export {hasProtectedSyncPayloads} from './local-protection.js';
import {pinSyncProtection} from './local-protection.js';

export const packageDescriptor = {
  packageName:'@molis-ai/molis-work-module-sync-replication',packagePath:'modules/sync-replication',kind:'module',maturity: "partial",
  contract:'@molis-ai/molis-work-contracts/modules/sync-replication',migrationGoals:['goal-reorg-f2'],ssot:'docs/SSOT-MATRIX.md',capabilities:[],
} as const;

export type SyncSelection = SpaceSyncPolicy['selections'][number];
export {syncNamespace} from './namespace.js';
import {syncNamespace} from './namespace.js';
export interface SyncRegistration {
  selection:SyncSelection; title:string;
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
import { parseSyncQuota, syncResponseMessage, syncQuotaError, isSyncQuotaError } from './quota.js';
import {blobTransfer,blobReference} from './blob-transfer.js';
import {syncItemFailures,itemFailureKey,isPermanentItemFailure,isTemporaryOwnerFailure} from './item-failures.js';
import {assertSyncDependencies,unavailableSyncSelections} from './selection-dependencies.js';
import {syncRegistrations,assertSyncRegistration} from './registrations.js';
import {retainConflict} from './conflict-retention.js';
import {decodeContent} from './decode-content.js';
import {cloudHistory} from './cloud-history.js';
import {parseSyncRound} from './round.js';
import {syncProgress} from './progress.js';
export { resolveSyncEndpoint } from './endpoint.js';

export class PersonalSync {
  private running:Promise<void>|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private controller=new AbortController();
  private error:string|null=null;
  private lastSuccess:string|null=null;
  private quota:SyncQuotaStatus|null=null;
  private closed=false;
  private changingDevice=false;
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
  private db<T>(run:(db:ReturnType<typeof openSyncDatabase>)=>T):T {
    const db=openSyncDatabase(this.options.home);try{return run(db);}finally{db.close();}
  }
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
  private async send(route:string,body?:string|Buffer,method=body===undefined?'GET':'POST',type='application/json',check=()=>this.assert()) {
    check();const token=await this.options.authority.accessToken();check();
    if(method!=='GET')this.writes++;
    const signal=AbortSignal.any([this.options.authority.signal,this.controller.signal,AbortSignal.timeout(15000)]);
    const response=await (this.options.fetch??fetch)(new URL(route,this.options.endpoint),{method,signal,redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':type},...(body===undefined?{}:{body})});
    check();return response;
  }
  private async request<T=unknown>(route:string,body?:unknown,method=body===undefined?'GET':'POST',check=()=>this.assert()):Promise<T> {
    const response=await this.send(route,body===undefined?undefined:JSON.stringify(body),method,'application/json',check);
    const text=await response.text();check();
    if(text.length>4*1024*1024)throw new Error('SYNC_RESPONSE_TOO_LARGE');
    let result:Record<string,unknown>;try{const parsed:unknown=JSON.parse(text);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw syncError('invalid','同步响应格式无效');result=parsed as Record<string,unknown>;}catch{throw syncError('invalid','同步响应格式无效');}
    if(!response.ok&&typeof result.error==='string'&&['SYNC_BLOB_MISSING','SYNC_BLOB_CORRUPT','SYNC_ITEM_PURGED','SYNC_ITEM_EXPIRED'].includes(result.error))throw syncError('invalid',result.error==='SYNC_ITEM_PURGED'||result.error==='SYNC_ITEM_EXPIRED'?'云端内容已过保留期或永久删除，本机原件仍保留':syncResponseMessage(result.error));
    if(!response.ok&&result.error==='SYNC_QUOTA_EXCEEDED')throw syncQuotaError();
    if(!response.ok)throw new Error(response.status===409?'同步版本已变化，请重试':response.status===401?'登录已失效，请重新登录':syncResponseMessage(result.error));
    return result as T;
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
    if(this.device.read().automatic!==true||this.changingDevice||this.timer)return;
    this.timer=setInterval(()=>void this.run(),15000);this.timer.unref();void this.run();
  }
  close(){this.closed=true;this.controller.abort();if(this.timer)clearInterval(this.timer);this.timer=null;}
  async setDevice(automatic:unknown){
    this.assert();
    if(typeof automatic!=='boolean')throw syncError('invalid','请选择是否自动同步');
    if(this.changingDevice)throw syncError('busy','同步设置正在保存，请稍后重试');
    this.device.write(automatic);this.changingDevice=true;
    if(this.timer)clearInterval(this.timer);this.timer=null;
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
    this.running=this.cycle().then(()=>{this.error=null;this.lastSuccess=new Date().toISOString();},error=>{this.error=error instanceof Error?error.message:'同步失败';}).finally(()=>{this.running=null;});
    return this.running;
  }
  private async cycle(){
    await this.registry.refresh();
    const startedWrites=this.writes,summary=parseSyncRound(await this.request('/v1/round'),this.options.spaceId);
    const policy=this.cache(summary.policy),quota=this.quota=summary.quota;
    let quotaFull=quota.usedBytes>=quota.limitBytes;
    const errors=unavailableSyncSelections(this.registry.current(),policy);
    let current:SyncRegistration|undefined;const check=()=>assertSyncRegistration(current,()=>this.assert());
    const blobs=blobTransfer(this.options.home,{assert:check,json:<T>(route:string,body?:unknown)=>this.request<T>(route,body,body===undefined?'GET':'POST',check),binary:async(route,body)=>{
      const response=await this.send(route,body?Buffer.from(body):undefined,body?'PUT':'GET','application/octet-stream',check);
      if(!response.ok)throw syncError('invalid','同步附件传输失败');const bytes=new Uint8Array(await response.arrayBuffer());check();if(bytes.byteLength>4*1024*1024)throw syncError('limit','同步附件分块过大');return bytes;
    }});
    // Host registration order puts reference owners before their consumers; policy is selection, not execution order.
    for(const registration of this.registry.current()){
      const namespace=syncNamespace(registration.selection);
      if(!policy.selections.some(s=>syncNamespace(s)===namespace))continue;
      current=registration;
      try {
      assertSyncDependencies(registration,this.registry.current(),policy);
      pinSyncProtection(this.options.home,namespace,check,registration.protection);
      await registration.refresh();check();
      const transientKeys=new Set<string>();
      await withSyncMutation(registration,{kind:'retry-waiting'},check,r=>r.retryWaiting?.());
      const incoming=async(wire:SyncEvent&{attachments?:SyncBlobReference[]},retry=false)=>{
        const event=await decodeContent(registration,wire,reference=>blobs.download(namespace,reference,registration.protection));check();await registration.prepare(event,{retry});await registration.refresh();check();
        await withSyncMutation(registration,{kind:'receive',event,retry},check,r=>r.receive(event,{retry}));check();syncItemFailures(this.options.home,check,registration.protection).acknowledge(namespace,event);blobs.forget(namespace,event.operationId);blobs.release(namespace,wire.attachments??[]);
      };
      await replayDeferred(namespace,syncItemFailures(this.options.home,check,registration.protection),wire=>incoming(wire,true),check);
      const preparation=await registration.prepareUploads?.()??[];check();for(const failed of preparation){transientKeys.add(failed.key);errors.push(registration.title+': '+(failed.error instanceof Error?failed.error.message:'内容导出暂不可用'));}
      let drained=false;
      for(let turn=0;turn<40;turn++){
        const failures=syncItemFailures(this.options.home,check,registration.protection);
        const after=Math.max(registration.withReplica(r=>r.cursor()),failures.cursor(namespace));
        if(turn===0&&summary.heads.get(namespace)!<after)throw syncError('conflict','云端同步版本已回退，请先核对服务恢复状态；本机原件和队列已保留');
        const result=turn===0&&summary.heads.get(namespace)!<=after?{events:[],more:false}:await this.request<{events:SyncEvent[];more:boolean}>(`/v1/changes?namespace=${encodeURIComponent(namespace)}&after=${after}`,undefined,'GET',check);
        if(!Array.isArray(result.events)||result.events.length>20)throw new Error('SYNC_INVALID_BATCH');
        let previous=after;
        for(const wire of result.events as (SyncEvent&{attachments?:SyncBlobReference[]})[]){
          if(!Number.isSafeInteger(wire.revision)||wire.revision<=previous||typeof wire.key!=='string'||!wire.key||wire.key.length>500)throw new Error('SYNC_INVALID_CURSOR');
          try{
            await incoming(wire);
          }catch(error){check();failures.save(namespace,wire.key,'download',error,wire,!isPermanentItemFailure(error)||isSyncQuotaError(error));}
          previous=wire.revision;
        }
        if(result.more){if(!result.events.length)throw new Error('SYNC_EMPTY_PAGE');continue;}
        await registration.refresh();check();await withSyncMutation(registration,{kind:'retry-waiting'},check,r=>r.retryWaiting?.());
        let next;try{next=registration.withReplica(r=>r.next({deletionsOnly:quotaFull,excludeKeys:[...failures.list(namespace).map(item=>item.key),...transientKeys]}));}
        catch(error){check();const key=itemFailureKey(error);if(!key)throw error;
          if(isPermanentItemFailure(error))failures.save(namespace,key,'upload',error);else{transientKeys.add(key);errors.push(registration.title+': '+(error instanceof Error?error.message:'同步资产暂时不可用'));}continue;}
        if(!next){drained=true;break;}
        try{const encoded=registration.content&&next.value!==null?registration.content.encode(next.key,next.value):{value:next.value,blobs:[]};
          for(const source of encoded.blobs)await blobs.upload(namespace,next.operationId,source);
          try{const receipt=await this.request<{accepted:boolean;revision:number}>('/v1/changes',{namespace,policyRevision:policy.revision,mutation:{...next,value:encoded.value},attachments:encoded.blobs.map(blobReference)},'POST',check);
            if(receipt.accepted!==true||!Number.isSafeInteger(receipt.revision)||receipt.revision<=next.base)throw syncError('invalid','同步回执版本无效');
            check();registration.withReplica(r=>r.acknowledge(next.key,next.operationId,receipt.revision));blobs.forget(namespace,next.operationId);}
          catch(error){blobs.forget(namespace,next.operationId);throw error;}}
        catch(error){check();if(isSyncQuotaError(error)){quotaFull=true;}else if(isPermanentItemFailure(error)){failures.save(namespace,next.key,'upload',error);}else if(isTemporaryOwnerFailure(error)){transientKeys.add(next.key);errors.push(registration.title+': '+(error instanceof Error?error.message:'同步资产暂时不可用'));}else throw error;}
        // Receipts settle frozen prefixes, but every remote event is still consumed in log order.
      }
      check();registration.withReplica(r=>r.maintain?.());check();
      if(!drained)errors.push(registration.title+': 本轮仍有内容待同步，请继续同步；原件和进度已保留');
      if(quotaFull&&registration.withReplica(r=>r.counts().pending)>0)errors.push(registration.title+': '+syncResponseMessage('SYNC_QUOTA_EXCEEDED'));
      const failed=syncItemFailures(this.options.home,()=>this.assert()).list(namespace);if(failed.length)errors.push(registration.title+': '+failed.length+' 项需要处理 · '+failed.slice(0,3).map(item=>item.reason).join('；'));
      } catch(error) {
        this.assert(); // Revocation aborts the whole cycle; an owner format error does not block unrelated collections.
        errors.push(registration.title+': '+(error instanceof Error?error.message:'同步失败'));
      } finally {current=undefined;}
    }
    if(this.writes!==startedWrites)this.quota=parseSyncQuota(await this.request('/v1/quota'));
    if(errors.length)throw new Error(errors.join('\n'));
  }
  status(){
    const policy=this.policy();
    const collections=this.registry.current().map(r=>({selection:r.selection,title:r.title,...r.withReplica(a=>a.counts()),conflicts:r.withReplica(a=>a.conflicts()),failures:syncItemFailures(this.options.home,()=>this.assert()).list(syncNamespace(r.selection))}));
    const running=!!this.running,progress=syncProgress({policy,collections,running,error:this.error,lastSuccess:this.lastSuccess});
    return {policy,device:this.device.read(),quota:this.quota,running,error:this.error,lastSuccess:this.lastSuccess,collections,progress,unavailable:policy.selections.filter(s=>!this.registry.current().some(r=>syncNamespace(r.selection)===syncNamespace(s)))};
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
    const inspection=await retainConflict({home:this.options.home,namespace,key,choice,revision,state,policyRevision,registration,channel:{assert:check,json:(route,body)=>this.request(route,body,body===undefined?'GET':'POST',check),binary:async(route,body)=>{const response=await this.send(route,body===undefined?undefined:Buffer.from(body),body===undefined?'GET':'PUT','application/octet-stream',check);if(!response.ok)throw syncError('invalid','同步附件传输失败');const bytes=new Uint8Array(await response.arrayBuffer());check();return bytes;}}});
    check();await withSyncMutation(registration,{kind:'resolve',key,choice,revision:inspection.revision,state:inspection.state},check,r=>r.resolve(key,choice,inspection.revision,inspection.state));await this.run();
  }
  private selected(namespace:string){this.assert();const registration=this.registry.current().find(r=>syncNamespace(r.selection)===namespace);if(!registration||!this.policy().selections.some(s=>syncNamespace(s)===namespace))throw syncError('scope','此同步集合已关闭或不存在');return registration;}
  inspectConflict(namespace:string,key:string){const registration=this.selected(namespace),view=registration.withReplica(r=>r.inspectConflict?.(key)??null);return view?{...view,location:registration.locate?.(key)??registration.withReplica(r=>r.locate?.(key)??null)}:null;}
  recoveries(namespace:string){return this.selected(namespace).withReplica(r=>r.recoveries?.()??[]);}
  inspectRecovery(namespace:string,id:string){const registration=this.selected(namespace),view=registration.withReplica(r=>r.inspectRecovery?.(id)??null);return view?{...view,location:registration.locate?.(view.key)??registration.withReplica(r=>r.locate?.(view.key)??null)}:null;}
  async restoreRecovery(namespace:string,id:string,choice:'local'|'remote',revision:number){if(this.running)await this.running;const registration=this.selected(namespace);await registration.refresh();assertSyncRegistration(registration,()=>this.assert());await withSyncMutation(registration,{kind:'restore-recovery',id,choice,revision},()=>assertSyncRegistration(registration,()=>this.assert()),r=>{if(!r.restoreRecovery)throw syncError('unsupported','此集合未提供版本恢复');r.restoreRecovery(id,choice,revision);});await this.run();}
  async trash(before?:number){this.assert();return this.request('/v1/trash'+(before===undefined?'':'?before='+encodeURIComponent(String(before))));}
  async restoreTrash(namespace:string,key:string,revision:number,operationId:string){const registration=this.selected(namespace);await this.request('/v1/trash/restore',{namespace,key,revision,operationId,policyRevision:this.policy().revision},'POST',()=>assertSyncRegistration(registration,()=>this.assert()));await this.run();}
  async purgeTrash(namespace:string,key:string,revision:number,confirm:boolean){const registration=this.selected(namespace);await this.request('/v1/trash/purge',{namespace,key,revision,confirm},'POST',()=>assertSyncRegistration(registration,()=>this.assert()));await this.run();}
}

async function replayDeferred(namespace:string,failures:ReturnType<typeof syncItemFailures>,receive:(event:SyncEvent)=>Promise<void>,assert:()=>void){
  for(const wire of failures.deferred(namespace)){
    assert();try{await receive(wire);}catch(error){assert();failures.save(namespace,wire.key,'download',error,wire,!isPermanentItemFailure(error)||isSyncQuotaError(error));}
  }
}
