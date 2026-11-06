import type { FixedVersionRecord, RecordFixedVersionInput } from '@molis-ai/molis-work-contracts/modules/artifacts';
import { canonicalArtifactJson } from './content.js';
import { ArtifactsRepository, type ArtifactsSqliteDatabase, type VersionStoreTables } from './repository.js';
import { ArtifactsService, type ArtifactsServiceOptions } from './service.js';
import type { ArtifactReplicationContext } from './replication.js';
import { fixedVersionInvalid as fail, fixedVersionRegistration, validateFixedVersionBundle, type PortableVersionBundle } from './fixed-version-replication-shape.js';

/** The same immutable-version engine in its two owner-declared stores. Tables are never selected by a network value. */
export function createFixedVersionReplication<R extends FixedVersionRecord>(db: ArtifactsSqliteDatabase, context: ArtifactReplicationContext, options: ArtifactsServiceOptions, tables: VersionStoreTables) {
  const repository = new ArtifactsRepository<R>(db, tables);
  const check = () => { context.authorize(); if (!context.spaceId || !context.projectId) fail('固定版本同步缺少可信空间'); };
  const validate = (input: unknown) => validateFixedVersionBundle<R>(input, context, tables.library);
  const service = (at?: string) => new ArtifactsService<R, RecordFixedVersionInput>(repository, {
    ...options, kind: tables.library ? 'artifact' : 'process_item', ...(at ? { now: () => at } : {}),
  });
  return {
    read(artifactId: string): PortableVersionBundle<R> | null {
      check();
      const identity = repository.getIdentity(context.projectId, artifactId);
      if (!identity) return null;
      const { project_id: _project, ...portableIdentity } = identity;
      const versions = repository.listVersions(context.projectId, artifactId).map(({ project_id: _project, ...version }) => version);
      const result = validate({ format: 1, spaceId: context.spaceId, projectId: context.projectId, identity: portableIdentity, versions });
      check(); return result;
    },
    apply(input: unknown): void {
      check();
      const snapshot = validate(input);
      repository.immediate(() => {
        check();
        const existing = repository.getIdentityById(snapshot.identity.artifact_id);
        if (existing) {
          const { project_id, ...identity } = existing;
          if (project_id !== context.projectId || canonicalArtifactJson(identity) !== canonicalArtifactJson(snapshot.identity)) fail('固定版本身份冲突');
        }
        const incoming = new Set(snapshot.versions.map(version => version.version));
        if (repository.listVersions(context.projectId, snapshot.identity.artifact_id).some(version => !incoming.has(version.version))) fail('远端缺少本机已有版本');
        for (const version of snapshot.versions) {
          check();
          const registration = fixedVersionRegistration(version, context.projectId, tables.library);
          const result = service(version.created_at).registerVersion(registration);
          if (result.artifact.created_at !== version.created_at) fail('同版本历史不一致');
          if (result.artifact.lifecycle_state === 'archived' && version.lifecycle_state !== 'archived') fail('不能通过同步撤销归档');
          if (result.artifact.availability === 'unavailable' && version.availability !== 'unavailable') fail('不能通过同步覆盖不可用状态');
          if (result.artifact.availability === 'unavailable' && result.artifact.unavailable_reason !== version.unavailable_reason) fail('不可用原因冲突');
          if (result.artifact.lifecycle_state === 'archived' && (result.artifact.archived_at !== version.archived_at || result.artifact.archived_by !== version.archived_by)) fail('归档历史冲突');
          const reference = { project_id: context.projectId, artifact_id: version.artifact_id, version: version.version, actor_id: version.owner_actor_id };
          if (version.availability === 'unavailable') service().markUnavailable({ ...reference, reason: version.unavailable_reason! });
          if (version.lifecycle_state === 'archived') service(version.archived_at!).archiveVersion(reference);
        }
        db.prepare('UPDATE ' + tables.identities + ' SET created_at=? WHERE artifact_id=?').run(snapshot.identity.created_at, snapshot.identity.artifact_id);
        check();
      });
    },
  };
}
