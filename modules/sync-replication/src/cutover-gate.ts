import type {SyncRegistration} from './index.js';
import {blobTransfer} from './blob-transfer.js';
import {PROCESS_ITEMS_CUTOVER_HEADER,PROCESS_ITEMS_NAMESPACE,adoptedSyncCutover,markSyncCutoverAdopted,parseSyncCutover,syncCutoverLane,syncCutoverWaiting,type SyncCutoverView} from './cutover.js';
import {runProcessItemsCutover} from './process-items-cutover.js';
import {syncResponseMessage} from './quota.js';
import {syncNamespace} from './namespace.js';
import {syncError} from './sync-errors.js';

/** What the gate needs from the engine: its requests, its registrations and a way to keep rounds out while a cutover runs. */
export interface CutoverGatePorts {
  home:string;
  spaceId:string;
  assert():void;
  registrations():readonly SyncRegistration[];
  check(registration:SyncRegistration):()=>void;
  send(route:string,body?:Buffer,method?:string,type?:string,check?:()=>void):Promise<Response>;
  request<T>(route:string,body:unknown,method:string,check:()=>void):Promise<T>;
  exclusive<T>(work:()=>Promise<T>):Promise<T>;
  /** How far this Home has read a collection's local state: its replica cursor or the furthest deferred event. */
  cursor(registration:SyncRegistration,lane:string):number;
}

/**
 * The engine's view of the process-items cutover (specs/batch-06-shared-tools/sync-cutover.md BSH-14-A/C): what the service last said
 * and which cutover this Home adopted. The public collection moves only under a complete cutover this Home adopted, under its lane and
 * with its scope header; until then it does not move at all. A Home that adopted nothing spends no request on it.
 */
export class ProcessItemsCutoverGate {
  private view:SyncCutoverView|null=null;
  private adopted:string|null=null;
  constructor(private ports:CutoverGatePorts){}

  /** The scope header for every request once this Home moves the adopted stream. */
  header():Record<string,string>{const moving=this.moving();return moving?{[PROCESS_ITEMS_CUTOVER_HEADER]:moving.cutoverId}:{};}
  /** The complete cutover this Home adopted, or null. */
  private moving(){const view=this.view;return view?.phase==='complete'&&this.adopted===view.cutoverId?view:null;}
  /** Local state's name for a collection, or null for the process items while they do not move here. */
  lane(namespace:string):string|null{
    if(namespace!==PROCESS_ITEMS_NAMESPACE)return namespace;
    const moving=this.moving();return moving?syncCutoverLane(this.ports.spaceId,moving.cutoverId):null;
  }
  local=(namespace:string)=>this.lane(namespace)??namespace;
  /** The completion head a newly adopted stream reads up to before anything of this Home is uploaded; 0 when not moving. */
  floor(namespace:string):number{return namespace===PROCESS_ITEMS_NAMESPACE?this.moving()?.completionHead??0:0;}
  waiting():string{return syncCutoverWaiting(this.view);}
  private bind(){for(const registration of this.ports.registrations())if(syncNamespace(registration.selection)===PROCESS_ITEMS_NAMESPACE)registration.bindLane?.(this.lane(PROCESS_ITEMS_NAMESPACE));}
  /** Before a round: only a Home that adopted a cutover asks the service, once per run of the engine, since completion is permanent. */
  async prepareRound(){
    if(this.lane(PROCESS_ITEMS_NAMESPACE)===null&&adoptedSyncCutover(this.ports.home,this.ports.spaceId)!==null)await this.observe();
    else this.bind();
  }
  private async observe(){
    this.adopted=adoptedSyncCutover(this.ports.home,this.ports.spaceId);this.ports.assert();
    const response=await this.ports.send('/v1/process-items/cutover');
    if(response.status===404){await response.body?.cancel();this.ports.assert();this.view={phase:'unsupported'};}
    else{
      const text=await response.text();this.ports.assert();
      let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw syncError('invalid','过程项同步切换状态无效，原件已保留');}
      if(!response.ok)throw new Error(response.status===401?'登录已失效，请重新登录':syncResponseMessage((parsed as {error?:unknown}|null)?.error));
      this.view=parseSyncCutover(parsed);
    }
    this.bind();return this.view;
  }
  /** The cutover as the service reports it now, and whether this Home moves its adopted stream. Read for sync settings. */
  status(){return this.ports.exclusive(async()=>{const cutover=await this.observe();return {cutover,adopted:this.moving()!==null};});}
  /**
   * The person's step that lets this Home move the adopted stream: only for a cutover the service reports complete, after this Home's
   * own libraries are adopted. Takeover of what the original journal still holds is a separate owner step; the lane starts empty.
   */
  adopt(cutoverId:string){return this.ports.exclusive(async()=>{
    const view=await this.observe();
    if(view?.phase!=='complete'||view.cutoverId!==cutoverId)throw syncError('conflict','过程项切换尚未完成或已变化，原件已保留');
    markSyncCutoverAdopted(this.ports.home,this.ports.spaceId,cutoverId);this.adopted=cutoverId;this.bind();
  });}
  /**
   * The person's takeover of what a verified recovery file holds (sync-cutover.md step 5): only while this Home moves the adopted
   * stream and has read it up to the completion head, so every line the cutover seeded has been received or held as a conflict first.
   */
  takeOver(captureId:string,keys?:readonly string[]){return this.ports.exclusive(async()=>{
    await this.observe();
    const moving=this.moving(),registration=this.registration();
    if(!moving)throw syncError('scope',this.waiting());
    if(!registration.takeOver)throw syncError('unsupported','过程项接管尚未接入，原件已保留');
    if(this.ports.cursor(registration,syncCutoverLane(this.ports.spaceId,moving.cutoverId))<moving.completionHead)throw syncError('conflict','采用后的过程项尚未接齐，接齐后再接管，原件已保留');
    this.ports.check(registration)();
    return registration.takeOver(captureId,keys);
  });}
  private registration(){
    const registration=this.ports.registrations().find(r=>syncNamespace(r.selection)===PROCESS_ITEMS_NAMESPACE);
    if(!registration)throw syncError('unsupported','过程项同步尚未接入，原件已保留');
    return registration;
  }
  /**
   * The person's cutover of process items, run from sync settings: plan, seal, seed, read back and finish on the service. A lost
   * response or restart is continued by running it again. Moving the adopted stream here is the separate `adopt` step.
   */
  cutOver(){return this.ports.exclusive(async()=>{
    const registration=this.registration(),check=this.ports.check(registration);
    const binary=async(route:string,body?:Uint8Array)=>{
      const response=await this.ports.send(route,body===undefined?undefined:Buffer.from(body),body===undefined?'GET':'PUT','application/octet-stream',check);
      if(!response.ok){let code:unknown;try{code=(JSON.parse(await response.text()) as {error?:unknown}).error;}catch{code=undefined;}throw new Error(syncResponseMessage(code));}
      const bytes=new Uint8Array(await response.arrayBuffer());check();if(bytes.byteLength>4*1024*1024)throw syncError('limit','同步附件分块过大');return bytes;
    };
    const json=<T>(route:string,body?:unknown,method?:string)=>this.ports.request<T>(route,body,method??(body===undefined?'GET':'POST'),check);
    const transfer=blobTransfer(this.ports.home,{assert:check,json,binary});
    const view=await runProcessItemsCutover({assert:check,json,binary,registration,download:ref=>transfer.download(PROCESS_ITEMS_NAMESPACE,ref,registration.protection)});
    if(view.phase!=='complete')throw syncError('conflict','过程项切换尚未完成，原件已保留');
    return view;
  });}
}
