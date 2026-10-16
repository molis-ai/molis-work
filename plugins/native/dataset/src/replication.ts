import { syncError } from './sync-errors.js';
import type { AggregateDefinition, PortableRow } from '@molis-ai/molis-work-storage';
import type { PluginSyncDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

export const datasetSync:PluginSyncDeclaration={protocol_version:1,collections:[{id:'datasets',title:'数据表与保存版本',schema_version:1,requires:[]}]};
export const datasetAggregates:readonly AggregateDefinition[]=[{
  kind:'dataset',table:'datasets',columns:['id','project_id','title','description','status','columns_json','rows_json','created_at','updated_at','artifact_id','artifact_version'],
  children:[{table:'dataset_versions',parent:'dataset_id',columns:['id','dataset_id','note','snapshot_json','created_at'],orderBy:'created_at,id'}],versionColumn:'version',busyColumn:'publication_pending_json',
  validate({record:r,children}){
    base(r);table(JSON.parse(String(r.columns_json)),JSON.parse(String(r.rows_json)));
    for(const v of children.dataset_versions!){
      check(typeof v.note==='string'&&typeof v.created_at==='string'&&Number.isFinite(Date.parse(v.created_at))&&typeof v.snapshot_json==='string');
      const s=JSON.parse(v.snapshot_json);check(s&&typeof s==='object'&&!Array.isArray(s));
      check(Object.keys(s).filter(k=>k!=='publication_pending').sort().join(',')==='artifact_id,artifact_version,columns,created_at,description,id,project_id,rows,status,title,updated_at,version');
      // A historical snapshot can describe a pending publication. It is not an executable intent;
      // rollback consumes only its content fields and must preserve the historical description.
      if(s.publication_pending!==undefined){const p=s.publication_pending;check(p&&Object.keys(p).sort().join(',')==='source_version,version'&&Number.isSafeInteger(p.version)&&p.version>0&&Number.isSafeInteger(p.source_version)&&p.source_version>0);}
      check(s.id===r.id&&s.project_id===r.project_id&&Number.isSafeInteger(s.version)&&s.version>0);base(s);table(s.columns,s.rows);
    }
  },
  dependencies({record:r},context,projectId){if(r.artifact_id&&!context.hasArtifact(projectId,String(r.artifact_id),Number(r.artifact_version)))throw syncError("dependencies",'等待数据表关联的成果版本');},
}];
function base(r:PortableRow){
  for(const k of ['id','project_id','title','description','artifact_id'])check(typeof r[k]==='string');
  check(String(r.title).length>0&&String(r.title).length<=80&&String(r.description).length<=2000&&['draft','ready'].includes(String(r.status)));
  for(const k of ['created_at','updated_at'])check(typeof r[k]==='string'&&Number.isFinite(Date.parse(r[k])));
  check(Number.isSafeInteger(r.artifact_version)&&Number(r.artifact_version)>=0&&Boolean(r.artifact_id)===(Number(r.artifact_version)>0));
}
function table(columns:unknown,rows:unknown){
  check(Array.isArray(columns)&&columns.length<=40&&Array.isArray(rows)&&rows.length<=2000);const ids=new Set<string>(),rowIds=new Set<string>();
  columns.forEach((c,i)=>{check(c&&Object.keys(c).sort().join(',')==='id,name,order,type'&&typeof c.id==='string'&&c.id.length>0&&!ids.has(c.id)&&typeof c.name==='string'&&c.order===i+1&&['text','number','date'].includes(c.type));ids.add(c.id);});
  for(const r of rows){check(r&&Object.keys(r).sort().join(',')==='cells,id'&&typeof r.id==='string'&&r.id.length>0&&!rowIds.has(r.id));rowIds.add(r.id);check(r.cells&&typeof r.cells==='object'&&!Array.isArray(r.cells)&&Object.keys(r.cells).length===ids.size&&Object.entries(r.cells).every(([k,v])=>ids.has(k)&&typeof v==='string'));}
}
function check(value:unknown):asserts value{if(!value)throw syncError("invalid",'数据表同步数据不合法');}
