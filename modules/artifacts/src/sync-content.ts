import {createHash} from 'node:crypto';
import {artifactErrors} from './errors.js';
import type {SyncBlobReference,SyncBlobSource,SyncContentCodec} from '@molis-ai/molis-work-contracts/platform/sync-transport';
import {IMPORTED_DOCUMENT_TYPE} from '@molis-ai/molis-work-contracts/modules/artifacts';
import {canonicalArtifactJson,normalizeArtifactPayload} from './content.js';

function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw artifactErrors['artifacts.artifact.payload_invalid']('成果同步内容格式无效');return value as Record<string,unknown>;}
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
/** Actual immutable Artifact content only: no project paths, SQLite files or producer-specific transport branches. */
export function createArtifactSyncContent(spaceId:string):SyncContentCodec {
  const envelope=(key:string,input:unknown)=>{
    const locator:unknown=JSON.parse(key),value=object(input),project=object(value.project),artifact=object(value.artifact);
    if(!Array.isArray(locator)||locator.length!==3||locator[1]!=='artifact'||project.id!==locator[0]||artifact.projectId!==locator[0]||artifact.spaceId!==spaceId||object(artifact.identity).artifact_id!==locator[2]||!Array.isArray(artifact.versions)||artifact.versions.length<1||artifact.versions.length>1000)throw artifactErrors['artifacts.artifact.scope_invalid']('成果同步内容的空间、项目或身份不匹配');
    return {value,artifact,versions:artifact.versions.map(object)};
  };
  return {
    encode(key,input){
      const {value,artifact,versions}=envelope(key,input);
      if(artifact.format!==1)throw artifactErrors['artifacts.artifact.payload_invalid']('成果同步内容格式无效');
      const needs=versions.some(v=>Buffer.byteLength(JSON.stringify(v.payload))>64*1024||v.artifact_type_id===IMPORTED_DOCUMENT_TYPE&&v.payload&&typeof v.payload==='object'&&'original_file' in v.payload);
      if(!needs)return {value:input,blobs:[]};
      const blobs=new Map<string,SyncBlobSource>();
      const add=(bytes:Uint8Array):SyncBlobReference=>{if(!bytes.byteLength||bytes.byteLength>100000000)throw artifactErrors['artifacts.artifact.content_invalid']('成果同步内容超出容量上限');const reference={digest:hash(bytes),size:bytes.byteLength};blobs.set(reference.digest,{...reference,bytes});return reference;};
      const projected=versions.map(version=>{
        const payload=structuredClone(version.payload);let file:SyncBlobReference|null=null;
        if(version.artifact_type_id===IMPORTED_DOCUMENT_TYPE&&payload&&typeof payload==='object'&&!Array.isArray(payload)){
          const original=Reflect.get(payload,'original_file');
          if(original&&typeof original==='object'&&!Array.isArray(original)&&typeof original.data_base64==='string'){
            const bytes=Buffer.from(original.data_base64,'base64');if(bytes.toString('base64')!==original.data_base64)throw artifactErrors['artifacts.artifact.payload_invalid']('成果同步原件编码无效');
            if(bytes.byteLength){file=add(bytes);delete original.data_base64;}
          }
        }
        const body=add(Buffer.from(canonicalArtifactJson(normalizeArtifactPayload(payload))));
        return {...version,payload:{body,file}};
      });
      return {value:{...value,artifact:{...artifact,format:2,versions:projected}},blobs:[...blobs.values()].sort((a,b)=>a.digest.localeCompare(b.digest))};
    },
    async decode(key,input,read){
      const {value,artifact,versions}=envelope(key,input);
      if(artifact.format===1)return input;
      if(artifact.format!==2)throw artifactErrors['artifacts.artifact.payload_invalid']('成果同步内容格式无效');
      const restored=[];
      for(const version of versions){
        const content=object(version.payload);if(Object.keys(content).length!==2||!('body' in content)||!('file' in content))throw artifactErrors['artifacts.artifact.payload_invalid']('成果同步内容格式无效');
        const readChecked=async(input:unknown)=>{const ref=object(input);if(Object.keys(ref).length!==2||typeof ref.digest!=='string'||!/^[a-f0-9]{64}$/.test(ref.digest)||!Number.isSafeInteger(ref.size)||Number(ref.size)<1||Number(ref.size)>100000000)throw artifactErrors['artifacts.artifact.content_invalid']('成果同步附件引用无效');const reference={digest:ref.digest,size:Number(ref.size)};const bytes=await read(reference);if(bytes.byteLength!==reference.size||hash(bytes)!==reference.digest)throw artifactErrors['artifacts.artifact.hash_mismatch']('成果同步附件校验失败');return bytes;};
        const payload:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readChecked(content.body)));
        if(content.file!==null){
          if(version.artifact_type_id!==IMPORTED_DOCUMENT_TYPE)throw artifactErrors['artifacts.artifact.payload_invalid']('成果同步内容格式无效');
          const original=object(object(payload).original_file);if('data_base64' in original)throw artifactErrors['artifacts.artifact.payload_invalid']('成果同步内容格式无效');
          original.data_base64=Buffer.from(await readChecked(content.file)).toString('base64');
        }
        restored.push({...version,payload});
      }
      return {...value,artifact:{...artifact,format:1,versions:restored}};
    },
  };
}
