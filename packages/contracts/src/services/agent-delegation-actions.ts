import type { ActionDefinition, ActionSchema, ExactActionReference } from "../platform/actions.js";
import { TEXT_REF_SCHEMA, type TextRef } from "../platform/ui-text.js";
import type { AgentDelegationMode } from "./agent-delegations.js";

export type AgentDelegationActionChoice = {
  readonly action: ExactActionReference;
} & (
  | { readonly kind: "objects"; readonly operations: readonly { key: string; targets: readonly { key: string; ids: readonly string[] }[] }[] }
  | { readonly kind: "exact"; readonly input: Record<string, unknown> }
);

export interface AgentDelegationWorkChoice {
  readonly work_id: string;
  readonly lifetime: "work" | "ongoing";
}

export interface AgentDelegationProposal extends AgentDelegationWorkChoice {
  readonly choices: readonly AgentDelegationActionChoice[];
}

export interface AgentDelegationGrantInput extends AgentDelegationProposal {
  readonly expected_version: number;
  readonly candidate_digest: string;
  readonly mode: AgentDelegationMode;
  readonly expires_at: string | null;
}

export interface AgentDelegationToken {
  readonly expected_version: number;
  readonly id: string;
  readonly revision: number;
}

export interface AgentDelegationUpdateInput extends AgentDelegationWorkChoice, AgentDelegationToken {}

export interface AgentDelegationNarrowInput extends AgentDelegationUpdateInput {
  readonly keep: readonly {
    scope_index: number;
    operations?: readonly { row_index: number; targets: readonly { key: string; ids: readonly string[] }[] }[];
  }[];
  readonly mode: AgentDelegationMode;
  readonly expires_at: string | null;
}

export interface AgentDelegationModeInput extends AgentDelegationUpdateInput {
  readonly mode: "read-only" | "confirm";
}

/** Resolved labels are for display only. Each range shown is tied to its exact action and complete operation row. */
export interface AgentDelegationCandidate {
  readonly action: ExactActionReference;
  readonly title: string;
  readonly provider_title: string;
  readonly state: "ready" | "unavailable";
  readonly reason?: string;
  /** Complete canonical parameters, returned only to the trusted person after secret screening. */
  readonly exact_parameters?: string;
  readonly operations?: readonly {
    key: string; title: string; title_text?: TextRef;
    targets: readonly { key: string; title: string; title_text?: TextRef; values: readonly { id: string; label: string | TextRef }[] }[];
  }[];
}

export interface AgentDelegationProjection {
  readonly storage_version: number;
  readonly lifecycle: "open" | "ending" | "ended";
  readonly cancellation_pending: boolean;
  readonly selection: {
    readonly id: string;
    readonly revision: number;
    readonly mode: AgentDelegationMode;
    readonly expires_at: string | null;
    readonly revoked_at: string | null;
  } | null;
}

export interface AgentDelegationPreparation extends AgentDelegationProjection {
  readonly candidate_digest: string;
  readonly candidates: readonly AgentDelegationCandidate[];
}

