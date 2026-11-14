import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { STATE_MACHINE_DECLARATION_LIMITS as LIMITS, type StateMachineDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { StateRingFamily } from "@molis-ai/molis-work-contracts/platform/ui";
import { isRecord } from "./json-value.js";
import { validVersion } from "./declaration-problems.js";
import { stateMachineDeclaration, stateMachineErrors, stateMachineLocalId } from "./state-machine-declaration.js";

export { inspectStateMachineDeclarations, stateMachineErrors } from "./state-machine-declaration.js";
export type { StateMachineDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

export interface StateMachineTransition<State extends string> {
  readonly from: readonly State[];
  readonly to: State;
  readonly trigger?: Pick<ActionReference, "capability_id" | "version">;
}

export interface StateMachineDefinition<State extends string, Event extends string> extends StateMachineDeclaration<State> {
  readonly transitions: Readonly<Record<Event, StateMachineTransition<State>>>;
  /** Nonterminal states that can take any declared transition. */
  readonly allow_any?: readonly State[];
}

export interface StateMachinePort<State extends string> {
  beforeEffect(): void | Promise<void>;
  compareAndSet(expected: State, next: State): boolean | Promise<boolean>;
}

export interface StateMachine<State extends string, Event extends string> {
  can(from: State, event: Event): boolean;
  assert(from: State, event: Event): void;
  next(from: State, event: Event): State;
  family(state: State): StateRingFamily;
  /** Checked code declaration. Only describe() is serialized into the Manifest. */
  readonly definition: StateMachineDefinition<State, Event>;
  describe(): StateMachineDeclaration<State>;
  apply(port: StateMachinePort<State>, input: { readonly expectedFrom: State; readonly event: Event }): Promise<State>;
}

const ACTION_ID = /^[a-z][a-z0-9_.-]*$/u;
const isTrigger = (value: unknown) => isRecord(value) && Object.keys(value).every(key => key === "capability_id" || key === "version")
  && typeof value.capability_id === "string" && value.capability_id.length <= LIMITS.id && ACTION_ID.test(value.capability_id) && validVersion(value.version);

function checkedTransitions<State extends string, Event extends string>(
  definition: StateMachineDefinition<State, Event>, declaration: StateMachineDeclaration<State>,
) {
  const { transitions, allow_any: unrestricted = [] } = definition;
  const fail = (reason: string): never => { throw stateMachineErrors.declaration_invalid(`状态机 ${declaration.machine_id} ${reason}`); };
  const states = new Set<string>(Object.keys(declaration.states)), terminal = new Set<string>(declaration.terminal);
  const any = new Set<string>();
  if (!Array.isArray(unrestricted) || unrestricted.length > states.size) return fail("的 allow_any 必须为非终态数组");
  for (const state of unrestricted) {
    if (!states.has(state) || terminal.has(state) || any.has(state)) return fail("的 allow_any 含未声明、终态或重复状态");
    any.add(state);
  }
  if (!isRecord(transitions)) return fail("的 transitions 必须为对象");
  const rows = Object.entries<StateMachineTransition<State>>(transitions);
  if (rows.length > LIMITS.transitions) return fail(`最多能声明 ${LIMITS.transitions} 条转换`);
  const rules = new Map<string, StateMachineTransition<State>>();
  const outbound = new Set(any);
  for (const [event, edge] of rows) {
    if (!stateMachineLocalId(event) || !isRecord(edge) || !states.has(edge.to) || !Array.isArray(edge.from)
      || edge.from.length < 1 || edge.from.length > states.size || new Set(edge.from).size !== edge.from.length
      || Object.keys(edge).some(key => !["from", "to", "trigger"].includes(key)) || (edge.trigger !== undefined && !isTrigger(edge.trigger)))
      return fail("含不合法的转换定义");
    for (const state of edge.from) {
      if (!states.has(state) || terminal.has(state)) return fail("的转换须从已声明的非终态出发");
      outbound.add(state);
    }
    rules.set(event, Object.freeze({ from: Object.freeze([...edge.from]), to: edge.to,
      ...(edge.trigger ? { trigger: Object.freeze({ ...edge.trigger }) } : {}) }));
  }
  for (const state of states) if (!terminal.has(state) && !outbound.has(state)) return fail(`的非终态 ${state} 没有出边`);
  return { any, rules };
}

export function defineStateMachine<State extends string, Event extends string>(
  definition: StateMachineDefinition<State, Event>,
): StateMachine<State, Event> {
  const { machine_id, version, states, initial, terminal } = definition;
  const declaration = stateMachineDeclaration({ machine_id, version, states, initial, terminal }, "状态机") as StateMachineDeclaration<State>;
  const { any, rules } = checkedTransitions(definition, declaration);
  const checked: StateMachineDefinition<State, Event> = Object.freeze({
    ...declaration, transitions: Object.freeze(Object.fromEntries(rules)) as StateMachineDefinition<State, Event>["transitions"],
    ...(definition.allow_any ? { allow_any: Object.freeze([...definition.allow_any]) } : {}),
  });
  const can = (from: State, event: Event) => {
    const rule = rules.get(event);
    return rule !== undefined && (any.has(from) || rule.from.includes(from));
  };
  const family = (state: State): StateRingFamily => {
    if (!Object.hasOwn(declaration.states, state)) throw stateMachineErrors.state_unknown(`状态机 ${machine_id} 没有这个状态`);
    return declaration.states[state];
  };
  const next = (from: State, event: Event) => {
    family(from);
    if (!can(from, event)) throw stateMachineErrors.transition_invalid(`状态机 ${machine_id} 在当前状态不允许这个转换`);
    return rules.get(event)!.to;
  };
  return Object.freeze({
    can, next, family, assert: (from: State, event: Event) => { next(from, event); },
    definition: checked, describe: () => declaration,
    async apply(port: StateMachinePort<State>, { expectedFrom, event }: { expectedFrom: State; event: Event }) {
      const target = next(expectedFrom, event);
      await port.beforeEffect();
      if (!await port.compareAndSet(expectedFrom, target)) throw stateMachineErrors.state_changed(`状态机 ${machine_id} 的状态已变化`);
      return target;
    },
  });
}
