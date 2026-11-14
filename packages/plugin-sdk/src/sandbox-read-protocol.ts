import { defineSubjectContextAction, type ActionDefinition, type ActionMetadata } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxReadOperation } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { definePresentationOverviewAction, definePresentationValuesAction, PRESENTATION_LIMITS } from '@molis-ai/molis-work-contracts/platform/presentation';
import { canonicalJsonText, isRecord } from './json-value.js';

interface Identity { capabilityId: string; version: number; title: string; scope: ActionMetadata['scope']; permissions: readonly string[] }
const schemaIdentity: Identity = { capabilityId: 'sandbox.protocol', version: 1, title: 'Sandbox read protocol', scope: 'project', permissions: [] };
const localReads = new Set(['storage', 'artifacts', 'projectDatabase', 'homeDatabase', 'ownerFiles']);
const invalid = (message: string) => pluginErrors.declaration_invalid(message);
const subjectKind = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function definitionOf(protocol: unknown, { capabilityId, version, title, scope, permissions }: Identity): ActionDefinition {
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
  throw invalid('read_protocol must name one of the platform read protocols with its subject kinds');
}

/** Only the protocol selection comes from the package. The platform supplies the schemas and execution metadata. */
export function sandboxReadProtocolAction(operation: SandboxReadOperation, identity: Identity = schemaIdentity): ActionDefinition {
  if (operation.kind !== 'query' || operation.external !== undefined || operation.background_job !== undefined
    || Object.entries(operation.effects).some(([key, values]) => !localReads.has(key) || !Array.isArray(values) || values.some(value => value !== 'read'))) {
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
