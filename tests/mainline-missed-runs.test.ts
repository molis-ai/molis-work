import { fakeActionClient } from "@molis-ai/molis-work-test-kit";
import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, defineRunDecisionAction, defineRunsOverviewAction, type ActionExecutionContext, type ActionClient, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { decideBackgroundTask, readBackgroundTasks, runBackgroundTaskCommand } from "@molis-ai/molis-work-service-mainline";
import { readFileSync } from "node:fs";
import { createImagesActionHandlers, imagesActions, type ImageJob } from "@molis-ai/molis-work-plugin-images";
import { installTextForTest, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";

/*
 * The other two kinds of row in the table of background tasks (specs/work-line §6, WLN-39): what runs on its own and was missed, read
 * from the runs owners by their types, and another plugin's long task (an image still generating). Both come in the one shape, and
 * what is pressed on a row is the owner's own action, read again in that call.
 */

const CALLER: ActionExecutionContext = { actor_id: "person", audience: "user", project_id: "p1", permissions: [], beforeEffect: async () => {} };
const view = (definition: Pick<ActionView, "capability_id" | "version" | "operation" | "action">, provider: string, available = true): ActionView => ({ ...definition, provider: { provider_id: provider, title: provider, kind: "plugin" },
  availability: available ? { available: true } : { available: false, code: "actions.plugin_disabled", reason: "这个插件没有开启" } });
const overview = (provider: string, scope: "project" | "home" = "project") => view(defineRunsOverviewAction(`${provider}.runs.overview`, 1, "运行概况", [`${provider}:read`], scope), provider);
const decision = (provider: string) => view(defineRunDecisionAction(`${provider}.runs.decide`, 2, "处理错过的", [`${provider}:write`], "project"), provider);
const run = (id: string, extra: Record<string, unknown> = {}) => ({ run_id: id, title: `每天 ${id}`, due_at: "2026-11-14T01:00:00.000Z", missed_at: "2026-11-14T01:00:00.000Z", project_id: "p1", open: { surface: "schedule", id }, needs: [], ...extra });
type Call = [capability: string, input: unknown, queryOnly: boolean];
function clientOf(views: ActionView[], answer: (capability: string, input: unknown) => unknown): { client: ActionClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: ActionClient = fakeActionClient({ discover: async () => views, invoke: async (caller, action, input) => { calls.push([action.capability_id, input, caller.query_only === true]); return answer(action.capability_id, input); } });
  return { calls, client };
}
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
/** The shell's words (the missed run's step, question and answers are said in the reader's language), with any plugin's own packs. */
const packOf = (file: string) => { const pack = parseLocalePack(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { file }); assert.ok(pack.ok); return pack.value; };
const withText = (t: { after(fn: () => void): void }, ...files: string[]) => t.after(installTextForTest({ locale: "zh", packs: ["apps/workbench/resources/locales/zh.json", ...files].map(packOf) }));

test("WLN-39 what runs on its own and was missed is a task that waits on the person: read from the project's runs owners by type, in the task shape, with 「现在做一次」 and 「跳过」 as the owner's own decision action; what is ahead is not a task", async t => {
  withText(t);
  const answers: Record<string, unknown> = {
    "schedule.runs.overview": { source: { surface: "schedule", title: "定时任务" }, upcoming: [run("ahead", { due_at: "2026-11-20T01:00:00.000Z" })], missed: [run("r1"), run("r2", { open: null }), { run_id: "", title: 7 }, "nonsense"] },
    "feed.runs.overview": { source: { surface: "feed", title: "Feed" }, upcoming: [], missed: [run("pull", { missed_at: "2026-11-14T03:00:00.000Z" })] },
  };
  const { client, calls } = clientOf([overview("schedule"), decision("schedule"), overview("feed"), overview("home", "home"), decision("other")], capability => answers[capability]);
  const read = await readBackgroundTasks(CALLER, client);
  assert.deepEqual(read.issues, []);
  assert.deepEqual(read.tasks.map(row => [row.subject.kind, row.subject.id]), [["scheduled_run", "pull"], ["scheduled_run", "r1"], ["scheduled_run", "r2"]], "only what was missed and can be drawn, newest first");
  assert.deepEqual(calls.map(call => [call[0], call[2]]).sort(), [["feed.runs.overview", true], ["schedule.runs.overview", true]], "each project owner once, read-only; a Home owner is not this project's");
  const window = calls[0]![1] as { now: string; upcoming_until: string };
  assert.equal(window.now, window.upcoming_until, "nothing ahead is asked for");

  const [pull, r1, r2] = read.tasks;
  assert.deepEqual([r1!.title, r1!.state, r1!.waiting, r1!.updated_at, r1!.scope, r1!.executor, r1!.origin], ["每天 r1", "answer", true, "2026-11-14T01:00:00.000Z", "project", { kind: "plugin", label: "定时任务" }, { surface: "schedule", title: "定时任务", icon: "clock" }]);
  assert.deepEqual(r1!.open, { kind: "item", surface: "schedule", id: "r1", title: "每天 r1", label: "打开" }); assert.equal(r2!.open, null);
  assert.deepEqual(r1!.commands, []);
  assert.deepEqual(r1!.decisions.map(asked => [asked.id, asked.answers.map(answer => {
    assert.ok("action" in answer, "the answer comes from the missed run's owner");
    return [answer.role, answer.action, answer.input];
  })]), [["missed", [
    ["approve", { capability_id: "schedule.runs.decide", version: 2, provider_id: "schedule" }, { run_id: "r1", decision: "run_now" }],
    ["reject", { capability_id: "schedule.runs.decide", version: 2, provider_id: "schedule" }, { run_id: "r1", decision: "skip" }]]]]);
  assert.deepEqual(pull!.decisions, [], "an owner with no decision action of its own offers nothing to press; another provider's is not borrowed");

  // An owner that fails or sends something else is an issue by its code, and the others are still listed.
  answers["feed.runs.overview"] = { missed: "none" };
  const partial = await readBackgroundTasks(CALLER, client);
  assert.deepEqual([partial.tasks.length, partial.issues.map(issue => [issue.source.capability_id, issue.code])], [2, [["feed.runs.overview", "actions.output_invalid"]]]);
});

test("WLN-39, WLN-10 answering a missed run asks its owner again and runs the owner's decision as the person: 「现在做一次」 and 「跳过」 carry that run only, and a run no longer missed is refused with nothing called", async t => {
  withText(t);
  let missed: unknown[] = [run("r1")];
  const { client, calls } = clientOf([overview("schedule"), decision("schedule")], capability => capability === "schedule.runs.overview" ? { source: { surface: "schedule", title: "定时任务" }, upcoming: [], missed } : { state: "started" });
  const source = { capability_id: "schedule.runs.overview", version: 1, provider_id: "schedule" }, subject = { kind: "scheduled_run", id: "r1" };
  assert.deepEqual(await decideBackgroundTask(CALLER, client, { source, subject, decision: "missed", role: "approve" }), { role: "approve", output: { state: "started" } });
  assert.deepEqual(calls.at(-1), ["schedule.runs.decide", { run_id: "r1", decision: "run_now" }, false]);
  await decideBackgroundTask(CALLER, client, { source, subject, decision: "missed", role: "reject" });
  assert.deepEqual(calls.at(-1), ["schedule.runs.decide", { run_id: "r1", decision: "skip" }, false]);

  const before = calls.filter(call => call[0] === "schedule.runs.decide").length;
  await assert.rejects(decideBackgroundTask(CALLER, client, { source, subject, decision: "missed", role: "revise", note: "换个时间" }), code("mainline.decision_changed"), "a missed run has no 「改一下」");
  await assert.rejects(decideBackgroundTask(CALLER, client, { source, subject: { kind: "scheduled_run", id: "r9" }, decision: "missed", role: "approve" }), code("mainline.decision_changed"));
  missed = [];
  await assert.rejects(decideBackgroundTask(CALLER, client, { source, subject, decision: "missed", role: "approve" }), code("mainline.decision_changed"), "decided elsewhere in the meantime");
  await assert.rejects(decideBackgroundTask(CALLER, client, { source: { ...source, provider_id: "feed" }, subject, decision: "missed", role: "approve" }), code("mainline.source_changed"));
  assert.equal(calls.filter(call => call[0] === "schedule.runs.decide").length, before, "a refusal calls no decision");
});

test("WLN-39 another plugin's long task: an image still generating is a row in the one shape, and its stop is Images' own 「停止本机等待」 for that job, run after asking Images again", async t => {
  const job = (id: string, status: ImageJob["status"]): ImageJob => ({ id, project_id: "p1", request_id: `q-${id}`, connection_id: "c1", connection_name: "示例", api_format: "openai-images", model: "img-1", prompt: `一张图 ${id}`, size: "1024x1024",
    aspect_ratio: "1:1", status, images: [], error: "", created_at: "2026-11-14T02:00:00.000Z", finished_at: status === "running" ? null : "2026-11-14T02:01:00.000Z" });
  withText(t, "plugins/native/images/locales/zh.json");
  let jobs = [job("j1", "running"), job("j2", "succeeded"), job("j3", "failed")];
  const asked: string[] = [];
  const handlers = createImagesActionHandlers({ service: () => ({ listJobs: (projectId: string) => { asked.push(projectId); return jobs; } }) } as never);
  const tasks = handlers.find(handler => handler.capability_id === imagesActions.backgroundTasks.capability_id)!;
  const { client, calls } = clientOf([view(imagesActions.backgroundTasks, "io.molis.work.images")], (capability, input) => capability === imagesActions.backgroundTasks.capability_id ? tasks.handle(CALLER as never, input) : { job: job("j1", "cancelled") });

  const read = await readBackgroundTasks(CALLER, client);
  assert.deepEqual([read.issues, read.tasks.map(row => [row.subject.kind, row.subject.id, row.state, row.waiting, row.title])], [[], [["image_job", "j1", "generating", false, "一张图 j1"]]], "only what is still running is a task");
  assert.deepEqual(asked, ["p1"], "the caller's project");
  const row = read.tasks[0]!;
  assert.deepEqual(row.commands.map(command => [command.role, command.action, command.input]), [["stop", { capability_id: imagesActions.cancel.capability_id, version: imagesActions.cancel.version, provider_id: "io.molis.work.images" }, { id: "j1" }]]);
  assert.deepEqual([row.open?.kind, row.open?.surface, row.executor.kind], ["surface", "images", "plugin"]);

  assert.deepEqual(await runBackgroundTaskCommand(CALLER, client, { source: row.source, subject: row.subject, command: row.commands[0]! }), { role: "stop", output: { job: job("j1", "cancelled") } });
  assert.deepEqual(calls.at(-1), [imagesActions.cancel.capability_id, { id: "j1" }, false]);
  jobs = [job("j1", "cancelled")];
  await assert.rejects(runBackgroundTaskCommand(CALLER, client, { source: row.source, subject: row.subject, command: row.commands[0]! }), code("mainline.task_changed"), "already stopped: nothing left to stop");
});
