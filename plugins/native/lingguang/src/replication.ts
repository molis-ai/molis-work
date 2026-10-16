import { syncError } from './sync-errors.js';
import type { AggregateDefinition, PortableRow, ReplicaDatabase } from '@molis-ai/molis-work-storage';
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

export const lingguangSync:PluginSyncDeclaration={protocol_version:1,collections:[{id:'ideas',title:'灵光与对话',schema_version:1,requires:[]}]};
export function lingguangAggregates(db:ReplicaDatabase):readonly AggregateDefinition[]{return [
  {kind:'spark',table:'sparks',columns:['id','project_id','title','body','source_kind','status','created_at','updated_at'],timestampVersionColumn:'updated_at',
    children:[{table:'spark_requests',parent:'spark_id',columns:['project_id','request_id','spark_id'],orderBy:'request_id',identityColumns:['project_id','request_id']}],
    validate({record:r,children}){
      base(r);check(typeof r.title==='string'&&r.title.length>0&&r.title.length<=80&&typeof r.body==='string'&&r.body.length<=8000&&r.source_kind==='manual'&&['inbox','discarded'].includes(String(r.status)));
      for(const row of children.spark_requests!)check(row.project_id===r.project_id&&typeof row.request_id==='string'&&row.request_id.length>0);
    },
  },
  {kind:'conversation',table:'conversations',columns:['id','project_id','spark_key','spark_ids_json','created_at','updated_at'],timestampVersionColumn:'updated_at',
    children:[{table:'messages',parent:'conversation_id',columns:['id','conversation_id','role','body','created_at'],orderBy:'rowid'}],
    validate({record:r,children}){
      base(r);const ids=sparkIds(r);check(ids.join(',')===r.spark_key&&[...ids].sort().join(',')===r.spark_key);
      for(const m of children.messages!)check(['user','assistant','stub'].includes(String(m.role))&&typeof m.body==='string'&&typeof m.created_at==='string'&&Number.isFinite(Date.parse(m.created_at)));
    },
    dependencies({record:r},_context,projectId){
      for(const id of sparkIds(r)){const row=db.prepare('SELECT project_id FROM sparks WHERE id=?').get(id);if(!row)throw syncError("dependencies",'等待对话关联的灵光');if(row.project_id!==projectId)throw syncError("scope",'对话关联的灵光属于其他项目');}
      const prior=db.prepare('SELECT id FROM conversations WHERE project_id=? AND spark_key=?').get(projectId,r.spark_key);
      if(prior&&prior.id!==r.id)throw syncError("conflict",'相同灵光在另一台设备已有独立对话，双方记录已保留');
    },
  },
];}
function base(r:PortableRow){for(const k of ['id','project_id'])check(typeof r[k]==='string'&&r[k].length>0);for(const k of ['created_at','updated_at'])check(typeof r[k]==='string'&&Number.isFinite(Date.parse(r[k])));}
function sparkIds(r:PortableRow):string[]{check(typeof r.spark_ids_json==='string');const ids:unknown=JSON.parse(r.spark_ids_json);check(Array.isArray(ids)&&ids.length>0&&ids.length<=1000&&ids.every(id=>typeof id==='string'&&id.length>0&&id.length<=80)&&new Set(ids).size===ids.length);return ids;}
function check(value:unknown):asserts value{if(!value)throw syncError("invalid",'灵光同步数据不合法');}
