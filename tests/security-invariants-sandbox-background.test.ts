import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PluginBackgroundExecution } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxEffects, SandboxIdentity, SandboxJson, SandboxOperationContract, SandboxPluginContract, SandboxSdkMethod } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { BACKGROUND_EXECUTIONS, DEFAULT_SANDBOX_LIMITS, SANDBOX_BACKGROUND_LIMITS, SANDBOX_NOT_GIVEN, SandboxBroker, SandboxError, assertContract, assertSandboxDeclarations,
  createBackgroundLane, createSandboxRunner, sandboxServicesFor, type SandboxBackground, type SandboxServices } from "@molis-ai/molis-work-plugin-sandbox";

// S-67 for `services.background` (PG-017 P3): a sandboxed plugin starts a run of one of its own commands in the background. Three gates in series:
// the broker (the declared and approved `background` effect naming the operation, a command for anything that starts or cancels work, the input checked
// before the Host accepts, a bound on the runs outstanding), the Host's client (the plugin's own concurrent command with `background_job`, the original
// caller's authority; asserted with the real client in security-invariants-sandbox-background-host.test.ts) and the lane, a second process of the
// package that runs one operation at a time, so a long run never holds up the first process. A run is not replayed when its process dies. RAC-236
// is this slice's. The Host's client is a stand-in in this file (it runs the work under its own signal); the processes are real Seatbelt processes.

const mac = { skip: process.platform !== "darwin" };
const IDENTITY: SandboxIdentity = { projectId: "p", installationId: "install-bg", pluginId: "bgprobe", namespace: "installed" };
const GRANTS: SandboxEffects = { background: ["work", "spin"], storage: ["read", "write"] };
const op = (id: string, kind: "query" | "command", effects: SandboxEffects, input: SandboxOperationContract["input"] = { type: "string" }): SandboxOperationContract =>
  ({ id, kind, input, output: { type: "string" }, errors: [], effects, examples: [{ input: input.type === "number" ? 1 : "x", output: "ok" }] });
