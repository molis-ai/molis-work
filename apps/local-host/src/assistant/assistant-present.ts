import type { AgentRecoveryReport, AgentRunView, AgentToolActivity } from "@molis-ai/molis-work-contracts/services/agent-host";
import { failedStep } from "./activity-failure.js";
import type { AssistantActivity, AssistantRecovery, AssistantWorkState, AssistantWorkObject, AssistantRoundDiagnostics } from "@molis-ai/molis-work-contracts/services/assistant";
import type { StoredRound, StoredWork } from "./assistant-store.js";
import { desktopVerb, shownActivityTarget } from "./desktop-activity.js";
import { ROUND_TURNS } from "./assistant-round-start.js";

/** How a work's state, rounds and activity read to the person and on the diagnostics page: pure functions, no Host. */
export function stateOf(phase: AgentRunView["phase"] | null | undefined, recovery: boolean): AssistantWorkState {
  if (recovery) return "needs-check";
  switch (phase) {
    case undefined: case null: return "idle";
    case "starting": case "running": case "compacting": return "running";
    case "awaiting-input": return "waiting-input";
    case "awaiting-review": return "waiting-review";
    case "paused": return "paused";
    case "completed": return "completed";
    case "failed": return "failed";
    case "cancelled": case "stopped": return "stopped";
    case "reconcile-required": return "needs-check";
  }
}

export function titleFrom(text: string): string {
  const line = text.split(/\r?\n/).map(part => part.trim()).find(Boolean) ?? "新工作";
  return line.length > 40 ? line.slice(0, 39) + "…" : line;
}

/** Titles of the capabilities a scope offered at its latest round start, to name them in the activity. */
export type CapabilityTitles = Map<string, { title: string; provider: string }>;

export const RELATION_WORDS: Record<AssistantWorkObject["relation"], string> = { origin: "起点", material: "材料", result: "产出", session: "专业会话" };

/**
 * After the runtime compacts a long work, earlier replies reach the model labelled “[retained assistant …]” or
 * “[historical … run:…]”, and it sometimes opens its answer with them. They are the runtime's bookkeeping, not
 * something said to the person: labels at the very start of a reply are dropped, and a reply that was only labels goes.
 */
const RUNTIME_LABELS = /^(?:[^\S\n]*\[(?:retained|historical) [^\]\n]*\][^\S\n]*\n?)+/;
export function spokenTurns<T extends { kind: string; text: string }>(turns: readonly T[]): T[] {
  return turns.flatMap(turn => {
    if (turn.kind !== "assistant" || !RUNTIME_LABELS.test(turn.text)) return [turn];
    const text = turn.text.replace(RUNTIME_LABELS, "");
    return text.trim() ? [{ ...turn, text }] : [];
  });
}

/** One round for the developer diagnostics page: its run's frozen start, what it was given, and where it stopped. */
export function roundDiagnostics(workId: string, work: StoredWork | null, round: StoredRound, view: AgentRunView | null): AssistantRoundDiagnostics {
  const frozen = view?.frozen;
  const tokens = view?.usage?.tokens;
  return {
    work_id: workId, work_title: work?.title ?? "", project_id: work?.project_ref?.project_id ?? null, session_id: work?.session_id ?? null,
    run_id: round.run_id, started_at: round.started_at, ended_at: view?.ended_at ?? null, phase: view?.phase ?? "unknown", stop_reason: view?.stop_reason ?? null,
    frozen: frozen ? { model_id: frozen.model_id, role: { id: frozen.role_id, version: frozen.role_version }, execution: frozen.execution,
      character: frozen.character ? { artifact_id: frozen.character.reference.artifact_id, version: frozen.character.reference.version, title: frozen.character.title } : null,
      prompts: frozen.prompts.map(({ prompt_id, version, layer, user_revision }) => ({ prompt_id, version, layer, ...(user_revision !== undefined ? { user_revision } : {}) })),
      ...(frozen.history ? { history: frozen.history } : {}), ...(frozen.thinking ? { thinking: frozen.thinking } : {}) } : null,
    materials: round.materials.map(material => ({ kind: material.kind, title: material.title, explicit: material.explicit, ...(material.draft ? { draft: true } : {}),
      ...(material.object ? { object: { ...material.object } } : {}),
      ...(material.capability ? { capability: { capability_id: material.capability.capability_id, version: material.capability.version, provider_id: material.capability.provider_id } } : {}),
      ...(material.method ? { method: { method_id: material.method.method_id, ...(material.method.version !== undefined ? { version: material.method.version } : {}) } } : {}) })),
    usage: tokens ? { input: tokens.input, output: tokens.output, cached_input: tokens.cached_input ?? 0 } : null,
    failures: (view?.activity ?? []).filter(item => item.state === "failed" || item.state === "unknown")
      .map(item => ({ tool: item.name, target: item.target.slice(0, 200), state: item.state as "failed" | "unknown", summary: item.summary.slice(0, 400), ...(item.output ? { detail: item.output.slice(0, 600) } : {}) })),
  };
}

