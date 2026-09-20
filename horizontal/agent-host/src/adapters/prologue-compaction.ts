import { createPrologueError, type ContextCompactionRecord, type ContextCompactor, type Run, type Runtime, type StartRunInput } from "@prologue/sdk";

/** The model selects coordinates; only the Host copies bytes from the original. */
function parts(text: string): string[] {
  const result: string[] = [];
  let part = "", count = 0, previous = "";
  // Session replay wraps tool output in JSON. Keep escaped newlines verbatim,
  // but make their paragraphs independently selectable. Bound single-line
  // minified data too, without breaking a Unicode code point.
  for (const character of text) {
    part += character; count++;
    if (character === "\n" || previous === "\\" && character === "n" || count >= 1024) {
      result.push(part); part = ""; count = 0;
    }
    previous = character;
  }
  if (part) result.push(part);
  return result;
}

export function compactionSelection(text: string, older: readonly ContextCompactionRecord[]) {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw invalid("整理结果不是有效的选择记录"); }
  if (!value || typeof value !== "object" || !("selections" in value) || !Array.isArray(value.selections)) throw invalid("整理结果缺少原文选择");
  return { excerpts: value.selections.map((item: unknown) => {
    if (!item || typeof item !== "object") throw invalid("原文选择格式无效");
    const { record, startPart, endPart } = item as Record<string, unknown>;
    if (typeof record !== "number" || !Number.isSafeInteger(record) || record < 0 || record >= older.length
      || typeof startPart !== "number" || !Number.isSafeInteger(startPart) || startPart < 1
      || typeof endPart !== "number" || !Number.isSafeInteger(endPart) || endPart < startPart) throw invalid("原文选择范围无效");
    const original = parts(older[record]!.text);
    if (endPart > original.length) throw invalid(`原文选择超出记录范围：记录 ${record} 只有 ${original.length} 个片段，返回了 ${startPart}–${endPart}`);
    return { record, text: original.slice(startPart - 1, endPart).join("") };
  }) };
}

function invalid(message: string) { return createPrologueError("CONTEXT_COMPACTION_INVALID", message); }

/** A single tool-free SDK request, frozen to the parent model. No second loop or history store. */
export function createPrologueCompactor(input: {
  runtime: Pick<Runtime, "sessions">;
  connection: Pick<StartRunInput, "protocol" | "endpoint" | "model" | "credentialRef" | "promptCache">;
  prompt: string;
}): ContextCompactor {
  // Copy the connection now: later settings changes must not alter this Run.
  const connection = { ...input.connection }, prompt = input.prompt;
  return async request => {
    const cancelled = () => request.signal?.aborted === true;
    if (cancelled()) throw invalid("上下文整理已取消");
    const session = await input.runtime.sessions.create({ ephemeral: true });
    if (cancelled()) throw invalid("上下文整理已取消");
    let run: Run | undefined, cancelling: Promise<void> | undefined;
    const cancel = () => run ? cancelling ??= Promise.resolve().then(() => run!.cancel()) : Promise.resolve();
    const onAbort = () => { void cancel().catch(() => {}); };
    request.signal?.addEventListener("abort", onAbort);
    try {
      if (cancelled()) throw invalid("上下文整理已取消");
      run = await session.startRun({ ...connection, params: { maxOutputTokens: 4096 }, messages: [
        { role: "system", text: prompt },
        { role: "user", text: JSON.stringify({ instructions: request.instructions ?? [], retained: request.retained ?? [],
          older: request.older.map((record, index) => ({ record: index, role: record.role, source: record.source, origin: record.origin,
            partCount: parts(record.text).length, parts: parts(record.text).map((text, index) => ({ part: index + 1, text })) })) }) },
      ] });
      if (cancelled()) { await cancel(); throw invalid("上下文整理已取消"); }
      const output = await collectSelection(run, request.signal, cancel, request.reportUsage);
      if (cancelled()) throw invalid("上下文整理已取消");
      return compactionSelection(output, request.older);
    } finally { request.signal?.removeEventListener("abort", onAbort); }
  };
}

function collectSelection(run: Run, signal: AbortSignal | undefined, cancel: () => Promise<void>, reportUsage: Parameters<ContextCompactor>[0]["reportUsage"]): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = "", bytes = 0, done = false, off = () => {};
    const encoder = new TextEncoder();
    let recorded: Promise<void> = Promise.resolve();
    const finish = (error?: Error) => {
      if (done) return;
      done = true; off(); signal?.removeEventListener("abort", abort);
      void (error ? cancel().catch(() => {}) : Promise.resolve()).then(() => recorded)
        .then(() => error ? reject(error) : resolve(text), reject);
    };
    const abort = () => finish(invalid("上下文整理已取消"));
    signal?.addEventListener("abort", abort);
    off = run.subscribe(event => {
      if (done) return;
      if (signal?.aborted) { abort(); return; }
      if (event.type === "usage-recorded") {
        recorded = recorded.then(() => reportUsage?.({ callId: event.callId, receipt: event.receipt }));
        void recorded.catch(error => finish(error instanceof Error ? error : invalid("整理用量无法保存")));
      } else if (event.type === "text-delta") {
        bytes += encoder.encode(event.text).byteLength;
        if (bytes > 64 * 1024) finish(invalid("整理输出超过大小限制"));
        else text += event.text;
      } else if (event.type === "tool-call") finish(invalid("整理请求不能调用工具"));
      else if (event.type === "failed" || event.type === "cancelled") finish(invalid("整理模型调用未完成"));
      else if (event.type === "completed") finish(event.stopReason === "max-tokens" || !text.trim() ? invalid("整理模型未返回完整选择") : undefined);
    });
    // subscribe can replay an already settled SDK Run synchronously.
    if (done) off();
    else if (signal?.aborted) abort();
  });
}
