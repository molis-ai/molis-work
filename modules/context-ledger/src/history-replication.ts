import type {ContextEdge,ContextHistoryReplication,ContextScope,ObjectRef} from '@molis-ai/molis-work-contracts/modules/context-ledger';
import {ContextLedgerRepository,type ContextLedgerDatabase} from './repository.js';
import {sameRef} from './service.js';
import {ledgerErrors} from './errors.js';

export interface ContextHistoryReplicationOptions {
  scope:ContextScope;
  sourceModule:ObjectRef['module'];
  /** Trusted semantic owner chooses the only relations and target kinds which may cross devices. */
  relations:Readonly<Record<string,{sourceType?:string;targetModule:ObjectRef['module'];targetType?:string}>>;
  authorize():void;
}
function record(value:unknown,keys:readonly string[]):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw ledgerErrors.invalid_reference('同步引用的字段无效');
  return value as Record<string,unknown>;
}
function text(value:unknown):value is string{return typeof value==='string'&&value.trim().length>0&&value.length<=1000;}
function reference(input:unknown,scope:ContextScope):ObjectRef {
  const ref=record(input,['module','id','version','revision','scope','project_id','object_type']),s=record(ref.scope,['kind','id']);
  if(!['goals','artifacts','feed','private-work-context','projects','assistant','plugins'].includes(String(ref.module))||!text(ref.id)
    ||s.kind!==scope.kind||s.id!==scope.id||(ref.version!==null&&(!Number.isSafeInteger(ref.version)||Number(ref.version)<1))
    ||(ref.module==='artifacts'&&ref.version===null)||(ref.revision!==undefined&&!text(ref.revision))
    ||(ref.project_id!==undefined&&ref.project_id!==null&&!text(ref.project_id))||(ref.object_type!==undefined&&!text(ref.object_type)))throw ledgerErrors.invalid_reference('同步引用的归属或版本无效');
  return input as ObjectRef;
}

/** Sole Ledger writer for passive replicated histories. No normal command replay, no inferred references. */
export function createContextHistoryReplication(db:ContextLedgerDatabase,options:ContextHistoryReplicationOptions):ContextHistoryReplication {
  const repository=new ContextLedgerRepository(db,false),types=Object.keys(options.relations);
  if(!types.length||types.some(type=>!text(type)))throw ledgerErrors.invalid_reference('同步引用缺少可信关系声明');
  const source=(value:ObjectRef)=>{const ref=reference(value,options.scope);if(ref.module!==options.sourceModule)throw ledgerErrors.scope_mismatch('同步引用来源不匹配');return ref;};
  const read=(value:ObjectRef):ContextEdge[]=>{
    options.authorize();const ref=source(value);
    const result=repository.list(options.scope,{source:ref,include_removed:true}).filter(edge=>Object.hasOwn(options.relations,edge.type)&&sameRef(edge.source,ref)).flatMap(edge=>repository.history(options.scope,edge.key));
    options.authorize();return validate(ref,result);
  };
  const validate=(value:ObjectRef,input:unknown):ContextEdge[]=>{
    options.authorize();const ref=source(value);
    if(!Array.isArray(input)||input.length>100000)throw ledgerErrors.invalid_reference('同步引用历史无效');
    const revisions=new Map<string,number>(),relationTypes=new Map<string,string>();
    for(const item of input){
      const edge=record(item,['key','revision','type','source','target','actor_id','cause','recorded_at','state']);
      const rule=typeof edge.type==='string'&&Object.hasOwn(options.relations,edge.type)?options.relations[edge.type]:undefined;
      const from=reference(edge.source,options.scope),to=reference(edge.target,options.scope);
      if(!rule||!sameRef(from,ref)||from.object_type!==rule.sourceType||to.module!==rule.targetModule||to.object_type!==rule.targetType
        ||!text(edge.key)||!text(edge.actor_id)||!text(edge.cause)||!text(edge.recorded_at)||!Number.isFinite(Date.parse(String(edge.recorded_at)))
        ||!['active','removed'].includes(String(edge.state))||edge.revision!==(revisions.get(String(edge.key))??0)+1
        ||(relationTypes.has(String(edge.key))&&relationTypes.get(String(edge.key))!==edge.type))throw ledgerErrors.invalid_reference('同步引用历史的来源、类型或顺序无效');
      revisions.set(edge.key,Number(edge.revision));relationTypes.set(edge.key,String(edge.type));
    }
    options.authorize();return structuredClone(input) as ContextEdge[];
  };
  return {read,validate,replace(value,input){
    options.authorize();const ref=source(value),rows=validate(ref,input);
    db.transaction(()=>{
      options.authorize();
      for(const row of rows){const previous=repository.history(options.scope,row.key);if(previous.some(edge=>!sameRef(edge.source,ref)||edge.type!==row.type))throw ledgerErrors.key_conflict('同步引用键已属于其他来源或关系');}
      const existing=read(ref);
      for(const key of new Set(existing.map(edge=>edge.key)))db.prepare('DELETE FROM context_edges WHERE scope_kind=? AND scope_id=? AND edge_key=?').run(options.scope.kind,options.scope.id,key);
      for(const row of rows)repository.insert(options.scope,row);
      options.authorize();
    }).immediate();
  }};
}
