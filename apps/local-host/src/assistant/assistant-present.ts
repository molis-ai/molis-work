import { cutWithEllipsis, cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { AGENT_TOOLS } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRecoveryReport, AgentRunView, AgentToolActivity } from "@molis-ai/molis-work-contracts/services/agent-host";
import { format, say, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { failedStep } from "./activity-failure.js";
import type { AssistantActivity, AssistantRecovery, AssistantWorkState, AssistantWorkObject, AssistantRoundDiagnostics } from "@molis-ai/molis-work-contracts/services/assistant";
import type { StoredRound, StoredWork } from "./assistant-store.js";
import { desktopVerb, shownActivityTarget } from "./desktop-activity.js";
import { ROUND_TURNS } from "./assistant-round-start.js";
import { workTitle } from "./assistant-work-title.js";
import { baseLanguageOf, localizeWebErrorMessage } from "../ui-error-words.js";
import { hasHostUiText } from "../ui-text-provider.js";
import { activeLocale, DEFAULT_WEB_LOCALE, listJoin, pageLocale } from "../web-locale.js";

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
  return cutWithEllipsis(line, 40);
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
    work_id: workId, work_title: work ? workTitle(work) : "", project_id: work?.project_ref?.project_id ?? null, session_id: work?.session_id ?? null,
    run_id: round.run_id, started_at: round.started_at, ended_at: view?.ended_at ?? null, phase: view?.phase ?? "unknown", stop_reason: view?.stop_reason ?? null, ...(view?.stop_reason_code ? { stop_reason_code: view.stop_reason_code } : {}),
    frozen: frozen ? { model_id: frozen.model_id, role: { id: frozen.role_id, version: frozen.role_version }, execution: frozen.execution,
      character: frozen.character ? { version: frozen.character.version, title: frozen.character.title } : null,
      prompts: frozen.prompts.map(({ prompt_id, version, layer, user_revision }) => ({ prompt_id, version, layer, ...(user_revision !== undefined ? { user_revision } : {}) })),
      ...(frozen.history ? { history: frozen.history } : {}), ...(frozen.thinking ? { thinking: frozen.thinking } : {}) } : null,
    materials: round.materials.map(material => ({ kind: material.kind, title: material.title, explicit: material.explicit, ...(material.draft ? { draft: true } : {}),
      ...(material.object ? { object: { ...material.object } } : {}),
      ...(material.capability ? { capability: { capability_id: material.capability.capability_id, version: material.capability.version, provider_id: material.capability.provider_id } } : {}),
      ...(material.method ? { method: { ...material.method } } : {}) })),
    usage: tokens ? { input: tokens.input, output: tokens.output, cached_input: tokens.cached_input ?? 0 } : null,
    failures: (view?.activity ?? []).filter(item => item.state === "failed" || item.state === "unknown")
      .map(item => ({ tool: item.name, target: cutHead(item.target, 200), state: item.state as "failed" | "unknown", summary: cutHead(item.summary, 400), ...(item.output ? { detail: cutHead(item.output, 600) } : {}) })),
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

const STOP_FALLBACKS = {
  "workbench.assistant-stop.service-unavailable": {
    zh: "模型服务暂时连不上，已有内容都保留着，稍后再试一次即可。",
    en: "The model service is temporarily unavailable. Your content is safe — try again in a moment.",
    ja: "モデルサービスに一時的に接続できません。入力内容はそのまま残っていますので、少し待ってからもう一度お試しください。",
  },
  "workbench.assistant-stop.context-overflow": {
    zh: "当前内容超过了模型的上下文上限，已完成的修改都保留着。可以新开一项工作或精简材料后继续。",
    en: "This turn exceeded the model’s context limit. Completed changes are kept — start a new work or trim materials to continue.",
    ja: "内容がモデルのコンテキスト上限を超えました。完了した変更は残っていますので、新しいワークを開くか資料を絞って続行してください。",
  },
  "workbench.assistant-stop.refused": {
    zh: "模型拒绝处理这次请求，已完成的修改都保留着。可以调整表述后再继续。",
    en: "The model declined this request. Completed changes are kept — try rephrasing to continue.",
    ja: "モデルがこのリクエストを見送りました。完了した変更は残っていますので、表現を変えて続行してください。",
  },
  "workbench.assistant-stop.output-truncated": {
    zh: "回复达到了单次输出上限，已写出的内容都保留着。发送「继续」可以接着往下写。",
    en: "The reply reached the single-output limit. What was written is kept — say “Continue” to keep going.",
    ja: "1回の出力上限に達しました。書かれた内容はそのまま残っています。「続けて」と送ると続きを進められます。",
  },
  "workbench.assistant-stop.interrupted": {
    zh: "这一轮因中断结束，已核实的操作都保留着，发送新要求就可以继续。",
    en: "This turn was interrupted. Confirmed actions are kept — send a new message to continue.",
    ja: "このターンは中断されました。確認済みの操作は残っていますので、新しい指示を送ると続行できます。",
  },
  "workbench.assistant-stop.compaction-failed": {
    zh: "精简对话历史没有成功，原有记录都保留着，但当前内容已超出模型容量。发送「继续」可以再试一次。",
    en: "Couldn’t compact the conversation context. Your history is kept, but it’s too long for the model window — say “Continue” to try again.",
    ja: "会話の整理に失敗しました。元の履歴は残っていますが、モデルのウィンドウ上限を超えています。「続けて」でもう一度整理できます。",
  },
  "workbench.assistant-stop.compaction-cancelled": {
    zh: "对话历史精简已取消，原有记录都保留着。",
    en: "Context compaction was canceled. Your original history is kept.",
    ja: "会話の整理はキャンセルされました。元の履歴はそのまま残っています。",
  },
  "workbench.assistant-stop.guardrail": {
    zh: "安全检查拦下了这次执行，已完成的修改都保留着。调整内容后可以继续。",
    en: "A safety check stopped this turn. Completed changes are kept — adjust your request to continue.",
    ja: "安全チェックによりこのターンを停止しました。完了した変更は残っていますので、内容を調整して続行してください。",
  },
  "workbench.assistant-stop.guardrail-error": {
    zh: "安全检查遇到异常，为安全起见先停了下来，已完成的修改都保留着。稍后再试即可。",
    en: "A safety check ran into an issue and stopped this turn to stay safe. Completed changes are kept — try again in a moment.",
    ja: "安全チェックで問題が発生したため、安全のため停止しました。完了した変更は残っていますので、少し待ってからもう一度お試しください。",
  },
  "workbench.assistant-stop.circuit-breaker": {
    zh: "连续几次尝试没有进展，这一轮先停在这里；已完成的修改都保留着，说明怎么调整后就可以继续。",
    en: "Several attempts made no progress, so this turn paused here. Completed changes are kept — let the assistant know how to adjust and continue.",
    ja: "複数回の試行で進展がなかったため、ここでいったん停止しました。完了した変更は残っていますので、調整方法を指定して続行してください。",
  },
  "workbench.assistant-stop.cancelled": {
    zh: "这一轮已取消，已完成的修改都保留着。",
    en: "This turn was canceled. Completed changes are kept.",
    ja: "このターンはキャンセルされました。完了した変更は残っています。",
  },
  "workbench.assistant-stop.stopped": {
    zh: "这一轮已停止，已完成的修改都保留着。",
    en: "This turn stopped. Completed changes are kept.",
    ja: "このターンは停止しました。完了した変更は残っています。",
  },
  "workbench.assistant-stop.model-error": {
    zh: "模型服务这次没能正常完成，已完成的修改都保留着。稍后再试或发送「继续」即可。",
    en: "The model service couldn’t finish this turn. Completed changes are kept — try again in a moment or say “Continue”.",
    ja: "モデルサービスがこのターンを完了できませんでした。完了した変更は残っていますので、少し待ってから「続けて」でお試しください。",
  },
} as const;

type StopWordKey = keyof typeof STOP_FALLBACKS;

function readStopWord(key: StopWordKey): string {
  const locale = activeLocale() ?? pageLocale() ?? DEFAULT_WEB_LOCALE;
  const fallback = STOP_FALLBACKS[key][baseLanguageOf(locale)];
  return hasHostUiText() ? say.text({ owner: "workbench", key, fallback }, { locale }) : fallback;
}

/**
 * Why a round stopped, in the person's words. A limit is a boundary the round kept, not a crash: what it did stays,
 * and the person can let it go on. Technical codes stay in diagnostics logs and never leak into user-facing text.
 */
export function stopInWords(reason: string, workBudget?: number): string {
  const trimmed = reason.trim();
  if (/^MEMORY_SCOPE_DENIED(?:\b|:)/.test(trimmed)) return uiText.text("workbench.assistant-stop.memory-permission");
  if (/too many tool turns|AGENT_BUDGET_EXCEEDED.*turn|maxTurns|of its \d+ turns/i.test(trimmed)) return uiText.text("workbench.assistant-stop.turn-limit", { count: ROUND_TURNS });
  if (/MODEL_CONTEXT_OVERFLOW|CONTEXT_BUDGET_EXCEEDED|context.?length.?exceeded|maximum context length|prompt is too long/i.test(trimmed)) return readStopWord("workbench.assistant-stop.context-overflow");
  if (/MODEL_BUDGET_EXCEEDED|AGENT_BUDGET_EXCEEDED|of its \d+ tokens|token/i.test(trimmed) && /budget|limit|exceed|of its \d+ tokens/i.test(trimmed)) {
    // A round whose work has a cap was given only what was left of it: this stop is that cap.
    return workBudget ? uiText.text("workbench.assistant-stop.work-budget", { count: format.number(workBudget) })
      : uiText.text("workbench.assistant-stop.turn-budget");
  }
  if (/wall.?clock|duration|timed.?out|ETIMEDOUT|MODEL_TIMEOUT/i.test(trimmed)) return uiText.text("workbench.assistant-stop.time-limit");
  if (/MODEL_AUTH|invalid.?api.?key|unauthori[sz]ed/i.test(trimmed) || (/\bMODEL_HTTP_ERROR\b/u.test(trimmed) && /\b(?:401|403)\b/u.test(trimmed)) || /\b(?:401|403)\b.*(?:auth|key|forbidden|unauthori[sz]ed)/i.test(trimmed)) {
    return uiText.text("workbench.assistant-stop.auth");
  }
  if (/MODEL_RATE_LIMITED|429|529|rate.?limit|overloaded|too many requests/i.test(trimmed)) return uiText.text("workbench.assistant-stop.rate-limit");
  if (/MODEL_UNAVAILABLE|service.?unavailable|bad.?gateway/i.test(trimmed) || (/\bMODEL_HTTP_ERROR\b/u.test(trimmed) && /\b50[0234]\b/u.test(trimmed)) || /\b50[0234]\b.*(?:unavailable|bad gateway|service|server|internal)/i.test(trimmed)) {
    return readStopWord("workbench.assistant-stop.service-unavailable");
  }
  if (/MODEL_NETWORK_FAILED|ECONNREFUSED|ENOTFOUND|ECONNRESET|EHOSTUNREACH|ENETUNREACH|fetch failed/i.test(trimmed)) {
    return uiText.text("workbench.assistant-stop.network");
  }
  if (/MODEL_REFUSED|content.?filter|safety.?refus|refused by model/i.test(trimmed)) return readStopWord("workbench.assistant-stop.refused");
  if (/MODEL_OUTPUT_TRUNCATED|output.?truncated|max_tokens/i.test(trimmed)) return readStopWord("workbench.assistant-stop.output-truncated");
  if (/RUN_INTERRUPTED|本轮因中断结束/u.test(trimmed)) return readStopWord("workbench.assistant-stop.interrupted");
  if (/CONTEXT_COMPACTION|上下文整理失败/u.test(trimmed)) return readStopWord("workbench.assistant-stop.compaction-failed");
  if (/compaction-cancelled|上下文整理已取消/u.test(trimmed)) return readStopWord("workbench.assistant-stop.compaction-cancelled");
  if (/护栏.*自身出错|guardrail.*(?:error|failed)/iu.test(trimmed)) return readStopWord("workbench.assistant-stop.guardrail-error");
  if (/被护栏.*拦下|\bguardrail\b/iu.test(trimmed)) return readStopWord("workbench.assistant-stop.guardrail");
  if (/circuit.?tripped|连续.*次调用都没有成功|同一个调用连续重复了|同样的话连续重复了/iu.test(trimmed)) return readStopWord("workbench.assistant-stop.circuit-breaker");
  if (/^(?:已取消|cancelled|canceled)$/iu.test(trimmed)) return readStopWord("workbench.assistant-stop.cancelled");
  if (/^(?:已停止|stopped)$/iu.test(trimmed)) return readStopWord("workbench.assistant-stop.stopped");
  if (/\b(?:MODEL|AGENT|CONTEXT|RUN|TOOL|EFFECT|RUNTIME)_[A-Z0-9_]+\b/u.test(trimmed) || /运行时报告失败/u.test(trimmed)) {
    return readStopWord("workbench.assistant-stop.model-error");
  }
  return localizeWebErrorMessage(trimmed, "common.error.internal");
}

/** A returned Memory tool can mean a pending candidate or no change; only its bounded receipt says which. */
function memoryActivityResult(item: AgentToolActivity): Partial<Pick<AssistantActivity, "verb" | "target" | "state" | "detail">> {
  if (item.state !== "completed" || !["remember", "suggest-memory", "forget-memory"].includes(item.name)) return {};
  if (!item.output || item.output_truncated || item.output.length > 16_384) return { state: "unknown" };
  let result: unknown;
  try { result = JSON.parse(item.output); } catch { return { state: "unknown" }; }
  if (!result || typeof result !== "object" || Array.isArray(result)) return { state: "unknown" };
  if (item.name === "forget-memory") {
    if ("forgotten" in result && result.forgotten === true) return {};
    if ("forgotten" in result && result.forgotten === false) return { state: "failed", detail: "这条记忆当前不可用或已不存在，没有停用。" };
    return { state: "unknown" };
  }
  const candidate = "candidate_id" in result && typeof result.candidate_id === "string" && result.candidate_id.length > 0;
  if (item.name === "suggest-memory") return candidate ? { verb: "memory-suggest", target: "" } : { state: "unknown" };
  if (!("scope" in result) || typeof result.scope !== "string" || !["personal", "project", "character"].includes(result.scope)
    || !("applies" in result) || typeof result.applies !== "string" || !("memory_id" in result)) return { state: "unknown" };
  if (result.memory_id === "" && candidate) return { verb: "memory-suggest", target: "" };
  return typeof result.memory_id === "string" && result.memory_id.length > 0 && !candidate ? {} : { state: "unknown" };
}
/**
 * The Agent tools' activity as the person reads it, keyed by a tool's name in the Agent Host's tool set or the runtime's own name for it
 * (`AGENT_TOOLS`; the side panel's browser tools are the runtime's, offered by the surface). Presenting stays here; the names are the set's.
 */
const ACTIVITY_WORDS: Readonly<Record<string, string>> = { "find-capabilities": "lookup", "read-capability": "read", "change-capability": "change", "change-reversible": "change", "ask-user": "ask", "update-todo": "todo",
  "suggest-action": "suggest",
  // A professional Agent's own tools, as the person reads them: on files and commands, never a business capability.
  "read": "file-read", "read-file": "file-read", "list": "file-list", "search": "file-search", "edit": "file-change", "edit-file": "file-change",
  "write": "file-change", "run-command": "command", "command-output": "command-output", "await-commands": "command-output", "find-tools": "lookup-tools",
  // Sub-tasks handed to works of their own.
  "delegate-work": "delegate", "check-delegated-work": "delegate-check", "follow-up-delegated-work": "delegate-follow-up", "stop-delegated-work": "delegate-stop", "report-delivery": "deliver",
  // The person's memory.
  "remember": "memory-keep", "list-memories": "memory-list", "forget-memory": "memory-forget", "suggest-memory": "memory-suggest",
};
/**
 * The side panel's browser tools: runtime tools the surface offers, not in a role's `host_tools`, so not in the Agent tool set.
 * They are presentation-only here (the runtime names its own calls with them).
 */
const SURFACE_ACTIVITY_WORDS: Readonly<Record<string, string>> = { "surface-list": "browser-list", "surface-observe": "browser-look", "surface-act": "browser-act" };
/**
 * Activity verbs by tool name: the names come from the Agent Host's one tool set (`AGENT_TOOLS`), so a name the Host no longer has
 * never gets a word here, and the runtime's own name for a tool starts from the set's name for it. A tool the set has but nobody wrote
 * a word for falls back to its name; adding one is a display decision, not a second list of tools.
 */
export const TOOL_ACTIVITY_VERBS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(AGENT_TOOLS.flatMap((entry): Array<[string, string]> => {
    const word = ACTIVITY_WORDS[entry.name] ?? (entry.runtime_name ? ACTIVITY_WORDS[entry.runtime_name] : undefined);
    if (!word) return [];
    return entry.runtime_name && entry.runtime_name !== entry.name ? [[entry.name, word], [entry.runtime_name, word]] : [[entry.name, word]];
  })),
  ...SURFACE_ACTIVITY_WORDS,
};
/** What the Host itself did to a round, shown as activity. */
const HOST_ACTIVITY_VERBS: Readonly<Record<string, string>> = {
  // The Host let a round that only announced its next step continue; the runtime condensed a long work's context.
  "自动续做": "auto-continue", "上下文整理": "compact",
  // It ended still only saying what it would do, after its one continuation: nothing was done.
  "只说未做": "ended-on-promise",
};
const ACTIVITY_VERBS: Readonly<Record<string, string>> = { ...TOOL_ACTIVITY_VERBS, ...HOST_ACTIVITY_VERBS };

