import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import {isDeepStrictEqual} from 'node:util';
import type {AgentBuild,AgentBuildSnapshot,AgentRelease,AgentDesign} from './agent-model.js';
import {contractEffects} from './agent-validation.js';
import {validateBuilderDirectories,type BuilderPortableDirectory} from './sync-files.js';
import {validateBuilderResults,validateBuilderSelection,validateBuilderReleaseFiles} from './sync-records.js';
import {validateBuilderDesignDomain,validateBuilderNodeDomain,validateBuilderPreviewDomain,validateBuilderSnapshotLinks,validateBuilderDecisionLinks} from './sync-domain.js';

export interface BuilderPortableState {format:1;builds:Record<string,unknown>[];releases:Record<string,unknown>[];files:Record<string,BuilderPortableDirectory[]>}
const errors=defineErrorCodes('plugin_builder',{sync_invalid:'invalid',sync_busy:'unavailable'});
export function builderSyncInvalid():never{throw errors.sync_invalid('创作同步内容或归属无效，原内容已保留');}
export const builderSyncBusy=():never=>{throw errors.sync_busy('创作执行尚未结束，内容已保留',{sync_waiting:true});};
export const object=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))return builderSyncInvalid();return value as Record<string,unknown>;};
const id=(value:unknown):value is string=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/.test(value)&&!['constructor','prototype','__proto__'].includes(value);
const stamp=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function keys(value:Record<string,unknown>,allowed:readonly string[],required:readonly string[]=[]){if(Object.keys(value).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(value,k)))builderSyncInvalid();}
function strings(value:unknown){if(!Array.isArray(value)||value.some(v=>typeof v!=='string'))builderSyncInvalid();}
function list(value:unknown):unknown[]{if(!Array.isArray(value)||value.length>100000)return builderSyncInvalid();return value;}
export function pick(value:object,fields:readonly string[]):Record<string,unknown>{return Object.fromEntries(fields.filter(k=>Object.hasOwn(value,k)&&Reflect.get(value,k)!==undefined).map(k=>[k,structuredClone(Reflect.get(value,k))]));}
const snapshotFields=['design','nodes','connected','designSource','browserResult','visualResult','pendingVisual'];
const buildFields=['id','brief','title','phase','messages','candidates','chosen','questions','clarificationAnswered','notes','runs','pendingPart','rework','error','createdAt','updatedAt'];
const releaseFields=['buildId','pluginId','version','design','nodes','manifest','permissions','publishedAt','prompts'];
function checks(value:Record<string,unknown>){
 return Object.fromEntries(Object.entries(value).map(([key,input])=>{const c=object(input);return [key,pick(c,['passed','gates'])];}));
}
export function portableBuilderSnapshot(value:AgentBuildSnapshot):Record<string,unknown>{return {...pick(value,snapshotFields),...(value.checks?{checks:checks(value.checks)}:{})};}
export function portableBuilderBuild(value:AgentBuild):Record<string,unknown>{
 return {...pick(value,buildFields),...portableBuilderSnapshot(value),revision:0,active:null,
  candidates:value.candidates.map(candidate=>({...pick(candidate,['id','title','description','rationale','journey','effects','preview']),...(candidate.mockup?{mockup:pick(candidate.mockup,['status','jobId','imageId','reason'])}:{})})),
  phase:['draft','clarifying','choosing'].includes(value.phase)?value.phase:'paused',
  steps:value.steps.map(step=>({...pick(step,['id','agent','action','label','status','operationId','detail','at','selection']),status:['active','queued'].includes(step.status)?'cancelled':step.status})),
  history:value.history.map(portableBuilderSnapshot)};
}
export function portableBuilderRelease(value:AgentRelease):Record<string,unknown>{return pick(value,releaseFields);}
export function assertBuilderIdle(builds:readonly AgentBuild[]):void{
 if(builds.some(b=>b.active||['building','designing'].includes(b.phase)||b.candidates?.some(c=>c.mockup?.status==='drawing')))builderSyncBusy();
}
function design(value:unknown){
 const d=object(value);keys(d,['catalog','id','title','description','rationale','journey','contract','parts','acceptance','presentation','experience'],['id','title','description','rationale','journey','contract','parts','acceptance']);
 return validateBuilderDesignDomain(d);
}
function snapshot(value:unknown,pluginId?:string){
 const s=object(value);keys(s,[...snapshotFields,'checks'],['design','nodes','connected']);
 const d=s.design===null?null:design(s.design);validateBuilderNodeDomain(d,s.nodes,s.connected);if(d&&pluginId&&d.contract.pluginId!==pluginId)builderSyncInvalid();
 validateBuilderResults(s);
 if(s.designSource!==undefined&&typeof s.designSource!=='string'||s.pendingVisual!==undefined&&typeof s.pendingVisual!=='string')builderSyncInvalid();
 if(s.checks!==undefined)for(const check of Object.values(object(s.checks))){const c=object(check);keys(c,['passed','gates'],['passed','gates']);if(typeof c.passed!=='boolean')builderSyncInvalid();for(const gate of list(c.gates)){const g=object(gate);keys(g,['id','passed','detail'],['id','passed','detail']);if(!/^G[1-6]$/.test(String(g.id))||typeof g.passed!=='boolean'||typeof g.detail!=='string')builderSyncInvalid();}}
 validateBuilderSnapshotLinks(s,d);
 return s;
}
function build(value:unknown){
 const b=object(value);keys(b,[...snapshotFields,...buildFields,'revision','active','checks','steps','history'],['id','revision','active','brief','title','phase','messages','candidates','questions','clarificationAnswered','design','nodes','connected','steps','checks','runs','history','error','createdAt','updatedAt']);
 if(!id(b.id)||b.revision!==0||b.active!==null||typeof b.brief!=='string'||typeof b.title!=='string'||!['draft','clarifying','choosing','paused'].includes(String(b.phase))
  ||typeof b.clarificationAnswered!=='boolean'||b.error!==null&&typeof b.error!=='string'||!stamp(b.createdAt)||!stamp(b.updatedAt))builderSyncInvalid();
 const s=pick(b,[...snapshotFields,'checks']);snapshot(s,'io.molis.work.generated.'+b.id);
 if(b.design!==null&&object(object(b.design).contract).pluginId!=='io.molis.work.generated.'+b.id)builderSyncInvalid();
 for(const message of list(b.messages)){const m=object(message);keys(m,['role','text'],['role','text']);if(!['user','assistant'].includes(String(m.role))||typeof m.text!=='string')builderSyncInvalid();}
 strings(b.questions);if(b.notes!==undefined)strings(b.notes);
 if(b.chosen!==undefined&&typeof b.chosen!=='string')builderSyncInvalid();
 if(b.rework!==undefined&&Object.values(object(b.rework)).some(v=>typeof v!=='string'))builderSyncInvalid();
 if(b.pendingPart!==undefined){const p=object(b.pendingPart);keys(p,['id','candidates','reason'],['id','candidates','reason']);if(!id(p.id)||typeof p.reason!=='string')builderSyncInvalid();strings(p.candidates);}
 for(const candidate of list(b.candidates)){const c=object(candidate);keys(c,['id','title','description','rationale','journey','effects','preview','mockup'],['id','title','description','rationale','journey','effects','preview']);if(!id(c.id)||['title','description','rationale'].some(k=>typeof c[k]!=='string'))builderSyncInvalid();strings(c.journey);object(c.effects);const p=object(c.preview);keys(p,['contract','parts','presentation'],['contract','parts']);if(object(p.contract).pluginId!=='io.molis.work.generated.'+b.id)builderSyncInvalid();list(p.parts);if(c.mockup!==undefined){const m=object(c.mockup);keys(m,['status','jobId','imageId','reason'],['status']);if(!['ready','failed'].includes(String(m.status)))builderSyncInvalid();if(m.jobId!==undefined&&!id(m.jobId)||m.imageId!==undefined&&!id(m.imageId)||m.reason!==undefined&&typeof m.reason!=='string'||m.status==='ready'&&(!id(m.jobId)||!id(m.imageId)))builderSyncInvalid();}}
 for(const step of list(b.steps)){const s=object(step);keys(s,['id','agent','action','label','status','operationId','detail','at','selection'],['id','agent','action','label','status','at']);if(!id(s.id)||!['design','ui','code','host'].includes(String(s.agent))||typeof s.action!=='string'||typeof s.label!=='string'||!['done','waiting','failed','cancelled'].includes(String(s.status))||!stamp(s.at)||s.operationId!==undefined&&typeof s.operationId!=='string'||s.detail!==undefined&&typeof s.detail!=='string')builderSyncInvalid();if(s.selection!==undefined)validateBuilderSelection(s.selection);}
 for(const run of list(b.runs)){const r=object(run);keys(r,['id','role','phase','configuredModel','reportedModels','promptVersion','error'],['id','role','phase','configuredModel','reportedModels','promptVersion']);if(!id(r.id)||['role','phase','configuredModel','promptVersion'].some(k=>typeof r[k]!=='string')||r.error!==undefined&&typeof r.error!=='string')builderSyncInvalid();strings(r.reportedModels);}
 for(const candidate of list(b.candidates))validateBuilderPreviewDomain(object(object(candidate).preview),object(candidate).effects);
 validateBuilderDecisionLinks(b);
 for(const h of list(b.history))snapshot(h,'io.molis.work.generated.'+b.id);return b;
}
function release(value:unknown){
 const r=object(value);keys(r,releaseFields,releaseFields);if(!id(r.buildId)||!id(r.pluginId)||!Number.isSafeInteger(r.version)||Number(r.version)<1||!stamp(r.publishedAt))builderSyncInvalid();
 const d=design(r.design),c=object(d.contract),m=object(r.manifest);keys(m,['version','pluginId','revision','effects'],['version','pluginId','revision','effects']);
 if(m.version!==1||m.pluginId!==r.pluginId||c.pluginId!==r.pluginId||r.pluginId!=='io.molis.work.generated.'+r.buildId||m.revision!==c.revision||!isDeepStrictEqual(m.effects,r.permissions)||!isDeepStrictEqual(m.effects,contractEffects(r.design as AgentDesign)))builderSyncInvalid();validateBuilderNodeDomain(d,r.nodes,[],true);
 const ids=new Set<string>();for(const prompt of list(r.prompts)){const p=object(prompt);keys(p,['id','title','purpose','body'],['id','title','purpose','body']);if(!id(p.id)||ids.has(p.id)||['title','purpose','body'].some(k=>typeof p[k]!=='string'))builderSyncInvalid();ids.add(p.id);}return r;
}
/** Validate the entire owner unit before project creation or staging any target bytes. */
export function validateBuilderPortable(input:unknown):BuilderPortableState{
 const value=object(input);keys(value,['format','builds','releases','files'],['format','builds','releases','files']);if(value.format!==1)builderSyncInvalid();
 const builds=list(value.builds).map(build),releases=list(value.releases).map(release),ids=new Set<string>(),versions=new Set<string>();
 for(const b of builds){if(ids.has(String(b.id)))builderSyncInvalid();ids.add(String(b.id));}
 for(const r of releases){const key=JSON.stringify([r.buildId,r.version]);if(versions.has(key))builderSyncInvalid();versions.add(key);ids.add(String(r.buildId));}
 const files=object(value.files);if(Object.keys(files).length!==ids.size||[...ids].some(id=>!Object.hasOwn(files,id)))builderSyncInvalid();
 const checked=Object.fromEntries([...ids].map(id=>[id,validateBuilderDirectories(files[id])]));
 for(const [id,entries] of Object.entries(checked))for(const e of entries){const b=builds.find(b=>b.id===id);if(e.slot.startsWith('current')&&!b||e.slot.startsWith('history-')&&(!b||Number(e.slot.match(/[0-9]+/)![0])>=list(b.history).length)||e.slot.startsWith('release-')&&!releases.some(r=>r.buildId===id&&r.version===Number(e.slot.slice(8))))builderSyncInvalid();}
 for(const r of releases){const directory=checked[String(r.buildId)]?.find(e=>e.slot==='release-'+r.version);if(!directory)builderSyncInvalid();validateBuilderReleaseFiles(r,directory!);}
 return {format:1,builds,releases,files:checked};
}
