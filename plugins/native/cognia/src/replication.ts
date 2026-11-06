import type { PluginSyncBusinessDatabase, PluginSyncCollectionDefinition } from '@molis-ai/molis-work-contracts/platform/plugin-sync';
import type { SyncBlobReference } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import type { PluginSyncDeclaration } from '@molis-ai/molis-work-contracts/platform/plugin';
import { requireCognia, type Material, type Source } from './types.js';
import { syncObject, validateKnowledgeGraph, type KnowledgeGraph } from './sync-validation.js';
import type { StoredDraft } from './drafts.js';


const KEY=JSON.stringify(['cognia','knowledge']);
const tables=['cognia_domains','cognia_sources','cognia_materials','cognia_versions','cognia_drafts'] as const;
function readGraph(db:PluginSyncBusinessDatabase):KnowledgeGraph {
 const bodies=<T>(table:string)=>db.prepare(`SELECT body FROM ${table} ORDER BY id`).all().map(r=>JSON.parse(String(r.body)) as T);
 return {domains:db.prepare('SELECT id,name FROM cognia_domains ORDER BY id').all().map(d=>({id:String(d.id),name:String(d.name)})),sources:bodies<Source>('cognia_sources').map(s=>({...s,locator:s.locator==='manual'||s.locator==='knowledge'?s.locator:'upload'})),materials:bodies<Material>('cognia_materials'),
  versions:db.prepare('SELECT body,data FROM cognia_versions ORDER BY material_id,revision').all().map(v=>({material:JSON.parse(String(v.body)) as Material,data:String(v.data)})),drafts:db.prepare('SELECT body,archived FROM cognia_drafts ORDER BY id').all().map(d=>({draft:JSON.parse(String(d.body)) as StoredDraft,archived:Number(d.archived)}))};
}
export const cogniaCollection: PluginSyncCollectionDefinition = {
 tracking: tables.map(table => ({ table, key: [{literal:'cognia'}, {literal:'knowledge'}] })),
 create(db,context){
 const key=(value:string)=>requireCognia(value===KEY,'知识同步资产不匹配');
 return {authorizeKey(id){key(id);context.authorize();},belongsToProject(id){key(id);return false;},
  read(id){key(id);const graph=readGraph(db);validateKnowledgeGraph(graph);return {format:/* @version format.cognia.portable */ 1,spaceId:context.spaceId,graph};},
  apply(id,value){key(id);const w=syncObject(value);requireCognia(Object.keys(w).sort().join(',')==='format,graph,spaceId'&&w.format===/* @version format.cognia.portable */ 1&&w.spaceId===context.spaceId,'知识同步空间或字段不匹配');const g=validateKnowledgeGraph(w.graph);
   const localPaths=new Map(db.prepare('SELECT id,body FROM cognia_sources').all().map(s=>[String(s.id),(JSON.parse(String(s.body)) as Source).locator]));
   for(const table of [...tables].reverse())db.exec(`DELETE FROM ${table}`);
   for(const d of g.domains)db.prepare('INSERT INTO cognia_domains(id,name) VALUES (?,?)').run(d.id,d.name);
   for(const s of g.sources)db.prepare('INSERT INTO cognia_sources(id,body) VALUES (?,?)').run(s.id,JSON.stringify({...s,locator:localPaths.get(s.id)??s.locator}));
   for(const m of g.materials)db.prepare('INSERT INTO cognia_materials(id,source_id,path,updated_at,body) VALUES (?,?,?,?,?)').run(m.id,m.source_id,m.path,m.updated_at,JSON.stringify(m));
   for(const v of g.versions)db.prepare('INSERT INTO cognia_versions(material_id,revision,body,data) VALUES (?,?,?,?)').run(v.material.id,v.material.revision,JSON.stringify(v.material),v.data);
   for(const d of g.drafts)db.prepare('INSERT INTO cognia_drafts(id,body,archived) VALUES (?,?,?)').run(d.draft.id,JSON.stringify(d.draft),d.archived);
   db.exec('DELETE FROM cognia_previews WHERE receipt IS NULL');
  },
 };
 }
};
/** Only immutable version bytes use the blob projection; source directories never reach this layer. */
export const cogniaSyncProjection={
  project(_key:string,input:unknown,put:(bytes:Uint8Array)=>SyncBlobReference){const wire=syncObject(input),graph=validateKnowledgeGraph(wire.graph);return {...wire,graph:{...graph,versions:graph.versions.map(v=>({...v,data:v.data?put(Buffer.from(v.data,'base64')):''}))}};},
  async restore(_key:string,input:unknown,read:(reference:SyncBlobReference)=>Promise<Uint8Array>){const wire=syncObject(input),graph=syncObject(wire.graph);requireCognia(Array.isArray(graph.versions)&&graph.versions.length<=100000,'知识历史清单无效');const versions=[];
   for(const entry of graph.versions){const v=syncObject(entry);versions.push({...v,data:v.data===''?'':Buffer.from(await read(v.data as SyncBlobReference)).toString('base64')});}
   const result={...wire,graph:{...graph,versions}};validateKnowledgeGraph(result.graph);return result;
  },
};

export const cogniaSync:PluginSyncDeclaration={protocol_version:/* @version sync.protocol */ 1,collections:[{id:'knowledge',title:'知识材料、历史与草稿',schema_version: /* @version sync.collection.cognia.knowledge */ 1,requires:[],tracking:cogniaCollection.tracking}]};
