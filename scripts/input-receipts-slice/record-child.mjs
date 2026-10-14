// Recording producer for the "restart" scene: a real Node Host run, killed by the recorder (SIGKILL) while one input is in
// the model's context unread and another is still queued. Prints one JSON line when it is ready to be killed.
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const [sdkDir, temp, payload] = process.argv.slice(2);
const said = JSON.parse(payload);
const load = file => import(pathToFileURL(join(sdkDir, "dist", file)).href);
const sdk = await load("index.js");
const { createNodeHost } = await load("node.js");
const { createMemoryHost } = await load("testing/api/index.js");

const actual = createNodeHost({ storageRoot: join(temp, "store") });
const memory = createMemoryHost({ network: { model: true } });
const host = { ...actual };
for (const name of ["writeCredential", "replaceCredential", "deleteCredential", "inspectCredential", "inspectModelNetwork"]) host[name] = memory[name];
const frame = text => `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text } }] })}\n`;
let handles = 0;
let release;
const opened = new Promise(resolve => { release = resolve; });
host.prepareModelNetwork = async () => ({ id: `child-${(handles += 1)}` });
host.cancelModelNetwork = async () => {};
host.executeModelNetwork = async exec => {
  if (handles === 1) {
    exec.onFrame(frame("我先看一下。"));
    await opened;
    exec.onFrame("data: [DONE]\n");
    return "completed";
  }
  exec.onFrame(frame("正在处理第一条……"));
  return new Promise(() => {});
};

setInterval(() => {}, 1000);
const runtime = await sdk.createRuntime({ app: { appId: "molis.input-receipts.recording", appVersion: "1.0.0" }, host, preset: "local-agent", network: { model: true } });
const session = await runtime.sessions.create();
const credential = await runtime.credentials.write({ label: "lab", secret: { plaintext: new TextEncoder().encode("recording-only") } });
const { run, control } = await runtime.startAgentRun({
  session, workspace: "app",
  start: { protocol: "openai-compatible", endpoint: "https://lab.invalid/v1/chat/completions", model: "scripted", credentialRef: credential.ref, messages: [{ role: "user", text: said.task }] },
  agent: { idempotencyKey: "rec-restart-1", toolNames: ["acknowledge-inputs"] },
});
const seen = [];
run.subscribe(event => seen.push(event));
const until = async (label, check) => {
  const limit = Date.now() + 8000;
  while (!check()) {
    if (Date.now() > limit) throw new Error(`recording child timed out waiting for ${label}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};
await until("first reply", () => seen.some(event => event.type === "text-delta"));
await control.steer({ text: said.first, key: "r-1" });
release();
await until("second reply", () => seen.some(event => event.type === "text-delta" && event.text === "正在处理第一条……"));
await control.steer({ text: said.second, key: "r-2" });
process.stdout.write(`${JSON.stringify({ session: session.ref, run: run.ref })}\n`);
