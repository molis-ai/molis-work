import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference, LocalHostStatus } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  acceptanceActions, acceptanceRequestId,
  type AcceptanceDecideRequest, type AcceptanceReadResult, type AcceptanceSubject, type AcceptanceView,
} from "@molis-ai/molis-work-contracts/modules/acceptance";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { ACCEPTANCE_DECIDE_ACTION } from "./acceptance-review.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { dispatchNativePluginJsonHttp } from "./native-plugin-http.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import { decideProjectReview, readProjectReview, type ProtectedReviewEntry } from "./project-review-commands.js";
import { projectReviewPerson } from "./project-review-entry.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const MAX_BODY_BYTES = 256 * 1024;
const REFUSAL = "插件页面不能代本人认可、退回或修改要求";

function assertAcceptanceDecideInput(value: unknown): asserts value is AcceptanceDecideRequest {
  assertActionInput(acceptanceActions.decide.action.input_schema, value);
}

export function resolveHostProjectReference(
  openProjects: LocalHostStatus["projects"],
  homeDirectory: string,
  catalogRunner: ((options: { homeDirectory: string }, operation: (catalog: { getProject(id: string): { project_id: string; database_path: string } | null | undefined }) => Promise<LocalHostProjectReference | null>) => Promise<LocalHostProjectReference | null>) | undefined,
  makeReference: (input: { projectId: string; databasePath: string }) => LocalHostProjectReference,
  projectId: string,
): Promise<LocalHostProjectReference | null> {
  const open = openProjects.find(row => row.project_id === projectId && row.state !== "closing");
  if (open) return Promise.resolve({ project_id: open.project_id, storage_key: open.storage_key });
  if (!catalogRunner) return Promise.resolve(null);
  return catalogRunner({ homeDirectory }, async catalog => {
    const found = catalog.getProject(projectId);
    return found ? makeReference({ projectId: found.project_id, databasePath: found.database_path }) : null;
  });
}

async function attachReviewReference(host: MolisWorkLocalHost, project: LocalHostProjectReference, view: AcceptanceView, entry: ProtectedReviewEntry): Promise<AcceptanceView> {
  if (!view.requirements.length || view.version === null) return view;
  try {
    const review = await readProjectReview(host, project, { action: ACCEPTANCE_DECIDE_ACTION, request_id: acceptanceRequestId(view.subject) }, entry);
    return { ...view, review_reference: review.reference };
  } catch {
    return view;
  }
}

async function submitAcceptanceDecision(host: MolisWorkLocalHost, project: LocalHostProjectReference, input: AcceptanceDecideRequest, entry: ProtectedReviewEntry, requestKey: string): Promise<AcceptanceView> {
  const requestId = acceptanceRequestId(input.subject);
  if (input.returns.length === 0 && input.accepts.length > 0) {
    const current = (await host.actionClient(project).invoke(entry.caller, { capability_id: acceptanceActions.read.capability_id, version: acceptanceActions.read.version, provider_id: ACCEPTANCE_DECIDE_ACTION.provider_id }, { subjects: [input.subject as AcceptanceSubject] }) as AcceptanceReadResult).views[0];
    if (current && current.version === input.version.trim() && input.accepts.every(selected => current.requirements.some(item => item.id === selected.id && item.version === selected.version))) {
      const standing = await readProjectReview(host, project, { action: ACCEPTANCE_DECIDE_ACTION, request_id: requestId }, entry);
      const choiceId = input.accepts.length === 1 ? `accept:${input.accepts[0]!.id}` : "accept_all";
      const match = standing.choices.find(choice => choice.id === choiceId && choice.availability.available
        && choice.accepts.length === input.accepts.length && input.accepts.every(item => choice.accepts.includes(item.id)));
      if (match) {
        const decided = await decideProjectReview(host, project, { reference: standing.reference, choice_id: match.id, request_key: requestKey }, entry);
        const result = "result" in decided && decided.result ? decided.result as AcceptanceView
          : (await host.actionClient(project).invoke(entry.caller, { capability_id: acceptanceActions.read.capability_id, version: acceptanceActions.read.version, provider_id: ACCEPTANCE_DECIDE_ACTION.provider_id }, { subjects: [input.subject] }) as AcceptanceReadResult).views[0]!;
        return attachReviewReference(host, project, result, entry);
      }
    }
  }
  const prepared = await readProjectReview(host, project, {
    action: ACCEPTANCE_DECIDE_ACTION,
    request_id: requestId,
    draft: { version: input.version, accepts: input.accepts, returns: input.returns },
  }, entry);
  const decided = await decideProjectReview(host, project, { reference: prepared.reference, choice_id: "apply", request_key: requestKey }, entry);
  const result = "result" in decided && decided.result ? decided.result as AcceptanceView
    : (await host.actionClient(project).invoke(entry.caller, { capability_id: acceptanceActions.read.capability_id, version: acceptanceActions.read.version, provider_id: ACCEPTANCE_DECIDE_ACTION.provider_id }, { subjects: [input.subject] }) as AcceptanceReadResult).views[0]!;
  return attachReviewReference(host, project, result, entry);
}

