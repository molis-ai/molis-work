import { WORK_EXECUTOR_PROTOCOL, WORK_EXECUTOR_ROLES, workExecutorRoleOf, type WorkExecutorRole } from "@molis-ai/molis-work-contracts/platform/actions";

// The checks a work executor's actions get (PG-036): each role action as its role fixes it, and a group that takes on any role takes
// on every role, once each. The protocol itself (roles, types, schemas, `defineWorkExecutorActions`) is in the contracts package, like
// the four protocols `source-declarations.ts` checks; these checks are not part of the SDK's public exports.

const TYPES: ReadonlySet<string> = new Set(WORK_EXECUTOR_ROLES.flatMap(name => [WORK_EXECUTOR_PROTOCOL[name].input_type, WORK_EXECUTOR_PROTOCOL[name].output_type]));
const roleOf = (action: Record<string, unknown>) => workExecutorRoleOf(action as { input_type?: string; output_type?: string });

/** One definition: a role action has both of its role's types and schemas, the role's operation and kind, project scope, and `user` among its audiences. */
export function workExecutorDeclarationProblems(key: string, action: Record<string, unknown>, operation: unknown, canonical: (value: unknown) => string): string[] {
  if (!TYPES.has(String(action.input_type)) && !TYPES.has(String(action.output_type))) return [];
  const name = roleOf(action), contract = name ? WORK_EXECUTOR_PROTOCOL[name] : null;
  // The Assistant calls every role as the local person; a role closed to `user` could never be called.
  const openToUser = Array.isArray(action.audiences) && (action.audiences as unknown[]).includes("user");
  if (!contract || operation !== contract.operation || action.kind !== (contract.operation === "query" ? "query" : "operation") || action.scope !== "project" || !openToUser
    || canonical(action.input_schema) !== canonical(contract.input_schema) || canonical(action.output_schema) !== canonical(contract.output_schema)) {
    return [`能力 ${key} 没有兑现工作执行方协议 v1：需要同一角色的输入输出类型与规范 schema、与角色一致的查询或命令、项目范围，并对本机用户开放`];
  }
  return [];
}

/** One group (a Manifest's actions, one registration): taking on any role means publishing each role exactly once, so no directory shows half an executor. */
export function workExecutorSetProblems(actions: readonly { readonly action: Record<string, unknown> }[]): string[] {
  const roles = actions.map(entry => roleOf(entry.action)).filter((name): name is WorkExecutorRole => name !== null);
  if (!roles.length) return [];
  const missing = WORK_EXECUTOR_ROLES.filter(name => !roles.includes(name));
  const twice = WORK_EXECUTOR_ROLES.filter(name => roles.filter(entry => entry === name).length > 1);
  if (!missing.length && !twice.length) return [];
  return [`工作执行方要一次发布全部角色，每个角色一个动作：${[...missing.map(name => `缺 ${name}`), ...twice.map(name => `${name} 重复`)].join("、")}`];
}
