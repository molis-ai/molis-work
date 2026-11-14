import type { HookContext, HookVerdict, Run } from "@prologue/sdk";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkDelegationPermission } from "../delegation-permissions.js";
import { workDelegationKey, type WorkDelegationStore } from "../delegations.js";
import { agentErrors } from "../errors.js";
import type { PrologueStartInput } from "./prologue-ports.js";
import type { SessionIndex } from "./prologue-session-index.js";
import { GATEWAY_TOOLS, MEMORY_TOOLS } from "./prologue-action-gateway.js";
import { AGENT_TOOLS } from "../tool-catalog.js";
import { SUGGEST_TOOL_PREFIX } from "./prologue-action-tools.js";
import { stopSdkRun } from "./prologue-stop-run.js";

const WRITING_TOOLS = new Set(AGENT_TOOLS.filter(tool => tool.writes).map(tool => tool.runtime_name ?? tool.name));

/** Hold the original work selection for one round, with a synchronous invalidation even during start. */
export async function bindWorkDelegation(store: WorkDelegationStore, input: PrologueStartInput, owner: SessionIndex["owner"]) {
  if (!input.delegation) return undefined;
  const { subject, session_owner_id: sessionOwner } = input.delegation;
  const { executor } = subject;
  if (subject.kind !== "work" || subject.actor_id !== owner.actor_id || sessionOwner !== owner.project_id
    || subject.project_id !== null && subject.project_id !== sessionOwner
    || executor.plugin_id !== owner.plugin_id || executor.install_id !== owner.install_id || executor.role_id !== input.character.id) {
    throw agentErrors.delegation_invalid("工作授权与原会话及角色不一致");
  }
  const startControl = {
    beforeEffect: async () => { await input.beforeStart?.(); requireSynchronous(input.assertBeforeStart?.()); },
    assertCurrent: () => { requireSynchronous(input.assertBeforeStart?.()); },
  };
  await store.ensureWork(subject, startControl);
  const permission = await store.permission(subject);
  startControl.assertCurrent(); permission.assertCurrent();
  return createWorkDelegation(store, permission);
}

function createWorkDelegation(store: WorkDelegationStore, permission: WorkDelegationPermission) {
  const workKey = workDelegationKey(permission.subject);
  const ongoingKey = workDelegationKey({ kind: "ongoing", actor_id: permission.subject.actor_id,
    project_id: permission.subject.project_id, executor: permission.subject.executor });
  let active: Run | undefined, invalidated = false;
  const assertCurrent = () => {
    if (invalidated) throw agentErrors.delegation_changed("原工作的权限已变化，请按当前范围重新开始");
    permission.assertCurrent();
  };
  const release = store.subscribe(change => {
    const key = workDelegationKey(change.subject);
    if (key !== workKey && key !== ongoingKey) return;
    invalidated = true;
    const original = active;
    return original && change.reason === "selection" ? { settle: () => stopSdkRun(original) } : undefined;
  });
  return { store, permission, assertCurrent,
    accept(run: Run) { assertCurrent(); active = run; },
    release() { active = undefined; release(); },
  };
}

export type PrologueWorkDelegation = NonNullable<Awaited<ReturnType<typeof bindWorkDelegation>>>;

export function actionWorkVerdict(work: PrologueWorkDelegation | undefined): HookVerdict | undefined {
  if (!work || work.permission.mode === "original") return;
  work.assertCurrent();
  return work.permission.mode === "read-only" ? { kind: "deny", why: "当前工作只允许读取。" } : { kind: "ask", why: "按当前工作权限核对这一笔操作。" };
}

export function workToolVerdict(work: PrologueWorkDelegation | undefined, { toolName, input }: HookContext): HookVerdict | undefined {
  if (!work || work.permission.mode === "original" || !toolName) return;
  work.assertCurrent();
  if (work.permission.mode === "read-only" && (toolName === "board-wait" || toolName === GATEWAY_TOOLS.suggest || toolName === MEMORY_TOOLS.propose || toolName.startsWith(SUGGEST_TOOL_PREFIX))) {
    return { kind: "deny", why: "当前工作只允许读取；可以在回复里提出建议。" };
  }
  if (toolName === GATEWAY_TOOLS.direct) return { kind: "deny", why: `当前工作已选择权限方式，改动使用 ${GATEWAY_TOOLS.change}。` };
  if (toolName === "command-input" || toolName === "start-command" && typeof input === "object" && input !== null && "interactive" in input && input.interactive === true) {
    return { kind: "deny", why: "当前权限方式下使用普通命令或非交互的后台命令。" };
  }
  if (toolName === "surface-act" && typeof input === "object" && input !== null && "do" in input && input.do === "wait") return;
  const writes = toolName === "surface-act" || toolName.startsWith("mcp:") || WRITING_TOOLS.has(toolName);
  if (!writes || toolName === MEMORY_TOOLS.remember && work.permission.mode !== "read-only") return;
  return actionWorkVerdict(work);
}
