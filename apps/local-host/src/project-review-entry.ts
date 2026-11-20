import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, requireSynchronous, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionUserAction,
  type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineAction } from "@molis-ai/molis-work-plugin-sdk";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { PROJECT_APPROVAL_RULE_CHANGE_SCHEMA, PROJECT_APPROVAL_RULE_FILTER_SCHEMA, TRUSTED_REVIEW_COMMAND_SCHEMA, TRUSTED_REVIEW_READ_SCHEMA,
  projectApprovalRuleActions, trustedReviewActions, type ProjectApprovalRuleChange, type ProjectApprovalRulePage,
  type TrustedReviewCommand, type TrustedReviewRead } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { projectApprovalRules } from "@molis-ai/molis-work-service-project-approvals";
import { authorizationSettingsControl } from "./authorization-settings-control.js";
import { entryUserAction } from "./entry-user-action.js";
import { withProtectedHostAction } from "./plugin-consent-settings-entry.js";
import { openProjectPersonContext } from "./local-web-actions.js";
import { decideProjectReview, readProjectReview, type ProtectedReviewEntry } from "./project-review-commands.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { webEntryDoor, webEntryProvider } from "./web-entry-actions.js";
import { readLocalWebBody, sendLocalWebJson } from "./web-http.js";
import { webManagementAuthenticated } from "./web-sessions.js";

interface Entry {
  readonly host: MolisWorkLocalHost;
  readonly project: LocalHostProjectReference;
}
const door = webEntryDoor<Entry>("project:approvals", () => "当前操作需要受保护的项目审批入口");

/** Resolve the person's authority once in the project that owns the review. */
export function projectReviewPerson({ host, project }: Entry, signal: AbortSignal | undefined, assertCurrent: () => void) {
  assertCurrent();
  return host.withProject(project, ({ store }) => {
    assertCurrent();
    return openProjectPersonContext(host, project, store, signal).caller;
  }, { activatePlugins: true });
}

async function controls({ host, project }: Entry, exposed: ActionExecutionContext): Promise<ProtectedReviewEntry> {
  const assertCurrent = () => { exposed.signal?.throwIfAborted(); requireSynchronous(exposed.assert_authority_current?.()); };
  const action = exposed.user_action;
  if (action?.source !== "web") throw new ActionError("actions.forbidden", "原决定入口已关闭");
  const caller = await projectReviewPerson({ host, project }, exposed.signal, assertCurrent);
  // A nested dispatch must carry the identical audit locator that the protected entry originally issued.
  return { caller, action: action as ProtectedReviewEntry["action"], assertCurrent };
}

/**
 * The management entry's calls (the CLI, the management MCP): one frozen `user_action` per call, issued by `invokeProjectReviewManagement`
 * alone, for the person on this machine and the project the transport verified. They go through the same two registered actions as the
 * page's, so the kernel settles each one: a refusal before the owner's action runs (cancelled, disconnected, stale) leaves its row as well.
 */
interface ManagementReview extends Entry {
  readonly action: ActionUserAction & { readonly source: "management" };
  assertCurrent(): void;
  readonly signal?: AbortSignal;
}
const managementIssued = new WeakMap<ActionUserAction, ManagementReview>();

function managementEntryOf(caller: ActionCallContext): ManagementReview | undefined {
  const held = caller.user_action ? managementIssued.get(caller.user_action) : undefined;
  if (!held) return undefined;
  if (caller.audience !== "user" || caller.actor_id !== LOCAL_PERSON_ACTOR_ID || caller.host_plugin || caller.delegated_by
    || caller.project_id !== held.project.project_id) throw new ActionError("actions.forbidden", "原决定入口已关闭");
  return held;
}

async function managementControls(held: ManagementReview): Promise<ProtectedReviewEntry> {
  const caller = await projectReviewPerson(held, held.signal, held.assertCurrent);
  return { caller, action: held.action, assertCurrent: held.assertCurrent };
}

/** One of the two review actions, served to the page's door and to the management entry. */
function reviewEntryAction<Input, Output>(defined: { readonly definition: ActionDefinition<Input, Output> },
  serve: (entry: Entry, input: Input, controls: ProtectedReviewEntry) => Promise<Output>) {
  return defineAction<Input, Output>(defined.definition, async (caller, input) => {
    const held = managementEntryOf(caller);
    if (held) return await serve(held, input, await managementControls(held));
    const entry = door.entryOf(caller);
    return await serve(entry, input, await controls(entry, caller));
  });
}

export const projectReviewEntryActions = {
  read: reviewEntryAction(door.define({ ...trustedReviewActions.read, scope: "project", effect: "read", title: "读取原决定请求",
    description: "向原动作提供方读取本人的待审对象和选项，或按原引用打开已决定的记录。", input_schema: TRUSTED_REVIEW_READ_SCHEMA }, unreachable),
  (entry, input, controls) => readProjectReview(entry.host, entry.project, input, controls)),
  decide: reviewEntryAction(door.define({ ...trustedReviewActions.decide, scope: "project", title: "提交本人决定",
    description: "对原请求的已阅版本选择一项，并在原动作实际提交时保存决定。", input_schema: TRUSTED_REVIEW_COMMAND_SCHEMA }, unreachable),
  (entry, input, controls) => decideProjectReview(entry.host, entry.project, input, controls)),
};

