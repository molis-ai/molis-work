type SQLInputValue = null | number | bigint | string | NodeJS.ArrayBufferView;
type SQLOutputValue = null | number | bigint | string | Uint8Array<ArrayBuffer>;
import type {SyncReplicaAdapter,SyncContentCodec,PrivateValueReplicationOwner} from './sync-transport.js';
export interface ReplicaDatabase {
  exec(sql:string):unknown;
  prepare(sql:string):{get(...params:SQLInputValue[]):Record<string,SQLOutputValue>|undefined;all(...params:SQLInputValue[]):Record<string,SQLOutputValue>[];run(...params:SQLInputValue[]):unknown};
}
export interface AggregateReplicaContext {
  spaceId: string;
  conflictState?: import('./sync-transport.js').SyncConflictState;
  authorize(): void;
  canUploadProject(projectId: string): boolean;
  project(projectId: string): { title: string };
  hasReference?(projectId:string,reference:{owner:'goals'|'artifacts';assetId:string;version?:number}):boolean;
  hasArtifact(projectId: string, id: string, version: number): boolean;
}
export interface AggregateCopyContext extends AggregateReplicaContext {direction:'source'|'target'}
export interface SyncDocumentStorage {
  read(): string | null;
  compareAndSet(expected: string | null, value: string): boolean;
  /** Optional file-owner capabilities. Checked replacement and read lock must share the same cross-process mutex. */
  compareAndSetChecked?(expected:string|null,value:string,validate:()=>void):boolean;
  withReadLock?<R>(read:(current:string|null)=>R):R;
}
/** Trusted owner bindings. Declaring one never grants synchronization or execution authority. */
export type BuiltinSyncBinding = ({ readonly content?: (context: {spaceId:string;authorize():void})=>SyncContentCodec; readonly scope:'home'|'home-with-projects'|'projects'; open(home:string,ownerId:string):{close():void;replica(context:AggregateReplicaContext):SyncReplicaAdapter} }
  | {readonly content?: (context:{spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'home-store';readonly path:string;readonly owner:string}
  | {readonly content?: (context:{spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'project-fixed-versions';readonly store:'library'|'process'}
  | {readonly content?: (context:{spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'home-document';readonly path:string;open(home:string,context:{spaceId:string;storage:SyncDocumentStorage;authorize():void}):SyncReplicaAdapter}
  | {readonly content?: (context: {spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'project-database';readonly kind:string;create(db:ReplicaDatabase,context:{spaceId:string;projectId:string;title:string;authorize():void}):SyncReplicaAdapter}
  | {readonly content?: (context: {spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'project-sections';readonly kind:string;readonly namespace:string;readonly owners:readonly string[]}
  | {readonly content?: (context:{spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'project-private-values';readonly kind:string;readonly namespace:string;owner(options:{home?:string;authorize?():void;assertIdle?(projectId:string,itemId:string):void}):PrivateValueReplicationOwner}
  | {readonly content?: (context: {spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'project-library';readonly kind:string;open(home:string,projectId:string):{close():void;replica(context:{spaceId:string;projectId:string;title:string;authorize():void}):SyncReplicaAdapter}}) & {readonly copy?:(home:string,context:AggregateCopyContext)=>{owner:import('../services/placement.js').ProjectCopyOwner;close():void}|null;readonly locate?:(key:string)=>string|null};
