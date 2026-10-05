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
  projectId: string;
  workspaceFor(projectId: string): ProjectWorkspaceRef | null | Promise<ProjectWorkspaceRef | null>;
  /** The memories the Host chooses for one scheduled run (Agent work in this project); none when not given. */
  memory?: (task: string, title: string) => ReturnType<NonNullable<AgentStartAuthority["memory"]>>;
}): ScheduledTaskRunner {
  return {
    async run(input, control) {
      control?.beforeEffect();
      await options.ready?.();
      control?.beforeEffect();
      // Scheduled work runs on Prologue, the Home's model path. An installed CLI Runtime
      // is never picked just because its id sorts first.
      if (!options.agentHost.descriptors().some((descriptor) => descriptor.runtime_id === PROLOGUE_RUNTIME_ID)) {
        throw new Error("还没有可用的 Agent Runtime：到点执行需要 Prologue，请先配置文字模型");
      }
      const workspace = await options.workspaceFor(options.projectId);
      control?.beforeEffect();
      if (workspace === null || !workspace.realpath_verified) {
        throw new Error("这个项目还没有绑定工作区，只读 Agent 无法启动");
      }
      const declared = BUILTIN_PLUGIN_AGENTS.get(SCHEDULE_PLUGIN_ID);
      if (!declared) throw new Error("Schedule 没有声明可运行的 Agent");
      const authority: AgentStartAuthority = {
        manifest: declared.manifest,
        authorizedDirectories: [workspace.canonical_path],
        prompts: declared.prompts,
        ...(control ? { beforeDispatch: () => control.beforeEffect() } : {}),
        ...(options.memory ? { memory: (task: string) => options.memory!(task, input.title) } : {}),
      };
      const runtimeId = PROLOGUE_RUNTIME_ID;
      const adapter = options.agentHost.adapter(runtimeId);
      const directory = {
        canonical_path: workspace.canonical_path,
        realpath_verified: true as const,
      };
      const session = await adapter.createSession({
        project_id: options.projectId,
        plugin_id: SCHEDULE_PLUGIN_ID,
        install_id: SCHEDULE_PLUGIN_ID,
        actor_id: "schedule",
        directory,
        title: input.title,
      });
      control?.beforeEffect();
      const handle = await options.agentHost.start(runtimeId, {
        session,
        project_id: options.projectId,
        plugin_id: SCHEDULE_PLUGIN_ID,
        install_id: SCHEDULE_PLUGIN_ID,
        actor_id: "schedule",
        task: composeScheduledTaskPrompt(input),
        role_id: SCHEDULE_READER_ROLE,
        directory,
      }, authority);
      const deadline = Date.now() + RUN_TIMEOUT_MS;
      let ended = false, cancelling: Promise<unknown> | undefined;
      const cancel = () => { cancelling ??= adapter.control(handle.ref, { kind: "cancel" }).catch(() => undefined); return cancelling; };
      const onAbort = () => { void cancel(); };
      control?.signal.addEventListener("abort", onAbort, { once: true });
      try {
        while (Date.now() < deadline) {
          control?.beforeEffect();
          const view = await adapter.read(handle.ref);
          control?.beforeEffect();
          if (view.phase === "awaiting-input" || view.phase === "awaiting-review") {
            throw new Error("到点执行不能停下来等人确认");
          }
          if (isTerminalAgentPhase(view.phase)) {
            ended = true;
            if (view.phase !== "completed") {
              throw new Error(view.stop_reason || `这一轮以 ${view.phase} 结束`);
            }
            const last = [...view.turns].reverse().find((turn) => turn.kind === "assistant");
            if (!last?.text.trim()) throw new Error("Agent 没有写出正文");
            return parseScheduledAgentReply(last.text);
          }
          await delay(POLL_MS, control?.signal);
        }
        throw new Error("到点执行超时");
      } finally {
        control?.signal.removeEventListener("abort", onAbort);
        if (!ended) await cancel();
        else await cancelling;
      }
    },
  };
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
    if (signal?.aborted) done();
  });
}
