import { handleGoalRelationsHttp } from "./relations.js";
import type { GoalsHttpContext } from "./types.js";
import { handleGoalCreateHttp } from "./create.js";
import { handleGoalPolicyGuidanceHttp } from "./policy-guidance.js";
import { handleGoalLifecycleHttp } from "./lifecycle.js";
import { handleGoalDecisionsHttp } from "./decisions.js";
import { handleGoalEventDecisionHttp } from "./event-decisions.js";
import { handleGoalEventHttp } from "./events.js";

export async function handleGoalsWebHttp(context: GoalsHttpContext): Promise<boolean> {
  return await handleGoalCreateHttp(context)
    || await handleGoalPolicyGuidanceHttp(context)
    || await handleGoalRelationsHttp(context)
    || await handleGoalLifecycleHttp(context)
    || await handleGoalDecisionsHttp(context)
    || await handleGoalEventHttp(context)
    || await handleGoalEventDecisionHttp(context);
}
