import { agentErrors } from "./errors.js";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentCallPorts, Call, Register } from "./capability-ports.js";

/**
 * The caller's own method library and MCP servers (`skill_owner`): no input names another's. Saving or connecting a
 * server checks its directory is one the Host authorized for the caller, and what the servers offer is republished after.
 */
export function registerLibraryActions<C extends Call>(register: Register<C>, ports: AgentCallPorts<C>): Array<() => void> {
  return [
    register(agentHostCapabilities.listSkills, async (context, [runtimeId]) =>
      ports.agentHost(context).skillCatalog(runtimeId, await ports.authority(context))),
    register(agentHostCapabilities.readSkill, async (context, [runtimeId, ref]) =>
      ports.agentHost(context).readSkill(runtimeId, await ports.authority(context), ref)),
    register(agentHostCapabilities.discoverSkills, async (context, [runtimeId, directory, path]) =>
      ports.agentHost(context).discoverSkills(runtimeId, await ports.authority(context), directory, path)),
    register(agentHostCapabilities.installSkill, async (context, [runtimeId, candidateId]) => {
      const authority = await ports.authority(context);
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      return ports.agentHost(context).installSkill(runtimeId, authority, candidateId);
    }),

    register(agentHostCapabilities.listMcp, async (context, [runtimeId]) => {
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, await ports.authority(context));
      const servers = await library.list(owner);
      await ports.mcpChanged(context, runtimeId, library, owner);
      return servers;
    }),
    register(agentHostCapabilities.saveMcp, async (context, [runtimeId, input]) => {
      const authority = await ports.authority(context);
      if (input.transport === "stdio" && (!input.directory?.realpath_verified || !authority.authorizedDirectories.includes(input.directory.canonical_path))) throw agentErrors.directory_unauthorized("MCP 进程目录必须是当前项目的授权工作区");
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, authority);
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      const saved = await library.save(owner, input);
      await ports.mcpChanged(context, runtimeId, library, owner);
      return saved;
    }),
    register(agentHostCapabilities.controlMcp, async (context, [runtimeId, id, action]) => {
      const authority = await ports.authority(context);
      const { library, owner } = ports.agentHost(context).mcpLibrary(runtimeId, authority);
      if (action === "connect") {
        const server = (await library.list(owner)).find(item => item.id === id);
        if (server?.transport === "stdio" && !authority.authorizedDirectories.includes(server.directory?.canonical_path ?? "")) throw agentErrors.directory_unauthorized("MCP 的原工作区已不可用，请重新配置");
      }
      await context.invocation.beforeEffect(); context.invocation.assertAuthorityCurrent();
      await library.control(owner, id, action);
      await ports.mcpChanged(context, runtimeId, library, owner);
    }),
  ];
}