/** Activity in the person's terms: what was looked up, read or changed — not the tool log. */
export function presentActivity(activity: readonly AgentToolActivity[], titles: CapabilityTitles | undefined, ended = false): AssistantActivity[] {
  return activity.flatMap(item => {
    if (item.name === "reasoning" || item.name === "context-remaining" || item.name === "acknowledge-inputs" || item.name === "board-wait") return [];
    // Sub-task traffic and task-board steps are not the assistant's own steps: the panel gets their words with the
    // subagent / board surface (43-1), not as raw tool names.
    if (item.name === "dispatch-subagent" || item.name === "await-subagents" || item.name === "steer-subagent"
      || item.name === "board-read" || item.name === "board-report") return [];
    const verb = desktopVerb(item, ACTIVITY_VERBS[item.name] ?? item.name);
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
      ...memoryActivityResult(item),
      ...(item.sequence !== undefined ? { sequence: item.sequence } : {}) }];
  });
}

/** What the person answered a question with, from the runtime's receipt: what they wrote, or the options they picked. */
function answerOf(output: string | undefined): string {
  let parsed: { kind?: unknown; value?: unknown; picked?: unknown };
  try { parsed = JSON.parse(output ?? ""); } catch { return ""; }
  const locale = activeLocale() ?? pageLocale() ?? DEFAULT_WEB_LOCALE;
  const semicolon = hasHostUiText() ? say.text({ owner: "workbench", key: "common.punctuation.semicolon", fallback: "; " }, { locale }) : (baseLanguageOf(locale) === "zh" ? "；" : "; ");
  const text = parsed.kind === "text" && (typeof parsed.value === "string" || typeof parsed.value === "boolean") ? String(parsed.value)
    : parsed.kind === "questionnaire" && Array.isArray(parsed.picked) ? parsed.picked.map(pick => {
      const one = pick as { labels?: unknown; other?: unknown };
      return listJoin([...(Array.isArray(one.labels) ? one.labels.filter((label): label is string => typeof label === "string") : []), ...(typeof one.other === "string" && one.other ? [one.other] : [])]);
    }).filter(Boolean).join(semicolon) : "";
  return cutWithEllipsis(text, 300, { prefixLength: 300 });
}

export function recoveryView(report: AgentRecoveryReport): AssistantRecovery {
  return { blockers: [...report.blockers], rounds: report.runs.filter(run => !run.subagent).map(run => ({ run_id: run.run_id, version: run.version, can_close: run.can_close,
    blockers: [...run.blockers], operations: run.operations.map(operation => ({ summary: operation.summary, outcome: operation.outcome })) })) };
}
