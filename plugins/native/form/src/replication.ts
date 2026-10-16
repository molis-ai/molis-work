import type { AggregateDefinition } from '@molis-ai/molis-work-storage';
import { PluginSyncError, type PluginSyncDeclaration } from '@molis-ai/molis-work-contracts/platform/plugin';

export const formSync:PluginSyncDeclaration={protocol_version:1,collections:[{id:'forms',title:'问卷与答卷',schema_version:1,requires:[]}]};
export const formAggregates:readonly AggregateDefinition[]=[{
  kind:'form',table:'forms',columns:['id','project_id','title','description','status','share_id','questions_json','created_at','updated_at','artifact_id','artifact_version'],
  children:[{table:'submissions',parent:'form_id',columns:['id','form_id','answers_json','submitted_at','form_version','questions_json','request_id','source'],orderBy:'submitted_at,id'}],versionColumn:'version',busyColumn:'publication_pending_json',
  validate({record:r,children}){
    for(const k of ['id','project_id','title','description','questions_json','artifact_id'])check(typeof r[k]==='string');
    check(String(r.title).length>0&&String(r.title).length<=80&&String(r.description).length<=2000);
    check(['draft','published','closed'].includes(String(r.status))&&(r.share_id===null||typeof r.share_id==='string'));
    for(const k of ['created_at','updated_at'])check(typeof r[k]==='string'&&Number.isFinite(Date.parse(r[k])));
    check(Number.isSafeInteger(r.artifact_version)&&Number(r.artifact_version)>=0&&Boolean(r.artifact_id)===(Number(r.artifact_version)>0));
    questions(JSON.parse(String(r.questions_json)));
    const requests=new Set<string>();
    for(const s of children.submissions!){
      check(['preview','fill','file','agent','mcp','workflow','plugin'].includes(String(s.source)));
      check(typeof s.answers_json==='string'&&typeof s.submitted_at==='string'&&Number.isFinite(Date.parse(s.submitted_at)));
      check(s.form_version===null||(Number.isSafeInteger(s.form_version)&&Number(s.form_version)>0));
      check(s.request_id===null||(typeof s.request_id==='string'&&s.request_id.length>0&&!requests.has(s.request_id)));if(s.request_id)requests.add(String(s.request_id));
      check(s.questions_json===null||typeof s.questions_json==='string');
      const answers:unknown=JSON.parse(s.answers_json);check(answers&&typeof answers==='object'&&!Array.isArray(answers)&&Object.values(answers).every(v=>typeof v==='string'&&v.length<=4000));
      // Legacy submissions deliberately keep their original question IDs when no snapshot exists.
      if(s.questions_json!==null){
        const captured=JSON.parse(String(s.questions_json)),qs=questions(captured);check(Object.keys(answers).every(k=>qs.includes(k)));
        const entries=new Map(Object.entries(answers));
        for(const q of captured){
          const answer=entries.get(q.id)??'';check(typeof answer==='string');check(!q.required||answer.trim().length>0);
          if(answer&&['singleChoice','multiChoice','dropdown'].includes(q.type)){
            const allowed=new Set(q.options.map((o:{label:string})=>o.label)),values=q.type==='multiChoice'?answer.split('\n'):[answer];
            check(values.every((v:string)=>allowed.has(v))&&new Set(values).size===values.length);
          }
          if(answer&&q.type==='rating')check(/^[1-5]$/.test(answer));
          if(answer&&q.type==='date')check(/^\d{4}-\d{2}-\d{2}$/.test(answer)&&Number.isFinite(Date.parse(answer))&&new Date(answer).toISOString().slice(0,10)===answer);
        }
      }
    }
  },
  dependencies({record:r},context,projectId){if(r.artifact_id&&!context.hasArtifact(projectId,String(r.artifact_id),Number(r.artifact_version)))throw new PluginSyncError('sync.dependencies','等待问卷关联的成果版本');},
}];
function questions(value:unknown):string[]{
  check(Array.isArray(value)&&value.length<=40);const ids=new Set<string>();
  value.forEach((q,i)=>{
    check(q&&typeof q==='object'&&!Array.isArray(q)&&Object.keys(q).every(k=>['id','type','title','required','order','options'].includes(k)));
    check(typeof q.id==='string'&&q.id.length>0&&q.id.length<=80&&!ids.has(q.id));ids.add(q.id);
    check(['text','singleChoice','multiChoice','dropdown','rating','date'].includes(q.type)&&typeof q.title==='string'&&q.title.length>0&&q.title.length<=200&&typeof q.required==='boolean'&&q.order===i+1);
    if(['singleChoice','multiChoice','dropdown'].includes(q.type)){
      check(Array.isArray(q.options)&&q.options.length>=2);const options=new Set<string>();
      for(const o of q.options){check(o&&Object.keys(o).sort().join(',')==='id,label'&&typeof o.id==='string'&&o.id.length>0&&!options.has(o.id)&&typeof o.label==='string');options.add(o.id);}
    }else check(q.options===undefined);
  });return [...ids];
}
function check(value:unknown):asserts value{if(!value)throw new PluginSyncError('sync.invalid','问卷同步数据不合法');}