/** `door.define` gives the definition; the handler is `reviewEntryAction`'s, which serves both entries. */
function unreachable(): never { throw new ActionError("actions.forbidden", "原决定入口已关闭"); }

const projectRuleEntries = {
  read: door.define({ ...projectApprovalRuleActions.read, scope: "project", effect: "read", title: "查看项目审批规则",
    description: "读取当前项目的审批规则、当前版本和原始历史。", input_schema: PROJECT_APPROVAL_RULE_FILTER_SCHEMA },
    ({ host, project }, input, caller) => host.withProject(project, runtime => {
      requireSynchronous(caller.assert_authority_current?.());
      return projectApprovalRules(runtime.store.db, project.project_id).page(input.cursor);
    })),
  change: door.define({ ...projectApprovalRuleActions.change, scope: "project", title: "修改项目审批规则",
    description: "本人按已阅版本修改项目默认要求或撤回现有规则，保留原因及历史。", input_schema: PROJECT_APPROVAL_RULE_CHANGE_SCHEMA },
    ({ host, project }, input, caller) => host.withProject(project, async runtime => {
      const owner = projectApprovalRules(runtime.store.db, project.project_id);
      await owner.change(input as ProjectApprovalRuleChange, caller.actor_id, new Date().toISOString(), {
        beforeEffect: () => caller.beforeEffect(), assertCurrent: () => requireSynchronous(caller.assert_authority_current?.()),
      });
      return owner.page();
    })),
};

export const projectApprovalsProvider = () => webEntryProvider("system.project-approvals", "项目审批",
  [...Object.values(projectReviewEntryActions), ...Object.values(projectRuleEntries)]);

export function projectRulesFromSettings(input: {
  host: MolisWorkLocalHost; project: LocalHostProjectReference; request: IncomingMessage; assertCurrent(): void;
}, change?: unknown, cursor?: NonNullable<ProjectApprovalRulePage["next_cursor"]>): Promise<ProjectApprovalRulePage> {
  const call = { host: input.host, request: input.request, reference: input.project, entry: input, assertCurrent: input.assertCurrent };
  return change === undefined ? door.invoke(call, projectRuleEntries.read.definition, cursor ? { cursor } : {})
    : door.invoke(call, projectRuleEntries.change.definition, change as InferActionInput<typeof PROJECT_APPROVAL_RULE_CHANGE_SCHEMA>);
}

export async function handleProjectReviewHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost,
  project: LocalHostProjectReference, accountCurrent?: () => void) {
  const read = request.method === "POST" && url.pathname === "/api/project-approvals/request";
  if (!read && (request.method !== "POST" || url.pathname !== "/api/project-approvals/decide")) return false;
  const control = authorizationSettingsControl(request, response, host, accountCurrent);
  try {
    if (!webManagementAuthenticated(request)) throw new ActionError("actions.forbidden", "需要当前页面的本人身份");
    control.assertCurrent();
    const call = { host, request, reference: project, entry: { host, project }, assertCurrent: control.assertCurrent };
    const body: unknown = await readLocalWebBody(request);
    const result = read ? await door.invoke(call, projectReviewEntryActions.read.definition, body as TrustedReviewRead)
      : await door.invoke(call, projectReviewEntryActions.decide.definition, body as TrustedReviewCommand);
    sendLocalWebJson(response, 200, result);
  } catch (error) {
    const refusal = actionErrorResponse(error);
    if (!response.destroyed) sendLocalWebJson(response, refusal.status, refusal.body);
  }
  return true;
}

/** The resident management transport has verified Home, project, origin, token and one-time key. */
export async function invokeProjectReviewManagement(host: MolisWorkLocalHost, project: LocalHostProjectReference, name: keyof typeof trustedReviewActions,
  input: unknown, callId: string, signal?: AbortSignal, accountCurrent?: () => void) {
  const assertCurrent = () => {
    signal?.throwIfAborted();
    requireSynchronous(accountCurrent?.());
    if (host.lifecycle() !== "running") throw new ActionError("actions.host_closed", "管理入口所在的宿主正在关闭");
  };
  assertCurrent();
  const action = Object.freeze({ ...entryUserAction("management", project.project_id, { id: callId }), source: "management" as const });
  managementIssued.set(action, { host, project, action, assertCurrent, ...(signal ? { signal } : {}) });
  const definition = projectReviewEntryActions[name].definition;
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", project_id: project.project_id, audience: "user", permissions: [],
    user_action: action, allowed_actions: [{ capability_id: definition.capability_id, version: definition.version }], call_id: callId,
    ...(signal ? { signal } : {}), validate_authority: async () => { assertCurrent(); }, assert_authority_current: () => { assertCurrent(); } };
  // Held as a protected action for the call, so the Host keeps its identity (`snapshotHostUserAction`) and the handler finds it here.
  try { return await withProtectedHostAction(action, () => bindActionClient(host.actionClient(project), () => caller).invoke(definition as ActionDefinition<unknown, unknown>, input)); }
  finally { managementIssued.delete(action); }
}
