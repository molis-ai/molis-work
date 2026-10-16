import type { AggregateDefinition } from '@molis-ai/molis-work-storage';
import { PluginSyncError, type PluginSyncDeclaration } from '@molis-ai/molis-work-contracts/platform/plugin';

export const pptSync:PluginSyncDeclaration={protocol_version:1,collections:[{id:'presentations',title:'演示稿',schema_version:1,requires:[]}]};
export const pptAggregates:readonly AggregateDefinition[]=[{
  kind:'presentation',table:'presentations',columns:['id','project_id','title','description','color_primary','color_background','color_text','slides_json','created_at','updated_at','artifact_id','artifact_version'],children:[],versionColumn:'version',busyColumn:'publication_pending_json',
  validate({record:r}){
    for(const k of ['id','project_id','title','description','slides_json','artifact_id'])check(typeof r[k]==='string');
    check(String(r.title).length>0&&String(r.title).length<=80&&String(r.description).length<=2000);
    for(const k of ['created_at','updated_at'])check(typeof r[k]==='string'&&Number.isFinite(Date.parse(r[k])));
    for(const k of ['color_primary','color_background','color_text'])check(typeof r[k]==='string'&&/^#[0-9a-f]{6}$/i.test(r[k]));
    check(Number.isSafeInteger(r.artifact_version)&&Number(r.artifact_version)>=0&&Boolean(r.artifact_id)===(Number(r.artifact_version)>0));
    const slides:unknown=JSON.parse(String(r.slides_json));check(Array.isArray(slides)&&slides.length>0&&slides.length<=40);
    const ids=new Set<string>();
    slides.forEach((s,i)=>{
      check(s&&typeof s==='object'&&!Array.isArray(s)&&Object.keys(s).sort().join(',')==='bullets,id,notes,order,title');
      check(typeof s.id==='string'&&s.id.length>0&&s.id.length<=80&&!ids.has(s.id));ids.add(s.id);
      check(s.order===i+1&&typeof s.title==='string'&&s.title.length<=80&&typeof s.notes==='string'&&s.notes.length<=2000);
      check(Array.isArray(s.bullets)&&s.bullets.length<=12&&s.bullets.every((v:unknown)=>typeof v==='string'&&v.length<=200));
    });
  },
  dependencies({record:r},context,projectId){if(r.artifact_id&&!context.hasArtifact(projectId,String(r.artifact_id),Number(r.artifact_version)))throw new PluginSyncError('sync.dependencies','等待演示稿关联的成果版本');},
}];
function check(value:unknown):asserts value{if(!value)throw new PluginSyncError('sync.invalid','演示稿同步数据不合法');}
