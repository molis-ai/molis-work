import type { ActionDefinition } from "./actions.js";
import type { StateRingFamily } from "./ui-state-rings.js";
import { TEXT_REF_LIMITS } from "./ui-text.js";

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
  id: TEXT_REF_LIMITS.owner + 1 + 64,
  localId: 64,
} as const;

/** Platform owner of the read-only state machine registry (specs/state-machine-platform §4.4). */
export const STATE_MACHINES_PROVIDER_ID = "system.state-machines";

/**
 * One owner's declared machines, as the registry projects them from a definition or an installation's stored Manifest. Metadata
 * only: no business value, no secret, no content. `unknown` says why the machines could not be read; nothing is guessed.
 */
export interface StateMachineRegistryEntry {
  readonly owner: "platform" | "plugin";
  /** The declaring plugin; the owning package for a platform machine. */
  readonly owner_id: string;
  readonly version: string | null;
  readonly scope: "platform" | "home" | "project";
  readonly source: "platform" | "builtin" | "installed";
  /** The installation the entry was read for; null for a platform machine and for a built-in plugin not installed in the caller's scope. */
  readonly install_id: string | null;
  /** That installation's lifecycle state; null where `install_id` is. */
  readonly installation_state: string | null;
  readonly machines: readonly StateMachineDeclaration[];
  readonly unknown?: "manifest_unavailable" | "declaration_invalid";
}

export interface StateMachineListResult {
  readonly entries: readonly StateMachineRegistryEntry[];
  /** Why no plugin has an entry: this host runs without a Home, or nothing is built in or installed in the caller's scope. */
  readonly empty_reason?: "no_home" | "no_plugins_in_scope";
}

export interface StateMachineGetResult {
  /** The owner's entry holding only the requested machine; null when no readable declaration has that id in the caller's scope. */
  readonly entry: StateMachineRegistryEntry | null;
}

const MACHINE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["machine_id", "version", "states", "initial", "terminal"],
  properties: {
    machine_id: { type: "string", minLength: 1, maxLength: STATE_MACHINE_DECLARATION_LIMITS.id },
    version: { type: "integer", minimum: 1 },
    states: { type: "object", maxProperties: STATE_MACHINE_DECLARATION_LIMITS.states, additionalProperties: { type: "string", maxLength: 32 } },
    initial: { type: "string", maxLength: STATE_MACHINE_DECLARATION_LIMITS.localId },
    terminal: { type: "array", maxItems: STATE_MACHINE_DECLARATION_LIMITS.states, items: { type: "string", maxLength: STATE_MACHINE_DECLARATION_LIMITS.localId } },
  },
} as const;

const ENTRY_SCHEMA = {
  type: "object", additionalProperties: false, required: ["owner", "owner_id", "version", "scope", "source", "install_id", "installation_state", "machines"],
  properties: {
    owner: { type: "string", enum: ["platform", "plugin"] },
    owner_id: { type: "string", minLength: 1, maxLength: 200 },
    version: { type: ["string", "null"], maxLength: 64 },
    scope: { type: "string", enum: ["platform", "home", "project"] },
    source: { type: "string", enum: ["platform", "builtin", "installed"] },
    install_id: { type: ["string", "null"], maxLength: 200 },
    installation_state: { type: ["string", "null"], maxLength: 32 },
    machines: { type: "array", maxItems: STATE_MACHINE_DECLARATION_LIMITS.machines, items: MACHINE_SCHEMA },
    unknown: { type: "string", enum: ["manifest_unavailable", "declaration_invalid"] },
  },
} as const;

export const stateMachineActions = {
  list: {
    capability_id: "state_machines.list", version: /* @version action.state_machines.list */ 1, operation: "query",
    action: {
      kind: "query", scope: "home", audiences: ["user", "agent", "mcp"], permissions: [], subject_kinds: [],
      title: "列出已申报的状态机",
      description: "列出平台和当前范围内各插件申报的状态机：每台机器的状态、所属状态家族、起始与终止状态。只含元数据，停用或没启动的插件也能读到。",
      input_schema: {
        type: "object", additionalProperties: false,
        properties: { plugin_id: { type: "string", minLength: 1, maxLength: 200 } },
      },
      output_schema: {
        type: "object", additionalProperties: false, required: ["entries"],
        properties: { entries: { type: "array", items: ENTRY_SCHEMA }, empty_reason: { type: "string", enum: ["no_home", "no_plugins_in_scope"] } },
      },
    },
  } as ActionDefinition<{ plugin_id?: string }, StateMachineListResult>,
  get: {
    capability_id: "state_machines.get", version: /* @version action.state_machines.get */ 1, operation: "query",
    action: {
      kind: "query", scope: "home", audiences: ["user", "agent", "mcp"], permissions: [], subject_kinds: [],
      title: "读取一台状态机的申报",
      description: "按 machine_id 读取一台已申报状态机的状态、状态家族、起始与终止状态，以及申报它的插件或平台服务。只含元数据。",
      input_schema: {
        type: "object", additionalProperties: false, required: ["machine_id"],
        properties: {
          machine_id: { type: "string", minLength: 1, maxLength: STATE_MACHINE_DECLARATION_LIMITS.id },
          install_id: { type: "string", minLength: 1, maxLength: 200 },
        },
      },
      output_schema: {
        type: "object", additionalProperties: false, required: ["entry"],
        properties: { entry: { anyOf: [ENTRY_SCHEMA, { type: "null" }] } },
      },
    },
  } as ActionDefinition<{ machine_id: string; install_id?: string }, StateMachineGetResult>,
} as const;
