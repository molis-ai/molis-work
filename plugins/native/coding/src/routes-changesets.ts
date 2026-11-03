import { codingArtifacts, CODING_REPORT_TYPE, CODING_CHANGESET_TYPE } from "./artifacts.js";
import { codingChangeSetReference, codingChangeSetPreview, readCodingChangeSet, createCodingChangeSet, codingChangeFeedback } from "./changeset.js";
import { codingOutputs } from "./outputs.js";
import { COMMIT_DRAFT_ROUNDS, commitDraftMaterial, commitMessageFrom } from "./commit-draft.js";
import { codingDraft } from "./drafts.js";
import { runGoalContext } from "./goal-context.js";
import { artifactReferenceOf } from "./materials.js";
import { CODING_COMMIT_DRAFT } from "./prompts.js";
import { codingReportSteps } from "./report-steps.js";
import { codingReportPreview, codingReportPublication, codingReportReference, createCodingExecutionReport, readCodingExecutionReport } from "./report.js";
import { type CodingActivation, selected } from "./route-activation.js";
import { codingActions, type CodingBeforeWrite } from "./route-entry.js";
import { bodyOf } from "./route-selections.js";
import { text } from "./run-inputs.js";
import type { CodingSessionRecord } from "./store.js";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, isTerminalAgentPhase, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingFailure } from "./words.js";

/** Coding routes for what a round fixes: its change set, its report, their outputs, the outputs listed, and a commit message drafted from them. */

/** A round's report: the fixed version when there is one; built from the round and, when asked, fixed now. */
export const roundReport = async (a: CodingActivation, record: CodingSessionRecord, runId: string, save: boolean, beforeWrite: CodingBeforeWrite, fixedOnly = false) => {
  const { context } = a;
  const artifacts = codingArtifacts(context);
  const existing = readCodingExecutionReport(artifacts, record.session_id, runId);
  if (existing) return existing;
  if (fixedOnly) throw codingFailure("coding.server.report-unreadable");
  if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-run");
  const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
  const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
  const ref = snapshot.runs.find(entry => entry.run_id === runId);
  if (!ref) throw codingFailure("coding.server.run-elsewhere");
  const run = await codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref]);
  if (!isTerminalAgentPhase(run.phase)) throw codingFailure("coding.server.report-not-ready");
  const commands = await Promise.all((run.command_outputs ?? []).map(async command => {
    try {
      const output = await codingActions(context, beforeWrite).invoke(agent.readCommandOutput, [session, { run_id: runId, call_id: command.call_id }]);
      return { call_id: command.call_id, output };
    } catch { return { call_id: command.call_id, output: null }; }
  }));
  // The round number keeps two fixed reports of one session apart wherever they are listed.
  const report = createCodingExecutionReport({ session_id: record.session_id, runtime_id: record.runtime_id, title: `${record.title} · 第 ${snapshot.runs.indexOf(ref) + 1} 轮`, run, commands, steps: codingReportSteps(context, record.session_id, run), ...runGoalContext(context, run) });
  if (!save) return { report, reference: null, saved_at: null };
  // No asynchronous gap between recheck and publish: concurrent clicks share
  // the existing fixed version, even if their evidence reads finished later.
  await beforeWrite(); beforeWrite.assert_current();
  const saved = readCodingExecutionReport(artifacts, record.session_id, runId);
  if (saved) return saved;
  const reference = codingReportReference(record.session_id, runId);
  const result = artifacts.publish({ ...reference, artifact_type_id: CODING_REPORT_TYPE, schema_version: 1,
    content: { kind: "inline", payload: JSON.parse(JSON.stringify(report)) }, ...codingReportPublication(report, record.session_id, runId, artifacts) });
  return { report, reference, saved_at: result.artifact.created_at };
};
const reportRoute = (a: CodingActivation, save: boolean) => a.route(save ? "coding.save-report" : "coding.read-report", async (request, _api, execution, beforeWrite) =>
  roundReport(a, selected(a, request, execution), text(request.params.runId, "coding.field.run"), save, beforeWrite, request.query?.fixed === "1"));
