import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * The words the Coding timeline reads tool calls and failures with, from Coding's language files.
 */
export function codingTimelineWords(readText: (text: string, values?: Record<string, string | number>) => string) {
  /**
   * One kind of call: the verb its row starts with, what the live line says while it runs, and how a run of them is
   * counted in the summary — by distinct target (files, directories), by call, or not at all.
   */
  const kind = (key: string, icon: string, tally: "targets" | "calls" | "" = "calls") =>
    ({ key, icon, tally, get verb() { return readText(`coding.call.${key}`); }, get doing() { return readText(`coding.call.${key}.doing`); } });
  const read = kind("read", "file", "targets"), search = kind("search", "search"), list = kind("list", "folder", "targets");
  const KIND: Record<string, ReturnType<typeof kind>> = {
    read, "read-file": read,
    edit: kind("edit", "edit", "targets"),
    write: kind("write", "edit", "targets"),
    "run-command": kind("run", "terminal"),
    grep: search, search,
    glob: kind("glob", "search"),
    list, "list-directory": list,
    "ask-user": kind("ask", "question"),
    reasoning: kind("think", "sparkles", ""),
    "dispatch-subagent": kind("dispatch", "workflow"),
    "await-subagents": kind("await-subagents", "clock", ""),
    "steer-subagent": kind("steer", "workflow"),
    "board-read": kind("board-read", "list", ""),
    "board-report": kind("board-report", "list"),
    "start-command": kind("start-command", "terminal"),
    "command-output": kind("command-output", "terminal"),
    "command-stop": kind("command-stop", "terminal"),
    "await-commands": kind("await-commands", "clock", ""),
    "session-send": kind("session-send", "share"),
    // The runtime names these two activities in Chinese; the names are data, the words come from the keys.
    "上下文整理": kind("compact", "clock"),
    "工具调用纠正": kind("correct", "circle-alert"),
    "sleep-wait": kind("sleep", "clock"),
    "model-switch": kind("model-switch", "sparkles"),
  };
  /*
   * The code-intelligence tool is scoped per round (`coding.find-symbol-<scope>`, so one Runtime can hold more than one
   * pack); the timeline shows what it does, never the internal name with the scope in it.
   */
  const symbols = kind("find-symbol", "search");
  const named = (name: string): ReturnType<typeof kind> => name.startsWith("coding.find-symbol") ? symbols : other(name);
  /** A call the timeline has no words for reads as its own name. */
  const other = (name: string): ReturnType<typeof kind> =>
    ({ key: "other", icon: "activity", tally: "calls", verb: name, doing: uiText.text("coding.call.other.doing", { name }) });
  /** "读取 4 个文件" / "Files read: 4" for a run of one kind; a kind that is not counted is just its verb. */
  const tally = (entry: ReturnType<typeof kind>, count: number) => entry.tally === "" ? entry.verb
    : readText(`coding.call.${entry.key}.count`, { count, name: entry.verb });
  const failure = (key: string) => [(`coding.failure.${key}`), (`coding.failure.${key}.hint`)] as const;
  const FAILURES: Array<[RegExp, string, string]> = ([
    // The Host refused before sending (a Character disabled, a grant withdrawn): nothing reached the model.
    [/EFFECT_NOT_AUTHORIZED/, "not-authorized"],
    // The model went silent or the connection dropped mid-answer: not a settings problem, and what was done is kept.
    [/MODEL_NETWORK_FAILED.*(timeout|went quiet)/i, "quiet"],
    [/MODEL_NETWORK_FAILED.*(terminated|reset|hang up)/i, "dropped"],
    [/MODEL_NETWORK_FAILED|NETWORK_|ENOTFOUND|ECONN|ETIMEDOUT|DNS/i, "network"],
    [/TIMEOUT|超时/i, "timeout"],
    [/CREDENTIAL_/i, "credential"],
    [/MODEL_HTTP_ERROR.*(429|rate)|rate.?limit/i, "rate-limit"],
    [/MODEL_HTTP_ERROR.*\(5\d\d\)/i, "server"],
    [/MODEL_HTTP_ERROR.*\((401|403)\)/i, "denied"],
    [/MODEL_HTTP_ERROR|MODEL_NOT_FOUND|MODEL_PROTOCOL_UNSUPPORTED|MODEL_PARAM_UNSUPPORTED/i, "provider"],
    [/MODEL_CONTEXT_OVERFLOW|MODEL_REQUEST_TOO_LARGE|CONTEXT_BUDGET_EXCEEDED/i, "context"],
    [/CONTEXT_COMPACTION_INVALID/i, "compaction"],
    [/AGENT_BUDGET_EXCEEDED|MODEL_BUDGET_EXCEEDED|RESOURCE_LIMIT_EXCEEDED/i, "budget"],
    [/too many tool turns/i, "turns"],
    [/MODEL_RESPONSE_INVALID|MODEL_STRUCTURED_INVALID|MODEL_TOOL_NOT_DECLARED/i, "response"],
    [/MODEL_REFUSED/i, "refused"],
    [/MODEL_OUTPUT_TRUNCATED/i, "truncated"],
  ] as Array<[RegExp, string]>).map(([pattern, key]) => [pattern, ...failure(key)]);
  /**
   * What a runtime refusal on one tool call means, in words, above its raw output. Only codes whose meaning is fixed:
   * the raw `CODE: message` stays below for the exact path, line and kind.
   */
  const toolHint = (output: string): string => {
    const code = /^([A-Z][A-Z0-9_]+):/.exec(output)?.[1];
    return code === "WORKSPACE_SECRET_DETECTED" ? uiText.text("coding.tool-hint.secret")
      : code === "PATCH_BASE_CHANGED" || code === "WORKSPACE_NOT_OBSERVED" ? uiText.text("coding.tool-hint.stale")
      : code === "COMMAND_DENIED" ? uiText.text("coding.tool-hint.denied")
      : "";
  };
  return { KIND, FAILURES, toolHint, other, named, tally, t: readText };
}