/** The title a change's output gives the object it made or changed (`{ id, title }` at the top or one level down). */
export function titleIn(output: unknown, id: string): string | null {
  const named = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) && (value as { id?: unknown }).id === id
    && typeof (value as { title?: unknown }).title === "string" && (value as { title: string }).title.trim() ? (value as { title: string }).title.trim() : null;
  if (named(output)) return named(output);
  if (output && typeof output === "object") for (const value of Object.values(output as Record<string, unknown>)) { const found = named(value); if (found) return found; }
  return null;
}

export function describeObjects(objects: readonly AssistantWorkObject[]): string {
  const lines = objects.map(object => {
    const where = `${object.title}（${object.subject.kind}，标识 ${object.subject.id}）`;
    const state = object.state === "changed" ? `已被修改：这项工作记下的是版本 ${object.recorded_revision}，现在是版本 ${object.current_revision}`
      : object.state === "missing" ? "已不存在（被删除或移走）" : object.state === "unavailable" ? "暂时读不到"
      : object.state === "moved" ? `${object.moved_to ? `已被用户移到${object.moved_to.kind === "personal" ? "个人空间" : "项目"}「${object.moved_to.title}」` : "现在属于别的项目"}，这项工作读不到它的正文`
      : object.current_revision ? `未变，版本 ${object.current_revision}` : "可用";
    return `- ${RELATION_WORDS[object.relation]}：${where}——${state}`;
  });
  // What the state lines cannot say: a moved object is still there, where the person may go on or bring it back.
  const moved = objects.some(object => object.state === "moved") ? ["", "被移走的对象还在它现在的地方：用户可以到那里继续，或把它放回这个项目。"] : [];
  return [...lines, ...moved].join("\n");
}

/**
 * Why a round stopped, in the person's words. A limit is a boundary the round kept, not a crash: what it did stays,
 * and the person can let it go on.
 */
export function stopInWords(reason: string, workBudget?: number): string {
  if (/too many tool turns|AGENT_BUDGET_EXCEEDED.*turn|maxTurns|of its \d+ turns/i.test(reason)) return `到了这一轮的步数上限（${ROUND_TURNS} 步），停在这里；已完成的修改都保留。说“继续”可以接着做`;
  if (/MODEL_BUDGET_EXCEEDED|of its \d+ tokens|token/i.test(reason) && /budget|limit|exceed|of its \d+ tokens/i.test(reason)) {
    // A round whose work has a cap was given only what was left of it: this stop is that cap.
    return workBudget ? `到了这项工作的用量上限（${workBudget.toLocaleString("en-US")} tokens），停在这里；已完成的修改都保留。要继续，先在“用量”里调高这项工作的上限`
      : "到了这一轮的用量上限，停在这里；已完成的修改都保留。说“继续”可以接着做";
  }
  if (/wall.?clock|duration|timed.?out/i.test(reason)) return "到了这一轮的时间上限，停在这里；已完成的修改都保留。说“继续”可以接着做";
  // The model service could not be reached or answered with an error: say so, with what to check, keeping the code for reference.
  if (/MODEL_NETWORK_FAILED|ECONNREFUSED|ENOTFOUND|fetch failed/i.test(reason)) return `连不上模型服务，这一轮没有完成；已完成的修改都保留。请检查网络和“模型设置”里的地址，再说“继续”（${reason.slice(0, 120)}）`;
  if (/MODEL_AUTH|401|403|invalid.?api.?key|unauthori[sz]ed/i.test(reason)) return `模型服务拒绝了这次调用（凭据不对或没有权限）；请到“模型设置”检查密钥，再说“继续”（${reason.slice(0, 120)}）`;
  if (/429|rate.?limit|overloaded|529/i.test(reason)) return `模型服务现在太忙，这一轮没有完成；稍等再说“继续”（${reason.slice(0, 120)}）`;
  return reason;
}

