import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { STATE_MACHINE_DECLARATION_LIMITS as LIMITS, type StateMachineDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { StateRingFamily } from "@molis-ai/molis-work-contracts/platform/ui";
import { isRecord } from "./json-value.js";
import { validVersion } from "./declaration-problems.js";
import { isId } from "./action-declarations.js";
import { stateMachineDeclaration, stateMachineErrors, stateMachineLocalId } from "./state-machine-declaration.js";

export { inspectStateMachineDeclarations, stateMachineErrors } from "./state-machine-declaration.js";
export type { StateMachineDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";

export interface StateMachineTransition<TState extends string> {
  readonly from: readonly TState[];
  readonly to: TState;
  readonly trigger?: Pick<ActionReference, "capability_id" | "version">;
}

export interface StateMachineDefinition<TState extends string, TEvent extends string> extends StateMachineDeclaration<TState> {
  readonly transitions: Readonly<Record<TEvent, StateMachineTransition<TState>>>;
  /** Nonterminal states that can take any declared transition. */
  readonly allow_any?: readonly TState[];
}

export interface StateMachinePort<TState extends string> {
  beforeEffect(): void | Promise<void>;
  compareAndSet(expected: TState, next: TState): boolean | Promise<boolean>;
}

export interface StateMachine<TState extends string, TEvent extends string> {
  can(from: TState, event: TEvent): boolean;
  assert(from: TState, event: TEvent): void;
  next(from: TState, event: TEvent): TState;
  family(state: TState): StateRingFamily;
  /** Checked code declaration. Only describe() is serialized into the Manifest. */
  readonly definition: StateMachineDefinition<TState, TEvent>;
  describe(): StateMachineDeclaration<TState>;
  apply(port: StateMachinePort<TState>, input: { readonly expectedFrom: TState; readonly event: TEvent }): Promise<TState>;
}

const isTrigger = (value: unknown) => isRecord(value) && Object.keys(value).every(key => key === "capability_id" || key === "version")
  && isId(value.capability_id) && value.capability_id.length <= LIMITS.id && validVersion(value.version);

function checkedTransitions<TState extends string, TEvent extends string>(
  definition: StateMachineDefinition<TState, TEvent>, declaration: StateMachineDeclaration<TState>,
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
  const rows = Object.entries<StateMachineTransition<TState>>(transitions);
  if (rows.length > LIMITS.transitions) return fail(`最多能声明 ${LIMITS.transitions} 条转换`);
  const rules = new Map<string, StateMachineTransition<TState>>();
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

export function defineStateMachine<TState extends string, TEvent extends string>(
  definition: StateMachineDefinition<TState, TEvent>,
): StateMachine<TState, TEvent> {
  const { machine_id, version, states, initial, terminal } = definition;
  const declaration = stateMachineDeclaration({ machine_id, version, states, initial, terminal }, "状态机") as StateMachineDeclaration<TState>;
  const { any, rules } = checkedTransitions(definition, declaration);
  const checked: StateMachineDefinition<TState, TEvent> = Object.freeze({
    ...declaration, transitions: Object.freeze(Object.fromEntries(rules)) as StateMachineDefinition<TState, TEvent>["transitions"],
    ...(definition.allow_any ? { allow_any: Object.freeze([...definition.allow_any]) } : {}),
  });
  const can = (from: TState, event: TEvent) => {
    const rule = rules.get(event);
    return rule !== undefined && (any.has(from) || rule.from.includes(from));
  };
  const family = (state: TState): StateRingFamily => {
    if (!Object.hasOwn(declaration.states, state)) throw stateMachineErrors.state_unknown(`状态机 ${machine_id} 没有这个状态`);
    return declaration.states[state];
  };
  const next = (from: TState, event: TEvent) => {
    family(from);
    if (!can(from, event)) throw stateMachineErrors.transition_invalid(`状态机 ${machine_id} 在当前状态不允许这个转换`);
    return rules.get(event)!.to;
  };
  return Object.freeze({
    can, next, family, assert: (from: TState, event: TEvent) => { next(from, event); },
    definition: checked, describe: () => declaration,
    async apply(port: StateMachinePort<TState>, { expectedFrom, event }: { expectedFrom: TState; event: TEvent }) {
      const target = next(expectedFrom, event);
      await port.beforeEffect();
      if (!await port.compareAndSet(expectedFrom, target)) throw stateMachineErrors.state_changed(`状态机 ${machine_id} 的状态已变化`);
      return target;
    },
  });
}
