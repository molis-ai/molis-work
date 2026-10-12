/**
 * The words the Coding timeline reads tool calls and failures with. Like `createCodingTimeline`, it is injected into the
 * browser with `toString()` and must stay self-contained; the client hands its result to the timeline factory. Its notes
 * live here, outside the function, because everything inside it ships to every page.
 *
 * - `FAILURES`: a round's failure in the user's words. `EFFECT_NOT_AUTHORIZED` is the Host refusing before sending (a
 *   Character disabled, a grant withdrawn): nothing reached the model. A model that went silent or a connection that
 *   dropped mid-answer is not a settings problem, and what was done is kept.
 * - `toolHint`: what a runtime refusal on one tool call means, in words, above its raw output. Only codes whose meaning is
 *   fixed; the raw `CODE: message` stays below for the exact path, line and kind.
 */
export function codingTimelineWords() {
  const TABLE: Record<string, [verb: string, icon: string, noun: string, unit: string]> = {
    read: ["读取","file","文件","个"],
    "read-file": ["读取","file","文件","个"],
    edit: ["修改","edit","文件","个"],
    write: ["写入","edit","文件","个"],
    "run-command": ["运行","terminal","命令","条"],
    grep: ["搜索","search","内容","次"],
    search: ["搜索","search","内容","次"],
    glob: ["查找","search","文件","次"],
    list: ["查看目录","folder","目录","个"],
    "list-directory": ["查看目录","folder","目录","个"],
    "ask-user": ["提问","question","问题","个"],
    reasoning: ["思考","sparkles","",""],
    "dispatch-subagent": ["派出子任务","workflow","子任务","个"],
    "await-subagents": ["等待子任务","clock","",""],
    "steer-subagent": ["补充子任务要求","workflow","次",""],
    "board-read": ["查看任务图","list","",""],
    "board-report": ["回报步骤","list","步骤","次"],
    "start-command": ["后台运行","terminal","命令","条"],
    "command-output": ["查看后台输出","terminal","次",""],
    "command-stop": ["停止后台命令","terminal","条",""],
    "await-commands": ["等待后台命令","clock","",""],
    "session-send": ["给其他会话发信","share","封",""],
    "上下文整理": ["整理上下文","clock","","次"],
    "工具调用纠正": ["纠正工具调用","circle-alert","","次"],
    "sleep-wait": ["等一会儿","clock","","次"],
    "model-switch": ["换模型","sparkles","","次"],
  };
  const KIND: Record<string, { verb: string; icon: string; noun: string; unit: string }> = {};
  for (const name in TABLE) { const [verb, icon, noun, unit] = TABLE[name]!; KIND[name] = { verb, icon, noun, unit }; }
  const FAILURES: Array<[RegExp, string, string]> = [
    [/EFFECT_NOT_AUTHORIZED/, "这一轮的授权已失效", "角色被停用或授权被收回，这一轮在发给模型前就停下了，没有发出任何内容。确认设置后再从断点继续。"],
    [/MODEL_NETWORK_FAILED.*(timeout|went quiet)/i, "模型服务长时间没有回应", "可能是网络不稳或服务繁忙；已完成的操作都保留着，从断点继续即可。反复出现时把任务拆小一些。"],
    [/MODEL_NETWORK_FAILED.*(terminated|reset|hang up)/i, "和模型服务的连接中断了", "已完成的操作都保留着；网络恢复后从断点继续即可。"],
    [/MODEL_NETWORK_FAILED|NETWORK_|ENOTFOUND|ECONN|ETIMEDOUT|DNS/i, "连不上模型服务", "检查网络或代理后，从断点继续即可。"],
    [/TIMEOUT|超时/i, "请求超时", "稍后从断点继续；若反复超时，把任务拆小一些。"],
    [/CREDENTIAL_/i, "模型凭据不可用或已过期", "到模型设置里重新检查凭据，再从断点继续。"],
    [/MODEL_HTTP_ERROR.*(429|rate)|rate.?limit/i, "模型服务限流", "等一会儿再从断点继续。"],
    [/MODEL_HTTP_ERROR.*\(5\d\d\)/i, "模型服务暂时出错", "这是服务方的问题，不是你的设置；已完成的操作都保留着，稍后从断点继续即可。"],
    [/MODEL_HTTP_ERROR.*\((401|403)\)/i, "模型服务拒绝了凭据", "到模型设置里检查密钥和账号权限，再从断点继续。"],
    [/MODEL_HTTP_ERROR|MODEL_NOT_FOUND|MODEL_PROTOCOL_UNSUPPORTED|MODEL_PARAM_UNSUPPORTED/i, "模型服务返回错误", "检查模型设置（地址、型号、协议）后再继续。"],
    [/MODEL_CONTEXT_OVERFLOW|MODEL_REQUEST_TOO_LARGE|CONTEXT_BUDGET_EXCEEDED/i, "上下文超出模型上限", "从断点继续时会带上整理后的事实；也可以把任务拆小。"],
    [/CONTEXT_COMPACTION_INVALID/i, "上下文整理失败", "已完成的操作都保留着；从断点继续时改用前面对话的摘要，不再整理原文。"],
    [/AGENT_BUDGET_EXCEEDED|MODEL_BUDGET_EXCEEDED|RESOURCE_LIMIT_EXCEEDED/i, "达到这一轮的执行上限", "确认进度后从断点继续，会开启新的一轮额度。"],
    [/too many tool turns/i, "用完了可用的执行轮次", "已完成的修改都保留着；重试时可以给更多轮次，或把任务拆小。"],
    [/MODEL_RESPONSE_INVALID|MODEL_STRUCTURED_INVALID|MODEL_TOOL_NOT_DECLARED/i, "模型的回复格式不对", "通常是偶发的，从断点继续即可。"],
    [/MODEL_REFUSED/i, "模型拒绝了这个请求", "换个说法或补充背景后再发。"],
    [/MODEL_OUTPUT_TRUNCATED/i, "回答一直写不完", "已写出的部分和已完成的操作都保留着；从断点继续时让它分几次写，或把任务拆小。"],
  ];
  const toolHint = (output: string): string => {
    const code = /^([A-Z][A-Z0-9_]+):/.exec(output)?.[1];
    return code === "WORKSPACE_SECRET_DETECTED" ? "新写的内容里有像密钥的一段，没有写入，也没有生成待审修改。密钥不要放进项目文件：放在密钥库或环境变量里，让它改用引用。"
      : code === "PATCH_BASE_CHANGED" || code === "WORKSPACE_NOT_OBSERVED" ? "文件在它读过之后又被改过，这次修改没有覆盖上去；它需要重新读取文件再改。"
      : code === "COMMAND_DENIED" ? "这条命令没有运行：它的写法或点名要的额外访问不合规则。"
      : "";
  };
  return { KIND, FAILURES, toolHint };
}
