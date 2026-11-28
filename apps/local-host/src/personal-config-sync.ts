import { ActionError, LOCAL_PERSON_ACTOR_ID } from '@molis-ai/molis-work-contracts/platform/actions';
import { attentionContentReplicationDefinition } from '@molis-ai/molis-work-module-attention-resumption';
import { FUNCTIONS_HOME_STORE, FUNCTIONS_STORE_BASELINE, judgmentConfigReplica } from '@molis-ai/molis-work-module-judgment-rules';
import { blueprintConfigReplica, BLUEPRINTS_BASELINE, BLUEPRINTS_STORE } from '@molis-ai/molis-work-service-blueprints';
import { SURFACE_CONFIG_JOURNAL, surfaceConfigOwner } from '@molis-ai/molis-work-service-surfaces';
import { PERSON_SETTINGS_BASELINE, PERSON_SETTINGS_STORE, personSettingsConfigReplica, type PersonSettingsInstallation } from '@molis-ai/molis-work-service-person-settings';
import { createSyncConflictState, createSyncJsonContent } from '@molis-ai/molis-work-plugin-sdk';
import { assertPortableConfig, createProjectContentReplicaFactory, openBaselineHomeSqlite, personalConfigReplica, readStorageSpace, validateProjectContentReplication } from '@molis-ai/molis-work-storage';
import { syncNamespace, type SyncRegistration, type SyncSelection } from '@molis-ai/molis-work-module-sync-replication';
import type { SyncReplicaAdapter, SyncEvent } from '@molis-ai/molis-work-contracts/platform/sync-transport';
import { AGENT_DEFINITIONS_BASELINE, AGENT_DEFINITIONS_STORE } from './agent-definitions/agent-definitions.js';
import { homeAgentDefinitions } from './agent-definitions/builtin-registrations.js';
import { promptOverrideConfigReplica } from './agent-definitions/prompt-overrides-replica.js';
import { PLATFORM_SYNC_COLLECTIONS } from './platform-sync-catalog.js';
import { ATTENTION_SYNC_JOURNAL } from './project-database-schema.js';
import { projectPlatformSyncRegistration } from './personal-project-approval-sync.js';
import { attentionChanged } from './attention-changes.js';
import { ATTENTION_OVERVIEW_SOURCE } from './partition-platform-services.js';
import { partitionChanged } from './partition-plugin-host.js';
import { appearanceForHome } from './ui-locale-memory.js';
import { liveObservation } from './observation-live.js';
import type { SyncCatalogReader } from './personal-runtime-sync-authority.js';
import type { LocalWebCatalogRunner } from './web-project-settings.js';

type Policy = () => { revision: number; selections: readonly SyncSelection[] };
const ATTENTION_KIND = 'project_attention';
const attentionDefinition = attentionContentReplicationDefinition(assertPortableConfig);
const attentionReplica = createProjectContentReplicaFactory([attentionDefinition], ATTENTION_SYNC_JOURNAL, ATTENTION_KIND);