/** Activity in the person's terms: what was looked up, read or changed — not the tool log. */
export function presentActivity(activity: readonly AgentToolActivity[], titles: CapabilityTitles | undefined, ended = false): AssistantActivity[] {
  const verbs: Record<string, string> = { "find-capabilities": "lookup", "read-capability": "read", "change-capability": "change", "change-reversible": "change", "ask-user": "ask", "update-todo": "todo",
    "suggest-action": "suggest",
    // A professional Agent's own tools, as the person reads them: on files and commands, never a business capability.
    "read": "file-read", "read-file": "file-read", "list": "file-list", "search": "file-search", "edit": "file-change", "edit-file": "file-change",
    "write": "file-change", "run-command": "command", "command-output": "command-output", "await-commands": "command-output", "find-tools": "lookup-tools",
    // Sub-tasks handed to works of their own.
    "delegate-work": "delegate", "check-delegated-work": "delegate-check", "follow-up-delegated-work": "delegate-follow-up", "stop-delegated-work": "delegate-stop",
    // The side panel's browser.
    "surface-list": "browser-list", "surface-observe": "browser-look", "surface-act": "browser-act",
    // The person's memory.
    "remember": "memory-keep", "list-memories": "memory-list", "forget-memory": "memory-forget", "suggest-memory": "memory-suggest",
    // The Host let a round that only announced its next step continue; the runtime condensed a long work's context.
    "自动续做": "auto-continue", "上下文整理": "compact",
    // It ended still only saying what it would do, after its one continuation: nothing was done.
    "只说未做": "ended-on-promise" };
  return activity.flatMap(item => {
    if (item.name === "reasoning" || item.name === "context-remaining" || item.name === "acknowledge-inputs" || item.name === "board-wait") return [];
    const verb = desktopVerb(item, verbs[item.name] ?? item.name);
    const named = titles?.get(shownActivityTarget(item.target));
    const target = (verb === "read" || verb === "change" || verb === "suggest") && named ? `${named.provider} · ${named.title}` : shownActivityTarget(item.target);
    // Sent and not finished: it may have happened, so it is neither done nor a failure to retry.
    const uncertain = item.state === "failed" && /actions\.outcome_unknown|may or may not have taken effect/.test(`${item.summary} ${item.output ?? ""}`);
    const said = `${item.summary} ${item.output ?? ""}`;
    const reason = item.state !== "failed" || uncertain ? undefined
      // The person answered “拒绝” on its confirmation.
      : /This effect is denied/.test(said) ? "declined" as const
      // Refused before anyone was asked: its input did not fit the capability (a plain failure the round can correct).
      : /blocked "change-capability"|blocked "change-reversible"|blocked "read-capability"/.test(said) ? undefined
      : /EFFECT_NOT_AUTHORIZED/.test(item.summary) ? "not-authorized" as const
      : /TOOL_INTERRUPTED|等待批准时这一轮结束/.test(`${item.summary} ${item.output ?? ""}`) ? "interrupted" as const
      // Switched off for the Assistant, uninstalled or no longer offered by the time it would run (even after approval).
      : /not offered here any more|not available here|action_revoked|已对助理关闭/.test(`${item.summary} ${item.output ?? ""}`) ? "unavailable" as const
      : /reject|declin|拒绝/i.test(item.summary) ? "declined" as const : undefined;
    // A round that is over has nothing still going on: a step it never closed is one whose outcome nobody recorded.
    const state = uncertain || (ended && item.state === "started") ? "unknown" as const : item.state;
    const { detail, failure } = failedStep(item);
    const capability = (verb === "read" || verb === "change") && item.target ? { capability_id: item.target } : {};
    const answer = verb === "ask" && item.state === "completed" ? answerOf(item.output) : "";
    return [{ call_id: item.call_id, verb, target, state, ...capability, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}), ...(failure ? { failure } : {}), ...(answer ? { answer } : {}),
      ...(item.sequence !== undefined ? { sequence: item.sequence } : {}) }];
  });
}

/** What the person answered a question with, from the runtime's receipt: what they wrote, or the options they picked. */
function answerOf(output: string | undefined): string {
  let parsed: { kind?: unknown; value?: unknown; picked?: unknown };
  try { parsed = JSON.parse(output ?? ""); } catch { return ""; }
  const text = parsed.kind === "text" && (typeof parsed.value === "string" || typeof parsed.value === "boolean") ? String(parsed.value)
    : parsed.kind === "questionnaire" && Array.isArray(parsed.picked) ? parsed.picked.map(pick => {
      const one = pick as { labels?: unknown; other?: unknown };
      return [...(Array.isArray(one.labels) ? one.labels.filter((label): label is string => typeof label === "string") : []), ...(typeof one.other === "string" && one.other ? [one.other] : [])].join("、");
    }).filter(Boolean).join("；") : "";
  return text.length <= 300 ? text : `${text.slice(0, 300)}…`;
}

export function recoveryView(report: AgentRecoveryReport): AssistantRecovery {
  return { blockers: [...report.blockers], rounds: report.runs.filter(run => !run.subagent).map(run => ({ run_id: run.run_id, version: run.version, can_close: run.can_close,
    blockers: [...run.blockers], operations: run.operations.map(operation => ({ summary: operation.summary, outcome: operation.outcome })) })) };
}
