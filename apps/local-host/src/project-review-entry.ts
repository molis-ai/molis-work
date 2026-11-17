import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, requireSynchronous, type ActionExecutionContext, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { PROJECT_APPROVAL_RULE_CHANGE_SCHEMA, PROJECT_APPROVAL_RULE_FILTER_SCHEMA, TRUSTED_REVIEW_COMMAND_SCHEMA, TRUSTED_REVIEW_READ_SCHEMA,
  projectApprovalRuleActions, trustedReviewActions, type ProjectApprovalRuleChange, type ProjectApprovalRulePage,
  type TrustedReviewCommand, type TrustedReviewRead } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { projectApprovalRules } from "@molis-ai/molis-work-service-project-approvals";
import { authorizationSettingsControl } from "./authorization-settings-control.js";
import { entryUserAction } from "./entry-user-action.js";
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

export const projectReviewEntryActions = {
  read: door.define({ ...trustedReviewActions.read, scope: "project", effect: "read", title: "读取原决定请求",
    description: "向原动作提供方读取本人的待审对象和选项，或按原引用打开已决定的记录。", input_schema: TRUSTED_REVIEW_READ_SCHEMA },
  async (entry, input, caller) => readProjectReview(entry.host, entry.project, input, await controls(entry, caller))),
  decide: door.define({ ...trustedReviewActions.decide, scope: "project", title: "提交本人决定",
    description: "对原请求的已阅版本选择一项，并在原动作实际提交时保存决定。", input_schema: TRUSTED_REVIEW_COMMAND_SCHEMA },
  async (entry, input, caller) => decideProjectReview(entry.host, entry.project, input, await controls(entry, caller))),
};

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
  const caller = await projectReviewPerson({ host, project }, signal, assertCurrent);
  const action = Object.freeze({ ...entryUserAction("management", project.project_id, { id: callId }), source: "management" as const });
  return (name === "read" ? readProjectReview : decideProjectReview)(host, project, input, { caller, action, assertCurrent });
}
