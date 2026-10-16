import type { ArtifactVersionRecord, ArtifactIdentityRecord } from '@molis-ai/molis-work-contracts/modules/artifacts';
import { canonicalArtifactJson, artifactContentDigest, artifactContentSize, normalizeArtifactMetadata, normalizeArtifactPayload } from './content.js';
import { ARTIFACT_TABLES, ArtifactsRepository, type ArtifactsSqliteDatabase } from './repository.js';
import { ArtifactsService, type ArtifactsServiceOptions } from './service.js';

/** Only a trusted personal-space Host constructs this port. No HTTP caller supplies authority. */
export interface ArtifactReplicationContext {
  spaceId: string;
  projectId: string;
  authorize(): void;
}
export interface PortableArtifact {
  format: 1;
  spaceId: string;
  projectId: string;
  identity: Omit<ArtifactIdentityRecord, 'project_id'>;
  versions: Omit<ArtifactVersionRecord, 'project_id'>[];
}

const IDENTITY_FIELDS=['artifact_id','owner_actor_id','producer_plugin_id','producer_binding_signature','created_at'];
const VERSION_FIELDS=['artifact_id','version','artifact_type_id','schema_version','producer_plugin_id','producer_plugin_version','producer_binding_signature','owner_actor_id','content_kind','payload','content_ref','content_digest','size_bytes','metadata','scope','availability','unavailable_reason','lifecycle_state','supersedes_version','created_by','created_at','archived_at','archived_by','origin','title','media_type','trace'];
function fail(message:string):never {throw new Error('ARTIFACT_SYNC: '+message);}
function object(value:unknown,fields:string[]):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))return fail('格式错误');
  const row=value as Record<string,unknown>;
  if(Object.keys(row).length!==fields.length||fields.some(k=>!Object.hasOwn(row,k)))return fail('字段不匹配');
  return row;
}
function text(value:unknown){if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>1024)fail('标识不合法');}
function timestamp(value:unknown){if(typeof value!=='string'||value.length>40||!Number.isFinite(Date.parse(value)))fail('时间不合法');}
function portableStrings(value:unknown,depth=0):void {
  if(depth>64)fail('内容嵌套过深');
  if(typeof value==='string'&&/(?:^|[\s("'])\b(?:file|blob):/i.test(value))fail('内容仍依赖本机文件');
  if(value&&typeof value==='object')for(const item of Object.values(value))portableStrings(item,depth+1);
}

/** Artifact versions remain immutable; the envelope carries their managed project identity. */
export function createArtifactReplication(db:ArtifactsSqliteDatabase,context:ArtifactReplicationContext,options:ArtifactsServiceOptions){
  const repository=new ArtifactsRepository(db);
  const check=()=>{context.authorize();if(!context.spaceId||!context.projectId)fail('缺少可信空间');};
  const validate=(input:unknown):PortableArtifact=>{
    const row=object(input,['format','spaceId','projectId','identity','versions']);
    if(row.format!==1||row.spaceId!==context.spaceId||row.projectId!==context.projectId)fail('空间或版本不匹配');
    const identity=object(row.identity,IDENTITY_FIELDS);
    for(const field of IDENTITY_FIELDS.filter(f=>f!=='created_at'))text(identity[field]);timestamp(identity.created_at);
    if(!Array.isArray(row.versions)||!row.versions.length||row.versions.length>1000)fail('版本列表不合法');
    let previous=0;const versions=new Set<number>();
    for(const raw of row.versions){
      const record=object(raw,VERSION_FIELDS);
      for(const field of ['artifact_id','owner_actor_id','producer_plugin_id','producer_binding_signature'])if(record[field]!==identity[field])fail('成果身份不一致');
      for(const field of ['artifact_type_id','producer_plugin_version','created_by'])text(record[field]);
      if(typeof record.version!=="number"||!Number.isSafeInteger(record.version)||record.version<=previous||typeof record.schema_version!=="number"||!Number.isSafeInteger(record.schema_version)||record.schema_version<1)fail('版本顺序不合法');
      if(record.supersedes_version!==null&&(typeof record.supersedes_version!=="number"||!versions.has(record.supersedes_version)))fail('被替代版本缺失');
      previous=record.version;versions.add(record.version);
      if(record.scope!=='personal')fail('团队成果尚不支持');
      if(record.content_kind!=='inline'||record.content_ref!==null)fail('附件本体尚未同步');
      portableStrings(record.payload);portableStrings(record.metadata);
      const serialized=canonicalArtifactJson(normalizeArtifactPayload(record.payload));
      if(record.content_digest!==artifactContentDigest(serialized)||record.size_bytes!==artifactContentSize(serialized))fail('正文校验失败');
      normalizeArtifactMetadata(record.metadata);
      timestamp(record.created_at);
      if(typeof record.availability!=='string'||typeof record.lifecycle_state!=='string'||!['available','unavailable'].includes(record.availability)||!['active','archived'].includes(record.lifecycle_state))fail('状态不合法');
      if(record.availability==='available'?record.unavailable_reason!==null:typeof record.unavailable_reason!=='string'||!record.unavailable_reason.trim())fail('可用性不合法');
      if(record.lifecycle_state==='archived'){timestamp(record.archived_at);if(record.archived_by!==identity.owner_actor_id)fail('归档作者与 owner 不一致');}
      else if(record.archived_at!==null||record.archived_by!==null)fail('归档状态不一致');
    }
    if(Buffer.byteLength(JSON.stringify(row),'utf8')>512*1024)fail('成果超过当前传输上限');
    return input as PortableArtifact;
  };
  return {
    read(artifactId:string):PortableArtifact|null {
      check();const identity=repository.getIdentity(context.projectId,artifactId);if(!identity)return null;
      const {project_id:_board,...portableIdentity}=identity;
      const versions=repository.listVersions(context.projectId,artifactId).map(({project_id:_board,...record})=>record);
      const result=validate({format:1,spaceId:context.spaceId,projectId:context.projectId,identity:portableIdentity,versions});check();return result;
    },
    apply(input:unknown):void {
      check();const snapshot=validate(input);
      repository.immediate(()=>{
        check();const existingIdentity=repository.getIdentityById(snapshot.identity.artifact_id);
        if(existingIdentity){const {project_id,...identity}=existingIdentity;
          if(project_id!==context.projectId||canonicalArtifactJson(identity)!==canonicalArtifactJson(snapshot.identity))fail('成果身份冲突');
        }
        const incoming=new Set(snapshot.versions.map(v=>v.version));
        if(repository.listVersions(context.projectId,snapshot.identity.artifact_id).some(v=>!incoming.has(v.version)))fail('远端缺少本机已有版本');
        for(const version of snapshot.versions){
          check();
          const service=new ArtifactsService(repository,{...options,now:()=>version.created_at});
          const result=service.registerVersion({project_id:context.projectId,artifact_id:version.artifact_id,version:version.version,actor_id:version.created_by,owner_actor_id:version.owner_actor_id,
            origin:version.origin,title:version.title,media_type:version.media_type,trace:version.trace,
            artifact_type_id:version.artifact_type_id,schema_version:version.schema_version,
            producer:{plugin_id:version.producer_plugin_id,plugin_version:version.producer_plugin_version,binding_signature:version.producer_binding_signature},
            content:{kind:'inline',payload:version.payload},metadata:version.metadata,scope:'personal',expected_digest:version.content_digest,supersedes_version:version.supersedes_version});
          if(result.artifact.created_at!==version.created_at)fail('同版本历史不一致');
          if(result.artifact.lifecycle_state==='archived'&&version.lifecycle_state!=='archived')fail('不能通过同步撤销归档');
          if(result.artifact.availability==='unavailable'&&version.availability!=='unavailable')fail('不能通过同步覆盖不可用状态');
          if(result.artifact.availability==='unavailable'&&result.artifact.unavailable_reason!==version.unavailable_reason)fail('不可用原因冲突');
          if(result.artifact.lifecycle_state==='archived'&&(result.artifact.archived_at!==version.archived_at||result.artifact.archived_by!==version.archived_by))fail('归档历史冲突');
          const identity={project_id:context.projectId,artifact_id:version.artifact_id,version:version.version,actor_id:version.owner_actor_id};
          // The envelope has no original unavailable-at field: record this transition at import time.
          if(version.availability==='unavailable')new ArtifactsService(repository,options).markUnavailable({...identity,reason:version.unavailable_reason!});
          if(version.lifecycle_state==='archived')new ArtifactsService(repository,{...options,now:()=>version.archived_at!}).archiveVersion(identity);
        }
        db.prepare(`UPDATE ${ARTIFACT_TABLES.identities} SET created_at=? WHERE artifact_id=?`).run(snapshot.identity.created_at,snapshot.identity.artifact_id);
        check();
      });
    },
  };
}