export function personalConfigRegistrations(context: { home: string; spaceId: string; actor: string; authorize(): void;
  catalog: LocalWebCatalogRunner; readCatalog?: SyncCatalogReader; selected: Policy;
  /** The Home's installations and their declared person settings; without it no setting is portable here, so none is sent or applied. */
  personSettings?: PersonSettingsInstallation }): SyncRegistration[] {
  const { home, spaceId, actor, catalog, readCatalog, selected } = context;
  const check = () => {
    context.authorize();
    const space = readStorageSpace(home);
    if (space?.kind !== 'personal' || space.spaceId !== spaceId || space.ownerUserId !== actor) throw new ActionError('actions.forbidden', '同步配置不属于当前个人空间');
  };
  type HomeDatabase = ReturnType<typeof openBaselineHomeSqlite>;
  const own = <T>(open: () => HomeDatabase, run: (db: HomeDatabase) => T): T => {
    check();
    const db = open();
    try { return run(db); } finally { db.close(); }
  };
  function homeConfig(owner: 'appearance' | 'prompt-overrides' | 'blueprints' | 'judgment-rules' | 'person-settings',
    open: <T>(authorize: () => void, run: (replica: SyncReplicaAdapter) => T) => T): SyncRegistration {
    const { selection, title } = PLATFORM_SYNC_COLLECTIONS.find(row => row.owner === owner)!;
    const namespace = syncNamespace(selection);
    const authority = (revision: number) => {
      check();
      const policy = selected();
      if (policy.revision !== revision || !policy.selections.some(row => syncNamespace(row) === namespace))
        throw new ActionError('actions.forbidden', '个人配置同步未授权或授权已变化');
    };
    return { selection, title, content: createSyncJsonContent({ spaceId, authorize: () => authority(selected().revision) }),
      async refresh() { check(); },
      async prepare() { authority(selected().revision); },
      withReplica(run) {
        const revision = selected().revision;
        const authorize = () => authority(revision);
        authorize();
        return open(authorize, run);
      },
    };
  }
  return [
    homeConfig('appearance', (authorize, run) => run(appearanceForHome(home).replica(spaceId, actor, authorize))),
    homeConfig('prompt-overrides', (authorize, run) => own(
      () => openBaselineHomeSqlite(home, AGENT_DEFINITIONS_STORE, AGENT_DEFINITIONS_BASELINE),
      db => run(promptOverrideConfigReplica(db, actor, spaceId, authorize, homeAgentDefinitions(home))))),
    homeConfig('blueprints', (authorize, run) => own(
      () => openBaselineHomeSqlite(home, BLUEPRINTS_STORE, BLUEPRINTS_BASELINE),
      db => run(blueprintConfigReplica(db, actor, spaceId, authorize)))),
    homeConfig('judgment-rules', (authorize, run) => own(
      () => openBaselineHomeSqlite(home, FUNCTIONS_HOME_STORE.path, FUNCTIONS_STORE_BASELINE),
      db => run(judgmentConfigReplica(db, spaceId, authorize)))),
    // Only a preference a plugin installed here declares portable goes out or comes in (S-person-settings-private).
    homeConfig('person-settings', (authorize, run) => own(
      () => openBaselineHomeSqlite(home, PERSON_SETTINGS_STORE, PERSON_SETTINGS_BASELINE),
      db => run(personSettingsObserved(home, personSettingsConfigReplica(db, spaceId, authorize, context.personSettings ?? (() => null)))))),
    projectPlatformSyncRegistration({
      owner: 'surfaces', journal: SURFACE_CONFIG_JOURNAL, denied: '呈现组合的同步授权或项目已变化', locate: projectLink,
      replica: (db, id, scope, authorize) => personalConfigReplica(db, SURFACE_CONFIG_JOURNAL, { spaceId: scope, authorize }, surfaceConfigOwner(db, id, actor)),
    }, home, spaceId, check, catalog, readCatalog, selected),
    projectPlatformSyncRegistration({
      owner: 'attention', journal: ATTENTION_KIND, denied: '注意事项的同步授权或项目已变化', locate: projectLink,
      onMutated: projectId => {
        partitionChanged(home, projectId, ATTENTION_OVERVIEW_SOURCE);
        attentionChanged(projectId);
      },
      replica: (db, projectId, scope, authorize, title) => {
        const replica = attentionReplica(db, {
          spaceId: scope, projectId, authorize, conflictState: createSyncConflictState,
          get title() {
            assertPortableConfig(title, 512);
            return title;
          },
        });
        const authorizeKey = (key: string, value?: unknown) => {
          authorize();
          if (key !== JSON.stringify([projectId, ATTENTION_KIND, projectId])) throw new ActionError('actions.forbidden', '注意事项不属于当前项目');
          if (value === undefined || value === null) return;
          assertPortableConfig(value, 512 * 1024);
          validateProjectContentReplication(value, [attentionDefinition], { spaceId: scope, projectId, authorize });
        };
        return { ...replica, authorizeKey,
          receive(event: SyncEvent, options) {
            authorizeKey(event.key, event.value);
            replica.receive(event, options);
          },
        };
      },
    }, home, spaceId, check, catalog, readCatalog, selected),
  ];
}

const projectLink = (project: string) => '/projects/' + encodeURIComponent(project) + '/';

/**
 * The person-settings channel in the work records (batch 108): one record per change received from another device and per upload the server
 * confirmed, with how it ended. Never the setting's key or value: those are the person's, and the synced row is their own history.
 */
export function personSettingsObserved(home: string, replica: SyncReplicaAdapter): SyncReplicaAdapter {
  const record = (stage: 'receive' | 'acknowledge', outcome: 'succeeded' | 'failed') => liveObservation(home)?.sink('home')
    .bind({ kind: 'background', entry: 'background', actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null })
    .record({ fact: 'home.person_settings_sync', outcome, stage, occurred_at: new Date().toISOString() });
  return new Proxy(replica, { get(target, property) {
    const value = Reflect.get(target, property, target) as unknown;
    if (typeof value !== 'function') return value;
    if (property !== 'receive' && property !== 'acknowledge') return value.bind(target);
    return (...args: unknown[]) => {
      try {
        const result = value.apply(target, args);
        record(property, 'succeeded');
        return result;
      } catch (error) {
        record(property, 'failed');
        throw error;
      }
    };
  } });
}
