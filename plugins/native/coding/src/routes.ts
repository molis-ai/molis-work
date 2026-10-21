import { ACTION_ERROR_CODE, type ActionHandlerBinding, type ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginRouteBinding, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { CodingCharacterPorts } from "./characters.js";
import { startCodingActivation } from "./route-activation.js";
import { cardsRoutes } from "./routes-cards.js";
import { changesetsRoutes } from "./routes-changesets.js";
import { delegationsRoutes } from "./routes-delegations.js";
import { goalsRoutes } from "./routes-goals.js";
import { sessionsRoutes } from "./routes-sessions.js";
import { setupRoutes } from "./routes-setup.js";
import { timelineRoutes } from "./routes-timeline.js";
import { writersRoutes } from "./routes-writers.js";
import type { CodingSessionStore } from "./store.js";

export { stopCodingSurface } from "./route-activation.js";
export { planContinuesAfterTalk } from "./routes-timeline.js";
export { codingSessionTitleFrom, DEFAULT_SESSION_TITLE } from "./session-title.js";

export interface CodingModelChoice { provider_id: string; model_id: string; label: string;
  /** The person marked this model as taking a reasoning effort; only then is one offered and sent. */
  reasoning_effort?: boolean }
export interface CodingExecutionPorts {
  characters?: CodingCharacterPorts;
  sessions: CodingSessionStore;
  reportReferences?(): ArtifactReference[];
  changeSetReferences?(): ArtifactReference[];
  planReferences?(): ArtifactReference[];
  goalTitle(goalId: string): string | undefined;
  /** The language of the page this call came from (route calls only): what a handler sends back to show is worded in it. */
  locale?: ActionLocale;
  ready(): Promise<void>;
  models(): Promise<readonly CodingModelChoice[]>;
}

// A refused answer's problems, with the questions they are about, for the Host to word beside each field.
const problemsOf = (error: unknown) => {
  const { problems, questions } = error as { problems?: unknown; questions?: unknown };
  return Array.isArray(problems) ? { details: { problems, ...(Array.isArray(questions) ? { questions } : {}) } } : {};
};

// The few codes Coding names keep their status; any other failure with a code of ours answers by its kind (D26), as the
// SDK's edge does. A plain error (Coding's own checks of what the page sent) stays a caller's mistake.
const failure = (error: unknown) => {
  const code = (error as { code?: string }).code;
  return { status: code === "coding.session_unknown" || code === "actions.missing" ? 404 : code === "agent.session_busy" ? 409
    : code === "actions.forbidden" || code === "actions.owner_mismatch" ? 403 : code === "actions.unredeemed" ? 503 : ACTION_ERROR_CODE.test(code ?? "") ? actionHttpStatus(error) : 400,
    body: { error: error instanceof Error ? error.message : "Coding 操作失败", ...(code ? { code } : {}), ...problemsOf(error) } };
};

/**
 * Routes for the workbench, and the owner-bound actions the Runtime instance redeems for Coding's business surface.
 * Coding owns intent and organization; execution is always obtained through Host capabilities. Each resource's routes
 * are in their own file (routes-*.ts) and share one activation (route-activation.ts).
 */
export function codingSurface(context: PluginStartContext, ports?: CodingExecutionPorts): { routes: PluginRouteBinding[]; actions: ActionHandlerBinding[] } {
  const actions: ActionHandlerBinding[] = [];
  const activation = startCodingActivation(context, ports, actions, failure);
  const routes = [writersRoutes, changesetsRoutes, goalsRoutes, setupRoutes, sessionsRoutes, timelineRoutes, delegationsRoutes, cardsRoutes].flatMap(group => group(activation));
  return { routes, actions };
}
