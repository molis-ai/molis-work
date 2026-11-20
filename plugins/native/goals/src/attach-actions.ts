import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ActionError, bindActionHandler, definePlacementRelationAction, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding,
  type ActionSubject, type PlacementRelationResult } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalEntryActions, goalPluginActions } from "./contract/goal-actions.js";
import { goalsInputActions, type GoalBoundObject } from "./input-actions.js";

/** The relation placement keeps for the person between any object and a Goal (「挂到…」, PG-032). */
export const GOALS_ATTACH_RELATION = "goal";
const GOAL = "goal";

/** Every Goals write is authored by a Session when a Runtime makes it, as `goalAction` says for Goals' own commands. */
const authored = <I, O>(definition: ActionDefinition<I, O>): ActionDefinition<I, O> =>
  ({ ...definition, action: { ...definition.action, authorship: "session" } });
/** The person attaches; agents use Goals' own actions. Any object the person can read may be attached (no kinds). */
const part = (title: string, description: string, permission: "goals:read" | "goals:write") =>
  ({ kinds: [], title, description, permissions: [permission], audiences: ["user"] as const });

/**
 * Goals' 「挂到…」 relation (batch 44 C1): others attach their objects to a Goal, which keeps them among its inputs. Each part is in the
 * platform's shape (`definePlacementRelationAction`) and declares its role with `placement_relation`; underneath are Goals' own actions:
 * listing, binding and releasing a Goal's inputs, its directory, and creating a Goal.
 */
export const goalsAttachActions = {
  list: definePlacementRelationAction(GOALS_ATTACH_RELATION, "list", "goals.attach.list", /* @version action.goals.attach.list */ 1,
    { ...part("资料挂在哪些目标上", "读取一个对象此刻挂在哪些目标上；只读。", "goals:read"), target: { kind: GOAL, noun: "Goal", noun_text: { key: "goals.attach.noun" } } }),
  bind: authored(definePlacementRelationAction(GOALS_ATTACH_RELATION, "bind", "goals.attach.bind", /* @version action.goals.attach.bind */ 1,
    part("挂到目标", "把一个对象挂到一个目标上，作为它的输入；不复制、不移动原对象，重复挂接不另加一条。", "goals:write"))),
  release: authored(definePlacementRelationAction(GOALS_ATTACH_RELATION, "release", "goals.attach.release", /* @version action.goals.attach.release */ 1,
    part("从目标取下", "把一个对象从一个目标的输入里取下；原对象不变。", "goals:write"))),
  candidates: definePlacementRelationAction(GOALS_ATTACH_RELATION, "candidates", "goals.attach.candidates", /* @version action.goals.attach.candidates */ 1,
    part("可以挂接的目标", "列出这里可以把对象挂上去的目标，已挂上的在前；只读。", "goals:read")),
  create: authored(definePlacementRelationAction(GOALS_ATTACH_RELATION, "create", "goals.attach.create", /* @version action.goals.attach.create */ 1,
    part("建成目标", "用一个对象新建一个目标并把它挂上去；给了读到的内容时，开头一段作为目标的结果描述。", "goals:write"))),
} as const;

const asGoal = (goalId: string): ActionSubject => ({ kind: GOAL, id: goalId });
const goalOf = (target: ActionSubject) => {
  if (target.kind !== GOAL) throw new ActionError("actions.input_invalid", "只能挂到目标上");
  return target.id;
};

/**
 * The parts' handlers, over Goals' own handlers as the platform runs them (`windowed`: each in the window Goals opens for it), so a part
 * may ask several of them in turn and wait between them. The parts open no window of their own.
 */
export function createGoalsAttachActionHandlers(windowed: readonly ActionHandlerBinding[]): ActionHandlerBinding[] {
  // Looked up when a part asks: a part over a handler that is not there is refused, the others still answer.
  const of = (definition: ActionDefinition) => (caller: ActionExecutionContext, input: unknown) => {
    const found = windowed.find(handler => handler.capability_id === definition.capability_id && handler.version === definition.version);
    if (!found) throw new ActionError("actions.definition_invalid", `Goals 缺少 ${definition.capability_id} 的处理`);
    return found.handle(caller, input);
  };
  const list = of(goalsInputActions.list), bind = of(goalsInputActions.bind), release = of(goalsInputActions.release);
  const directory = of(goalPluginActions.list), create = of(goalEntryActions.create);
  // The object itself as it follows its original; a fixed version of it (`ref`) is bound and taken off on the Goal's page, not here.
  const bindings = async (caller: ActionExecutionContext, subject: ActionSubject) => (await list(caller, { subject }) as { bindings: GoalBoundObject[] }).bindings
    .filter(binding => !binding.ref && binding.subject.kind === subject.kind && binding.subject.id === subject.id);
  const targets = async (caller: ActionExecutionContext, subject: ActionSubject, first?: string): Promise<PlacementRelationResult> => {
    const ids = [...new Set((await bindings(caller, subject)).map(binding => binding.goal_id))];
    return { targets: (first ? [first, ...ids.filter(id => id !== first)] : ids).map(asGoal) };
  };
  return [
    bindActionHandler(goalsAttachActions.list, (input, caller) => targets(caller, input.subject)),
    bindActionHandler(goalsAttachActions.bind, async (input, caller) => {
      // What the person read goes with it: its title names the input, its revision tells later whether the original changed.
      await bind(caller, { goal_id: goalOf(input.target), subject: input.subject, title: input.read?.title.trim() || input.subject.id,
        ...(input.read?.revision ? { read_revision: input.read.revision } : {}) });
      return targets(caller, input.subject);
    }),
    bindActionHandler(goalsAttachActions.release, async (input, caller) => {
      const goalId = goalOf(input.target);
      for (const binding of (await bindings(caller, input.subject)).filter(one => one.goal_id === goalId)) {
        await release(caller, { goal_id: goalId, binding_id: binding.binding_id });
      }
      return targets(caller, input.subject);
    }),
    bindActionHandler(goalsAttachActions.candidates, async (input, caller) => {
      const current = new Set((await bindings(caller, input.subject)).map(binding => binding.goal_id));
      const goals: string[] = [];
      let after: string | undefined;
      for (let page = 0; page < 5; page += 1) {
        const result = await directory(caller, { limit: 100, ...(after ? { after_cursor: after } : {}) }) as { goals: { goal_id: string }[]; next_cursor?: string | null };
        goals.push(...result.goals.map(goal => goal.goal_id));
        if (!result.next_cursor) break;
        after = result.next_cursor;
      }
      const ordered = [...goals.filter(id => current.has(id)), ...goals.filter(id => !current.has(id))];
      return { targets: ordered.map(id => ({ subject: asGoal(id), current: current.has(id) })) };
    }),
    bindActionHandler(goalsAttachActions.create, async (input, caller) => {
      // The start of the content becomes the Goal's outcome; where it came from is its why. The same request makes the same Goal.
      const source = input.read?.title.trim();
      const made = await create(caller, { title: input.name, outcome: input.read?.excerpt?.trim() || input.name,
        ...(source ? { why: uiText.text("goals.attach.source", { source }) } : {}), source_kind: "web",
        idempotency_key: (input.request_id ?? `attach:${input.subject.kind}:${input.subject.id}:${input.name}`).slice(0, 200) }) as { goal: { goal_id: string } };
      await bind(caller, { goal_id: made.goal.goal_id, subject: input.subject, title: source || input.subject.id,
        ...(input.read?.revision ? { read_revision: input.read.revision } : {}) });
      return targets(caller, input.subject, made.goal.goal_id);
    }),
  ];
}
