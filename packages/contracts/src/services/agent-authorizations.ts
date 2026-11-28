import type { ActionDefinition, ActionSchema, ExactActionReference } from "../platform/actions.js";
import type { ReviewDecisionSource } from "../platform/reviews.js";
import type { AgentDelegationMode } from "./agent-delegations.js";
import type { AgentDelegationCandidate, AgentDelegationNarrowInput } from "./agent-delegation-actions.js";
import type { TaskGrantCategoryReference, TaskGrantCategoryState } from "./agent-task-grants.js";

export const AUTHORIZATION_OWNERS = ["work-delegation", "run-app", "session-command", "task-grant", "mcp-client", "assistant-policy"] as const;
export type AuthorizationOwner = typeof AUTHORIZATION_OWNERS[number];
export type AuthorizationChangeKind = "narrow" | "revoke" | "confirm" | "read-only" | "disable" | "settle";
export type AuthorizationStatus = "active" | "restricted" | "revoked" | "expired" | "ended" | "unavailable" | "settling";

export interface AuthorizationKey { readonly owner: AuthorizationOwner; readonly id: string }
export interface AuthorizationFilter { readonly project_id?: string | null; readonly owners?: readonly AuthorizationOwner[]; readonly client_id?: string }
export interface AuthorizationEntry extends AuthorizationKey {
  readonly expected: string;
  readonly project_id: string | null;
  readonly title: string;
  readonly actor: string;
  readonly scope: readonly string[];
  readonly mode: AgentDelegationMode;
  readonly lifetime: "work" | "ongoing" | "run" | "session" | "task";
  readonly expires_at: string | null;
  readonly status: AuthorizationStatus;
  readonly source: ReviewDecisionSource | null;
  readonly recent_use_at: string | null;
  readonly changes: readonly AuthorizationChangeKind[];
  readonly reason?: string;
}
export interface AuthorizationList {
  readonly entries: readonly AuthorizationEntry[];
  readonly owners: readonly { owner: AuthorizationOwner; state: "complete" | "failed"; reason?: string }[];
  readonly clients: readonly { id: string; title: string }[];
}
export type AuthorizationDetail = AuthorizationEntry & {
  readonly availability?: "available" | "unavailable" | "unknown";
  readonly action?: ExactActionReference;
  readonly candidates?: readonly (Pick<AgentDelegationCandidate, "title" | "state" | "reason" | "exact_parameters" | "operations"> & { scope_index: number })[];
  readonly categories?: readonly TaskGrantCategoryState[];
};
export type AuthorizationChange = AuthorizationKey & { readonly expected: string } & (
  | { readonly owner: "work-delegation"; readonly kind: "narrow"; readonly keep: AgentDelegationNarrowInput["keep"] }
  | { readonly owner: "work-delegation"; readonly kind: "revoke" | "confirm" | "read-only" | "settle" }
  | { readonly owner: "task-grant"; readonly kind: "narrow"; readonly keep: readonly TaskGrantCategoryReference[] }
  | { readonly owner: "run-app" | "session-command" | "mcp-client"; readonly kind: "revoke" }
  | { readonly owner: "task-grant"; readonly kind: "revoke" }
  | { readonly owner: "assistant-policy"; readonly kind: "confirm" | "disable" }
);

const id = { type: "string", minLength: 1, maxLength: 2400 } as const;
const revision = { type: "string", maxLength: 300 } as const;
const owner = { enum: AUTHORIZATION_OWNERS } as const;
const object = (properties: Record<string, ActionSchema>, required = Object.keys(properties)): ActionSchema =>
  ({ type: "object", additionalProperties: false, properties, required });
const key = { owner, id };
const mutation = (owner: ActionSchema, kind: ActionSchema, fields: Record<string, ActionSchema> = {}) =>
  object({ ...key, owner, kind, expected: revision, ...fields });
const index = { type: "integer", minimum: 0, maximum: 23 } as const;
const targets = { type: "array", minItems: 1, maxItems: 16, items: object({ key: id, ids: { type: "array", minItems: 1, maxItems: 50,
  uniqueItems: true, items: { type: "string", maxLength: 300 } } }) } as const;
const scope = object({ scope_index: index, operations: { type: "array", minItems: 1, maxItems: 24, items: object({ row_index: index, targets }) } }, ["scope_index"]);
const category = object({ provider_id: id, group_id: id, installation: id }, ["provider_id"]);

export const AGENT_AUTHORIZATIONS_PROVIDER_ID = "system.agent-authorizations";
function action<I, O>(name: string, version: number, title: string, operation: "command" | "query", input_schema: ActionSchema): ActionDefinition<I, O> {
  return { capability_id: name, provider_id: AGENT_AUTHORIZATIONS_PROVIDER_ID, version, operation, action: { title, description: title, scope: "home",
    audiences: ["user"], permissions: [], subject_kinds: [], scheduling: "concurrent", kind: operation === "query" ? "query" : "operation",
    effect: operation === "query" ? "read" : "write", input_schema, output_schema: { type: "object" } } };
}
export const agentAuthorizationActions = {
  list: action<AuthorizationFilter, AuthorizationList>("agent.authorizations.list", /* @version action.agent.authorizations.list */ 1, "查看授权", "query",
    object({ project_id: { anyOf: [id, { type: "null" }] }, owners: { type: "array", uniqueItems: true, items: owner }, client_id: id }, [])),
  read: action<AuthorizationKey, AuthorizationDetail>("agent.authorizations.read", /* @version action.agent.authorizations.read */ 1, "查看授权详情", "query", object(key)),
  change: action<AuthorizationChange, AuthorizationDetail>("agent.authorizations.change", /* @version action.agent.authorizations.change */ 1, "收紧授权", "command",
    { oneOf: [
      mutation({ const: "work-delegation" }, { const: "narrow" }, { keep: { type: "array", maxItems: 24, items: scope } }),
      mutation({ const: "work-delegation" }, { enum: ["revoke", "confirm", "read-only", "settle"] }),
      mutation({ const: "task-grant" }, { const: "narrow" }, { keep: { type: "array", maxItems: 100, items: category } }),
      mutation({ enum: ["run-app", "session-command", "task-grant", "mcp-client"] }, { const: "revoke" }),
      mutation({ const: "assistant-policy" }, { enum: ["confirm", "disable"] }),
    ] }),
};
