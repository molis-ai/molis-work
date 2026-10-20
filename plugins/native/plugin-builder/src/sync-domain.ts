import { isDeepStrictEqual } from 'node:util';
import { assertContract, assertProposalContract, assertEffects } from '@molis-ai/molis-work-plugin-sandbox';
import { pluginComponentChoices, validatePluginComponentPlans, validatePluginComponentNodes, validatePluginPresentation } from '@molis-ai/molis-work-design-system';
import { contractEffects, validateAgentDesign } from './agent-validation.js';
import { builderSyncInvalid, object } from './sync-shape.js';
import { validateBuilderContractFields } from './sync-contract-fields.js';
import type { AgentDesign } from './agent-model.js';

/** Historical capability/resource names describe content, never current permission or availability. */
export function validateBuilderDesignDomain(value: Record<string, unknown>): AgentDesign {
  try {
    assertContract(value.contract);
    validateBuilderContractFields(value.contract);
    if (value.catalog !== undefined && (typeof value.catalog !== 'string' || value.catalog.length > 200)) return builderSyncInvalid();
    const input = structuredClone(value); delete input.catalog;
    const capabilities = value.contract.operations.flatMap(operation => operation.effects.capabilities ?? []);
    const resources = value.contract.operations.flatMap(operation => operation.effects.resources ?? []);
    return validateAgentDesign(input, capabilities, resources, assertContract);
  } catch { return builderSyncInvalid(); }
}

/** A partially assembled draft may omit nodes; any present node must be the exact plan and a legal renderer choice. */
export function validateBuilderNodeDomain(design: AgentDesign | null, nodes: unknown, connected: unknown, complete = false): void {
  try {
    if (!Array.isArray(nodes) || nodes.length > 100 || !Array.isArray(connected) || connected.some(id => typeof id !== 'string') || new Set(connected).size !== connected.length) return builderSyncInvalid();
    if (!design) { if (nodes.length || connected.length) builderSyncInvalid(); return; }
    validatePluginComponentNodes(nodes, design.parts, design.contract);
    if (connected.some(id => !design.contract.operations.some(operation => operation.id === id)) || complete && nodes.length !== design.parts.length) builderSyncInvalid();
  } catch { return builderSyncInvalid(); }
}

/** Proposals are not frozen builds: validate the same schema vocabulary without fabricating behavioral examples. */
export function validateBuilderPreviewDomain(value: Record<string, unknown>, effects: unknown): void {
  try {
    assertProposalContract(value.contract); assertEffects(effects);
    validateBuilderContractFields(value.contract);
    const plans = validatePluginComponentPlans(value.parts, value.contract);
    if (value.presentation !== undefined) validatePluginPresentation(value.presentation, plans, value.contract);
    const expected = contractEffects({ contract: value.contract });
    if (!isDeepStrictEqual(expected, effects)) builderSyncInvalid();
  } catch { return builderSyncInvalid(); }
}

export function validateBuilderSnapshotLinks(value: Record<string, unknown>, design: AgentDesign | null): void {
  const operations = new Set(design?.contract.operations.map(operation => operation.id) ?? []);
  for (const key of Object.keys(object(value.checks ?? {}))) {
    if (!design || key !== 'global' && !operations.has(key)) builderSyncInvalid();
  }
  if (value.browserResult !== undefined) {
    const cases = object(value.browserResult).cases as Array<{ id: string }>;
    const ids = new Set(cases.map(item => item.id));
    if (!design || ids.size !== cases.length || cases.some(item => !design.acceptance.some(test => test.id === item.id))) builderSyncInvalid();
  }
}

/** A resumed UI decision must still point at a saved candidate, operation or legal renderer choice. */
export function validateBuilderDecisionLinks(value: Record<string, unknown>): void {
  const candidates = value.candidates as Array<{ id: string }>;
  const ids = new Set(candidates.map(candidate => candidate.id));
  if (ids.size !== candidates.length || value.chosen !== undefined && !ids.has(String(value.chosen))) builderSyncInvalid();
  const design = value.design as AgentDesign | null;
  if (value.rework !== undefined && Object.keys(object(value.rework)).some(id => !design?.contract.operations.some(operation => operation.id === id))) builderSyncInvalid();
  if (value.pendingPart !== undefined) {
    const pending = object(value.pendingPart), part = design?.parts.find(part => part.id === pending.id);
    if (!design || !part) return builderSyncInvalid();
    const choices = pending.candidates as string[], legal = new Set(pluginComponentChoices(part, design.contract).map(choice => String(choice.kind)));
    if (!choices.length || new Set(choices).size !== choices.length || choices.some(choice => !legal.has(choice))) builderSyncInvalid();
  }
}
