import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { PROLOGUE_RUNTIME_ID, type AgentHost, type AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import { BUILTIN_PLUGIN_AGENTS } from "@molis-ai/molis-work-app-workbench";
import {
  SCHEDULE_PLUGIN_ID,
  SCHEDULE_READER_ROLE,
  composeScheduledTaskPrompt,
  parseScheduledAgentReply,
  type ScheduledTaskRunner,
} from "@molis-ai/molis-work-plugin-schedule";

const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const POLL_MS = 400;

export function createHostScheduledTaskRunner(options: {
  agentHost: AgentHost;
  /** Settles once the Home's Prologue adapter is registered; it registers lazily. */
  ready?: () => Promise<void>;
  boardId: string;
  projectId: string;
  workspaceFor(projectId: string): ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
}): ScheduledTaskRunner {
  return {
    async run(input) {
      await options.ready?.();
      // Scheduled work runs on Prologue, the Home's model path. An installed CLI Runtime
      // is never picked just because its id sorts first.
      if (!options.agentHost.descriptors().some((descriptor) => descriptor.runtime_id === PROLOGUE_RUNTIME_ID)) {
        throw new Error("还没有可用的 Agent Runtime：到点执行需要 Prologue，请先配置文字模型");
      }
      const workspace = await options.workspaceFor(options.projectId);
      if (workspace === null || !workspace.realpath_verified) {
        throw new Error("这个项目还没有绑定工作区，只读 Agent 无法启动");
      }
      const declared = BUILTIN_PLUGIN_AGENTS.get(SCHEDULE_PLUGIN_ID);
      if (!declared) throw new Error("Schedule 没有声明可运行的 Agent");
      const authority: AgentStartAuthority = {
        manifest: declared.manifest,
        authorizedDirectories: [workspace.canonical_path],
        prompts: declared.prompts,
      };
      const runtimeId = PROLOGUE_RUNTIME_ID;
      const adapter = options.agentHost.adapter(runtimeId);
      const directory = {
        canonical_path: workspace.canonical_path,
        realpath_verified: true as const,
      };
      const session = await adapter.createSession({
        board_id: options.boardId,
        plugin_id: SCHEDULE_PLUGIN_ID,
        install_id: SCHEDULE_PLUGIN_ID,
        actor_id: "schedule",
        directory,
        title: input.title,
      });
      const handle = await options.agentHost.start(runtimeId, {
        session,
        board_id: options.boardId,
        plugin_id: SCHEDULE_PLUGIN_ID,
        install_id: SCHEDULE_PLUGIN_ID,
        actor_id: "schedule",
        task: composeScheduledTaskPrompt(input),
        role_id: SCHEDULE_READER_ROLE,
        directory,
      }, authority);
      const deadline = Date.now() + RUN_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const view = await adapter.read(handle.ref);
        if (view.phase === "awaiting-input" || view.phase === "awaiting-review") {
          await adapter.control(handle.ref, { kind: "cancel" });
          throw new Error("到点执行不能停下来等人确认");
        }
        if (isTerminalAgentPhase(view.phase)) {
          if (view.phase !== "completed") {
            throw new Error(view.stop_reason || `这一轮以 ${view.phase} 结束`);
          }
          const last = [...view.turns].reverse().find((turn) => turn.kind === "assistant");
          if (!last?.text.trim()) throw new Error("Agent 没有写出正文");
          return parseScheduledAgentReply(last.text);
        }
        await delay(POLL_MS);
      }
      await adapter.control(handle.ref, { kind: "cancel" }).catch(() => undefined);
      throw new Error("到点执行超时");
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
