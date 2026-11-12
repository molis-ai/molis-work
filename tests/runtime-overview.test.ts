import assert from "node:assert/strict";
import test from "node:test";
import { decideRuntimeRun, runtimeOverview, runtimeRunDecisionRequest, type HomeAggregatePorts, type RuntimeOverviewPorts, type RunsClient } from "@molis-ai/molis-work-app-local-host";
import { ActionError, defineRunDecisionAction, defineRunsOverviewAction, type ActionCallContext, type ActionDefinition, type ActionView, type RunsOverview,
  type RunsWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";

/**
 * RES-05: the Host finds every owner of runs by type — the project ones in each open project, the Home ones in the Home — asks each once,
 * and puts the answers side by side; one that fails or sends what cannot be drawn is named by its code and costs the others nothing.
 */

const NOW = "2026-11-11T09:00:00.000Z";
const reference = (projectId: string): LocalHostProjectReference => ({ project_id: projectId, storage_key: `/tmp/${projectId}` });
const context = (projectId: string): ActionCallContext => ({ actor_id: "owner", project_id: projectId, audience: "user", permissions: [] });
const view = (definition: ActionDefinition, provider: string, projectId: string | null, available = true): ActionView => ({
  capability_id: definition.capability_id, version: definition.version, operation: definition.operation, action: definition.action,
  provider: { provider_id: provider, title: provider, kind: "plugin", ...(projectId ? { project_id: projectId } : {}) },
  availability: available ? { available: true } : { available: false, code: "actions.plugin_disabled", reason: "停用了" },
});
const projectOverview = (id: string) => defineRunsOverviewAction(`${id}.runs.overview`, 1, id, [], "project");
const projectDecision = (id: string) => defineRunDecisionAction(`${id}.runs.decide`, 1, id, [], "project");
const homeOverview = defineRunsOverviewAction("assistant.runs.overview", 1, "助理", [], "home");
const homeDecision = defineRunDecisionAction("assistant.runs.decide", 1, "助理", [], "home");
const run = (id: string, due: string, needs: Array<"network" | "model"> = [], project: string | null = null) =>
  ({ run_id: id, title: id, due_at: due, project_id: project, open: null, needs });

function harness(answers: Record<string, (input: unknown) => unknown>, options: { online?: boolean; model?: boolean } = {}) {
  const calls: string[] = [];
  const projects = [reference("p1"), reference("p2")];
  const projectViews = (projectId: string) => [view(projectOverview("schedule"), "schedule", projectId), view(projectDecision("schedule"), "schedule", projectId),
    view(projectOverview("feed"), "feed", projectId), view(projectDecision("feed"), "feed", projectId)];
  const answer = (key: string, input: unknown) => { calls.push(key); const respond = answers[key]; if (!respond) throw new ActionError("actions.not_found", "没有"); return respond(input); };
  const aggregate: HomeAggregatePorts = {
    openProjects: () => projects, whileOpen: async (_reference, work) => work(),
    client: project => ({ discover: async () => projectViews(project.project_id),
      invoke: async (_caller, action, input) => answer(`${project.project_id}:${action.capability_id}`, input) }),
    context: async project => context(project.project_id), projectPlugins: async () => () => true,
  };
  const homeViews = [view(homeOverview, "assistant", null), view(homeDecision, "assistant", null)];
  const client = (scope: string | null): RunsClient => ({
    discover: async () => scope === null ? homeViews : projectViews(scope),
    invoke: async (action, input) => answer(`${scope ?? "home"}:${action.capability_id}`, input),
  });
  const ports: RuntimeOverviewPorts = {
    aggregate, within: async (scope, work) => scope === null || projects.some(project => project.project_id === scope) ? work(client(scope)) : undefined,
    now: () => new Date(NOW), online: () => options.online ?? true, model: () => options.model ?? true,
    gaps: () => [{ from: "2026-11-11T01:00:00.000Z", to: "2026-11-11T07:00:00.000Z", cause: "sleep" }],
  };
  return { ports, calls };
}

const overview = (source: string, upcoming: unknown[], missed: unknown[] = []) => (input: unknown) => {
  const window = input as RunsWindow;
  assert.equal(window.now, NOW);
  assert.equal(Date.parse(window.upcoming_until) - Date.parse(window.now), 48 * 3_600_000, "the next two days");
  return { source: { surface: source, title: source }, upcoming, missed } as RunsOverview;
};

test("RES-05 every owner found by type is asked once and the answers are put side by side, sorted, each with where it came from", async () => {
  const { ports, calls } = harness({
    "p1:schedule.runs.overview": overview("schedule", [run("t2", "2026-11-11T12:00:00.000Z", ["model"], "elsewhere")], [{ ...run("t0", "2026-11-11T06:00:00.000Z"), missed_at: NOW }]),
    "p2:schedule.runs.overview": overview("schedule", []),
    "p1:feed.runs.overview": overview("feed", [run("pull", "2026-11-11T10:00:00.000Z", ["network"])]),
    "p2:feed.runs.overview": overview("feed", []),
    "home:assistant.runs.overview": overview("assistant", [run("fu", "2026-11-11T11:00:00.000Z", ["model"])], [{ ...run("fu-old", "2026-11-11T08:00:00.000Z"), missed_at: NOW }]),
  });
  const result = await runtimeOverview(ports);
  assert.equal(result.state, "running");
  assert.deepEqual(calls.sort(), ["home:assistant.runs.overview", "p1:feed.runs.overview", "p1:schedule.runs.overview", "p2:feed.runs.overview", "p2:schedule.runs.overview"],
    "each owner once, never the decision actions");
  assert.deepEqual(result.upcoming.map(row => [row.run_id, row.project_id, row.source.scope_project_id, row.source.provider_id]), [
    ["pull", "p1", "p1", "feed"], ["fu", null, null, "assistant"], ["t2", "p1", "p1", "schedule"]], "by time; a project owner's run is that project's whatever it says");
  assert.deepEqual(result.missed.map(row => [row.run_id, row.source.surface]), [["fu-old", "assistant"], ["t0", "schedule"]], "latest first");
  assert.deepEqual(result.gaps.map(gap => gap.cause), ["sleep"]);
  assert.deepEqual(result.unavailable_sources, []);
});

test("RES-05 one owner that fails, times out or answers what cannot be drawn is named by its code; the others are listed as usual", async () => {
  const { ports } = harness({
    "p1:schedule.runs.overview": () => { throw new ActionError("schedule.unreadable", "PRIVATE owner words"); },
    "p2:schedule.runs.overview": () => new Promise(() => undefined),
    "p1:feed.runs.overview": () => ({ source: { surface: "bad surface!", title: "x" }, upcoming: [], missed: [] }),
    "p2:feed.runs.overview": overview("feed", [run("pull", "2026-11-11T10:00:00.000Z", ["network"])]),
    "home:assistant.runs.overview": overview("assistant", [run("fu", "2026-11-11T11:00:00.000Z", ["model"])]),
  }, { online: false });
  const result = await runtimeOverview(ports);
  assert.deepEqual(result.upcoming.map(row => [row.run_id, row.waiting]), [["pull", true], ["fu", false]], "without a network the pull waits; the model one does not");
  assert.deepEqual(result.waiting, { network: true, model: false });
  assert.deepEqual(result.unavailable_sources.map(issue => [issue.project_id, issue.provider_id, issue.code]).sort(), [
    ["p1", "feed", "actions.output_invalid"], ["p1", "schedule", "schedule.unreadable"], ["p2", "schedule", "actions.timeout"]]);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/u, "what an owner said in its error stays out");
});

