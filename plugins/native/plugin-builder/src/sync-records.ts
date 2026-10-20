import {isDeepStrictEqual} from 'node:util';
import {builderSyncInvalid,object} from './sync-shape.js';
import type {BuilderPortableDirectory} from './sync-files.js';

function exact(row:Record<string,unknown>,allowed:readonly string[],required:readonly string[]=allowed){
 if(Object.keys(row).some(k=>!allowed.includes(k))||required.some(k=>!Object.hasOwn(row,k)))builderSyncInvalid();
}
function strings(value:unknown){if(!Array.isArray(value)||value.some(v=>typeof v!=='string'))builderSyncInvalid();}
function stamp(value:unknown){if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))builderSyncInvalid();}
export function validateBuilderResults(row:Record<string,unknown>):void{
 if(row.browserResult!==undefined){const b=object(row.browserResult);exact(b,['passed','cases','at']);stamp(b.at);
  if(typeof b.passed!=='boolean'||!Array.isArray(b.cases))builderSyncInvalid();
  for(const entry of b.cases as unknown[]){const c=object(entry);exact(c,['id','passed','detail']);if(typeof c.id!=='string'||typeof c.passed!=='boolean'||typeof c.detail!=='string')builderSyncInvalid();}
 }
 if(row.visualResult!==undefined){const v=object(row.visualResult);exact(v,['structural','status','issues','at','revision','elapsedMs']);stamp(v.at);strings(v.issues);
  if(typeof v.structural!=='boolean'||!['reviewed','unavailable','failed'].includes(String(v.status))||typeof v.revision!=='string'||typeof v.elapsedMs!=='number'||!Number.isFinite(v.elapsedMs)||v.elapsedMs<0)builderSyncInvalid();
 }
}
export function validateBuilderSelection(input:unknown):void{
 const s=object(input);exact(s,['source','candidates','choice','model','elapsedMs','confidence'],['source','candidates','choice']);strings(s.candidates);
 if(!['rule','jev','user','design'].includes(String(s.source))||typeof s.choice!=='string'||s.model!==undefined&&typeof s.model!=='string'
  ||s.elapsedMs!==undefined&&(typeof s.elapsedMs!=='number'||!Number.isFinite(s.elapsedMs)||s.elapsedMs<0)
  ||s.confidence!==undefined&&s.confidence!==null&&(typeof s.confidence!=='number'||!Number.isFinite(s.confidence)||s.confidence<0||s.confidence>1))builderSyncInvalid();
}
/** The exact published bytes must describe the same release, not merely have valid independent hashes. */
export function validateBuilderReleaseFiles(release:Record<string,unknown>,directory:BuilderPortableDirectory):void{
 const design=object(release.design),iface={nodes:release.nodes,acceptance:design.acceptance,...(design.presentation===undefined?{}:{presentation:design.presentation})};
 for(const [path,expected] of Object.entries({'manifest.json':release.manifest,'contract.json':design.contract,'interface.json':iface,'prompts.json':release.prompts})){
  const file=directory.files.find(f=>f.path===path);if(!file)builderSyncInvalid();
  const value:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(file!.bytes,'base64')));
  if(!isDeepStrictEqual(value,expected))builderSyncInvalid();
 }
}
