import {
  defineWorkflowContentActions, definePlacementRelationAction, defineSearchEntriesAction, defineResumeSummaryAction, defineSubjectContextAction, defineWorkTerminalPromptAction,
  PLACEMENT_RELATION_ROLES, type ActionDefinition, type ActionMetadata, type PlacementRelationRole, type PlacementRelationTarget,
} from '@molis-ai/molis-work-contracts/platform/actions';
import { isUiSubjectContextKind, pluginErrors } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxProtocolOperation, SandboxReadOperation } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { definePresentationOverviewAction, definePresentationValuesAction, PRESENTATION_LIMITS } from '@molis-ai/molis-work-contracts/platform/presentation';
import {
  SETTINGS_READ_INPUT_SCHEMA, SETTINGS_READ_INPUT_TYPE, SETTINGS_READ_OUTPUT_SCHEMA,
  SETTINGS_READ_OUTPUT_TYPE, SETTINGS_WRITE_INPUT_SCHEMA, SETTINGS_WRITE_INPUT_TYPE,
} from '@molis-ai/molis-work-contracts/platform/settings';
import { PLUGIN_ICON_NAMES } from './ui/icon-names.js';
import { canonicalJsonText, isRecord } from './json-value.js';

interface Identity { pluginId?: string; stationId?: string; capabilityId: string; version: number; title: string; scope: ActionMetadata['scope']; permissions: readonly string[] }
const schemaIdentity: Identity = { capabilityId: 'sandbox.protocol', version: 1, title: 'Sandbox read protocol', scope: 'project', permissions: [] };
const localStores = new Set(['storage', 'artifacts', 'projectDatabase', 'homeDatabase', 'ownerFiles']);
const invalid = (message: string) => pluginErrors.declaration_invalid(message);
const subjectKind = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const validRelation = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9_.-]{0,63}$/.test(value);

function definitionOf(protocol: unknown, { pluginId, capabilityId, version, title, scope, permissions }: Identity): ActionDefinition {
  if (!isRecord(protocol)) throw invalid('read_protocol must be a fixed protocol object');
  const keys = Object.keys(protocol);
  if (protocol.kind === 'subject_context' && keys.length === 2 && subjectKind(protocol.subject_kind)) {
    return defineSubjectContextAction(capabilityId, version, protocol.subject_kind, title, [...permissions], scope);
  }
  if (protocol.kind === 'presentation_values' && keys.length === 2 && Array.isArray(protocol.subject_kinds)
    && protocol.subject_kinds.length > 0 && protocol.subject_kinds.length <= PRESENTATION_LIMITS.objects
    && protocol.subject_kinds.every(subjectKind) && new Set(protocol.subject_kinds).size === protocol.subject_kinds.length) {
    return definePresentationValuesAction(capabilityId, version, protocol.subject_kinds, title, permissions, scope);
  }
  if (protocol.kind === 'presentation_overview' && keys.length === 1) {
    return definePresentationOverviewAction(capabilityId, version, title, permissions, scope);
  }
  if (protocol.kind === 'search_entries' && keys.length === 2 && Array.isArray(protocol.kinds) && protocol.kinds.length > 0 && protocol.kinds.length <= 20) {
    const kinds = protocol.kinds.map(entry => {
      if (!isRecord(entry) || !Object.keys(entry).every(key => ['kind', 'title', 'glyph'].includes(key))
        || !validRelation(entry.kind) || !subjectKind(entry.title)
        || entry.glyph !== undefined && (typeof entry.glyph !== 'string' || !(PLUGIN_ICON_NAMES as readonly string[]).includes(entry.glyph))) {
        throw invalid('search_entries requires named object kinds and supported glyphs');
      }
      // Registration binds the verified manifest's surface; the standalone schema pass only checks the shape.
      return { kind: entry.kind, title: entry.title, surface: pluginId ?? 'sandbox', ...(typeof entry.glyph === 'string' ? { glyph: entry.glyph } : {}) };
    });
    if (new Set(kinds.map(entry => entry.kind)).size !== kinds.length) throw invalid('search_entries object kinds must be unique');
    return defineSearchEntriesAction(capabilityId, version, kinds, title, permissions, scope);
  }
  if (protocol.kind === 'resume_summary' && keys.length === 2 && Array.isArray(protocol.subject_kinds)
    && protocol.subject_kinds.length > 0 && protocol.subject_kinds.length <= 20
    && protocol.subject_kinds.every(subjectKind) && new Set(protocol.subject_kinds).size === protocol.subject_kinds.length) {
    return defineResumeSummaryAction(capabilityId, version, protocol.subject_kinds, title, [...permissions]);
  }
  if (protocol.kind === 'work_terminal_prompt' && keys.length === 2 && isUiSubjectContextKind(protocol.subject_kind)) {
    return defineWorkTerminalPromptAction(capabilityId, version, protocol.subject_kind, title, [...permissions]);
  }
  throw invalid('read_protocol must name one of the platform read protocols with its subject kinds');
}

/** Only the protocol selection comes from the package. The platform supplies the schemas and execution metadata. */
export function sandboxReadProtocolAction(operation: SandboxReadOperation, identity: Identity = schemaIdentity): ActionDefinition {
  if (operation.kind !== 'query' || operation.external !== undefined || operation.background_job !== undefined
    || Object.entries(operation.effects).some(([key, values]) => !localStores.has(key) || !Array.isArray(values) || values.some(value => value !== 'read'))) {
    throw invalid('read_protocol only accepts local read effects');
  }
  const definition = definitionOf(operation.read_protocol, identity);
  if (canonicalJsonText(operation.input) !== canonicalJsonText(definition.action.input_schema)
    || canonicalJsonText(operation.output) !== canonicalJsonText(definition.action.output_schema)) {
    throw invalid('read_protocol input and output must be the platform schemas');
  }
  const { project_reach, ...action } = definition.action;
  // The package's Home overview uses its own data. This declaration cannot give it cross-project reach.
  void project_reach;
  return { ...definition, action: { ...action, effect: 'read', scheduling: 'concurrent', execution: { cost: 'none' } } };
}

