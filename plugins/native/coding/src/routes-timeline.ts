import type { ActionLocale } from "@molis-ai/molis-work-contracts/platform/actions";
import { runsWithCards } from "./action-cards.js";
import { characterTitle, savedCharacter, savedCharacterSkills } from "./characters.js";
import { codingContinuation } from "./continuation.js";
import { nextHistoryMode } from "./history-digest.js";
import { savedMaterials } from "./materials.js";
import { type CodingActivation, selected, sessionState, savedBudget, savedDigestUsage, priorityOf } from "./route-activation.js";
import { codingActions, codingActionControl, type CodingBeforeWrite } from "./route-entry.js";
import { bodyOf, savedActions, methodSelection, mcpSelection, mcpSources } from "./route-selections.js";
import { nextConfiguration, text } from "./run-inputs.js";
import { codingRunForDisplay, codingSessionUsage, SESSION_PAGE, summariesFingerprint } from "./session-window.js";
import { codingTaskBoardPlans, stepVerdictKey } from "./taskboard.js";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { agentHostCapabilities as agent, isTerminalAgentPhase, type AgentRunView, type AgentStepAmendment, type AgentStepBoard } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentCollaborationActions } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { agentInputActions } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { codingFailure, codingText } from "./words.js";

/** Coding routes for a session's timeline: its rounds as they run and as recorded, the TaskBoard, recovery and rewind, messages and background commands. */

/** The supplement a new step is for, as the page names it; the Host checks it is the round's own (stage 3d-3). */
function origin(value: unknown): { origin?: string } {
  if (value === undefined) return {};
  if (typeof value !== "string" || !value || value.length > 200) throw codingFailure("coding.server.supplement-ref");
  return { origin: value };
}

/** A person's plan change, checked before it reaches the Host. */
function stepAmendment(value: unknown): AgentStepAmendment {
  const entry = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const id = (key: string) => { const found = entry[key]; if (typeof found !== "string" || !/^(step|user)-\d{1,3}$/.test(found)) throw codingFailure("coding.server.step-ref"); return found; };
  const words = (key: string, label: string, max: number) => { const found = entry[key]; if (typeof found !== "string" || !found.trim() || found.length > max) throw codingFailure("coding.server.fill-in", { label: { key: label }, max }); return found.trim(); };
  switch (entry.kind) {
    case "skip": return { kind: "skip", node: id("node"), reason: words("reason", "coding.field.skip-reason", 300) };
    case "insert": return { kind: "insert", after: id("after"), title: words("title", "coding.field.new-step", 120), acceptance: words("acceptance", "coding.field.acceptance", 300), ...(entry.mine === true ? { mine: true as const } : {}), ...origin(entry.origin) };
    case "unblock": return { kind: "unblock", node: id("node"), note: words("note", "coding.field.decision", 500) };
    case "move": if (entry.direction !== "up" && entry.direction !== "down") throw codingFailure("coding.server.move-direction"); return { kind: "move", node: id("node"), direction: entry.direction };
    case "assign": if (entry.to !== "me" && entry.to !== "session") throw codingFailure("coding.server.reassign-target"); return { kind: "assign", node: id("node"), to: entry.to };
    case "resolve": if (entry.state !== "succeeded" && entry.state !== "failed") throw codingFailure("coding.server.result"); return { kind: "resolve", node: id("node"), state: entry.state, note: words("note", "coding.field.result-note", 500) };
    default: throw codingFailure("coding.server.plan-change");
  }
}

