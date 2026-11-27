import { PLUGIN_ICON_NAMES } from "@molis-ai/molis-work-plugin-sdk/ui";
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';
import {isRecord,parseConnectionSlots,parseSandboxUi} from '@molis-ai/molis-work-plugin-sdk';
import {assertContract} from '@molis-ai/molis-work-plugin-sandbox';
import {validatePluginComponentNodes,validatePluginComponentPlans} from '@molis-ai/molis-work-design-system';
import {validateFrozenStudioWords,validateStudioPlainWords} from './agent-ui-text.js';
import type {AgentBuild,AgentBuildSnapshot,AgentDesign,AgentProposal,AgentRelease} from './agent-model.js';
import {isStudioBuildFailure,isStudioStepLabel} from './studio-collaboration.js';

export const BUILDER_SAVED_STATE = {
 version: /* @version format.builder.saved-state */ 2,
 upgrades: [{ from: 1, apply: upgradeUnboundImages }],
} as const;

export interface BuilderSavedState {format:typeof BUILDER_SAVED_STATE.version;builds:AgentBuild[];releases:AgentRelease[];revisions:Record<string,number>}
const errors=defineErrorCodes('plugin_builder',{store_invalid:'invalid',store_limit:'too_large'});
const invalid=():never=>{throw errors.store_invalid('创作数据格式版本无效，原内容已保留');};
function wordsAreValid(design: AgentDesign | null | undefined): boolean {
 if (!design) return true;
 if (design.icon !== undefined && !PLUGIN_ICON_NAMES.some(name => name === design.icon)) return false;
 try { validateFrozenStudioWords(design); return true; } catch { return false; }
}
function previewWordsAreValid(candidate: AgentProposal): boolean {
 try {
  if (candidate?.preview) validateStudioPlainWords(candidate.preview);
  const picture = candidate?.mockup;
  if (picture === undefined) return true;
  if (!isRecord(picture) || !['drawing','failed','ready'].includes(picture.status)
    || Object.keys(picture).some(key => !['status','jobId','imageId','reason','binding','regenerate','requestId','prompt'].includes(key))) return false;
  const binding = picture.binding;
  if (binding !== undefined && (!isRecord(binding) || !['home','project'].includes(binding.scope)
    || Object.keys(binding).sort().join(',') !== 'connection_id,install_id,installation_generation,manifest_digest,project_id,provider_id,scope,version'
    || ![binding.install_id,binding.installation_generation,binding.version,binding.manifest_digest,binding.provider_id,binding.project_id].every(identity) || !imageIdentity(binding.connection_id))) return false;
  if (picture.prompt !== undefined && (typeof picture.prompt !== 'string' || !picture.prompt.length || picture.prompt.length > 32000)) return false;
  if (picture.requestId !== undefined && !identity(picture.requestId) || picture.regenerate !== undefined && picture.regenerate !== true
    || picture.reason !== undefined && typeof picture.reason !== 'string') return false;
  if (picture.jobId !== undefined && (!binding || !imageIdentity(picture.jobId))) return false;
  if (picture.imageId !== undefined && (!picture.jobId || !imageIdentity(picture.imageId))) return false;
  return picture.status !== 'ready' || Boolean(picture.binding && picture.requestId && picture.jobId && picture.imageId);
 } catch { return false; }
}
const imageIdentity=(value:unknown):value is string=>typeof value==='string'&&value.length>0&&value.length<=256;
const identity=(value:unknown):value is string=>typeof value==='string'&&!!value.trim()&&value.length<=200;
const revision=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>0;
export function nextBuilderRevision(value:number):number{
 if(!Number.isSafeInteger(value)||value<0||!Number.isSafeInteger(value+1))throw errors.store_limit('草稿编辑版本已达上限，原内容已保留');
 return value+1;
}
const mentionsSlot=(parts:unknown)=>Array.isArray(parts)&&parts.some(part=>isRecord(part)&&(Object.hasOwn(part,'surfaceSlot')||Object.hasOwn(part,'connectionNeed')||part.kind==='surface-slot'||part.kind==='connection-need'));
function checkSavedUi(design:unknown,nodes:unknown):void{
 const parts=isRecord(design)?design.parts:undefined;
 if(!(isRecord(design)&&(Object.hasOwn(design,'ui')||Object.hasOwn(design,'connections')))&&!mentionsSlot(parts)&&!mentionsSlot(nodes))return;
 if(!isRecord(design)||!Array.isArray(nodes))return invalid();
 try{
  const ui=parseSandboxUi(design.ui);
  assertContract(design.contract);
  const connections = parseConnectionSlots(design.connections, design.contract.operations.flatMap(op => op.effects.connections ?? []));
  validatePluginComponentNodes(nodes,validatePluginComponentPlans(parts,design.contract,ui,connections),design.contract);
 }catch{return invalid();}
}
/** v1 jobs have no verifiable installation or connection. Keep the draft and ask for a new generation. */
function upgradeUnboundImages(old: Record<string, unknown>): void {
 if (!Array.isArray(old.builds)) return invalid();
 for (const build of old.builds) {
  if (!isRecord(build)) return invalid();
  if (build.candidates === undefined) continue;
  if (!Array.isArray(build.candidates)) return invalid();
  for (const candidate of build.candidates) {
   if (!isRecord(candidate)) return invalid();
   const picture = candidate.mockup;
   if (picture === undefined) continue;
   if (!isRecord(picture) || !['drawing','ready','failed'].includes(String(picture.status))
      || Object.keys(picture).some(field => !['status','jobId','imageId','reason'].includes(field))) return invalid();
   candidate.mockup = { status: 'failed', regenerate: true };
  }
 }
}

