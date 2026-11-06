import { defineErrorCodes } from '@molis-ai/molis-work-contracts/platform/actions';
import type { ArtifactIdentityRecord, ArtifactVersionRecord, FixedVersionRecord } from '@molis-ai/molis-work-contracts/modules/artifacts';
import { canonicalArtifactJson, artifactContentDigest, artifactContentSize, normalizeArtifactMetadata, normalizeArtifactPayload } from './content.js';
import { normalizeRegistration } from './registration.js';
import type { ArtifactReplicationContext } from './replication.js';

export interface PortableVersionBundle<R extends FixedVersionRecord> {
  format: 1;
  spaceId: string;
  projectId: string;
  identity: Omit<ArtifactIdentityRecord, 'project_id'>;
  versions: Omit<R, 'project_id'>[];
}
const errors = defineErrorCodes('artifacts', { sync_invalid: 'invalid' });
export function fixedVersionInvalid(message: string): never { throw errors.sync_invalid(message); }
const IDENTITY_FIELDS = ['artifact_id', 'owner_actor_id', 'producer_plugin_id', 'producer_binding_signature', 'created_at'];
const VERSION_FIELDS = ['artifact_id', 'version', 'artifact_type_id', 'schema_version', 'producer_plugin_id', 'producer_plugin_version', 'producer_binding_signature', 'owner_actor_id', 'content_kind', 'payload', 'content_ref', 'content_digest', 'size_bytes', 'metadata', 'scope', 'availability', 'unavailable_reason', 'lifecycle_state', 'supersedes_version', 'created_by', 'created_at', 'archived_at', 'archived_by'];
function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fixedVersionInvalid('固定版本同步格式错误');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== fields.length || fields.some(key => !Object.hasOwn(row, key))) fixedVersionInvalid('固定版本同步字段不匹配');
  return row;
}
function text(value: unknown): void {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 1024) fixedVersionInvalid('固定版本标识不合法');
}
function timestamp(value: unknown): void {
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) fixedVersionInvalid('固定版本时间不合法');
}
function portableStrings(value: unknown, depth = 0): void {
  if (depth > 64) fixedVersionInvalid('固定版本内容嵌套过深');
  if (typeof value === 'string' && /(?:^|[\s("'])\b(?:file|blob):/i.test(value)) fixedVersionInvalid('固定版本内容仍依赖本机文件');
  if (value && typeof value === 'object') for (const child of Object.values(value)) portableStrings(child, depth + 1);
}
/** Exactly one current shape per store. The library's presentation fields never turn process items into library entries. */
export function validateFixedVersionBundle<R extends FixedVersionRecord>(input: unknown, context: ArtifactReplicationContext, library: boolean): PortableVersionBundle<R> {
  const row = object(input, ['format', 'spaceId', 'projectId', 'identity', 'versions']);
  if (row.format !== 1 || row.spaceId !== context.spaceId || row.projectId !== context.projectId) fixedVersionInvalid('固定版本空间或版本不匹配');
  const identity = object(row.identity, IDENTITY_FIELDS);
  for (const field of IDENTITY_FIELDS.filter(key => key !== 'created_at')) text(identity[field]);
  timestamp(identity.created_at);
  if (!Array.isArray(row.versions) || !row.versions.length || row.versions.length > 1000) fixedVersionInvalid('固定版本列表不合法');
  let previous = 0;
  const versions = new Set<number>();
  for (const value of row.versions) {
    const record = object(value, library ? [...VERSION_FIELDS, 'origin', 'title', 'media_type', 'trace'] : VERSION_FIELDS);
    for (const field of ['artifact_id', 'owner_actor_id', 'producer_plugin_id', 'producer_binding_signature']) if (record[field] !== identity[field]) fixedVersionInvalid('固定版本身份不一致');
    for (const field of ['artifact_type_id', 'producer_plugin_version', 'created_by']) text(record[field]);
    if (typeof record.version !== 'number' || !Number.isSafeInteger(record.version) || record.version <= previous
      || typeof record.schema_version !== 'number' || !Number.isSafeInteger(record.schema_version) || record.schema_version < 1) fixedVersionInvalid('固定版本顺序不合法');
    if (record.supersedes_version !== null && (typeof record.supersedes_version !== 'number' || !versions.has(record.supersedes_version))) fixedVersionInvalid('被替代版本缺失');
    previous = record.version; versions.add(record.version);
    if (record.scope !== 'personal') fixedVersionInvalid('团队固定版本尚不支持同步');
    if (record.content_kind !== 'inline' || record.content_ref !== null) fixedVersionInvalid('固定版本附件本体尚未同步');
    portableStrings(record.payload); portableStrings(record.metadata);
    const serialized = canonicalArtifactJson(normalizeArtifactPayload(record.payload));
    if (record.content_digest !== artifactContentDigest(serialized) || record.size_bytes !== artifactContentSize(serialized)) fixedVersionInvalid('固定版本正文校验失败');
    normalizeArtifactMetadata(record.metadata); timestamp(record.created_at);
    if (typeof record.availability !== 'string' || typeof record.lifecycle_state !== 'string'
      || !['available', 'unavailable'].includes(record.availability) || !['active', 'archived'].includes(record.lifecycle_state)) fixedVersionInvalid('固定版本状态不合法');
    if (record.availability === 'available' ? record.unavailable_reason !== null : typeof record.unavailable_reason !== 'string' || !record.unavailable_reason.trim()) fixedVersionInvalid('固定版本可用性不合法');
    if (record.lifecycle_state === 'archived') {
      timestamp(record.archived_at);
      if (record.archived_by !== identity.owner_actor_id) fixedVersionInvalid('归档作者与 owner 不一致');
    } else if (record.archived_at !== null || record.archived_by !== null) fixedVersionInvalid('固定版本归档状态不一致');
    normalizeRegistration(fixedVersionRegistration(value as Omit<R, 'project_id'>, context.projectId, library), { library, readOwner: owner => owner });
  }
  if (Buffer.byteLength(JSON.stringify(row), 'utf8') > 100000000) fixedVersionInvalid('固定版本超过当前传输上限');
  return input as PortableVersionBundle<R>;
}
/** The ordinary owner registration validator and importer consume exactly the same fields. */
export function fixedVersionRegistration(version: Omit<FixedVersionRecord, 'project_id'>, projectId: string, library: boolean) {
  const presentation = version as Omit<ArtifactVersionRecord, 'project_id'>;
  return {
    project_id: projectId, artifact_id: version.artifact_id, version: version.version,
    actor_id: version.created_by, owner_actor_id: version.owner_actor_id,
    artifact_type_id: version.artifact_type_id, schema_version: version.schema_version,
    producer: { plugin_id: version.producer_plugin_id, plugin_version: version.producer_plugin_version, binding_signature: version.producer_binding_signature },
    content: { kind: 'inline' as const, payload: version.payload }, metadata: version.metadata,
    scope: 'personal' as const, expected_digest: version.content_digest, supersedes_version: version.supersedes_version,
    ...(library ? { origin: presentation.origin, title: presentation.title, media_type: presentation.media_type, trace: presentation.trace } : {}),
  };
}
