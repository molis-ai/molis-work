import { contentHash, decodeFile, safeRelativePath } from './content.js';
import { cogniaErrors, requireCognia, type Domain, type Material, type Source } from './types.js';
import type { StoredDraft } from './drafts.js';
export interface KnowledgeVersion { material:Material;data:string }
export interface KnowledgeGraph { domains:Domain[];sources:Source[];materials:Material[];versions:KnowledgeVersion[];drafts:{draft:StoredDraft;archived:number}[] }
export function syncObject(value:unknown):Record<string,unknown>{requireCognia(value&&typeof value==='object'&&!Array.isArray(value),'知识同步对象无效');return value as Record<string,unknown>;}
function exact(value:Record<string,unknown>,keys:readonly string[]){requireCognia(Object.keys(value).sort().join(',')===[...keys].sort().join(','),'知识同步字段无效');}
const text=(value:unknown,max=1000000)=>typeof value==='string'&&value.length<=max;
const id=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=200;
const stamp=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const strings=(value:unknown)=>Array.isArray(value)&&value.length<=10000&&value.every(v=>text(v,1000));
function unique<T>(values:T[],identity:(v:T)=>string){const keys=values.map(identity);requireCognia(new Set(keys).size===keys.length,'知识同步有重复记录');}
function material(value:unknown):Material {
 const m=syncObject(value);exact(m,['id','source_id','path','domain_id','role','revision','hash','bytes','updated_at','mime','body','title','tags','aliases','frontmatter']);
 requireCognia(id(m.id)&&id(m.source_id)&&(m.domain_id===null||id(m.domain_id))&&['material','wiki','index','log','attachment'].includes(String(m.role))&&Number.isSafeInteger(m.revision)&&Number(m.revision)>0&&Number.isSafeInteger(m.bytes)&&Number(m.bytes)>=0&&text(m.hash,64)&&/^[a-f0-9]{64}$/.test(String(m.hash))&&stamp(m.updated_at)&&text(m.title,10000)&&strings(m.tags)&&strings(m.aliases)&&text(m.frontmatter,2000000)&&text(m.mime,200)&&text(m.body,2000000),'知识材料字段无效');safeRelativePath(m.path);return value as Material;
}
/** One owner-consistent graph: fixed citations, deleted-material versions and draft adoption share identities. */
export function validateKnowledgeGraph(value:unknown):KnowledgeGraph {
 try{return validatedGraph(value);}catch(error){if(error&&typeof error==='object'&&'code' in error&&typeof error.code==='string'&&error.code.startsWith('cognia.'))throw error;throw cogniaErrors.invalid('知识同步记录形状无效');}
}
function validatedGraph(value:unknown):KnowledgeGraph {
 const graph=syncObject(value);exact(graph,['domains','sources','materials','versions','drafts']);
 for(const rows of Object.values(graph))requireCognia(Array.isArray(rows)&&rows.length<=100000,'知识同步清单无效');
 const g=value as KnowledgeGraph;unique(g.domains,d=>d.id);unique(g.domains,d=>d.name);unique(g.sources,s=>s.id);unique(g.materials,m=>m.id);unique(g.versions,v=>JSON.stringify([v.material?.id,v.material?.revision]));unique(g.drafts,d=>d.draft?.id);
 const domains=new Set(g.domains.map(d=>d.id)),sources=new Set(g.sources.map(s=>s.id));
 for(const d of g.domains){const row=syncObject(d);exact(row,['id','name']);requireCognia(id(d.id)&&text(d.name,120)&&!!d.name.trim(),'知识领域无效');}
 for(const s of g.sources){const row=syncObject(s);exact(row,['id','name','kind','locator','domain_id']);requireCognia(id(s.id)&&text(s.name,200)&&['obsidian','llm-wiki','markdown'].includes(s.kind)&&['upload','manual','knowledge'].includes(s.locator)&&(s.domain_id===null||domains.has(s.domain_id)),'知识来源无效或含本机目录');}
 const versions=new Map<string,Material>();
 for(const version of g.versions){exact(syncObject(version),['material','data']);const m=material(version.material),decoded=decodeFile({path:m.path,data:version.data});
  requireCognia(decoded.bytes.length===m.bytes&&contentHash(decoded.bytes)===m.hash&&decoded.body===m.body&&decoded.mime===m.mime,'知识历史原件与正文不一致');versions.set(JSON.stringify([m.id,m.revision]),m);
 }
 unique(g.materials,m=>JSON.stringify([m.source_id,m.path]));
 for(const m of g.materials){material(m);const fixed=versions.get(JSON.stringify([m.id,m.revision]));requireCognia(fixed&&JSON.stringify(fixed)===JSON.stringify(m)&&sources.has(m.source_id)&&(m.domain_id===null||domains.has(m.domain_id)),'知识当前材料缺少固定版本或来源');}
 for(const entry of g.drafts){exact(syncObject(entry),['draft','archived']);const d=syncObject(entry.draft);
  const fields=['id','title','body','domain_id','references','mode','saved_id','created_at',...(d.earlier_ids===undefined?[]:['earlier_ids'])];exact(d,fields);
  requireCognia([0,1].includes(entry.archived)&&id(d.id)&&text(d.title,500)&&text(d.body,100000)&&stamp(d.created_at)&&['synthesize','query'].includes(String(d.mode))&&(d.domain_id===null||domains.has(String(d.domain_id)))&&(d.saved_id===null||id(d.saved_id))&&(d.earlier_ids===undefined||Array.isArray(d.earlier_ids)&&d.earlier_ids.every(id))&&Array.isArray(d.references)&&d.references.length<=5,'知识草稿无效');
  unique(entry.draft.references,r=>r.label);
  for(const reference of entry.draft.references){exact(syncObject(reference),['label','material_id','revision','title','path','body']);const fixed=versions.get(JSON.stringify([reference.material_id,reference.revision]));requireCognia(/^S[1-5]$/.test(reference.label)&&fixed&&reference.title===fixed.title&&reference.path===fixed.path&&reference.body===fixed.body,'知识草稿缺少准确的固定来源');}
 }
 if(Buffer.byteLength(JSON.stringify(value))>100000000)throw cogniaErrors.too_large('知识内容超过账号容量上限');return g;
}