const reportOutput = (a: CodingActivation, write: boolean) => a.route(write ? "coding.select-report-output" : "coding.report-output", async (request, _api, execution) => {
  const session = selected(a, request, execution);
  const saved = readCodingExecutionReport(codingArtifacts(a.context), session.session_id, text(request.params.runId, "coding.field.run"));
  if (!saved) throw codingFailure("coding.server.report-save-first");
  const outputs = a.context.services!.outputs!;
  if (write) {
    const body = bodyOf(request);
    const expected = body.expected_reference === null ? null : artifactReferenceOf(body.expected_reference);
    outputs.select({ port: "report", reference: saved.reference, expected_reference: expected });
  }
  const current = outputs.reference("report");
  return { reference: saved.reference, current, selected: current?.artifact_id === saved.reference.artifact_id && current?.version === saved.reference.version };
});

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  (a) => {
    const { context, route } = a;
    return [false, true].map(save => route(save ? "coding.save-changeset" : "coding.read-changeset", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution), runId = text(request.params.runId, "coding.field.run");
      const artifacts = codingArtifacts(context);
      const existing = readCodingChangeSet(artifacts, record.session_id, runId);
      if (existing) return { ...existing, output: context.services!.outputs!.reference("changeset") };
      if (request.query?.fixed === "1") throw codingFailure("coding.server.change-unreadable");
      if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-run");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]), ref = snapshot.runs.find(run => run.run_id === runId);
      if (!ref) throw codingFailure("coding.server.run-elsewhere");
      const run = await codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref]);
      const change = createCodingChangeSet(record.session_id, run, await codingActions(a.context, beforeWrite).invoke(agent.readRunReviews, [session, ref]));
      if (!save) return { change, reference: null, saved_at: null, output: context.services!.outputs!.reference("changeset") };
      await beforeWrite(); beforeWrite.assert_current();
      const saved = readCodingChangeSet(artifacts, record.session_id, runId);
      if (saved) return { ...saved, output: context.services!.outputs!.reference("changeset") };
      const reference = codingChangeSetReference(record.session_id, runId);
      const result = context.services!.processItems!.record({ ...reference, artifact_type_id: CODING_CHANGESET_TYPE, schema_version: 1,
        content: { kind: "inline", payload: JSON.parse(JSON.stringify(change)) },
        metadata: { title: `${record.title} · 第 ${snapshot.runs.indexOf(ref) + 1} 轮固定变更`, session_id: record.session_id, run_id: runId } });
      return { change, reference, saved_at: result.artifact.created_at, output: context.services!.outputs!.reference("changeset") };
    }));
  },
  (a) => {
    const { context, route } = a;
    return route("coding.changeset-output", async (request, _api, execution) => {
      const record = selected(a, request, execution), saved = readCodingChangeSet(codingArtifacts(context), record.session_id, text(request.params.runId, "coding.field.run"));
      if (!saved) throw codingFailure("coding.server.change-save-first");
      const body = bodyOf(request), expected = body.expected_reference === null ? null : artifactReferenceOf(body.expected_reference);
      context.services!.outputs!.select({ port: "changeset", reference: saved.reference, expected_reference: expected });
      return { ...saved, output: context.services!.outputs!.reference("changeset") };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.changeset-feedback", async (request, _api, execution) => {
      const record = selected(a, request, execution), runId = text(request.params.runId, "coding.field.run");
      const saved = readCodingChangeSet(codingArtifacts(context), record.session_id, runId);
      if (!saved) throw codingFailure("coding.server.change-save-for-notes");
      return { task: codingChangeFeedback(saved.change, bodyOf(request).comments), reference: saved.reference };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.reports", async () => {
      const reports = codingOutputs(context, [CODING_REPORT_TYPE]).flatMap(({ record }) => {
        const value = codingReportPreview(record);
        if (!value) return [];
        const { body_markdown: _body, ...entry } = value;
        return [entry];
      });
      return { reports };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.artifacts", async () => {
      const artifacts = codingOutputs(context, [CODING_REPORT_TYPE, CODING_CHANGESET_TYPE]).flatMap(({ record }) => {
        const report = codingReportPreview(record);
        if (report) { const { body_markdown: _body, ...entry } = report; return [{ ...entry, kind: "report", file_count: 0 }]; }
        const saved = codingChangeSetPreview(record);
        if (!saved) return [];
        const { change, ...entry } = saved;
        return [{ ...entry, kind: "changeset", file_count: change.files.length }];
      }).sort((a, b) => b.saved_at.localeCompare(a.saved_at) || a.reference.artifact_id.localeCompare(b.reference.artifact_id));
      return { artifacts };
    });
  },
  // The model drafts a commit message from the rounds that changed files; the person edits it and commits under review.
  (a) => {
    const { projectId, route } = a;
    return route("coding.commit-draft", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution), runId = text(request.params.runId, "coding.field.run"), body = bodyOf(request);
      if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-run");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
      const at = snapshot.runs.findIndex(run => run.run_id === runId);
      if (at < 0) throw codingFailure("coding.server.run-elsewhere");
      const rounds: Array<{ number: number; run: AgentRunView; change: ReturnType<typeof createCodingChangeSet> }> = [];
      for (let index = at; index >= 0 && rounds.length < COMMIT_DRAFT_ROUNDS; index--) {
        const ref = snapshot.runs[index]!, run = await codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref]);
        if (!isTerminalAgentPhase(run.phase)) continue;
        let change: ReturnType<typeof createCodingChangeSet>;
        try { change = createCodingChangeSet(record.session_id, run, await codingActions(a.context, beforeWrite).invoke(agent.readRunReviews, [session, ref])); } catch { continue; }
        if (change.files.some(file => file.review?.execution === "applied")) rounds.unshift({ number: index + 1, run, change });
      }
      if (!rounds.length) throw codingFailure("coding.server.no-saved-edits");
      const plan = execution.sessions.plan(projectId, record.session_id);
      const selection = typeof body.provider_id === "string" && typeof body.model_id === "string" ? { provider_id: body.provider_id, model_id: body.model_id } : undefined;
      const draft = await codingDraft(a.context, { purpose: "起草 git 提交说明", prompt: CODING_COMMIT_DRAFT.prompt_id,
        material: commitDraftMaterial({ ...(plan?.confirmed ? { planTitle: plan.content.title } : {}), ...(execution.locale ? { locale: execution.locale } : {}), rounds }), ...(selection ? { model_selection: selection } : {}) }, beforeWrite);
      return { message: commitMessageFrom(draft.text), usage: draft.usage, rounds: rounds.map(round => round.number) };
    });
  },
  (a) => [reportRoute(a, false), reportRoute(a, true), reportOutput(a, false), reportOutput(a, true)],
];

/** The change-set and report routes of one activation. */
export const changesetsRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
