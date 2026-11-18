import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError, bindActionHandler, defineAttachRelationAction, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding,
  type PlacementAttachParts } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEntryActions, goalPluginActions } from "./contract/goal-actions.js";
import { goalsInputActions, type GoalBoundObject } from "./input-actions.js";

/** Every Goals write is authored by a Session when a Runtime makes it, as `goalAction` says for Goals' own commands. */
const authored = <I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> =>
  ({ ...definition, action: { ...definition.action, authorship: "session" } });

const list = defineAttachRelationAction("list", "goals.attach.list", /* @version action.goals.attach.list */ 1, ["goal"], "资料挂在哪些目标上", ["goals:read"]);
const release = authored(defineAttachRelationAction("release", "goals.attach.release", /* @version action.goals.attach.release */ 1, ["goal"], "从目标取下", ["goals:write"]));
const candidates = defineAttachRelationAction("candidates", "goals.attach.candidates", /* @version action.goals.attach.candidates */ 1, ["goal"], "可以挂接的目标", ["goals:read"]);
const create = authored(defineAttachRelationAction("create", "goals.attach.create", /* @version action.goals.attach.create */ 1, ["goal"], "建成目标", ["goals:write"]));
const refOf = (definition: ActionDefinition) => ({ capability_id: definition.capability_id, version: definition.version });

/**
 * Goals' 「挂到…」 relation (batch 44 C1): others attach their objects to a Goal, which keeps them among its inputs. The attaching action
 * declares the relation and names the other parts, each in the platform's shape (`defineAttachRelationAction`). Each is Goals' own
 * action underneath: listing, binding and releasing a Goal's inputs, its directory, and creating a Goal; the person's calls to them are
 * the same calls.
 */
export const goalsAttachActions = {
  list, release, candidates, create,
  bind: authored(defineAttachRelationAction("bind", "goals.attach.bind", /* @version action.goals.attach.bind */ 1, ["goal"], "挂到目标", ["goals:write"], {
    attach_id: "goal", item_kind: "goal", title: "Goal", verb: "挂到 Goal", describe: "把这个对象挂到项目里的一个 Goal 上，作为它的输入；不复制、不移动原对象。",
    relation: { noun: "Goal", noun_text: { key: "goals.attach.noun" }, list: refOf(list), release: refOf(release), candidates: refOf(candidates), create: refOf(create) },
  })),
} as const;

/** The parts that stand for a self-windowed Goals action (`goals.inputs.list`, `goals.inputs.bind`) and so open no window of their own. */
export const ATTACH_SELF_WINDOWED: readonly string[] = [list.capability_id, goalsAttachActions.bind.capability_id];

type Part<R extends keyof PlacementAttachParts> = PlacementAttachParts[R];

/**
 * The parts' handlers, over the handlers of the Goals actions they stand for (`handlers`: every other Goals handler). Each part keeps the
 * window of the action under it: list and bind stand for actions that open their own windows (`ATTACH_SELF_WINDOWED`) and may wait;
 * release, candidates and create run inside the window Goals opens for them, so they answer synchronously (an async body there is refused).
 */
export function createGoalsAttachActionHandlers(handlers: readonly ActionHandlerBinding[]): ActionHandlerBinding[] {
  const of = (definition: ActionDefinition) => {
    const found = handlers.find(handler => handler.capability_id === definition.capability_id && handler.version === definition.version);
    if (!found) throw new ActionError("actions.definition_invalid", `Goals 缺少 ${definition.capability_id} 的处理`);
    return (caller: ActionExecutionContext, input: unknown) => found.handle(caller, input);
  };
  const list = of(goalsInputActions.list), bind = of(goalsInputActions.bind), release = of(goalsInputActions.release);
  const directory = of(goalPluginActions.list), create = of(goalEntryActions.create);
  return [
    bindActionHandler(goalsAttachActions.list, async (input, caller): Promise<Part<"list">["output"]> => {
      const { bindings } = await list(caller, { subject: input.subject }) as { bindings: GoalBoundObject[] };
      return { bindings: bindings.map(binding => ({ binding_id: binding.binding_id, target_id: binding.goal_id, created_at: binding.created_at })) };
    }),
    bindActionHandler(goalsAttachActions.bind, async (input, caller): Promise<Part<"bind">["output"]> => {
      const { binding } = await bind(caller, { goal_id: input.target_id, subject: input.subject, title: input.title,
        ...(input.read_revision ? { read_revision: input.read_revision } : {}) }) as { binding: GoalBoundObject };
      return { binding: { binding_id: binding.binding_id } };
    }),
    bindActionHandler(goalsAttachActions.release, (input, caller) =>
      release(caller, { goal_id: input.target_id, binding_id: input.binding_id }) as Part<"release">["output"]),
    bindActionHandler(goalsAttachActions.candidates, (input, caller): Part<"candidates">["output"] => {
      const page = directory(caller, { ...(input.limit ? { limit: input.limit } : {}), ...(input.after_cursor ? { after_cursor: input.after_cursor } : {}) }) as
        { goals: { goal_id: string; title: string }[]; next_cursor?: string | null };
      return { targets: page.goals.map(goal => ({ id: goal.goal_id, title: goal.title })), next_cursor: page.next_cursor ?? null };
    }),
    bindActionHandler(goalsAttachActions.create, (input, caller): Part<"create">["output"] => {
      // The content becomes the Goal's outcome as far as it fits; where it came from is the Goal's why.
      const result = create(caller, { title: input.title, outcome: input.body.slice(0, 2000), why: uiText.text("goals.attach.source", { source: input.source }),
        source_kind: "web", idempotency_key: input.idempotency_key }) as { goal: { goal_id: string } };
      return { target: { id: result.goal.goal_id } };
    }),
  ];
}
