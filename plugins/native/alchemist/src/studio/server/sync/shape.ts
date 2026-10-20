import {STUDIO_CONTENT_TABLES,type StudioContentGraph,type StudioContentRow} from './content-tables.js';
import {studioSyncErrors} from './errors.js';
export function invalidStudio():never{throw studioSyncErrors.sync_invalid('研究内容、版本或关联不完整');}
export function studioObject(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalidStudio();return value as Record<string,unknown>;}
export function studioExact(value:Record<string,unknown>,keys:readonly string[]):void{if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))invalidStudio();}
export function studioGraph(value:unknown):StudioContentGraph{
 const input=studioObject(value);studioExact(input,STUDIO_CONTENT_TABLES.map(t=>t.name));
 if(Buffer.byteLength(JSON.stringify(input))>100000000)throw studioSyncErrors.sync_limit('研究内容超过账号容量上限');
 const graph:StudioContentGraph={};let count=0;
 for(const table of STUDIO_CONTENT_TABLES){
  const rows=input[table.name];if(!Array.isArray(rows)||(count+=rows.length)>100000)invalidStudio();
  const seen=new Set<string>();graph[table.name]=rows.map(value=>{
   const row=studioObject(value);studioExact(row,table.columns);
   for(const [key,value]of Object.entries(row)){
    if(value!==null&&typeof value!=='string'&&(typeof value!=='number'||!Number.isFinite(value)))invalidStudio();
    if(value!==null&&(key==='version'||key==='revision'||key==='position'||key.endsWith('_version')||['estimated_min_minutes','estimated_max_minutes','budget_limit','http_status','rate_limit_remaining'].includes(key))&&typeof value!=='number')invalidStudio();
    if(key==='id'||key.endsWith('_id')){if(value!==null&&(typeof value!=='string'||!value||value.length>500))invalidStudio();}
    if(value!==null&&(key.endsWith('_at')||key==='period_start'||key==='period_end')&&(typeof value!=='string'||!Number.isFinite(Date.parse(value))))invalidStudio();
    if(value!==null&&key.endsWith('_json')){if(typeof value!=='string')invalidStudio();try{JSON.parse(value);}catch{invalidStudio();}}
   }
   const keys=table.keys.map(k=>row[k]);if(keys.some(v=>v===null)||seen.has(JSON.stringify(keys)))invalidStudio();seen.add(JSON.stringify(keys));
   if('workspace_id'in row&&row.workspace_id!=='workspace-local')invalidStudio();
   return row as StudioContentRow;
  });
 }
 if(graph.workspaces!.length!==1||graph.workspaces![0]!.id!=='workspace-local'||!graph.workspace_actors!.some(a=>a.id==='actor-local'))invalidStudio();
 for(const name of ['jobs','exploration_runs','lens_runs','pulse_runs'])for(const row of graph[name]!)if(!['completed','partial','failed','cancelled','interrupted'].includes(String(row.status)))invalidStudio();
 return graph;
}
