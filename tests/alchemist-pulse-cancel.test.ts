import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions as a, ALCHEMIST_ACTION_PERMISSIONS, ALCHEMIST_CLIENT_FACTORY_SCRIPT } from "@molis-ai/molis-work-plugin-alchemist";
import { alchemistFixture } from "./fixtures/alchemist-actions.js";

/**
 * W5-01-ALC-RES09: a Pulse is stopped through `runCancel`, the one action the page's 「停止」 (POST /runs/:jobId/cancel), MCP and
 * every other caller share, while a source waits on the network. The cancel is the job's own `cancelled` and the run's, in one
 * transaction; after it, what the source brings back, an answer or a failure, is never recorded (RES07, QA-023: this is the
 * job's own cancel, now through its entry), and the next source is never asked. The studio's close is the other way a Pulse
 * stops, in tests/alchemist-pulse-close.test.ts.
 *
 * BL-370: the same 「停止」 is on the page while a job waits for the person's confirmation to continue (the host restarted: the job
 * is persisted, no process holds it). The last two tests run the served client script against the real runtime's routes.
 */
const FACTS = ["jobs", "job_events", "pulse_runs", "source_fetches", "supply_signals", "pulse_reports", "activity_events"];

for (const entry of ["page", "mcp"] as const) test(`W5-01-ALC-RES09 QA-023 RES07: a Pulse stopped from the ${entry === "page" ? "page's HTTP route" : "MCP"} while a source waits records nothing after the stop`, async t => {
  for (const fail of [false, true]) await t.test(fail ? "the source fails late" : "the source answers late", async t => {
    const home = await mkdtemp(join(tmpdir(), "alchemist-pulse-cancel-")), library = join(home, "a.sqlite");
    const entered = Promise.withResolvers<AbortSignal>(), release = Promise.withResolvers<void>();
    // Watcha, asked second, leaves through the process's own fetch: a stopped Pulse never gets that far.
    let laterCalls = 0;
    t.mock.method(globalThis, "fetch", async () => { laterCalls++; throw new TypeError("A stopped Pulse cannot fetch another source"); });
    const f = alchemistFixture(home, "a", ALCHEMIST_ACTION_PERMISSIONS, { pulseSourceMode: "live", pulseGithub: { async fetch(_url, init) {
      entered.resolve(init.signal!); await release.promise;
      if (fail) throw new TypeError("The source answered too late");
      return Response.json({ items: [] });
    } } });
    t.after(async () => { release.resolve(); await f.close(); await rm(home, { recursive: true, force: true }); });
    const facts = () => {
      const database = new DatabaseSync(library, { readOnly: true });
      try { return FACTS.map(table => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()); } finally { database.close(); }
    };
    const cancel = async (jobId: string): Promise<{ kind: string; run: { id: string; status: string } }> => {
      if (entry === "mcp") return await bindActionClient(f.service, () => ({ ...f.caller, audience: "mcp" })).invoke(a.runCancel, { id: jobId });
      const response = await f.runtime.app.request(`http://localhost/api/v1/runs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
      assert.equal(response.status, 200);
      return await response.json() as { kind: string; run: { id: string; status: string } };
    };

    const { run } = await f.bound.invoke(a.pulseStart, { sourceIds: ["github", "watcha"] });
    const drained = f.runtime.runPending(), signal = await entered.promise;
    const stopped = await cancel(run.jobId);
    assert.equal(stopped.kind, "pulse");
    assert.deepEqual([stopped.run.id, stopped.run.status], [run.id, "cancelled"]);
    assert.equal(signal.aborted, true, "the stop reaches the request that is waiting");
    assert.match(String(signal.reason), /alchemist\.job_cancelled/u);
    const atStop = facts();
    assert.equal(atStop[0]!.find(job => job.id === run.jobId)?.status, "cancelled");
    assert.equal(atStop[1]!.filter(event => event.job_id === run.jobId).at(-1)?.type, "cancelled");
    assert.equal(atStop[2]!.find(row => row.id === run.id)?.status, "cancelled");

    release.resolve(); await drained;
    assert.deepEqual(facts(), atStop, "nothing in the seven tables changed after the stop");
    assert.equal(laterCalls, 0, "the next source was never asked");
    assert.equal((await f.bound.invoke(a.pulseReports, {})).latestRun?.status, "cancelled", "the page shows the run as stopped");
  });
});

test("W5-01-ALC-RES09: a Pulse that has ended, or a job that is not one, cannot be stopped, and the refusal writes nothing", async t => {
  const home = await mkdtemp(join(tmpdir(), "alchemist-pulse-cancel-"));
  const f = alchemistFixture(home);
  t.after(async () => { await f.close(); await rm(home, { recursive: true, force: true }); });
  const { run } = await f.bound.invoke(a.pulseStart, {});
  await f.runtime.runPending();
  const post = async (jobId: string) => {
    const response = await f.runtime.app.request(`http://localhost/api/v1/runs/${encodeURIComponent(jobId)}/cancel`, { method: "POST" });
    return [response.status, (await response.json() as { code: string }).code];
  };
  const ended = (await f.bound.invoke(a.pulseReports, {})).latestRun;
  assert.equal(ended?.id, run.id);
  assert.notEqual(ended?.status, "cancelled");
  assert.deepEqual(await post(run.jobId), [409, "alchemist.run_not_cancellable"]);
  assert.deepEqual(await post("missing"), [404, "alchemist.run_not_found"]);
  assert.deepEqual((await f.bound.invoke(a.pulseReports, {})).latestRun, ended, "a refused stop leaves the run as it was");
});

interface FakeElement {
  innerHTML: string; textContent: string; value: string; hidden: boolean; open: boolean; disabled: boolean; scrollTop: number; isConnected: boolean;
  dataset: Record<string, string>; classList: { add(): void; remove(): void; toggle(): void };
  querySelector(selector: string): FakeElement; querySelectorAll(): FakeElement[]; setAttribute(): void; removeAttribute(): void; focus(): void;
  closest(): null; contains(): boolean; matches(): boolean; addEventListener(): void;
}
function fakeElement(): FakeElement {
  const children = new Map<string, FakeElement>();
  return { innerHTML: "", textContent: "", value: "", hidden: false, open: false, disabled: false, scrollTop: 0, isConnected: true, dataset: {},
    classList: { add() {}, remove() {}, toggle() {} }, querySelectorAll: () => [], setAttribute() {}, removeAttribute() {}, focus() {},
    closest: () => null, contains: () => false, matches: () => false, addEventListener() {},
    querySelector(selector) { let child = children.get(selector); if (!child) { child = fakeElement(); children.set(selector, child); } return child; } };
}
const until = async (condition: () => boolean, what: string) => {
  for (let attempt = 0; attempt < 400 && !condition(); attempt++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(condition(), what);
};

/** The served client script, on stand-in elements, talking to the real runtime's routes: what it draws and which request a click makes. */
function openClient(f: ReturnType<typeof alchemistFixture>, saved: { collection: string; current?: object }) {
  const root = fakeElement(), listeners = new Map<string, (event: unknown) => unknown>(), requests: string[] = [];
  const base = "http://localhost/api/v1";
  const life = {
    alive: true, visible: true, assertCurrent() {}, observe() {}, timeout: () => 0, clearTimeout() {}, own: <T>(value: T) => value,
    listen: (target: unknown, type: string, handler: (event: unknown) => unknown) => { if (target === root) listeners.set(type, handler); },
    whenVisible: (start: (signal: AbortSignal) => unknown) => { start(new AbortController().signal); },
    fetch: async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
      requests.push(`${init.method} ${url.slice(base.length)}`);
      return await f.runtime.app.request(url, { method: init.method, headers: init.headers, ...(init.body === undefined ? {} : { body: init.body }) });
    },
  };
  const document = { querySelector: (selector: string) => selector === "[data-alchemist=workbench]" ? root : fakeElement(), addEventListener() {} };
  const context = vm.createContext({ document, location: { search: "" }, URLSearchParams, console, window: {}, FormData: class {}, MutationObserver: class { observe() {} },
    localStorage: { getItem: () => JSON.stringify(saved), setItem() {} } });
  const factory = vm.runInContext(`(${ALCHEMIST_CLIENT_FACTORY_SCRIPT})`, context) as (host: object) => unknown;
  factory({ mountPluginClient: () => life, translate: (value: string) => value, route: () => base, projectId: () => "a" });
  const part = (name: string) => root.querySelector(`[data-alc-${name}]`);
  const click = async (html: string, action: string) => {
    const tag = html.match(new RegExp(`<button[^>]*data-alc-action="${action}"[^>]*>`, "u"))?.[0];
    assert.ok(tag, `the page draws a ${action} button`);
    const button = { disabled: false, isConnected: true, dataset: { alcAction: action, job: tag.match(/data-job="([^"]*)"/u)?.[1] ?? "" } };
    await listeners.get("click")!({ target: { closest: (selector: string) => selector === "[data-alc-action]" ? button : null } });
  };
  return { part, click, requests };
}
const stopButton = (html: string, label: string) => new RegExp(`<button[^>]*data-alc-action="cancel"[^>]*>${label}</button>`, "u").test(html);

for (const lease of ["queued, never claimed", "running, its process gone"]) test(`BL-370 W5-01-ALC-RES09: a Pulse waiting for confirmation to continue (${lease}) shows 「停止」 and the click stops it, writing nothing after`, async t => {
  const home = await mkdtemp(join(tmpdir(), "alchemist-pulse-cancel-"));
  const f = alchemistFixture(home);
  t.after(async () => { await f.close(); await rm(home, { recursive: true, force: true }); });
  const { run } = await f.bound.invoke(a.pulseStart, {});
  f.runtime.worker.cancel(run.jobId); // the host restarted: the job is persisted, no process holds its acceptance
  const database = f.runtime.database;
  if (lease.startsWith("running")) database.prepare("UPDATE jobs SET status = 'running', lease_owner = 'previous-process', lease_expires_at = ? WHERE id = ?").run("2026-01-01T00:00:00.000Z", run.jobId);
  await f.runtime.runPending();
  assert.equal((await f.bound.invoke(a.runList, {})).jobs.find(job => job.jobId === run.jobId)?.accepted, false, "nothing runs it until the person confirms");

  const page = openClient(f, { collection: "pulse" });
  await until(() => page.part("list-actions").innerHTML.includes("pulse-start"), "the Pulse view draws");
  assert.match(page.part("rows").innerHTML, new RegExp(`data-alc-action="continue-job"[^>]*data-job="${run.jobId}"`, "u"), "it waits for the person's confirmation");
  assert.ok(stopButton(page.part("list-actions").innerHTML, "停止"), "a waiting Pulse can be stopped from the list");

  const facts = () => FACTS.map(table => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  await page.click(page.part("list-actions").innerHTML, "cancel");
  assert.ok(page.requests.includes(`POST /runs/${encodeURIComponent(run.jobId)}/cancel`), "the click goes through the one cancel route");
  assert.equal((database.prepare("SELECT status FROM jobs WHERE id = ?").get(run.jobId) as { status: string }).status, "cancelled");
  assert.equal((await f.bound.invoke(a.pulseReports, {})).latestRun?.status, "cancelled");
  await until(() => !stopButton(page.part("list-actions").innerHTML, "停止"), "a stopped Pulse no longer offers 「停止」");
  const atStop = facts();
  await assert.rejects(f.bound.invoke(a.runContinue, { id: run.jobId }), { code: "alchemist.job_not_resumable" });
  await f.runtime.runPending();
  assert.deepEqual(facts(), atStop, "nothing is written after the stop, and no source is asked");
});

test("BL-370 W5-01-ALC-RES09: a study waiting for confirmation to continue shows 「停止研究」 and the click stops it, writing nothing after", async t => {
  const home = await mkdtemp(join(tmpdir(), "alchemist-pulse-cancel-"));
  const f = alchemistFixture(home);
  t.after(async () => { await f.close(); await rm(home, { recursive: true, force: true }); });
  const { direction } = await f.bound.invoke(a.directionCreate, { description: "A study the host restarted under is stopped from its page" });
  const explored = await f.bound.invoke(a.explorationStart, { id: direction.id }); await f.runtime.runPending();
  const { exploration } = await f.bound.invoke(a.explorationGet, { id: explored.runId });
  const { idea } = await f.bound.invoke(a.cardKeep, { id: exploration.cards[0]!.id });
  const { plan } = await f.bound.invoke(a.researchPlan, { id: idea.id, lens: "market_space", ideaVersion: 1, modelPolicy: "auto", budget: { kind: "calls", limit: 4 } });
  const { run } = await f.bound.invoke(a.researchStart, { id: idea.id, lens: "market_space", planId: plan.id });
  f.runtime.worker.cancel(run.jobId); // the host restarted
  await f.runtime.runPending();
  const callsBefore = f.requests.length;

  const page = openClient(f, { collection: "ideas", current: { kind: "idea", id: idea.id, version: 1, panel: "market" } });
  await until(() => page.part("footer").innerHTML.includes("continue-job"), "the study view draws, waiting for the person's confirmation");
  assert.ok(stopButton(page.part("footer").innerHTML, "停止研究"), "a waiting study can be stopped from its page");

  const database = f.runtime.database;
  const facts = () => ["jobs", "job_events", "lens_runs", "lens_reports", "activity_events"].map(table => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
  await page.click(page.part("footer").innerHTML, "cancel");
  assert.ok(page.requests.includes(`POST /runs/${encodeURIComponent(run.jobId)}/cancel`), "the click goes through the one cancel route");
  assert.equal((database.prepare("SELECT status FROM jobs WHERE id = ?").get(run.jobId) as { status: string }).status, "cancelled");
  await until(() => !stopButton(page.part("footer").innerHTML, "停止研究"), "a stopped study no longer offers 「停止研究」");
  assert.equal((await f.bound.invoke(a.researchGet, { id: idea.id, version: 1 })).lenses.market_space.status, "cancelled");
  const atStop = facts();
  await assert.rejects(f.bound.invoke(a.runContinue, { id: run.jobId }), { code: "alchemist.job_not_resumable" });
  await f.runtime.runPending();
  assert.deepEqual(facts(), atStop, "nothing is written after the stop");
  assert.equal(f.requests.length, callsBefore, "and no model is called");
});