const jobState = { type: 'string', enum: ['running', 'done', 'failed'] } as const;
const jobSchema: SandboxOperationContract['output'] = { type: 'object', properties: { id: {type:'string'}, state: jobState }, required: ['id','state'], additionalProperties: false };
const contract = (operations: SandboxOperationContract[]): SandboxPluginContract => ({ version: 1, pluginId: "bgprobe", revision: "one", entities: [], pages: [], acceptance: [], operations: [
  ...operations.map(operation => operation.effects.background?.length ? {...operation, output: jobSchema,
    background_job: {status:'status',id:'id',input:'id',state:'state',done:['done'],failed:['failed']},
    examples: operation.examples.map(example=>({...example,output:{id:'example',state:'running'}}))} : operation),
  {id:'status',kind:'query',input:{type:'object',properties:{id:{type:'string'}},required:['id'],additionalProperties:false},output:jobSchema,effects:{},errors:[],examples:[{input:{id:'example'},output:{id:'example',state:'running'}}]},
] });
const code = (expected: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === expected;

/** The Host's client as far as this slice needs it: it runs the work under an execution signal of its own, and can be told to hold it instead. */
function standIn(options: { run?: boolean } = {}) {
  const executions: Array<{ cancelled: boolean; settled: boolean; execution: PluginBackgroundExecution<SandboxJson> }> = [];
  const client: SandboxBackground["client"] = { async start<T>(work: (control: never) => Promise<T>) {
    const controller = new AbortController();
    const entry = { cancelled: false, settled: false } as (typeof executions)[number];
    const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
    const result = options.run === false ? aborted : Promise.race([work({ signal: controller.signal, beforeEffect: async () => {} } as never), aborted]);
    void result.then(() => undefined, () => undefined).then(() => { entry.settled = true; });
    entry.execution = Object.freeze({ result: result as Promise<never>, cancel: () => { entry.cancelled = true; controller.abort(); } }) as never;
    executions.push(entry);
    return entry.execution as never;
  } };
  return { client, executions };
}

const WRITES: SandboxEffects = { storage: ["read", "write"] };
const OPERATIONS = [
  op("launch", "command", { background: ["work"] }), op("launch-spin", "command", { background: ["spin"] }), op("launch-bad", "command", { background: ["work"] }, { type: "number" }),
  op("stop", "command", { background: ["work", "spin"] }), op("ping", "query", {}), op("release", "command", WRITES),
  op("work", "command", WRITES), op("spin", "command", WRITES),
];

function rig() {
  const lane = createBackgroundLane({ contract: contract(OPERATIONS), create: async () => { throw new Error("no process is needed here"); } });
  const host = standIn({ run: false });
  const services: SandboxServices = { background: { client: host.client, lane } };
  const broker = (grants: SandboxEffects = GRANTS, extra: SandboxServices = services) => new SandboxBroker(IDENTITY, grants, extra, DEFAULT_SANDBOX_LIMITS);
  const call = async (b: SandboxBroker, operation: SandboxOperationContract, method: SandboxSdkMethod, args: SandboxJson[]) => {
    try { return { ok: await b.invoke(operation, new AbortController().signal, method, args) }; } catch (error) { return { error: (error as { code?: string }).code }; }
  };
  return { lane, host, services, broker, call };
}

test("S-67 RAC-236 the broker accepts a run only for a command that declared it, the person approved it and the contract names it", () => {
  const f = rig(), launch = OPERATIONS[0]!, start = (target: SandboxJson, input: SandboxJson = "x"): SandboxJson[] => [target, input];
  return (async () => {
    const b = f.broker();
    assert.equal(typeof (await f.call(b, launch, "background.start", start("work")) as { ok: string }).ok, "string", "declared, approved and named: accepted");
    assert.equal(f.host.executions.length, 1);
    for (const [what, operation, grants, args, expected] of [
      ["an operation that did not declare the effect", op("quiet", "command", {}), GRANTS, start("work"), "sandbox.not_authorized"],
      ["a run the person did not approve", launch, { storage: ["read"] }, start("work"), "sandbox.not_authorized"],
      ["a target that is not in the declared list", launch, GRANTS, start("spin"), "sandbox.not_authorized"],
      ["a query", op("peek", "query", { background: ["work"] }), GRANTS, start("work"), "sandbox.not_authorized"],
      ["a target the contract does not have", op("l", "command", { background: ["gone"] }), { background: ["gone"] }, start("gone"), "sandbox.invalid_request"],
      ["a target that is a query", op("l", "command", { background: ["ping"] }), { background: ["ping"] }, start("ping"), "sandbox.invalid_request"],
      ["an input the target does not take", launch, GRANTS, start("work", 7), "sandbox.schema_mismatch"],
      ["a missing input", launch, GRANTS, ["work"], "sandbox.invalid_request"],
      ["an operation id that is not a string", launch, GRANTS, start(7), "sandbox.invalid_request"],
    ] as const) {
      const before = f.host.executions.length;
      assert.deepEqual(await f.call(f.broker(grants), operation, "background.start", [...args]), { error: expected }, what);
      assert.equal(f.host.executions.length, before, `${what}: the Host accepted nothing`);
    }
    assert.deepEqual(await f.call(f.broker(GRANTS, {}), launch, "background.start", start("work")), { error: "sandbox.service_unavailable" }, "no service connected");
  })();
});

test("S-67 RAC-236 the broker bounds the runs outstanding and a package can cancel only the runs it started", async () => {
  const f = rig(), b = f.broker(), launch = OPERATIONS[0]!, stop = OPERATIONS[3]!;
  const ids: string[] = [];
  for (let index = 0; index < BACKGROUND_EXECUTIONS; index += 1) ids.push(((await f.call(b, launch, "background.start", ["work", "x"])) as { ok: string }).ok);
  assert.equal(new Set(ids).size, BACKGROUND_EXECUTIONS, "each run has its own id");
  assert.deepEqual(await f.call(b, launch, "background.start", ["work", "x"]), { error: "sandbox.queue_full" }, "the next one waits for a run to end");
  assert.deepEqual(await f.call(b, stop, "background.cancel", [ids[0]!]), { ok: true });
  assert.equal(f.host.executions[0]!.cancelled, true, "the Host's execution was cancelled");
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(await f.call(b, stop, "background.cancel", [ids[0]!]), { ok: false }, "a run that has ended cannot be cancelled again");
  assert.deepEqual(await f.call(b, stop, "background.cancel", ["not-an-execution"]), { ok: false });
  assert.deepEqual(await f.call(f.broker(), stop, "background.cancel", [ids[1]!]), { ok: false }, "another broker's package cannot reach this one's run");
  assert.deepEqual(await f.call(b, op("quiet", "command", {}), "background.cancel", [ids[1]!]), { error: "sandbox.not_authorized" }, "cancelling needs the effect too");
  assert.deepEqual(await f.call(b, op("peek", "query", { background: ["work"] }), "background.cancel", [ids[1]!]), { error: "sandbox.not_authorized" });
  assert.equal(((await f.call(b, launch, "background.start", ["work", "x"])) as { ok: string }).ok.length > 0, true, "a freed place is usable");
  b.stop(new SandboxError("sandbox.stopped", "stopped"));
  assert.ok(f.host.executions.every(entry => entry.cancelled), "stopping the broker cancels what it accepted");
});

test("S-67 RAC-236 a contract cannot declare background work for a query, for a missing or non-command target, or for a run that starts more", () => {
  const ok = [op("a", "command", { background: ["b"] }), op("b", "command", {})];
  assert.doesNotThrow(() => assertContract(contract(ok)));
  for (const [what, operations] of [
    ["a query", [op("a", "query", { background: ["b"] }), op("b", "command", {})]],
    ["a target the contract does not have", [op("a", "command", { background: ["c"] }), op("b", "command", {})]],
    ["a target that is a query", [op("a", "command", { background: ["b"] }), op("b", "query", {})]],
    ["a target that starts runs of its own", [op("a", "command", { background: ["b"] }), op("b", "command", { background: ["a"] })]],
  ] as const) assert.throws(() => assertContract(contract([...operations])), code("sandbox.invalid_contract"), what);
});

test("S-67 RAC-236 cancelling a run requires its actual target in both the operation's declaration and the person's approval", async t => {
  const f = rig(), grants: SandboxEffects = { background: ["work", "spin"] }, b = f.broker(grants);
  t.after(() => b.stop(new SandboxError("sandbox.stopped", "test finished")));
  const id = (await b.invoke(OPERATIONS[1]!, new AbortController().signal, "background.start", ["spin", "x"])) as string;
  assert.deepEqual(await f.call(b, OPERATIONS[0]!, "background.cancel", [id]), { error: "sandbox.not_authorized" }, "declaring work cannot cancel spin");
  assert.equal(f.host.executions[0]!.cancelled, false, "the declared-target refusal did not cancel the Host execution");
  grants.background = ["work"];
  assert.deepEqual(await f.call(b, OPERATIONS[3]!, "background.cancel", [id]), { error: "sandbox.not_authorized" }, "approval of work cannot cancel spin");
  assert.equal(f.host.executions[0]!.cancelled, false, "the approved-target refusal did not cancel the Host execution");
  grants.background = ["work", "spin"];
  assert.deepEqual(await f.call(b, OPERATIONS[1]!, "background.cancel", [id]), { ok: true }, "the declared and approved target can be cancelled");
  await f.host.executions[0]!.execution.result.catch(() => undefined);
});

test("S-67 RAC-236 stopping during acceptance cancels the late handle and refuses it and subsequent requests", { timeout: 10_000 }, async t => {
  const f = rig(), entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const client: SandboxBackground["client"] = { async start(work, options) {
    const execution = await f.host.client.start(work, options);
    entered.resolve(); await release.promise;
    return execution;
  } };
  const b = f.broker(GRANTS, { background: { client, lane: f.lane } });
  t.after(() => { release.resolve(); b.stop(new SandboxError("sandbox.stopped", "test finished")); });
  const refused = assert.rejects(b.invoke(OPERATIONS[0]!, new AbortController().signal, "background.start", ["work", "x"]), code("sandbox.stopped"));
  try {
    await entered.promise;
    assert.equal(f.host.executions.length, 1, "the Host accepted but has not returned the handle");
    b.stop(new SandboxError("sandbox.stopped", "stopped while accepting"));
  } finally { release.resolve(); }
  await refused;
  await f.host.executions[0]!.execution.result.catch(() => undefined);
  assert.equal(f.host.executions[0]!.cancelled, true, "the late handle cannot outlive the broker");
  assert.equal(f.host.executions[0]!.settled, true, "the accepted execution has ended");
  assert.deepEqual(await f.call(b, OPERATIONS[0]!, "background.start", ["work", "after"]), { error: "sandbox.stopped" });
  assert.equal(f.host.executions.length, 1, "nothing was accepted after stop");
});

test("S-67 RAC-236 the sandbox is given the Host's background client only with a lane, and kept jobs of the Manifest are still refused", () => {
  const storage = { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true };
  const host = standIn(), lane = createBackgroundLane({ contract: contract(OPERATIONS), create: async () => { throw new Error("unused"); } });
  const background = { start: host.client.start } as never;
  assert.equal(sandboxServicesFor({ storage, background }, { backgroundLane: lane }).background?.lane, lane);
  assert.equal(sandboxServicesFor({ storage, background }).background, undefined, "no lane: a call is service_unavailable, not a run in the first process");
  assert.equal(sandboxServicesFor({ storage }, { backgroundLane: lane }).background, undefined);
  const row = SANDBOX_NOT_GIVEN.find(item => item.service === "background")!;
  const manifest = (extra: object) => ({ manifest: { plugin_id: "p", permissions: [], artifacts: { produces: [], consumes: [] }, ...extra } as never });
  assert.throws(() => assertSandboxDeclarations(manifest({ background: { jobs: [{ job: "tick" }] } }), []), code("sandbox.service_not_given"));
  assert.ok(row.declared(manifest({ background: { jobs: [{ job: "tick" }] } }), []));
  assert.ok(!row.declared(manifest({ actions: [{ action: { background_job: { scope: "x" } } }] }), []), "a run a command starts is given");
});

// ---- Real processes -------------------------------------------------------------------------------------------------------------------------

const BODY = `
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(sdk, key) { while (await sdk.storage.get(key) === null) await wait(20); }
export const operations = {
  launch: async (input, sdk) => ({id:await sdk.background.start('work', input),state:'running'}),
  'launch-spin': async (input, sdk) => ({id:await sdk.background.start('spin', input),state:'running'}),
  'launch-bad': async (input, sdk) => ({id:await sdk.background.start('work', input),state:'running'}),
  stop: async (input, sdk) => ({id:String(await sdk.background.cancel(input)),state:'running'}),
  status: async input => ({id:input.id,state:'running'}),
  ping: async () => String(process.pid),
  release: async (input, sdk) => { await sdk.storage.set('go', true); return 'released'; },
  work: async (input, sdk) => { await until(sdk, 'go'); await sdk.storage.set('done:' + input, String(process.pid)); return 'ok'; },
  spin: async (input, sdk) => { await sdk.storage.set('spin-pid', String(process.pid)); await until(sdk, 'never'); return 'ok'; },
};`;

async function processes(t: test.TestContext, stand = standIn()) {
  const directory = await mkdtemp(join(tmpdir(), "sandbox-bg-")), bundlePath = join(directory, "plugin.mjs");
  await writeFile(bundlePath, BODY);
  const entries = new Map<string, SandboxJson>();
  const storage: NonNullable<SandboxServices["storage"]> = { async transaction(_context, mutate) {
    const next = new Map(entries), result = mutate(next); entries.clear(); for (const [key, value] of next) entries.set(key, value); return result;
  } };
  const contractValue = contract(OPERATIONS), runners: Array<{ stop(): Promise<void> }> = [];
  const make = async (services: SandboxServices, limits = {}) => { const runner = await createSandboxRunner({ bundlePath, contract: contractValue, identity: IDENTITY, grants: GRANTS, services, limits }); runners.push(runner); return runner; };
  const lane = createBackgroundLane({ contract: contractValue, create: () => make({ storage }, { ...SANDBOX_BACKGROUND_LIMITS, operationTimeoutMs: 20_000 }) });
  const foreground = await make({ storage, background: { client: stand.client, lane } });
  t.after(async () => { await lane.stop(); for (const runner of runners) await runner.stop(); await rm(directory, { recursive: true, force: true }); });
  const until = async (check: () => boolean) => { const deadline = Date.now() + 15_000; while (!check()) { if (Date.now() > deadline) assert.fail("did not happen in time"); await new Promise(resolve => setTimeout(resolve, 25)); } };
  return { foreground, lane, entries, stand, until };
}

test("S-67 RAC-236 a run happens in a second process, so the first keeps answering while it waits", { ...mac, timeout: 60_000 }, async t => {
  const f = await processes(t);
  const {id} = await f.foreground.call("launch", "job-1") as {id:string};
  assert.equal(typeof id, "string");
  const answered = Date.now();
  const first = await f.foreground.call("ping", ""), again = await f.foreground.call("ping", "");
  assert.equal(first, again);
  assert.ok(Date.now() - answered < 5_000, "the first process answered while the run was still waiting");
  assert.equal(f.entries.has("done:job-1"), false, "the run has not finished: it waits for a release");
  await f.foreground.call("release", "");
  await f.until(() => f.entries.has("done:job-1"));
  assert.notEqual(f.entries.get("done:job-1"), first, "the run happened in another process");
  await f.until(() => f.stand.executions.every(entry => entry.settled));
});

test("S-67 RAC-236 cancelling a run that is executing ends its process; the next run starts a new one and the first is not replayed", { ...mac, timeout: 90_000 }, async t => {
  const f = await processes(t);
  const {id} = await f.foreground.call("launch-spin", "s") as {id:string};
  await f.until(() => f.entries.has("spin-pid"));
  const spinPid = f.entries.get("spin-pid");
  assert.deepEqual(await f.foreground.call("stop", id), {id:'true',state:'running'});
  await f.until(() => f.stand.executions[0]!.settled);
  assert.deepEqual(await f.foreground.call("stop", id), {id:'false',state:'running'}, "a run that has ended cannot be cancelled again");
  f.entries.delete("spin-pid");
  await f.foreground.call("release", "");
  await f.foreground.call("launch", "after");
  await f.until(() => f.entries.has("done:after"));
  assert.notEqual(f.entries.get("done:after"), spinPid, "a new process ran the next run");
  assert.equal(f.entries.has("spin-pid"), false, "the cancelled run did not start again");
});

test("S-67 RAC-236 stopping the lane ends its process and refuses new runs", { ...mac, timeout: 60_000 }, async t => {
  const f = await processes(t);
  await f.foreground.call("release", "");
  await f.foreground.call("launch", "one");
  await f.until(() => f.entries.has("done:one"));
  await f.lane.stop();
  await assert.rejects(f.lane.run("work", "two", {}), code("sandbox.stopped"));
  assert.throws(() => f.lane.check("ping", ""), code("sandbox.invalid_request"));
  assert.throws(() => f.lane.check("work", 7), code("sandbox.schema_mismatch"));
});
