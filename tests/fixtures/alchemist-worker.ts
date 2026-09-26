import { createAlchemistStudioRuntime, type AlchemistAiPort } from "@molis-ai/molis-work-plugin-alchemist";

const [databasePath, provider] = process.argv.slice(2);
if (!databasePath || !provider || !process.send) throw new Error("Missing isolated worker fixture configuration");
const ai: AlchemistAiPort = {
  listModels: async () => [{ id: "fixture/model", label: "Fixture", runtimeLabel: "Controlled HTTP", costVisibility: "unobservable" }],
  generate: async input => {
    const result = await fetch(provider, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt: input.userPrompt }), signal: input.signal });
    if (!result.ok) throw new Error("Controlled provider failed");
    return { text: await result.text(), runtimeLabel: "Controlled HTTP" };
  },
  search: async () => { throw new Error("This fixture only generates ideas"); },
};
const runtime = createAlchemistStudioRuntime({ databasePath, ai, workerIntervalMs: 25, jobLeaseMs: 600, pulseSourceMode: "fixture" });
process.on("message", async (message: { id: number; operation?: "start" | "close"; path?: string; method?: string; body?: unknown }) => {
  try {
    if (message.operation === "start") { runtime.start(); process.send!({ id: message.id, result: {} }); return; }
    if (message.operation === "close") { await runtime.close(); process.send!({ id: message.id, result: {} }, () => process.disconnect()); return; }
    const result = await runtime.app.request(`http://localhost/api/v1${message.path}`, { method: message.method ?? "GET", headers: { "content-type": "application/json" }, ...(message.body === undefined ? {} : { body: JSON.stringify(message.body) }) });
    process.send!({ id: message.id, status: result.status, result: await result.json() });
  } catch (error) { process.send!({ id: message.id, error: String(error) }); }
});
process.send({ ready: true });