/** What the model is told, in the person's voice; the graph itself holds the authoritative record. */
function amendmentNote(amendment: AgentStepAmendment, board: AgentStepBoard): string {
  const name = (id: string) => `「${board.nodes.find(node => node.id === id)?.title ?? id}」`;
  const tail = "请先用 board-read 读取最新版本，按新的顺序继续；不要重做已完成的步骤。";
  switch (amendment.kind) {
    case "skip": return `我调整了本轮计划：跳过${name(amendment.node)}，原因：${amendment.reason}。${tail}`;
    case "insert": return amendment.mine
      ? `我调整了本轮计划：在${name(amendment.after)}之后插入新步骤「${amendment.title}」，完成条件：${amendment.acceptance}，由我自己处理。你不要报告这一步；等它完成后再继续依赖它的步骤。${tail}`
      : `我调整了本轮计划：在${name(amendment.after)}之后插入新步骤「${amendment.title}」，完成条件：${amendment.acceptance}。新步骤在任务图里的编号以 board-read 为准（user- 开头），轮到它时照常报告 running 与结果。${tail}`;
    case "unblock": return `关于受阻的${name(amendment.node)}，我的决定：${amendment.note}。请按这个决定继续。${tail}`;
    case "move": return `我调整了本轮计划顺序：把${name(amendment.node)}${amendment.direction === "up" ? "提前" : "推后"}一步。${tail}`;
    case "assign": return amendment.to === "me"
      ? `我把${name(amendment.node)}改派给我自己处理。你（以及原来负责它的子任务）不要再报告这一步；等它完成后再继续依赖它的步骤。${tail}`
      : `我把${name(amendment.node)}交回本会话，由你负责报告和完成。${tail}`;
    case "resolve": return `我处理的${name(amendment.node)}${amendment.state === "succeeded" ? "已经完成" : "失败了"}：${amendment.note}。${amendment.state === "succeeded" ? "依赖它的步骤现在可以继续。" : "请看依赖它的步骤怎么办，需要我决定就说明。"}${tail}`;
  }
}

/**
 * Whether an earlier round may still be continued: only a plan round whose graph is unfinished, when every round
 * after it was plain conversation (no plan of its own) and has ended.
 */
