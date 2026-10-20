import type {ProjectReplicaDefinition,ProjectReplicaRows} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import {createProjectReplicaSection,validateProjectReplicaRows} from './project-replica.js';
import {createSqliteReplica,namespacedReplicaDatabase,type ReplicaDatabase} from './replica.js';
import {readDatabaseSpace} from './space.js';

const errors=defineErrorCodes('storage',{sync_sections_invalid:'invalid',sync_sections_scope:'forbidden',sync_sections_limit:'too_large'});
/** Complete pure owner validation before project creation; target identity and execution guards remain transactional. */
export function validateProjectContentReplication(value:unknown,definitions:readonly ProjectReplicaDefinition[],context:{spaceId:string;projectId:string;authorize():void}){
 context.authorize();size(value);const wire=object(value);exact(wire,['format','spaceId','project','facts']);const project=object(wire.project);exact(project,['id','title']);
 if(wire.format!==1||wire.spaceId!==context.spaceId||project.id!==context.projectId||typeof project.title!=='string'||!project.title.trim()||project.title.length>120)invalid();
 const facts=object(wire.facts);exact(facts,definitions.map(d=>d.id));const rows=definitions.map(d=>{const part=validateProjectReplicaRows(facts[d.id],d,context.projectId);d.validate(part,context.projectId);return part;});
 context.authorize();return rows;
}
/** Transactional project replication of explicit owner sections, without discovery or execution. */
export function createProjectContentReplicaFactory(definitions:readonly ProjectReplicaDefinition[],namespace:string,kind:string){
 if(!definitions.length||definitions.some(d=>d.assetKind!==kind))invalid();
 return (db:ReplicaDatabase,context:{spaceId:string;projectId:string;title:string;authorize():void;conflictState?:import('@molis-ai/molis-work-contracts/platform/sync-transport').SyncConflictState})=>{
  const bound=readDatabaseSpace(db);if(bound?.kind!=='personal'||bound.spaceId!==context.spaceId)throw errors.sync_sections_scope('项目同步空间不匹配');
  const sections=definitions.map(d=>createProjectReplicaSection(db,d,context.projectId));
  const key=JSON.stringify([context.projectId,kind,context.projectId]);
  const check=(input:string)=>{if(input!==key)throw errors.sync_sections_scope('项目同步资产不匹配');};
  return createSqliteReplica(namespacedReplicaDatabase(db,namespace),{authorize:context.authorize,conflictState:context.conflictState,
   read(input){check(input);const facts=Object.fromEntries(definitions.map((d,i)=>[d.id,sections[i]!.validate(sections[i]!.read())]));if(!Object.values(facts).some(part=>Object.values(part).some(rows=>rows.length)))return null;const wire={format:1,spaceId:context.spaceId,project:{id:context.projectId,title:context.title},facts};size(wire);return wire;},
   apply(input,value){check(input);db.exec('PRAGMA defer_foreign_keys=ON');
    if(value===null){[...sections].reverse().forEach(section=>section.clear());return;}
    const pure=validateProjectContentReplication(value,definitions,context);const rows=definitions.map((_d,i)=>sections[i]!.validate(pure[i]));
    [...sections].reverse().forEach(section=>section.clear());sections.forEach((section,i)=>section.write(rows[i] as ProjectReplicaRows));
    if(db.prepare('PRAGMA foreign_key_check').get())invalid();
   },
  });
 };
}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>;}
function exact(row:Record<string,unknown>,keys:readonly string[]):void{if(Object.keys(row).length!==keys.length||keys.some(k=>!Object.hasOwn(row,k)))invalid();}
function size(value:unknown):void{if(Buffer.byteLength(JSON.stringify(value))>100000000)throw errors.sync_sections_limit('项目内容超过同步容量上限');}
function invalid():never{throw errors.sync_sections_invalid('项目同步内容、归属或关联无效');}
