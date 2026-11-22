import type { StateMachineDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract, SandboxSchema } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { STATE_MACHINE_DECLARATION_LIMITS as LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin";
import { STATE_RING_FAMILIES, type StateRingFamily } from "@molis-ai/molis-work-contracts/platform/ui";
import { validVersion } from "./declaration-problems.js";
import { isRecord } from "./json-value.js";
import { stateMachineLocalId } from "./state-machine-declaration.js";

/**
 * The state machines of a sandbox plugin's contract (SMP-11). A generated plugin has no code that declares a machine: its
 * contract names the field its records carry a state in and gives every value of that field a family of the public
 * vocabulary. The checks and the Manifest's `state_machines` both come from here, so the two cannot drift.
 */
type Contract = Pick<SandboxPluginContract, "pluginId" | "operations" | "state_machines">;
const FAMILIES = new Set<string>(STATE_RING_FAMILIES.map(({ key }) => key));
const FIELD = /^[a-zA-Z_][a-zA-Z0-9_]{0,99}$/u;
const KEYS = ["field", "version", "states", "initial", "terminal"];

/** Every list of values the operations give `field`, wherever it sits in an input or an output. */
function valuesOf(contract: Contract, field: string): string[][] {
  const found: string[][] = [];
  const walk = (given: SandboxSchema | Readonly<Record<string, unknown>> | undefined, depth: number): void => {
    if (!given || depth > 8) return;
    const schema = given as SandboxSchema;
    if (schema.type === "array") return walk(schema.items, depth + 1);
    if (schema.type !== "object") return;
    for (const [name, spec] of Object.entries(schema.properties ?? {})) {
      if (name === field && spec.type === "string" && Array.isArray(spec.enum)) found.push(spec.enum.filter((value): value is string => typeof value === "string"));
      walk(spec, depth + 1);
    }
  };
  for (const operation of contract.operations) {
    walk(operation.input, 0);
    walk(operation.output, 0);
  }
  return found;
}

/** The first thing wrong with one declared machine, or nothing; `ids` holds the fields declared before it. */
function machineProblem(contract: Contract, machine: unknown, at: string, ids: Set<string>): string | undefined {
  if (!isRecord(machine) || Object.keys(machine).some(key => !KEYS.includes(key))) return `${at}只能写 field、version、states、initial、terminal`;
  const { field, version, states, initial, terminal } = machine;
  if (typeof field !== "string" || !FIELD.test(field)) return `${at}的 field 要写状态所在的字段名`;
  const local = field.toLowerCase();
  if (!stateMachineLocalId(local)) return `${at}的字段 ${field} 不能做状态机编号：字段名用字母开头，不超过 ${LIMITS.localId} 个字符`;
  if (ids.has(local)) return `${at}重复申报了字段 ${field}`;
  ids.add(local);
  if (!validVersion(version)) return `${at}（${field}）的 version 须为正整数`;
  if (!isRecord(states) || !Object.keys(states).length || Object.keys(states).length > LIMITS.states) return `${at}（${field}）要给每个取值写一个状态家族`;
  const declared = Object.keys(states), lists = valuesOf(contract, field);
  if (!lists.length) return `${at}的字段 ${field} 在操作的输入输出里不是枚举；状态字段要写成 "A|B|C" 这样的取值`;
  const wrong = lists.find(values => values.length !== declared.length || values.some(value => !declared.includes(value)));
  if (wrong) return `${at}（${field}）的取值要和字段的枚举完全一致：字段是 ${wrong.join("|")}，申报的是 ${declared.join("|")}`;
  const unknown = declared.filter(value => typeof states[value] !== "string" || !FAMILIES.has(states[value] as string));
  if (unknown.length) return `${at}（${field}）的取值 ${unknown.join("、")} 没有写可用的状态家族；可用：${[...FAMILIES].join(" / ")}`;
  if (typeof initial !== "string" || !declared.includes(initial)) return `${at}（${field}）的 initial 要是其中一个取值`;
  if (!Array.isArray(terminal) || terminal.some(value => typeof value !== "string" || !declared.includes(value)) || new Set(terminal).size !== terminal.length)
    return `${at}（${field}）的 terminal 要是不重复的取值列表，没有终点就写 []`;
  return undefined;
}

/** What is wrong with the contract's `state_machines`, in the words its author reads; empty when nothing is. */
export function sandboxStateMachineProblems(contract: Contract): string[] {
  const machines: unknown = contract.state_machines;
  if (machines === undefined) return [];
  if (!Array.isArray(machines) || machines.length > LIMITS.machines) return [`状态申报须为列表，最多 ${LIMITS.machines} 项`];
  const ids = new Set<string>();
  return machines.flatMap((machine, index) => machineProblem(contract, machine, `状态申报第 ${index + 1} 项`, ids) ?? []);
}

/**
 * The Manifest's declarations for a checked contract. A machine is named after its field; a state after its family, numbered
 * when a second value shares it (`running`, `running-2`), in the order the field lists its values: the Manifest's state ids are
 * plain lowercase names, and a generated plugin's values are whatever its person reads.
 */
export function sandboxStateMachineDeclarations(contract: Contract): StateMachineDeclaration[] | undefined {
  if (contract.state_machines === undefined) return undefined;
  const problems = sandboxStateMachineProblems(contract);
  if (problems.length) throw new Error(problems.join("；"));
  return contract.state_machines.map(machine => {
    const order = valuesOf(contract, machine.field)[0]!, used = new Map<string, number>(), ids = new Map<string, string>();
    for (const value of order) {
      const family = machine.states[value] as StateRingFamily, count = (used.get(family) ?? 0) + 1;
      used.set(family, count);
      ids.set(value, count === 1 ? family : `${family}-${count}`);
    }
    return {
      machine_id: `${contract.pluginId}.${machine.field.toLowerCase()}`,
      version: machine.version,
      states: Object.fromEntries(order.map(value => [ids.get(value)!, machine.states[value] as StateRingFamily])),
      initial: ids.get(machine.initial)!,
      terminal: order.filter(value => machine.terminal.includes(value)).map(value => ids.get(value)!),
    };
  });
}
