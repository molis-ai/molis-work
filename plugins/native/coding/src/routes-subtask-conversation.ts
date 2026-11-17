import { agentHostCapabilities as agent, type AgentSubagentCommand } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PluginRouteBinding, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { selected, type CodingActivation } from "./route-activation.js";
import { bodyOf } from "./route-selections.js";
import { text } from "./run-inputs.js";
import { codingFailure } from "./words.js";
import type { CodingExecution } from "./routes.js";

/** Coding supplies only its owned parent reference. The Host owns child history, admission and original requests. */
export function subtaskConversationRoutes(a: CodingActivation): PluginRouteBinding[] {
  const target = (request: PluginRouteRequest, execution: CodingExecution) => {
    const record = selected(a, request, execution);
    if (!record.runtime_session_id) throw codingFailure("coding.server.no-subtasks");
    return { session: { runtime_id: record.runtime_id, session_id: record.runtime_session_id },
      run: { session_id: record.runtime_session_id, run_id: text(request.params.runId, "coding.field.original-run") },
      child: text(request.params.childId, "coding.field.subtask") };
  };
  return [
    a.route("coding.read-subtask-conversation", async (request, api, execution) => {
      const { session, run, child } = target(request, execution);
      return api.invoke(agent.readSubagentConversation, [session, run, child]);
    }),
    a.route("coding.wait-subtask-conversation", async (request, api, execution) => {
      const { session, run, child } = target(request, execution);
      return api.invoke(agent.waitSubagentConversation, [session, run, child, request.query.since ?? null, Number(request.query.timeout ?? 25_000)]);
    }),
    a.route("coding.check-subtask-request", async (request, api, execution) => {
      const { session, run, child } = target(request, execution);
      return api.invoke(agent.checkSubagentRequest, [session, run, child, text(request.query.request_id, "coding.field.original-run")]);
    }),
    a.route("coding.command-subtask", async (request, api, execution) => {
      const { session, run, child } = target(request, execution);
      // The public Host Action validates this payload. Its original input is the protected route envelope, never this cast.
      const command = bodyOf(request) as AgentSubagentCommand, result = await api.invoke(agent.commandSubagent, [session, run, child, command]);
      if (result.state !== "not-applied" || !result.problems || command.kind !== "answer") return result;
      const questions = await api.invoke(agent.readSubagentConversation, [session, run, child]).then(value => value.questions.find(question => question.pending_id === command.pending_id)?.questions).catch(() => undefined);
      return { ...result, details: { problems: result.problems, ...(questions ? { questions } : {}) } };
    }),
  ];
}