/** The workbench's own doors to requirements and acceptance in one project, as the person (S-acceptance-person-decides, S-work-line-person-doors). */
export async function handleAcceptanceHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost,
  project: LocalHostProjectReference): Promise<boolean> {
  if (!url.pathname.startsWith("/api/acceptance/")) return false;
  const controller = new AbortController(), cancel = () => controller.abort(new ActionError("actions.cancelled", "请求已经结束"));
  const disconnected = () => { if (!response.writableEnded) cancel(); };
  request.once("aborted", cancel); response.once("close", disconnected);
  try {
    return await dispatchNativePluginJsonHttp(request, response, url, {
      prefix: "/api/acceptance",
      maxBodyBytes: MAX_BODY_BYTES,
      async handle({ method, pathname, body }) {
        const door = pathname.slice("/api/acceptance/".length);
        if (method !== "POST" || (door !== "read" && door !== "decide" && door !== "requirements")) return null;
        if (pluginPageRequest(request)) throw new ActionError("actions.forbidden", REFUSAL);
        const message = `web:${randomUUID()}`;
        const action = Object.freeze({ source: "web" as const, conversation_ref: `web:${project.project_id}`, message_ref: message });
        const assertCurrent = () => { controller.signal.throwIfAborted(); if (host.lifecycle() !== "running") throw new ActionError("actions.host_closed", "宿主正在关闭"); };
        if (door === "requirements") {
          const client = bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS, { signal: controller.signal, user_action: () => action });
          const view = await client.invoke(acceptanceActions.set as ActionDefinition, body) as AcceptanceView;
          const caller = await projectReviewPerson({ host, project }, controller.signal, assertCurrent);
          return { status: 200, body: await attachReviewReference(host, project, view, { caller, action, assertCurrent }) };
        }
        if (door === "read") {
          const client = bindLocalWebActions(host, project, LOCAL_OWNER_PERMISSIONS, { signal: controller.signal, user_action: () => action });
          const read = await client.invoke(acceptanceActions.read as ActionDefinition, body) as AcceptanceReadResult;
          const caller = await projectReviewPerson({ host, project }, controller.signal, assertCurrent);
          const entry: ProtectedReviewEntry = { caller, action, assertCurrent };
          const views = await Promise.all(read.views.map(view => attachReviewReference(host, project, view, entry)));
          return { status: 200, body: { views } };
        }
        assertAcceptanceDecideInput(body);
        const caller = await projectReviewPerson({ host, project }, controller.signal, assertCurrent);
        const entry: ProtectedReviewEntry = { caller, action, assertCurrent };
        return { status: 200, body: await submitAcceptanceDecision(host, project, body, entry, message) };
      },
    });
  } finally { request.off("aborted", cancel); response.off("close", disconnected); }
}
