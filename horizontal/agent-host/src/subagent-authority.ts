import { randomUUID } from "node:crypto";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentStartExecution, AgentFrozenStart, AgentFrozenSubagentRole } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentStartAuthority } from "./index.js";
import { agentErrors } from "./errors.js";
import { currentCharacterMatches } from "./character-import.js";

/** Current Host authority, never the business parent's Work-specific tool closures. */
export function subagentExecution(authority: AgentStartAuthority, runtimeId: string,
  parent: Pick<AgentFrozenStart, "role_id" | "role_version" | "execution" | "host_tools" | "character">, owner: { actor_id: string; project_id: string }): AgentStartExecution {
  const assertParent = () => {
    const role = authority.manifest.roles.find(one => one.role_id === parent.role_id && one.version === parent.role_version);
    if (!role || (role.execution ?? "read-only") !== parent.execution || parent.host_tools.some(tool => !role.host_tools?.includes(tool))) {
      throw agentErrors.role_execution_exceeded("原父角色或工具权限已不可用");
    }
    const character = parent.character;
    if (character) {
      const declared = authority.manifest.characters;
      if (declared?.selection !== "optional-role" || declared.scope !== "owner" || !declared.role_ids.includes(parent.role_id) || !authority.characterVersion) {
        throw agentErrors.role_execution_exceeded("原角色已不可用");
      }
      const current = authority.characterVersion(character.version, owner.actor_id);
      if (!currentCharacterMatches(character, current, owner.project_id, owner.actor_id)) {
        throw agentErrors.role_execution_exceeded("原角色已不可用");
      }
    }
  };
  const assertSubagent = (role: Pick<AgentFrozenSubagentRole, "role_id" | "version" | "execution" | "host_tools">) => {
    assertParent();
    const declaration = authority.manifest.subagents;
    const current = declaration?.parent_role_ids.includes(parent.role_id)
      ? declaration.roles.find(one => one.role_id === role.role_id && one.version === role.version && (!one.parent_role_ids || one.parent_role_ids.includes(parent.role_id))) : undefined;
    if (!current || (current.execution ?? "read-only") !== role.execution || role.host_tools.some(tool => !current.host_tools?.includes(tool))) {
      throw agentErrors.role_execution_exceeded("原子角色或工具权限已不可用");
    }
  };
  return {
    beforeStart: async () => { await authority.beforeStart?.(); assertParent(); },
    assertBeforeStart: () => { requireSynchronous(authority.assertBeforeStart?.(), "最终授权检查必须同步完成"); assertParent(); },
    beforeDispatch: async () => { const fence = await authority.beforeDispatch?.(); assertParent(); return () => { requireSynchronous(fence?.(), "最终派发检查必须同步完成"); assertParent(); }; },
    assertBeforeDispatch: () => { requireSynchronous(authority.assertBeforeDispatch?.()); assertParent(); },
    assertSubagent,
    async subagentGateway(role, session) {
      assertSubagent(role);
      if (!["read-only", "operate"].includes(role.execution) || !authority.actions) {
        throw agentErrors.role_execution_exceeded("原业务子角色或工具权限已不可用");
      }
      const granted = await authority.actions(runtimeId, undefined, session, { consumer: "agent", named: structuredClone(authority.skillCatalog?.named ?? []), round: randomUUID() });
      // The child has its own session context and may use ordinary authorized actions/reviews. The parent's delegation,
      // delivery and memory tools are bound to its Work and cannot become a child's authority by object inheritance.
      const { discover, invoke, check, offer, direct, prepareReview } = granted;
      return { operate: role.execution === "operate", client: {
        discover: () => discover.call(granted), invoke: (...args) => invoke.call(granted, ...args),
        ...(check ? { check: (...args: Parameters<NonNullable<typeof check>>) => check.call(granted, ...args) } : {}),
        ...(offer ? { offer: (...args: Parameters<NonNullable<typeof offer>>) => offer.call(granted, ...args) } : {}),
        ...(prepareReview ? { prepareReview: (...args: Parameters<NonNullable<typeof prepareReview>>) => prepareReview.call(granted, ...args) } : {}),
        ...(direct ? { direct: (...args: Parameters<NonNullable<typeof direct>>) => direct.call(granted, ...args) } : {}),
      } };
    },
  };
}
