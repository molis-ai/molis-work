import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ProjectApprovalRulePage, ProjectTrustedDecision, TrustedReviewCommand } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import type { TestHostServer } from "./test-home.js";

type Web = TestHostServer["web"];
type Draft = { readonly idempotency_key: string; readonly request_id?: string };
type ReviewAction = Pick<ActionDefinition, "capability_id" | "version">;
type Receipt<Output> = { record: ProjectTrustedDecision; replayed: boolean; result?: Output };

export function prepareGoalReview(action: ReviewAction, draft: Draft) {
  return { action: { capability_id: action.capability_id, version: action.version, provider_id: GOALS_PLUGIN_ID },
    request_id: draft.request_id ?? draft.idempotency_key, draft };
}

const answer = (review: ReviewRequest, request_key: string): TrustedReviewCommand => ({
  reference: review.reference as TrustedReviewCommand["reference"], choice_id: "apply", request_key,
});

export function webGoalReviews(web: Web, projectId: string) {
  const path = "/projects/" + encodeURIComponent(projectId) + "/api/project-approvals";
  const read = (input: ReturnType<typeof prepareGoalReview> | { reference: ReviewRequest["reference"] }) => web.post<ReviewRequest>(path + "/request", input);
  const submit = <Output = unknown>(command: TrustedReviewCommand) => web.post<Receipt<Output>>(path + "/decide", command);
  return { read, submit, async prepare(action: ReviewAction, draft: Draft) {
    return answer(await read(prepareGoalReview(action, draft)), draft.idempotency_key);
  } };
}

export function mcpGoalReviews(server: { callTool(name: string, input: object): Promise<string> }, projectId: string, databasePath: string) {
  const project = { project_id: projectId, database_path: databasePath };
  const call = async <Output>(name: string, payload: object) => JSON.parse(await server.callTool(name, { ...project, ...payload })) as Output;
  const read = (input: ReturnType<typeof prepareGoalReview> | { reference: ReviewRequest["reference"] }) => call<ReviewRequest>("molis_work_v1_review_request", input);
  const submit = <Output = unknown>(command: TrustedReviewCommand) => call<Receipt<Output>>("molis_work_v1_review_decide", command);
  return { read, submit, async prepare(action: ReviewAction, draft: Draft) {
    return answer(await read(prepareGoalReview(action, draft)), draft.idempotency_key);
  } };
}

export function projectRulesPage(server: TestHostServer, projectId: string) {
  const path = "/api/settings/authorizations/project-rules?project=" + encodeURIComponent(projectId);
  const read = async () => {
    const response = await fetch(server.origin + path, { headers: { "x-molis-work-control-token": server.controlToken } });
    if (!response.ok) throw new Error(await response.text());
    return await response.json() as ProjectApprovalRulePage;
  };
  const change = (input: object) => server.web.post<ProjectApprovalRulePage>(path, input);
  return { read, change, async setDefault(requires_person: boolean, reason: string) {
    return await change({ kind: "set", scope: { kind: "project_default" }, expected_revision: (await read()).revision, requires_person, reason });
  } };
}
