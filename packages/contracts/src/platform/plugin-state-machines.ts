import type { StateRingFamily } from "./ui-state-rings.js";

export interface StateMachineDeclaration<State extends string = string> {
  readonly machine_id: string;
  readonly version: number;
  readonly states: Readonly<Record<State, StateRingFamily>>;
  readonly initial: State;
  readonly terminal: readonly State[];
}

export const STATE_MACHINE_DECLARATION_LIMITS = {
  machines: 32,
  states: 64,
  transitions: 256,
  id: 160,
  localId: 64,
} as const;
