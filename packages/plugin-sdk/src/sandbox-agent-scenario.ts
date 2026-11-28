import { createHash } from 'node:crypto';
import type { ActionMetadata } from '@molis-ai/molis-work-contracts/platform/actions';
import { pluginErrors } from '@molis-ai/molis-work-contracts/platform/plugin';
import type { SandboxPluginContract } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';

type Scenario = NonNullable<ActionMetadata['agent_scenario']>;
const word = (value: unknown, limit: number): value is string => typeof value === 'string' && !!value.trim() && value.length <= limit;
const validId = (value: unknown): value is string => word(value, 64) && /^[a-z][a-z0-9_-]*$/.test(value);

/** Resolve every tool and review against this signed package. Labels describe the card; the Host retains the original input and caller. */
export function sandboxAgentTools(contract: SandboxPluginContract, buildId: string): Map<string, Scenario> {
  const pack = contract.agent_scenario;
  const tools = new Map<string, Scenario>();
  if (pack === undefined) return tools;
  const invalid = () => pluginErrors.declaration_invalid('助理场景包须登记自己的工具、使用规则和审查字段');
  if (!pack || !validId(pack.id) || !word(pack.title, 80) || !word(pack.instructions, 2000) || !Array.isArray(pack.tools) || !pack.tools.length || pack.tools.length > 32) throw invalid();
  const namespace = 'signed.' + createHash('sha256').update(JSON.stringify([buildId, pack.id])).digest('hex').slice(0, 32);
  const kinds = new Map<string, string>();
  for (const tool of pack.tools) {
    const op = tool && contract.operations.find(operation => operation.id === tool.operation);
    if (!op || tools.has(op.id) || op.read_protocol || op.action_protocol || op.background_job || op.trusted_review) throw invalid();
    const review = tool.review;
    if (review !== undefined) {
      if (!review || op.kind !== 'command' || !validId(review.kind) || !word(review.title, 80) || !Array.isArray(review.fields)
        || !review.fields.length || review.fields.length > 12 || review.fields.some(row => !row || !word(row.label, 80) || !validId(row.field)
          || !op.input.properties || !Object.hasOwn(op.input.properties, row.field) || op.input.properties[row.field]?.type !== 'string')
        || new Set(review.fields.map(row => row.field)).size !== review.fields.length) throw invalid();
      const description = JSON.stringify([review.title, review.fields]);
      if (kinds.has(review.kind) && kinds.get(review.kind) !== description) throw invalid();
      kinds.set(review.kind, description);
    }
    tools.set(op.id, { id: namespace, title: pack.title, instructions: pack.instructions,
      ...(review ? { review: { kind: namespace + '.' + review.kind, title: review.title, fields: review.fields } } : {}) });
  }
  return tools;
}
