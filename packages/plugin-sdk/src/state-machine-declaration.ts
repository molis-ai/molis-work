import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { STATE_MACHINE_DECLARATION_LIMITS as LIMITS, type StateMachineDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { STATE_RING_FAMILIES } from "@molis-ai/molis-work-contracts/platform/ui";
import { validVersion } from "./declaration-problems.js";
import { isRecord } from "./json-value.js";

export const stateMachineErrors = defineErrorCodes("state_machines", {
  declaration_invalid: "invalid",
  state_unknown: "invalid",
  transition_invalid: "conflict",
  state_changed: "conflict",
});

const MACHINE_ID = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/u;
const LOCAL_ID = /^[a-z][a-z0-9_-]*$/u;
const KEYS = new Set(["machine_id", "version", "states", "initial", "terminal"]);
const FAMILIES = new Set<string>(STATE_RING_FAMILIES.map(({ key }) => key));

export function stateMachineLocalId(value: unknown): value is string {
  return typeof value === "string" && value.length <= LIMITS.localId && LOCAL_ID.test(value);
}

export function stateMachineDeclaration(value: unknown, at: string, pluginId?: string): StateMachineDeclaration {
  const fail = (reason: string): never => { throw stateMachineErrors.declaration_invalid(`${at} ${reason}`); };
  if (!isRecord(value)) return fail("必须为对象");
  if (Object.keys(value).some(key => !KEYS.has(key))) return fail("只能填写 machine_id、version、states、initial、terminal");
  const { machine_id, version, states, initial, terminal } = value;
  if (typeof machine_id !== "string" || machine_id.length > LIMITS.id || !MACHINE_ID.test(machine_id)) return fail("的 machine_id 不合法");
  if (pluginId === undefined && machine_id.startsWith("platform.") && machine_id.split(".").length < 3) return fail("的平台机器须写 platform.<owner>.<object>");
  if (pluginId !== undefined && (machine_id.startsWith("platform.") || !machine_id.startsWith(pluginId + ".") ||
      !stateMachineLocalId(machine_id.slice(pluginId.length + 1)))) return fail("的 machine_id 须以自己的插件 ID 开头");
  if (!validVersion(version)) return fail("的 version 必须为正整数");
  if (!isRecord(states)) return fail("的 states 必须为状态到家族的对象");
  const entries = Object.entries(states);
  if (!entries.length || entries.length > LIMITS.states) return fail(`的 states 须有 1 到 ${LIMITS.states} 项`);
  if (entries.some(([state, family]) => !stateMachineLocalId(state) || typeof family !== "string" || !FAMILIES.has(family))) return fail("含无效状态名或状态家族");
  const hasState = (state: unknown): state is string => typeof state === "string" && Object.hasOwn(states, state);
  if (!hasState(initial)) return fail("的 initial 须引用已声明状态");
  if (!Array.isArray(terminal) || terminal.length > entries.length || !Array.from(terminal).every(hasState) || new Set(terminal).size !== terminal.length)
    return fail("的 terminal 须引用不重复的已声明状态");
  return Object.freeze({ machine_id, version, states: Object.freeze({ ...states }) as StateMachineDeclaration["states"],
    initial, terminal: Object.freeze([...terminal]) });
}

export function inspectStateMachineDeclarations(value: unknown, pluginId: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > LIMITS.machines)
    throw stateMachineErrors.declaration_invalid(`state_machines 须为数组，最多 ${LIMITS.machines} 项`);
  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    const { machine_id } = stateMachineDeclaration(item, `state_machines[${index}]`, pluginId);
    if (seen.has(machine_id)) throw stateMachineErrors.declaration_invalid(`state_machines 重复声明了 ${machine_id}`);
    seen.add(machine_id);
  }
}
