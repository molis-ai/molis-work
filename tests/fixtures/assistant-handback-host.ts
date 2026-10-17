// The Host of tests/assistant-delegation-handback.test.ts's restart case: a work hands one part out and ends its round;
// once that is over, the part's round answers, and this process is killed at the first task-graph write after it — so
// the part's step end is not on disk, the way a Host that stops between a round's end and its step's end leaves it.
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority } from "@molis-ai/molis-work-app-local-host";
import { reply } from "./fixture-replies.js";

const [home, database] = process.argv.slice(2);
if (!home || !database || !process.send) throw new Error("Expected a Home, a database and IPC");
const send = (message: object) => process.send!(message);

let dying = false;
const rename = fs.renameSync;
// The SDK's storage writes a record as a temporary file renamed into place: the graph's next write is the one lost.
fs.renameSync = (from, to) => { if (dying && String(to).includes("~taskboards")) process.kill(process.pid, "SIGKILL"); return rename(from, to); };
syncBuiltinESMExports();

const parentDone = Promise.withResolvers<void>();
let parentStep = 0;
const parentScript = [() => reply({ name: "delegate-work", input: { title: "开头", brief: "起草「开头」。", acceptance: "一段话" } }), () => reply(undefined, "已交给子任务，做完我再汇总。")];
globalThis.fetch = async (_url: unknown, init?: RequestInit) => {
  const said = JSON.stringify(JSON.parse(typeof init?.body === "string" ? init.body : new TextDecoder().decode(init?.body as Uint8Array)).messages);
  if (!said.includes("委托的子任务")) return (parentScript[parentStep++] ?? (() => reply(undefined, "不该有这一轮。")))();
  await parentDone.promise;
  dying = true;
  return reply(undefined, "「开头」的草稿：三句话。");
};

const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.handback-restart", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
  modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
host.register(adapter);
const store = new AssistantStore(new DatabaseSync(database));
const service: AssistantService = new AssistantService(store, { host: async () => host,
  authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), projectTitle: async () => "项目" }, "web-user");
const sent = await service.send({ text: "把开头分给子任务起草，做完汇总", request_id: "req-handback-restart" }, { project_ref: { project_id: "board", storage_key: "memory:project" } });
// The work's round is over once its root waits (the SDK has closed the round's attempt on it): no graph write is left of it.
const rootWaits = async () => (await adapter.collaboration!.works!.read(store.get("web-user", sent.work.work_id).graph_id!)).find(node => node.node_id === "work")?.state === "waiting";
for (let i = 0; i < 600 && ((await service.read(sent.work.work_id)).work.state !== "completed" || !await rootWaits()); i++) await new Promise(resolve => setTimeout(resolve, 20));
send({ parent: sent.work.work_id });
parentDone.resolve();
// Killed by now; a part's round that wrote no graph would leave this process to say so.
setTimeout(() => { send({ survived: true }); process.exit(3); }, 30_000);
