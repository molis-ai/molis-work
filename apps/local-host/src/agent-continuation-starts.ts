import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentContinuationStartAnswer, AgentContinuationStartRequest } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { HOST_AGENT_CONTINUATION_READY_EVENT, type HostAgentContinuationReadyPayload } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginHostEvents } from "@molis-ai/molis-work-plugin-runtime";

const RUNTIME = "prologue";

/**
 * Who starts a continuation that may go on by itself (specs/work-line/spec.md, result return; user decision 2026-11-15): the
 * runtime asks the Home's one starter, and only when the session has no round going or starting. A session the Assistant owns
 * is started by the Assistant (its own checks: the work stopped, a person's Send under way, the cap on rounds in a row). A
 * session a plugin owns is told to that installation as `host.agent.continuation.ready@1` through its project's platform, and
 * the answer is `later`: the plugin starts its next round itself, under the request key, with its own authority. Nothing here
 * keeps a copy of the continuation; the task graph holds it, and a plugin that is not running hears of it when it next reads.
 */
export interface AgentContinuationStarts {
  /** The Assistant's start; one at a time. The returned function withdraws it. */
  serveAssistant(start: (request: AgentContinuationStartRequest) => Promise<AgentContinuationStartAnswer>): () => void;
  /** A project's platform hears the continuations of its plugins' sessions. The returned function stops it. */
  observeProject(projectId: string, listener: (request: AgentContinuationStartRequest) => void): () => void;
}

const HUBS = new WeakMap<AgentHost, { hub: AgentContinuationStarts; serve(): void }>();

/**
 * The Home's continuation starts for `host`. The Prologue runtime registers on its first use (agent-host-composition.ts), which
 * calls this again then; the starter is served once, as soon as the runtime is there.
 */
export function agentContinuationStarts(host: AgentHost): AgentContinuationStarts {
  const known = HUBS.get(host);
  if (known) { known.serve(); return known.hub; }
  let assistant: ((request: AgentContinuationStartRequest) => Promise<AgentContinuationStartAnswer>) | undefined;
  const projects = new Map<string, Set<(request: AgentContinuationStartRequest) => void>>();
  const hub: AgentContinuationStarts = {
    serveAssistant(start) { assistant = start; return () => { if (assistant === start) assistant = undefined; }; },
    observeProject(projectId, listener) {
      const listeners = projects.get(projectId) ?? new Set();
      listeners.add(listener); projects.set(projectId, listeners);
      return () => { listeners.delete(listener); if (!listeners.size && projects.get(projectId) === listeners) projects.delete(projectId); };
    },
  };
  let served = false;
  const serve = () => {
    // A Host without the Prologue runtime yet (not used so far, no model configured, a gate's throwaway Host) has nothing to start.
    if (served || !host.descriptors().some(descriptor => descriptor.runtime_id === RUNTIME)) return;
    served = true;
    host.adapter(RUNTIME).collaboration?.serveStarts(async request => {
      if (request.owner.plugin_id === ASSISTANT_PLUGIN_ID) return assistant ? assistant(request) : { later: { code: "assistant.not_attached" } };
      const listeners = projects.get(request.project_id);
      // The owner's project is not open now: it reads the continuation when it next starts and takes it up then.
      if (!listeners?.size) return { later: { code: "agent.continuation_owner_not_running" } };
      for (const listener of [...listeners]) { try { listener(request); } catch { /* one project's fault stays its own */ } }
      return { later: { code: "agent.continuation_app_starts", note: "插件自己接着做" } };
    });
  };
  HUBS.set(host, { hub, serve });
  serve();
  return hub;
}

/** A project's continuations of its plugins' sessions, as the entry point that opened it hears them. */
export type ObserveContinuations = (listener: (request: AgentContinuationStartRequest) => void) => () => void;

/**
 * One subscription to whichever continuation port the latest entry point brought: each goes as `host.agent.continuation.ready@1`
 * to the installation that owns the session. Host-event delivery decides whether that installation can take it now (S-54).
 */
export function continuationForwarder(hostEvents: Pick<PluginHostEvents, "notify">) {
  let current: ObserveContinuations | undefined, unsubscribe: (() => void) | undefined;
  return {
    update(next: ObserveContinuations | undefined): void {
      if (next === current) return;
      unsubscribe?.(); current = next;
      unsubscribe = next?.(request => {
        const payload: HostAgentContinuationReadyPayload = { runtime_id: request.runtime_id, session_id: request.session_id, request_key: request.request_key, wait_id: request.wait_id };
        hostEvents.notify(request.owner, { event_type_id: HOST_AGENT_CONTINUATION_READY_EVENT, type_version: /* @version event.host.agent.continuation.ready */ 1, payload, correlation_id: request.request_key });
      });
    },
    stop(): void { unsubscribe?.(); unsubscribe = undefined; current = undefined; },
  };
}
