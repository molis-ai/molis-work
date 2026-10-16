import type { ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginRouteBinding, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { CodingCharacterPorts } from "./characters.js";
import { startCodingActivation } from "./route-activation.js";
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
  materialReferences?(): ArtifactReference[];
  reportReferences?(): ArtifactReference[];
  changeSetReferences?(): ArtifactReference[];
  planReferences?(): ArtifactReference[];
  goalTitle(goalId: string): string | undefined;
  ready(): Promise<void>;
  models(): Promise<readonly CodingModelChoice[]>;
}

const failure = (error: unknown) => {
  const code = (error as { code?: string }).code;
  return { status: code === "coding.session_unknown" || code === "actions.missing" ? 404 : code === "agent.session_busy" ? 409
    : code === "actions.forbidden" || code === "actions.owner_mismatch" ? 403 : code === "actions.unredeemed" ? 503 : 400,
    body: { error: error instanceof Error ? error.message : "Coding 操作失败", ...(code ? { code } : {}) } };
};

/**
 * Routes for the workbench, and the owner-bound actions the Runtime instance redeems for Coding's business surface.
 * Coding owns intent and organization; execution is always obtained through Host capabilities. Each resource's routes
 * are in their own file (routes-*.ts) and share one activation (route-activation.ts).
 */
export function codingSurface(context: PluginStartContext, ports?: CodingExecutionPorts): { routes: PluginRouteBinding[]; actions: ActionHandlerBinding[] } {
  const actions: ActionHandlerBinding[] = [];
  const activation = startCodingActivation(context, ports, actions, failure);
  const routes = [writersRoutes, changesetsRoutes, goalsRoutes, setupRoutes, sessionsRoutes, timelineRoutes, delegationsRoutes].flatMap(group => group(activation));
  return { routes, actions };
}
