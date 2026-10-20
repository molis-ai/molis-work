import { SEARCH_ITEM_TAB_SURFACES } from './search-navigation.js';
import type {AggregateCopyContext,AggregateReplicaContext,ReplicaDatabase} from "@molis-ai/molis-work-storage";
import type {SyncReplicaAdapter,SyncContentCodec,PrivateValueReplicationOwner} from "@molis-ai/molis-work-contracts/platform/sync-transport";
import type {SyncDocumentStorage} from "@molis-ai/molis-work-plugin-sdk";

export type BuiltinSyncBinding = ({ readonly content?: (context: {spaceId:string;authorize():void})=>SyncContentCodec; readonly scope:'home'|'home-with-projects'|'projects'; open(home:string,ownerId:string):{close():void;replica(context:AggregateReplicaContext):SyncReplicaAdapter} }
  | {readonly content?: (context:{spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'project-fixed-versions';readonly store:'library'|'process'}
  | {readonly content?: (context:{spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'home-document';readonly path:string;open(home:string,context:{spaceId:string;storage:SyncDocumentStorage;authorize():void}):SyncReplicaAdapter}
  | {readonly content?: (context: {spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'project-database';readonly kind:string;create(db:ReplicaDatabase,context:{spaceId:string;projectId:string;title:string;authorize():void}):SyncReplicaAdapter}
  | {readonly content?: (context: {spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'project-sections';readonly kind:string;readonly namespace:string;readonly owners:readonly string[]}
  | {readonly content?: (context:{spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'project-private-values';readonly kind:string;readonly namespace:string;owner(options:{home?:string;authorize?():void;assertIdle?(projectId:string,itemId:string):void}):PrivateValueReplicationOwner}
  | {readonly content?: (context: {spaceId:string;authorize():void})=>SyncContentCodec;readonly scope:'project-library';readonly kind:string;open(home:string,projectId:string):{close():void;replica(context:{spaceId:string;projectId:string;title:string;authorize():void}):SyncReplicaAdapter}}) & {readonly copy?:(home:string,context:AggregateCopyContext)=>{owner:import('@molis-ai/molis-work-contracts/services/placement').ProjectCopyOwner;close():void}|null;readonly locate?:(key:string)=>string|null};

/** Trusted binding declares its own tuple identity; transport never guesses a plugin's key. */
export function syncTupleLocation(surface:string,project:boolean,index?:number):(key:string)=>string|null {
 return key=>{
  const parts:unknown=JSON.parse(key);if(!Array.isArray(parts)||parts.some(part=>typeof part!=='string'||part.length>500)||project&&parts.length!==3)return null;
  const base=project?'/projects/'+encodeURIComponent(String(parts[0]))+'/':'/',query=new URLSearchParams({openPlugin:surface});
  if(index!==undefined&&typeof parts[index]==='string'){query.set((SEARCH_ITEM_TAB_SURFACES as readonly string[]).includes(surface)?'openItem':'openRecord',parts[index]);}
  return base+'?'+query;
 };
}
