import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import { builderSyncInvalid } from './sync-shape.js';

/** The portable representation has no opaque extension bag in which native state or authority can hide. */
function fields(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) builderSyncInvalid();
}

export function validateBuilderContractFields(contract: SandboxPluginContract): void {
  fields(contract, ['version', 'pluginId', 'revision', 'operations', 'entities', 'pages', 'acceptance']);
  for (const operation of contract.operations) {
    fields(operation, ['id', 'kind', 'description', 'input', 'output', 'errors', 'effects', 'examples']);
    if (operation.description !== undefined && typeof operation.description !== 'string') builderSyncInvalid();
    for (const error of operation.errors) fields(error, ['code', 'description']);
    for (const example of operation.examples) fields(example, ['input', 'output', 'outputIncludes', 'error']);
  }
  for (const entity of contract.entities) {
    fields(entity, ['id', 'schema', 'description']);
    if (entity.description !== undefined && typeof entity.description !== 'string') builderSyncInvalid();
  }
  for (const page of contract.pages) {
    fields(page, ['id', 'title', 'regions']);
    for (const region of page.regions) {
      fields(region, ['id', 'title', 'description', 'operationIds']);
      if (region.description !== undefined && typeof region.description !== 'string') builderSyncInvalid();
    }
  }
  for (const test of contract.acceptance) {
    fields(test, ['id', 'description', 'steps']);
    for (const step of test.steps) fields(step, ['description', 'operationId', 'input', 'expected']);
  }
}
