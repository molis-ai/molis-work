import { openSyncDatabase } from './database.js';
import type { SpaceSyncPolicy } from '@molis-ai/molis-work-contracts/modules/sync-replication';
import type { SyncEvent, SyncReplicaAdapter } from '@molis-ai/molis-work-contracts/platform/sync-transport';
export {partitionedReplica} from './partitioned-replica.js';
export {SYNC_HOME_STORE,SYNC_STORE_BASELINE} from './database.js';

export const packageDescriptor = {
  packageName:'@molis-ai/molis-work-module-sync-replication',packagePath:'modules/sync-replication',kind:'module',maturity: "partial",
  contract:'@molis-ai/molis-work-contracts/modules/sync-replication',migrationGoals:['goal-reorg-f2'],ssot:'docs/SSOT-MATRIX.md',capabilities:[],
} as const;

export type SyncSelection = SpaceSyncPolicy['selections'][number];
export const syncNamespace=(s:SyncSelection)=>JSON.stringify([s.plugin_id,s.publisher_id,s.publisher_signature,s.collection_id,s.schema_version]);
export interface SyncRegistration {
  selection:SyncSelection; title:string;
  refresh():Promise<void>;
  withReplica<T>(run:(replica:SyncReplicaAdapter)=>T):T;
  prepare(event:SyncEvent):Promise<void>;
}
export interface SyncAuthority { signal:AbortSignal; assertCurrent():void; accessToken():Promise<string> }

export { parseSpaceSyncPolicy } from "./policy.js";
import { parseSpaceSyncPolicy } from "./policy.js";

