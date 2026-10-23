import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentMemorySourceRef, AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_STORE_NAME, AssistantStore, type MemorySourceOwner, memorySources } from "@molis-ai/molis-work-app-local-host";
import type { MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";

export const EVALUATION_ACTOR = LOCAL_PERSON_ACTOR_ID;
export const EVALUATION_CODING = "io.molis.work.coding";
export const evaluationPerson = (project_id: string | null, current_scene = "common") => ({
  actor_id: EVALUATION_ACTOR, project_id, consumer: "ui" as const, person: true, current_scene, purpose: "management" as const,
});
export function evaluationOwner(scene: "coding" | "assistant", project: string | null) {
  return { actor_id: EVALUATION_ACTOR, project_id: project ?? ASSISTANT_PERSONAL_OWNER,
    plugin_id: scene === "coding" ? EVALUATION_CODING : ASSISTANT_PLUGIN_ID,
    install_id: scene === "coding" ? "evaluation-coding-install" : ASSISTANT_INSTALL_ID };
}
export interface EvaluationOriginal {
  ref: AgentMemorySourceRef;
  caller: MemoryCaller & { purpose: "management"; current_scene: "coding" | "assistant" };
}

/** Only source setup uses this loopback model. These calls are reported separately from evaluated model attempts. */
export async function evaluationOriginals(home: string, ownerFor: () => MemorySourceOwner | undefined, now: () => string,
  registerFixture?: (endpoint: string) => () => void) {
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME), store = new AssistantStore(db);
  let calls = 0, bytes = 0;
  const server = createServer(async (request, reply) => {
    for await (const chunk of request) bytes += Buffer.byteLength(chunk);
    calls++;
    reply.writeHead(200, { "content-type": "text/event-stream" });
    reply.end('data: {"model":"source-setup","choices":[{"index":0,"delta":{"content":"Source received."},"finish_reason":null}]}\n\n'
      + 'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\ndata: [DONE]\n\n');
  });
  let unregister: (() => void) | undefined;
  const close = async () => {
    try { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
    finally { unregister?.(); db.close(); }
  };
  try {
    await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Source setup did not open a loopback server");
    const endpoint = `http://127.0.0.1:${address.port}/v1/chat/completions`;
    unregister = registerFixture?.(endpoint);
    const sources = memorySources(home, ownerFor);
    return {
      model: { protocol: "openai-compatible", endpoint, model: "source-setup", credential_ref: "source-setup" }, sources,
      observation: () => ({ calls, requestBytes: bytes, provider: "loopback-scripted", purpose: "synthetic completed source setup", paidCalls: 0 }),
      async create(adapter: AgentRuntimeAdapter, text: string, scene: "coding" | "assistant", project: string | null): Promise<EvaluationOriginal> {
        const owner = evaluationOwner(scene, project);
        const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: "Evaluation source" });
        let workId: string | undefined;
        if (scene === "assistant") {
          const work = store.create({ actor_id: owner.actor_id, title: "Evaluation source", scope: project ? { kind: "project", project_id: project } : { kind: "personal" },
            ...(project ? { project_ref: { project_id: project, storage_key: `evaluation:${project}` } } : {}), origin: null });
          store.update(owner.actor_id, work.work_id, null, { session_id: session.session_id }); workId = work.work_id;
        }
        const input_id = randomUUID(), occurred_at = now();
        const handle = await adapter.start({ ...owner, session, workspace: "none", task: text, role_id: "reader",
          original_input: { input_id, text, occurred_at, written_by: "person" },
          role: { role_id: "reader", version: 1, workspace: "none", execution: "read-only", prompts: [], host_tools: [] } });
        const deadline = performance.now() + 10_000;
        for (;;) {
          const view = await adapter.read(handle.ref);
          if (view.phase === "completed") break;
          if (["failed", "cancelled", "stopped"].includes(view.phase)) throw new Error(`Source setup ended ${view.phase}`);
          if (performance.now() > deadline) { await adapter.control(handle.ref, { kind: "cancel" }); throw new Error("Source setup timed out"); }
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        if (workId) store.addRound(workId, { run_id: handle.ref.run_id, text, materials: [], context: null, started_at: occurred_at });
        return { ref: { event_id: "molis-input:1:" + JSON.stringify([owner.actor_id, session.session_id, "original", input_id]), version: "1" },
          caller: { actor_id: owner.actor_id, project_id: project, consumer: scene === "coding" ? "agent" : "assistant",
            ...(scene === "coding" ? { plugin_id: EVALUATION_CODING } : {}), current_scene: scene, session_id: session.session_id,
            source_use: "learning", purpose: "management" } };
      }, close,
    };
  } catch (error) { await close(); throw error; }
}