function actionProtocolDefinitionOf(protocol: unknown, operation: SandboxProtocolOperation, { stationId, capabilityId, version, title, scope, permissions }: Identity): ActionDefinition {
  if (!isRecord(protocol)) throw invalid('action_protocol must be a fixed protocol object');
  if (protocol.kind === 'placement_relation') {
    const allowedKeys = new Set(['kind', 'relation', 'role', 'target', 'subject_kinds']);
    if (Object.keys(protocol).some(key => !allowedKeys.has(key))) throw invalid('action_protocol placement_relation has unknown fields');
    if (!validRelation(protocol.relation)) throw invalid('action_protocol placement_relation requires a valid relation id');
    const role = protocol.role as PlacementRelationRole;
    if (!(PLACEMENT_RELATION_ROLES as readonly string[]).includes(role)) throw invalid('action_protocol placement_relation role is invalid');
    const expectedKind = role === 'list' || role === 'candidates' ? 'query' : 'command';
    if (operation.kind !== expectedKind) throw invalid(`action_protocol placement_relation ${role} must be a ${expectedKind}`);
    if (role === 'list' && !isRecord(protocol.target)) throw invalid('action_protocol placement_relation list requires target');
    if (role !== 'list' && protocol.target !== undefined) throw invalid('action_protocol placement_relation target is only allowed on list');
    const kinds = protocol.subject_kinds === undefined ? [] : Array.isArray(protocol.subject_kinds) && protocol.subject_kinds.length <= 20
      && protocol.subject_kinds.every(subjectKind) && new Set(protocol.subject_kinds).size === protocol.subject_kinds.length
      ? protocol.subject_kinds : (() => { throw invalid('action_protocol placement_relation subject_kinds must be unique strings'); })();
    return definePlacementRelationAction(protocol.relation, role, capabilityId, version, {
      kinds, title, description: operation.description || title, permissions,
      ...(role === 'list' ? { target: protocol.target as PlacementRelationTarget } : {}),
    });
  }
  if (protocol.kind === 'workflow_receive') {
    if (Object.keys(protocol).length !== 4 || !subjectKind(protocol.title) || !validRelation(protocol.subject_kind)
      || typeof protocol.icon !== 'string' || !(PLUGIN_ICON_NAMES as readonly string[]).includes(protocol.icon)
      || operation.kind !== 'command' || scope !== 'project') throw invalid('workflow_receive must be a named project command with a registered icon and object kind');
    // A published operation keeps its own station across upgrades. Packages cannot register another owner's station id.
    const id = stationId ?? 'sandbox-station';
    const { receive } = defineWorkflowContentActions({ id, title: protocol.title, icon: protocol.icon, subject_kind: protocol.subject_kind,
      read_permissions: [], write_permissions: permissions });
    return { ...receive, capability_id: capabilityId, version };
  }
  if (protocol.kind === 'settings') {
    const keys = Object.keys(protocol);
    if (keys.length !== 2 || (protocol.role !== 'read' && protocol.role !== 'write')) {
      throw invalid('action_protocol settings must specify role: read or write');
    }
    const expectedKind = protocol.role === 'read' ? 'query' : 'command';
    if (operation.kind !== expectedKind) throw invalid(`action_protocol settings ${protocol.role} must be a ${expectedKind}`);
    const isRead = protocol.role === 'read';
    return {
      capability_id: capabilityId, version, operation: expectedKind,
      action: {
        kind: isRead ? 'query' : 'operation', effect: isRead ? 'read' : 'write', scope, title,
        description: operation.description || title, permissions: [...permissions], subject_kinds: [],
        audiences: isRead ? ['user', 'plugin', 'agent'] : ['user'],
        input_type: isRead ? SETTINGS_READ_INPUT_TYPE : SETTINGS_WRITE_INPUT_TYPE,
        input_schema: isRead ? SETTINGS_READ_INPUT_SCHEMA : SETTINGS_WRITE_INPUT_SCHEMA,
        output_type: SETTINGS_READ_OUTPUT_TYPE, output_schema: SETTINGS_READ_OUTPUT_SCHEMA,
      },
    };
  }
  throw invalid('action_protocol must name placement_relation or settings');
}

/** Fixed-schema platform action protocols (`placement_relation` and `settings`) for signed sandbox packages. */
export function sandboxActionProtocolAction(operation: SandboxProtocolOperation, identity: Identity = schemaIdentity): ActionDefinition {
  const allowedAccess = operation.kind === 'query' ? ['read'] : ['read', 'write'];
  if (operation.external !== undefined || operation.background_job !== undefined
    || Object.entries(operation.effects).some(([key, values]) => !localStores.has(key) || !Array.isArray(values) || values.some(value => !allowedAccess.includes(value)))) {
    throw invalid('action_protocol only accepts local store effects matching its operation kind');
  }
  const definition = actionProtocolDefinitionOf(operation.action_protocol, operation, identity);
  if (canonicalJsonText(operation.input) !== canonicalJsonText(definition.action.input_schema)
    || canonicalJsonText(operation.output) !== canonicalJsonText(definition.action.output_schema)) {
    throw invalid('action_protocol input and output must be the platform schemas');
  }
  return { ...definition, action: { ...definition.action, scheduling: 'concurrent', execution: { cost: 'none' } } };
}