/** Apply each step once before the owner opens its current state. Parsing alone never migrates a draft. */
export function upgradeBuilderSavedState(raw: string): string | null {
 const saved: unknown = JSON.parse(raw);
 if (!isRecord(saved) || saved.format === BUILDER_SAVED_STATE.version) return null;
 for (const step of BUILDER_SAVED_STATE.upgrades) {
  if (saved.format !== step.from) continue;
  step.apply(saved);
  saved.format = step.from + 1;
 }
 const next = JSON.stringify(saved);
 parseBuilderState(next);
 return next;
}
/** One current owner document. A different format is refused without rewriting or empty-state recovery. */
export function parseBuilderState(raw:string|null):BuilderSavedState{
 if(raw===null)return {format:BUILDER_SAVED_STATE.version,builds:[],releases:[],revisions:{}};
 let value:unknown;try{value=JSON.parse(raw);}catch{return invalid();}
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const row=value as Record<string,unknown>;
 if(Object.keys(row).sort().join(',')!=='builds,format,releases,revisions'||row.format!==BUILDER_SAVED_STATE.version
  ||!Array.isArray(row.builds)||!Array.isArray(row.releases)||row.builds.length>10000||row.releases.length>10000
  ||!row.revisions||typeof row.revisions!=='object'||Array.isArray(row.revisions))return invalid();
 const floors=row.revisions as Record<string,unknown>;
 if(Object.keys(floors).length>100000||Object.entries(floors).some(([id,version])=>!identity(id)||!revision(version)))return invalid();
 const ids=new Set<string>();
 for(const item of row.builds){
  if(!item||typeof item!=='object'||!identity(item.id)||!revision(item.revision)||ids.has(item.id)
   ||!Object.hasOwn(floors,item.id)||floors[item.id]!==item.revision || !wordsAreValid(item.design) || !isStudioBuildFailure(item.error)
   || Array.isArray(item.candidates) && item.candidates.some((candidate: AgentProposal) => !previewWordsAreValid(candidate))
   ||!Array.isArray(item.steps)||item.steps.some((step:unknown)=>!step||typeof step!=='object'||!('label' in step)||!isStudioStepLabel(step.label))
   || Array.isArray(item.history) && item.history.some((entry: AgentBuildSnapshot) => !wordsAreValid(entry?.design)))return invalid();
  ids.add(item.id);
  checkSavedUi(item.design,item.nodes);
  for(const snapshot of Array.isArray(item.history)?item.history:[])if(isRecord(snapshot))checkSavedUi(snapshot.design,snapshot.nodes);
 }
 const releases=new Set<string>();
 for(const item of row.releases){
  if(!item||typeof item!=='object'||!identity(item.buildId)||!identity(item.pluginId)||!revision(item.version)||!wordsAreValid(item.design))return invalid();
  const id=JSON.stringify([item.buildId,item.version]);if(releases.has(id))return invalid();releases.add(id);
  checkSavedUi(item.design,item.nodes);
 }
 return value as BuilderSavedState;
}
