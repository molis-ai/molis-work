import { ACTION_ERROR_CODE, type ActionHandlerBinding, type ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginRouteBinding, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingCharacters, type CodingCharacters } from "./character-source.js";
import { codingGoalTitles, type CodingGoalTitles } from "./goal-titles.js";
import { codingModels } from "./models.js";
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
import { codingZh } from "./words.js";

export { stopCodingSurface } from "./route-activation.js";
export { planContinuesAfterTalk } from "./routes-timeline.js";
export { codingSessionTitleFrom, DEFAULT_SESSION_TITLE } from "./session-title.js";

export type { CodingModelChoice } from "./models.js";

/**
 * What every route and background loop of one activation runs with. Nothing in it is lent by the Host: the session store is opened from
 * `services.project_database`, models come from `services.model`, and Goal titles and Characters are read through the public actions
 * Goals and Characters answer (PG-047, PG-086, PG-091).
 */
export interface CodingExecution {
  readonly sessions: CodingSessionStore;
  readonly models: ReturnType<typeof codingModels>;
  readonly goalTitles: CodingGoalTitles;
  readonly characters: CodingCharacters;
  /** The language of the page this call came from (route calls only): what a handler sends back to show is worded in it. */
  readonly locale?: ActionLocale;
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
    body: { error: error instanceof Error ? error.message : codingZh("coding.server.failed"), ...(code ? { code } : {}), ...problemsOf(error) } };
};

/**
 * Routes for the workbench, and the owner-bound actions the Runtime instance redeems for Coding's business surface.
 * Coding owns intent and organization; execution is always obtained through Host capabilities. Each resource's routes
 * are in their own file (routes-*.ts) and share one activation (route-activation.ts). `goalTitles` is the one cache the page's
 * synchronous directory and the routes share (plugin.ts); a caller with none gets its own.
 */
export function codingSurface(context: PluginStartContext, sessions: CodingSessionStore, goalTitles: CodingGoalTitles = codingGoalTitles(context)): { routes: PluginRouteBinding[]; actions: ActionHandlerBinding[] } {
  const actions: ActionHandlerBinding[] = [];
  const execution: CodingExecution = { sessions, models: codingModels(context), goalTitles, characters: codingCharacters(context) };
  const activation = startCodingActivation(context, execution, actions, failure);
  const routes = [writersRoutes, changesetsRoutes, goalsRoutes, setupRoutes, sessionsRoutes, timelineRoutes, delegationsRoutes, cardsRoutes].flatMap(group => group(activation));
  return { routes, actions };
}