export class PersonalSync {
  private running:Promise<void>|null=null;
  private timer:ReturnType<typeof setInterval>|null=null;
  private controller=new AbortController();
  private error:string|null=null;
  private lastSuccess:string|null=null;
  constructor(private options:{home:string;spaceId:string;endpoint:string;authority:SyncAuthority;registrations:SyncRegistration[];fetch?:typeof fetch}) {
    const url=new URL(options.endpoint);
    // This delivery is local integration only. Opening a production destination requires explicit deployment approval.
    if(url.origin!=='http://127.0.0.1:8788'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('SYNC_LOCAL_ENDPOINT_REQUIRED');
    this.db(()=>{});
  }
  private db<T>(run:(db:ReturnType<typeof openSyncDatabase>)=>T):T {
    const db=openSyncDatabase(this.options.home);try{return run(db);}finally{db.close();}
  }
  private assert(){this.options.authority.assertCurrent();if(this.controller.signal.aborted)throw new Error('SYNC_CLOSED');}
  policy():SpaceSyncPolicy {
    this.assert();
    const json=this.db(db=>db.prepare('SELECT json FROM sync_policy WHERE id=1').get()?.json);
    return json?parseSpaceSyncPolicy(JSON.parse(String(json)),this.options.spaceId):{spaceId:this.options.spaceId,revision:0,selections:[]};
  }
  private cache(value:unknown):SpaceSyncPolicy {
    const policy=parseSpaceSyncPolicy(value,this.options.spaceId);this.assert();
    this.db(db=>db.prepare('INSERT INTO sync_policy VALUES (1,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json').run(JSON.stringify(policy)));return policy;
  }
  private async request<T=unknown>(route:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<T> {
    this.assert();const token=await this.options.authority.accessToken();this.assert();
    const signal=AbortSignal.any([this.options.authority.signal,this.controller.signal,AbortSignal.timeout(15000)]);
    const response=await (this.options.fetch??fetch)(new URL(route,this.options.endpoint),{method,signal,redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text=await response.text();this.assert();
    if(text.length>4*1024*1024)throw new Error('SYNC_RESPONSE_TOO_LARGE');
    const result=JSON.parse(text);
    if(!response.ok)throw new Error(response.status===409?'同步版本已变化，请重试':response.status===401?'登录已失效，请重新登录':result.error??'同步服务暂时不可用');
    return result as T;
  }
  async save(policy:unknown){
    if(this.running)await this.running;
    const parsed=parseSpaceSyncPolicy(policy,this.options.spaceId);
    const known=new Set(this.options.registrations.map(r=>syncNamespace(r.selection)));
    const old=new Set(this.policy().selections.map(syncNamespace));
    if(parsed.selections.some(s=>!known.has(syncNamespace(s))&&!old.has(syncNamespace(s))))throw new Error('此同步格式尚未接入');
    const result=this.cache(await this.request('/v1/policy',parsed,'PUT'));
    await this.run();return result;
  }
  async loadPolicy(){try{this.cache(await this.request('/v1/policy'));}catch(error){this.error=error instanceof Error?error.message:'同步配置暂时不可用';}}
  start(){if(!this.timer){this.timer=setInterval(()=>void this.run(),15000);this.timer.unref();}}
  close(){this.controller.abort();if(this.timer)clearInterval(this.timer);this.timer=null;}
  run():Promise<void>{
    if(this.running)return this.running;
    this.running=this.cycle().then(()=>{this.error=null;this.lastSuccess=new Date().toISOString();},error=>{this.error=error instanceof Error?error.message:'同步失败';}).finally(()=>{this.running=null;});
    return this.running;
  }
  private async cycle(){
    const policy=this.cache(await this.request('/v1/policy'));
    const errors:string[]=[];
    // Host registration order puts reference owners before their consumers; policy is selection, not execution order.
    for(const registration of this.options.registrations){
      const namespace=syncNamespace(registration.selection);
      if(!policy.selections.some(s=>syncNamespace(s)===namespace))continue;
      try {
      await registration.refresh();this.assert();
      registration.withReplica(r=>r.retryWaiting?.());
      for(let turn=0;turn<40;turn++){
        const after=registration.withReplica(r=>r.cursor());
        const result=await this.request<{events:SyncEvent[];more:boolean}>(`/v1/changes?namespace=${encodeURIComponent(namespace)}&after=${after}`);
        if(!Array.isArray(result.events)||result.events.length>20)throw new Error('SYNC_INVALID_BATCH');
        let previous=after;
        for(const event of result.events as SyncEvent[]){
          if(!Number.isSafeInteger(event.revision)||event.revision<=previous)throw new Error('SYNC_INVALID_CURSOR');
          this.assert();await registration.prepare(event);await registration.refresh();this.assert();
          registration.withReplica(r=>r.receive(event));previous=event.revision;
        }
        if(result.more){if(!result.events.length)throw new Error('SYNC_EMPTY_PAGE');continue;}
        await registration.refresh();this.assert();registration.withReplica(r=>r.retryWaiting?.());const next=registration.withReplica(r=>r.next());
        if(!next)break;
        await this.request('/v1/changes',{namespace,policyRevision:policy.revision,mutation:next});
        // Even our own successful writes must be consumed in log order next round.
      }
      } catch(error) {
        this.assert(); // Revocation aborts the whole cycle; an owner format error does not block unrelated collections.
        errors.push(registration.title+': '+(error instanceof Error?error.message:'同步失败'));
      }
    }
    if(errors.length)throw new Error(errors.join('\n'));
  }
  status(){
    const policy=this.policy();
    return {policy,running:!!this.running,error:this.error,lastSuccess:this.lastSuccess,collections:this.options.registrations.map(r=>({selection:r.selection,title:r.title,...r.withReplica(a=>a.counts()),conflicts:r.withReplica(a=>a.conflicts())})),unavailable:policy.selections.filter(s=>!this.options.registrations.some(r=>syncNamespace(r.selection)===syncNamespace(s)))};
  }
  async resolve(namespace:string,key:string,choice:'local'|'remote'){
    if(this.running)await this.running;this.assert();
    if(!this.policy().selections.some(s=>syncNamespace(s)===namespace))throw new Error('此同步集合已关闭');
    const registration=this.options.registrations.find(r=>syncNamespace(r.selection)===namespace);
    if(!registration)throw new Error('SYNC_ADAPTER_MISSING');
    await registration.refresh();this.assert();
    registration.withReplica(r=>r.resolve(key,choice));await this.run();
  }
}