test("RES-05 现在做 and 跳过 go to the decision action of the same provider in the same place; an owner no longer there is gone", async () => {
  const decided: unknown[] = [];
  const { ports } = harness({
    "p1:feed.runs.decide": input => { decided.push(input); return { state: "started" }; },
    "home:assistant.runs.decide": input => { decided.push(input); return { state: "skipped" }; },
  });
  assert.deepEqual(await decideRuntimeRun(ports, runtimeRunDecisionRequest({ scope_project_id: "p1", provider_id: "feed", run_id: "pull:1", decision: "run_now" })), { state: "started" });
  assert.deepEqual(await decideRuntimeRun(ports, runtimeRunDecisionRequest({ scope_project_id: null, provider_id: "assistant", run_id: "followup:a:1", decision: "skip" })), { state: "skipped" });
  assert.deepEqual(decided, [{ run_id: "pull:1", decision: "run_now" }, { run_id: "followup:a:1", decision: "skip" }]);
  assert.deepEqual(await decideRuntimeRun(ports, runtimeRunDecisionRequest({ scope_project_id: "closed", provider_id: "feed", run_id: "pull:1", decision: "skip" })), { state: "gone" });
  assert.deepEqual(await decideRuntimeRun(ports, runtimeRunDecisionRequest({ scope_project_id: "p1", provider_id: "nobody", run_id: "x", decision: "skip" })), { state: "gone" });
  for (const bad of [{ scope_project_id: "p1", provider_id: "feed", run_id: "x", decision: "later" }, { provider_id: "feed", run_id: "x", decision: "skip" }])
    assert.throws(() => runtimeRunDecisionRequest(bad), { code: "actions.input_invalid" });
});