const id = { type: "string", minLength: 1, maxLength: 300 } as const;
const number = { type: "integer", minimum: 1 } as const;
const mode = { type: "string", enum: ["read-only", "confirm", "automatic"] } as const;
const date = { anyOf: [{ type: "string", format: "date-time" }, { type: "null" }] } as const;
const digest = { type: "string", pattern: "^[a-f0-9]{64}$" } as const;
const object = (properties: Record<string, ActionSchema>): ActionSchema => ({ type: "object", additionalProperties: false, properties, required: Object.keys(properties) });
const action = object({ capability_id: id, version: number, provider_id: id });
const target = object({ key: id, ids: { type: "array", minItems: 1, maxItems: 50, uniqueItems: true, items: { type: "string", maxLength: 300 } } });
const targets = { type: "array", minItems: 1, maxItems: 16, items: target };
const choices = { type: "array", maxItems: 24, items: { oneOf: [
  object({ action, kind: { const: "exact" }, input: { type: "object" } }),
  object({ action, kind: { const: "objects" }, operations: { type: "array", minItems: 1, maxItems: 24, items: object({ key: id, targets }) } }),
] } } as const;
const at = { work_id: id, lifetime: { type: "string", enum: ["work", "ongoing"] } };
const proposal = { ...at, choices };
const grant = { ...proposal, expected_version: { type: "integer", minimum: 0 }, candidate_digest: digest, mode, expires_at: date };
const token = { expected_version: number, id, revision: number };
const label = { anyOf: [{ type: "string" }, TEXT_REF_SCHEMA] } as const;
const candidateTarget = { type: "object", additionalProperties: false, required: ["key", "title", "values"], properties: {
  key: id, title: { type: "string" }, title_text: TEXT_REF_SCHEMA, values: { type: "array", items: object({ id: { type: "string", maxLength: 300 }, label }) },
} } as const;
const candidateOperation = { type: "object", additionalProperties: false, required: ["key", "title", "targets"], properties: {
  key: id, title: { type: "string" }, title_text: TEXT_REF_SCHEMA, targets: { type: "array", items: candidateTarget },
} } as const;
const index = { type: "integer", minimum: 0, maximum: 23 };
const keep = { type: "array", maxItems: 24, items: { type: "object", additionalProperties: false, required: ["scope_index"], properties: {
  scope_index: index, operations: { type: "array", minItems: 1, maxItems: 24, items: object({ row_index: index, targets }) },
} } };
const projection = {
  storage_version: grant.expected_version, lifecycle: { type: "string", enum: ["open", "ending", "ended"] },
  cancellation_pending: { type: "boolean" },
  selection: { anyOf: [{ type: "null" }, object({ id, revision: number, mode, expires_at: date, revoked_at: date })] },
};
const selectionOutput = object(projection);
const prepareOutput = object({ ...projection, candidate_digest: digest, candidates: { type: "array", maxItems: 24,
  items: { type: "object", additionalProperties: false, required: ["action", "title", "provider_title", "state"], properties: {
    action, title: { type: "string" }, provider_title: { type: "string" }, state: { type: "string", enum: ["ready", "unavailable"] },
    reason: { type: "string" }, exact_parameters: { type: "string", maxLength: 12000 }, operations: { type: "array", items: candidateOperation },
  } },
} });

export const AGENT_DELEGATIONS_PROVIDER_ID = "system.agent-delegations";

function definition<I, O>(name: string, version: number, title: string, description: string, operation: "query" | "command", input_schema: ActionSchema, output_schema: ActionSchema): ActionDefinition<I, O> {
  return { capability_id: name, version, operation, provider_id: AGENT_DELEGATIONS_PROVIDER_ID, action: {
    title, description, kind: operation === "query" ? "query" : "operation", scope: "home", effect: operation === "query" ? "read" : "write",
    scheduling: "concurrent", audiences: operation === "query" ? ["user", "agent"] : ["user"], permissions: [], subject_kinds: [], input_schema, output_schema,
  } };
}

export const agentDelegationActions = {
  prepare: definition<AgentDelegationProposal, AgentDelegationPreparation>("agent.delegations.prepare", /* @version action.agent.delegations.prepare */ 1, "查看工作权限候选", "按当前工作范围与候选动作读取可授予的有限操作与目标摘要，不修改任何已存权限。", "query", object(proposal), prepareOutput),
  grant: definition<AgentDelegationGrantInput, AgentDelegationProjection>("agent.delegations.grant", /* @version action.agent.delegations.grant */ 1, "保存工作权限", "确认候选摘要后保存本次工作或持续生效的有限委托选择，并返回最新权限投影。", "command", object(grant), selectionOutput),
  narrow: definition<AgentDelegationNarrowInput, AgentDelegationProjection>("agent.delegations.narrow", /* @version action.agent.delegations.narrow */ 1, "收窄现有权限", "按读取时的存储版本收窄已保存的有限委托操作范围或有效期，并立即失效超出的在途许可。", "command", object({ ...at, ...token, keep, mode, expires_at: date }), selectionOutput),
  revoke: definition<AgentDelegationUpdateInput, AgentDelegationProjection>("agent.delegations.revoke", /* @version action.agent.delegations.revoke */ 1, "撤销现有权限", "按读取时的存储版本立即撤销这条工作或持续委托，并拒绝尚未派出的受控操作。", "command", object({ ...at, ...token }), selectionOutput),
  settle: definition<AgentDelegationUpdateInput, AgentDelegationProjection>("agent.delegations.settle", /* @version action.agent.delegations.settle */ 1, "核对原执行停止回执", "重试核对撤权或停止时的原执行运行取消回执，确认收口后更新待结算状态。", "command", object({ ...at, ...token }), selectionOutput),
  mode: definition<AgentDelegationModeInput, AgentDelegationProjection>("agent.delegations.mode", /* @version action.agent.delegations.mode */ 1, "收紧权限方式", "把当前工作的权限方式收紧为只读协助或修改前确认，立即停止沿用更宽的自动执行。", "command", object({ ...at, ...token, mode: { type: "string", enum: ["read-only", "confirm"] } }), selectionOutput),
};
