import { createHash } from "node:crypto";
import type { AgentRunRef, AgentSubagentConversation, AgentSubagentsCapability } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "./errors.js";

/** A wakeup reads the original SDK history. The subscription owns no messages or task state. */
export async function waitForSubagentChange(port: AgentSubagentsCapability, run: AgentRunRef, id: string,
  since: string | null, timeoutMs: number, signal?: AbortSignal): Promise<{ version: string; view: AgentSubagentConversation }> {
  if (!port.conversation || !port.subscribe) throw agentErrors.capability_unavailable("当前运行时未接通子任务更新");
  let wake = () => {};
  const stop = await port.subscribe(run, () => wake());
  try {
    return await new Promise((resolve, reject) => {
      let finished = false, reading = false, dirty = true, expired = timeoutMs === 0;
      let gather: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => { finished = true; clearTimeout(timer); clearTimeout(gather); signal?.removeEventListener("abort", cancel); };
      const cancel = () => { cleanup(); reject(signal!.reason); };
      const read = async () => {
        if (finished || reading) return;
        reading = true; dirty = false; gather = undefined;
        try {
          const view = await port.conversation!(run, id);
          if (finished) return;
          const version = createHash("sha256").update(JSON.stringify(view)).digest("hex");
          if (version !== since || expired) { cleanup(); resolve({ version, view }); }
        } catch (error) { if (!finished) { cleanup(); reject(error); } }
        finally { reading = false; if (!finished && (dirty || expired)) wake(); }
      };
      wake = () => { dirty = true; if (!finished && !reading && !gather) gather = setTimeout(() => void read(), 40); };
      const timer = setTimeout(() => { expired = true; void read(); }, timeoutMs);
      if (signal?.aborted) cancel();
      else { signal?.addEventListener("abort", cancel, { once: true }); void read(); }
    });
  } finally { stop(); }
}
