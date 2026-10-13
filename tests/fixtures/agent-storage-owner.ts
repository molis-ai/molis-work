import { createPrologueNodeAdapter, AgentReviewQueue } from "@molis-ai/molis-work-service-agent-host";
import { join } from "node:path";
const home = process.argv[2];
if (!home || !process.send) throw new Error("Expected isolated Home and IPC");
const projectId = process.argv[3], queue = new AgentReviewQueue();
try {
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "0.0.0" }, storageRoot: join(home, "agent-runtime"),
    reviewQueue: queue, modelConfiguration: async () => { throw new Error("This fixture must not call a model"); } });
  if (projectId) {
    await queue.refresh(projectId); await adapter.close();
    process.send({ unexpected_owner: true }); process.disconnect();
  } else { process.send({ ready: true }); setInterval(() => {}, 60_000); }
} catch (error) {
  if (!projectId) throw error;
  process.send({ code: (error as { code?: string }).code }); process.disconnect();
}