export function planContinuesAfterTalk(run: Pick<AgentRunView, "step_board">, later: ReadonlyArray<Pick<AgentRunView, "frozen" | "phase">>): boolean {
  return Boolean(run.step_board && !run.step_board.terminal) && later.every(view => !view.frozen.execution_plan && isTerminalAgentPhase(view.phase));
}
/** Children of the rounds that coordinate them, with the person's saved verdicts. */
const subagentGroups = async (a: CodingActivation, beforeWrite: CodingBeforeWrite, sessionId: string, session: { runtime_id: string; session_id: string }, runs: readonly AgentRunView[], locale?: ActionLocale) => {
  const { context } = a;
  const groups = [];
  for (const run of runs.filter(run => ["coordinator", "writers"].includes(run.frozen.role_id))) {
    try {
      const children = await codingActions(a.context, beforeWrite).invoke(agent.listSubagents, [session, run.ref]);
      groups.push({ run_id: run.ref.run_id, children: children.map(child => {
        const saved = context.services!.storage!.get(`subagent-verdict:${sessionId}:${run.ref.run_id}:${child.subagent_id}`);
        return { ...child, integration_available: run.frozen.role_id === "writers" && Boolean(run.frozen.subagent_workspaces?.some(workspace => workspace.directory.canonical_path === child.workspace_path)), verdict: typeof saved === "string" ? JSON.parse(saved) : null };
      }) });
    } catch (error) { groups.push({ run_id: run.ref.run_id, children: [], error: error instanceof Error ? error.message : codingText(locale)("coding.server.subtasks-unreadable") }); }
  }
  return groups;
};

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  (a) => {
    const { context, route } = a;
    return route("coding.evaluate-step", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-record");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
      const ref = snapshot.runs.find(run => run.run_id === request.params.runId);
      if (!ref || snapshot.recovery || snapshot.checkpoint_busy) throw codingFailure("coding.server.check-original-first");
      const run = await codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref]);
      if (!isTerminalAgentPhase(run.phase)) throw codingFailure("coding.server.rate-after-turn");
      const entry = codingTaskBoardPlans(context, record.session_id, [run]).find(entry => entry.board);
      const board = entry?.board, node = board?.nodes.find(node => node.id === request.params.stepId);
      if (!board || !node || entry?.board_error || !node.reports.length) throw codingFailure("coding.server.step-no-report");
      if (body.project_id !== board.project_id || body.board_version !== board.version) throw codingFailure("coding.server.step-report-changed");
      if (!["accepted", "needs-work"].includes(String(body.action)) || body.action === "accepted" && node.state !== "succeeded") throw codingFailure("coding.server.accept-succeeded-only");
      const notes = typeof body.notes === "string" ? body.notes.trim() : "";
      if (notes.length > 4000 || body.action === "needs-work" && !notes) throw codingFailure("coding.server.rework-reason");
      await beforeWrite(); beforeWrite.assert_current();
      const key = stepVerdictKey(record.session_id, ref.run_id, node.id), saved = context.services!.storage!.get(key);
      const revision = typeof saved === "string" ? JSON.parse(saved).revision : 0;
      if (body.expected_revision !== revision) throw codingFailure("coding.server.rating-changed");
      const verdict = { revision: revision + 1, status: body.action, notes, project_id: board.project_id, board_version: board.version, actor: request.actor_id, at: new Date().toISOString() };
      context.services!.storage!.set(key, JSON.stringify(verdict));
      return { verdict };
    });
  },
  (a) => {
    const { context, projectId, summaries, route } = a;
    return route("coding.read-session", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      // The Goal's title as Goals has it now (the page shows it in the session header); read through Goals' action, kept for the directory.
      if (record.goal_id) await execution.goalTitles.read([record.goal_id], beforeWrite);
      const character = savedCharacter(context, record.session_id), character_title = characterTitle(context, character);
      const plan = execution.sessions.plan(projectId, record.session_id);
      const draft = context.services?.storage?.get(`draft:${record.session_id}`) ?? "";
      const savedConfiguration = context.services?.storage?.get(`configuration:${record.session_id}`);
      const configuration = typeof savedConfiguration === "string" ? nextConfiguration(JSON.parse(savedConfiguration)) : null;
      const savedMcp = context.services?.storage?.get(`mcp:${record.session_id}`);
      const action_tools = savedActions(context, record.session_id);
      const mcp_tools = typeof savedMcp === "string" ? mcpSelection(JSON.parse(savedMcp)) : [];
      const savedSources = context.services?.storage?.get(`mcp-sources:${record.session_id}`);
      const mcp_sources = typeof savedSources === "string" ? mcpSources(JSON.parse(savedSources)) : [];
      const materials = savedMaterials(context, record.session_id);
      const savedMethods = context.services?.storage?.get(`methods:${record.session_id}`);
      const methods = typeof savedMethods === "string" ? methodSelection(JSON.parse(savedMethods)) : [];
      const questionDrafts = context.services?.storage?.get(`question-drafts:${record.session_id}`);
      const question_drafts = typeof questionDrafts === "string" ? JSON.parse(questionDrafts) : {};
      const wait = await a.waits.openWaitOf(record).catch(() => undefined), queuedView = wait ? a.waits.waitView(wait) : null, priority = priorityOf(a, record.session_id);
      if (!record.runtime_session_id) return { session: { ...record, queued: queuedView, priority, goal_title: record.goal_id ? execution.goalTitles.known(record.goal_id) ?? null : null }, runs: [], draft, question_drafts, materials, methods, configuration, action_tools, mcp_tools, mcp_sources, character, character_title, character_skill_ids: savedCharacterSkills(context, record.session_id), plan };
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      try {
        const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
        // With a window, a refresh costs the same however long the session is: the latest rounds in full, the earlier
        // ones as summaries that are only resent when they changed. Without one, every round is read, as before.
        const size = request.query?.window === undefined ? undefined : Number(request.query.window);
        if (size !== undefined && (!Number.isSafeInteger(size) || size < 1 || size > 50)) throw codingFailure("coding.server.page-size");
        const offset = size === undefined ? 0 : Math.max(0, snapshot.runs.length - size);
        const runs = await runsWithCards(context, api!, record, await Promise.all(snapshot.runs.slice(offset).map((run) => codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, run]))), beforeWrite);
        // A round the page already holds unchanged travels as its fingerprint alone.
        const known = new Set(String(request.query?.known ?? "").split(",").filter(Boolean));
        const shown = size === undefined ? runs : runs.map(run => { const display = codingRunForDisplay(run); return known.has(display.fingerprint) ? { ref: display.ref, fingerprint: display.fingerprint, unchanged: true } : display; });
        const earlier = offset ? await summaries.read(session.session_id, snapshot.runs.slice(0, offset), ref => codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref])) : [];
        const earlierFingerprint = summariesFingerprint(earlier);
        const last = runs.at(-1);
        const state = snapshot.recovery ? "reconcile-required" : last ? sessionState(last) : "idle";
        const updated = { ...record, state };
        const compactRequested = context.services?.storage?.get(`compact-next:${record.session_id}`) === "1";
        return { session: { ...updated, queued: queuedView, queued_inputs: snapshot.queued_inputs, priority, checkpoint_busy: snapshot.checkpoint_busy === true, goal_title: updated.goal_id ? execution.goalTitles.known(updated.goal_id) ?? null : null }, runs: shown, subagents: await subagentGroups(a, beforeWrite, record.session_id, session, runs, execution.locale), taskboard_plans: codingTaskBoardPlans(context, record.session_id, runs), draft, question_drafts, materials, methods, configuration, action_tools, mcp_tools, mcp_sources, character, character_title, character_skill_ids: savedCharacterSkills(context, record.session_id), plan, checkpoint_busy: snapshot.checkpoint_busy === true,
          run_count: snapshot.runs.length, runs_offset: offset,
          ...(size === undefined ? {} : { earlier_fingerprint: earlierFingerprint, ...(request.query?.earlier === earlierFingerprint ? {} : { earlier }) }),
          usage_total: codingSessionUsage([...earlier.map(summary => summary.usage), ...runs.map(run => run.usage)], savedDigestUsage(a, record.session_id)),
          next_history: nextHistoryMode(last, compactRequested), compact_requested: compactRequested, budget: savedBudget(a, record.session_id),
          ...(snapshot.recovery ? { recovery_required: true, error: snapshot.recovery.reason } : {}) };
      } catch (error) {
        // Never replace a lost runtime reference with a new session: that would
        // silently lose history and could repeat effects after a restart.
        const session = { ...record, state: "reconcile-required" as const };
        return { session, runs: [], draft, question_drafts, materials, methods, configuration, action_tools, mcp_tools, mcp_sources, character, character_title, character_skill_ids: savedCharacterSkills(context, record.session_id), plan, recovery_required: true,
          error: (error as { code?: string }).code === "agent.session_unknown"
            ? codingText(execution.locale)("coding.server.record-not-restored")
            : codingText(execution.locale)("coding.server.record-unreadable") };
      }
    });
  },
  // A live round, as it happens: answers as soon as it changes from what the page holds (or after the wait).
  (a) => {
    const { route } = a;
    return route("coding.live", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-run");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const since = typeof request.query?.since === "string" && request.query.since ? request.query.since : null;
      const wait = Math.min(Math.max(Math.trunc(Number(request.query?.timeout ?? 20_000)) || 0, 0), 25_000);
      const result = await codingActions(a.context, beforeWrite).invoke(agent.waitRun, [session, { session_id: session.session_id, run_id: text(request.params.runId, "coding.field.run", 200) }, since, wait]);
      return { version: result.version, runs: (await runsWithCards(a.context, api!, record, [result.view], beforeWrite)).map(codingRunForDisplay) };
    });
  },
  // Scrolling back reads earlier rounds a page at a time, with what the timeline shows beside them.
  (a) => {
    const { context, route } = a;
    return route("coding.read-runs", async (request, api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) return { runs: [], runs_offset: 0, subagents: [], taskboard_plans: [] };
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
      const before = Number(request.query?.before ?? snapshot.runs.length), limit = Number(request.query?.limit ?? SESSION_PAGE);
      if (!Number.isSafeInteger(before) || before < 0 || before > snapshot.runs.length || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw codingFailure("coding.server.read-range");
      const offset = Math.max(0, before - limit);
      const runs = await runsWithCards(context, api!, record, await Promise.all(snapshot.runs.slice(offset, before).map(ref => codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref]))), beforeWrite);
      return { runs: runs.map(codingRunForDisplay), runs_offset: offset, run_count: snapshot.runs.length, subagents: await subagentGroups(a, beforeWrite, record.session_id, session, runs, execution.locale), taskboard_plans: codingTaskBoardPlans(context, record.session_id, runs) };
    });
  },
  // The whole session's TaskBoard: rounds that ran a confirmed plan or dispatched subagents are read in full, the rest
  // come as summaries, since the board shows none of their detail.
  (a) => {
    const { context, summaries, route } = a;
    return route("coding.taskboard", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) return { runs: [], subagents: [], taskboard_plans: [] };
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
      const light = await summaries.read(session.session_id, snapshot.runs, ref => codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref]));
      const prefix = `coding-plan:${record.session_id}:`;
      const tasked = snapshot.runs.filter((_, index) => light[index]!.frozen.text_materials.some(material => material.source_artifact_id.startsWith(prefix))
        || ["coordinator", "writers"].includes(light[index]!.frozen.role_id));
      const full = await Promise.all(tasked.map(ref => codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref])));
      return { runs: light, subagents: await subagentGroups(a, beforeWrite, record.session_id, session, full, execution.locale), taskboard_plans: codingTaskBoardPlans(context, record.session_id, full) };
    });
  },
  (a) => {
    const { route } = a;
    return route("coding.recovery", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) throw codingFailure("coding.server.no-run-record");
      return codingActions(a.context, beforeWrite).invoke(agent.inspectRecovery, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }]);
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.plan-amendments", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-run");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
      const ref = snapshot.runs.find(entry => entry.run_id === request.params.runId);
      if (!ref) throw codingFailure("coding.server.run-elsewhere");
      const body = bodyOf(request), amendment = stepAmendment(body.amendment), version = body.expected_version;
      if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw codingFailure("coding.server.plan-graph-stale");
      const before = (await codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref])).step_board;
      const { board } = await context.services!.actions!.invoke(agentCollaborationActions.revise, { ...session, run_id: ref.run_id, amendment, expected_version: version }, codingActionControl(beforeWrite));
      // The live round learns of the change through the same supplemental channel a person already uses.
      const note = amendmentNote(amendment, before ?? board);
      try { await context.services!.actions!.invoke(agentInputActions.send, { ...session, run_id: ref.run_id, source: "host", text: note }, codingActionControl(beforeWrite)); return { board, steered: true }; }
      catch (error) { return { board, steered: false, steer_error: error instanceof Error ? error.message : String(error) }; }
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.continuation", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-run");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
      if (snapshot.recovery || snapshot.checkpoint_busy) throw codingFailure("coding.server.check-before-continue");
      const index = snapshot.runs.findIndex(ref => ref.run_id === request.params.runId);
      if (index < 0) throw codingFailure("coding.server.run-elsewhere");
      const ref = snapshot.runs[index]!, run = await codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, ref]);
      // Only the newest round picks up again, with one exception: the latest plan round's unfinished graph, when the
      // rounds after it were only conversation (a question, say) and have ended. Nothing else is continued out of order.
      if (index !== snapshot.runs.length - 1) {
        const later = await Promise.all(snapshot.runs.slice(index + 1).map(entry => codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, entry])));
        if (!planContinuesAfterTalk(run, later)) throw codingFailure("coding.server.continue-latest");
      }
      const reviews = await codingActions(a.context, beforeWrite).invoke(agent.readRunReviews, [session, ref]);
      // A receipt that cannot be read is reported as such, never skipped: the continuation must not overstate what ran.
      const commands = await Promise.all((run.command_outputs ?? []).map(async command => {
        try { return { call_id: command.call_id, output: await codingActions(context, beforeWrite).invoke(agent.readCommandOutput, [session, { run_id: ref.run_id, call_id: command.call_id }]) }; }
        catch { return { call_id: command.call_id, output: null }; }
      }));
      const plan = run.step_board && !run.step_board.terminal ? codingTaskBoardPlans(context, record.session_id, [run]).find(entry => entry.board && entry.revision) : undefined;
      // A round that dispatched subtasks hands them on as facts; unreadable is said, never read as "none". A plan's
      // subtasks count from every round of that plan, newest first: one finished two rounds ago must not be sent again.
      const planRuns = plan && run.step_board
        ? (await Promise.all(snapshot.runs.map(each => each.run_id === ref.run_id ? run : codingActions(a.context, beforeWrite).invoke(agent.readRun, [session, each]))))
          .filter(each => each.step_board?.project_id === run.step_board!.project_id).reverse()
        : [run];
      const withChildren = planRuns.filter(each => ["coordinator", "writers"].includes(each.frozen.role_id));
      const subagents = withChildren.length
        ? await Promise.all(withChildren.map(each => codingActions(a.context, beforeWrite).invoke(agent.listSubagents, [session, each.ref]))).then(lists => lists.flat(), () => null) : [];
      const next = codingContinuation({ number: index + 1, run, reviews, commands, plan_unfinished: Boolean(plan), subagents });
      // A plan run in parallel goes on in parallel; any other plan continues as one execution round.
      return plan ? { ...next, intent: next.intent === "parallel" ? "parallel" : "execute", plan_revision: plan.revision, continue_step_board_of: run.ref.run_id } : next;
    });
  },
  (a) => {
    const { route } = a;
    return route("coding.recover-run", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) throw codingFailure("coding.server.no-run-record");
      const expectedVersion = bodyOf(request).expected_version;
      if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw codingFailure("coding.server.check-version-stale");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      return codingActions(a.context, beforeWrite).invoke(agent.recoverRun, [session, { session_id: session.session_id, run_id: text(request.params.runId, "coding.field.run") }, expectedVersion]);
    });
  },
  (a) => {
    const { route } = a;
    return route("coding.checkpoints", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) return { checkpoints: [] };
      return { checkpoints: await codingActions(a.context, beforeWrite).invoke(agent.listCheckpoints, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }]) };
    });
  },
  (a) => {
    const { route } = a;
    return route("coding.prepare-rewind", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-run");
      const intent = bodyOf(request).intent;
      const role = intent === "edit" ? "writer" : intent === "execute" ? "builder" : null;
      if (!role) throw codingFailure("coding.server.rollback-needs-edit");
      return { review: await codingActions(a.context, beforeWrite).invoke(agent.prepareRewind, [{ runtime_id: record.runtime_id, session_id: record.runtime_session_id }, text(request.params.checkpointId, "coding.field.checkpoint"), role]) };
    });
  },
  (a) => {
    const { route } = a;
    return route("coding.command-output", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) throw codingFailure("coding.server.session-no-run");
      const session = { runtime_id: record.runtime_id, session_id: record.runtime_session_id };
      const snapshot = await codingActions(a.context, beforeWrite).invoke(agent.readSession, [session]);
      const run = snapshot.runs.find(entry => entry.run_id === request.params.runId);
      if (!run) throw codingFailure("coding.server.run-elsewhere");
      return codingActions(a.context, beforeWrite).invoke(agent.readCommandOutput, [session, { run_id: run.run_id, call_id: text(request.params.callId, "coding.field.command") }]);
    });
  },
  // Messages this session sent and received, and withdrawing an open one.
  (a) => {
    const { projectId, route } = a;
    return route("coding.messages", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) return { messages: [] };
      const sessions = execution.sessions.list(projectId), coding = (runtime: string) => sessions.find(entry => entry.runtime_session_id === runtime);
      // Letters for people (delegations and their deliveries) are shown with the delegation, not here.
      return { messages: (await codingActions(a.context, beforeWrite).invoke(agent.readMessages, [record.runtime_id, record.runtime_session_id])).filter(message => message.audience !== "people").map(message => {
        const outgoing = message.from_session === record.runtime_session_id, other = coding(outgoing ? message.to_session : message.from_session);
        return { ...message, from_title: coding(message.from_session)?.title ?? message.from_title, to_title: coding(message.to_session)?.title ?? message.to_title,
          outgoing, peer: other ? { session_id: other.session_id, title: other.title } : null };
      }) };
    });
  },
  (a) => {
    const { route } = a;
    return route("coding.message-cancel", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      await codingActions(a.context, beforeWrite).invoke(agent.cancelMessage, [record.runtime_id, text(request.params.messageId, "coding.field.letter")]);
      return { cancelled: true };
    });
  },
  // The session's background commands, and stopping one.
  (a) => {
    const { route } = a;
    return route("coding.background", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      if (!record.runtime_session_id) return { commands: [] };
      return { commands: await codingActions(a.context, beforeWrite).invoke(agent.readBackground, [record.runtime_id, record.runtime_session_id]) };
    });
  },
  (a) => {
    const { route } = a;
    return route("coding.background-stop", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution);
      return { stopped: await codingActions(a.context, beforeWrite).invoke(agent.stopBackground, [record.runtime_id, text(request.params.taskId, "coding.field.background-command")]) };
    });
  },
];

/** The timeline routes of one activation. */
export const timelineRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
