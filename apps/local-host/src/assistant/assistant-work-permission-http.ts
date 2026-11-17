import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentDelegationActions, type AgentActionReviewControl, type AgentDelegationActionChoice, type AgentDelegationGrantInput, type AgentDelegationProposal } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { NativePluginJsonResult } from "../native-plugin-http.js";
import type { AssistantHttpPorts } from "./assistant-http.js";
import { assistantErrors } from "./assistant-errors.js";
import { ownerOf } from "./assistant-round-start.js";
import { assertHumanReview } from "../computer/computer-policy.js";
import { computerHolderFor } from "../computer/computer-surfaces.js";
import type { AssistantStore } from "./assistant-store.js";

/** This settings entry uses the original work and live review. The browser never sends business parameters back as authority. */
export async function workPermissionHttp(workId: string, method: "GET" | "POST", source: URLSearchParams | Record<string, unknown>,
  ports: AssistantHttpPorts & { projectRef?: LocalHostProjectReference }, owner: AssistantStore, control: AgentActionReviewControl): Promise<NativePluginJsonResult> {
  control.assertCurrent();
  const fields = source instanceof URLSearchParams ? Object.fromEntries(source) : source;
  const { lifetime = "work", review_id, version, mode, expected_version, candidate_digest, selected } = fields;
  if ((lifetime !== "work" && lifetime !== "ongoing") || (review_id !== undefined || version !== undefined)
    && (typeof review_id !== "string" || !review_id || typeof version !== "string" || !version)) throw assistantErrors.invalid("工作权限请求无效");
  if (Object.keys(fields).some(key => !(method === "GET" ? ["lifetime", "review_id", "version", "selected"]
    : ["lifetime", "review_id", "version", "mode", "expected_version", "candidate_digest", "selected"]).includes(key))) {
    throw assistantErrors.invalid("工作权限请求包含不支持的字段");
  }
  const work = owner.get(LOCAL_PERSON_ACTOR_ID, workId);
  if ((ports.projectRef?.project_id ?? null) !== (work.project_ref?.project_id ?? null)) throw assistantErrors.scope("请从这项工作所在的项目管理权限");
  await ports.agentReady(); control.assertCurrent();
  const reviewChoice = () => {
    if (typeof review_id !== "string" || typeof version !== "string") return undefined;
    const review = ports.agentHost.reviews.get(review_id);
    if (!work.session_id || !review || review.project_id !== ownerOf(work) || review.run?.session_id !== work.session_id) {
      throw assistantErrors.scope("该操作不属于这项工作");
    }
    return ports.agentHost.reviews.delegationChoice(review_id, version);
  };
  const needsReview = method === "GET" || mode === "automatic", original = needsReview ? reviewChoice() : undefined;
  const wanted = original?.choice;
  const assertCurrent = () => {
    control.assertCurrent(); original?.assertPending();
    if (method === "POST") assertHumanReview(computerHolderFor(ports.localHost)?.(), work.session_id ?? undefined);
  };
  const project = ports.projectRef;
  const request: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: project?.project_id ?? null,
    permissions: [], validate_authority: control.beforeEffect, assert_authority_current: assertCurrent };
  const client = bindActionClient(project ? ports.localHost.actionClient(project, false) : ports.localHost.homeActionClient(), () => request);
  const proposal = { work_id: work.work_id, lifetime } satisfies Omit<AgentDelegationProposal, "choices">;
  if (method === "GET") {
    if (typeof selected === "string") {
      const preview = await client.invoke(agentDelegationActions.prepare, { ...proposal, choices: selectWorkPermission(wanted, "automatic", selected.split(",")) });
      assertCurrent();
      return { status: 200, body: { preview } };
    }
    const current = await client.invoke(agentDelegationActions.prepare, { ...proposal, choices: [] });
    const automatic = wanted ? await client.invoke(agentDelegationActions.prepare, { ...proposal, choices: [wanted] }) : null;
    if (automatic && current.storage_version !== automatic.storage_version) throw new ActionError("actions.conflict", "工作权限已变化，请重新查看");
    assertCurrent();
    return { status: 200, body: { current, automatic, preview: automatic } };
  }
  const choices = selectWorkPermission(wanted, mode, selected);
  if (typeof expected_version !== "number" || typeof candidate_digest !== "string" || !modeValid(mode)) throw assistantErrors.invalid("请先查看当前工作权限再保存");
  const input: AgentDelegationGrantInput = { ...proposal, choices, expected_version, candidate_digest, mode, expires_at: null };
  return { status: 200, body: await client.invoke(agentDelegationActions.grant, input) };
}

const modeValid = (mode: unknown): mode is AgentDelegationGrantInput["mode"] => mode === "read-only" || mode === "confirm" || mode === "automatic";

function selectWorkPermission(choice: AgentDelegationActionChoice | undefined, mode: unknown, selected: unknown): AgentDelegationActionChoice[] {
  if (mode !== "automatic") return [];
  if (!choice) throw assistantErrors.invalid("这项操作没有可复用的授权范围");
  if (choice.kind === "exact") return [choice];
  if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length) throw assistantErrors.invalid("请至少选择一项原操作");
  const operations = choice.operations.filter(operation => selected.includes(operation.key));
  if (operations.length !== selected.length) throw assistantErrors.invalid("只能选择原操作中的范围");
  return [{ ...choice, operations }];
}
