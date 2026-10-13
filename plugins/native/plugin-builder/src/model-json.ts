/** Reading a model's JSON answer: fences and reasoning blocks are dropped, a misordered close is repaired once. */
/** Closes what JSON text left open or closed out of order; text inside strings is never touched. */
export function balanceBrackets(source: string): string {
  const stack: string[] = [], out: string[] = []; let inString = false, escaped = false;
  for (const char of source) {
    if (inString) { out.push(char); if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') inString = false; continue; }
    if (char === '"') { inString = true; out.push(char); continue; }
    if (char === "{" || char === "[") { stack.push(char); out.push(char); continue; }
    if (char === "}" || char === "]") {
      const opener = char === "}" ? "{" : "[";
      if (!stack.includes(opener)) continue;
      while (stack.at(-1) !== opener) out.push(stack.pop() === "{" ? "}" : "]");
      stack.pop(); out.push(char); continue;
    }
    out.push(char);
  }
  while (stack.length) out.push(stack.pop() === "{" ? "}" : "]");
  return out.join("");
}
/**
 * A root object closed one brace too early, then went on with more keys (`{"design":{…}}},"rework":[…]}`): the brace
 * that closed the root goes, so the trailing keys join it. Anything else is left as it was.
 */
export function reopenRoot(source: string): string {
  let depth = 0, inString = false, escaped = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (inString) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') inString = false; continue; }
    if (char === '"') { inString = true; continue; }
    if (char === "{" || char === "[") depth++;
    else if ((char === "}" || char === "]") && --depth === 0) {
      const rest = source.slice(index + 1).trim();
      return char === "}" && rest.startsWith(",") && rest.endsWith("}") ? source.slice(0, index) + source.slice(index + 1) : source;
    }
  }
  return source;
}
export function parseModelJson(input: string): unknown {
  if (typeof input !== "string") throw new Error("模型输出必须是 JSON 文本");
  // Some providers emit their reasoning as <think>…</think> ahead of the answer; it is never part of the answer.
  const trimmed = input.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  const source = fenced ? fenced[1]! : trimmed;
  try { return JSON.parse(source) as unknown; }
  catch (error) {
    // A long answer that ended but closed its brackets out of order (…]}]}} for …]}]}]}) is repaired once; one that
    // was cut off is not guessed at. The result still goes through the full design checks.
    if (/[}\]]\s*$/.test(source)) try { return JSON.parse(balanceBrackets(source)) as unknown; } catch { /* report the original error */ }
    if (/}\s*$/.test(source)) try { return JSON.parse(reopenRoot(source)) as unknown; } catch { /* report the original error */ }
    // Say where the syntax broke, so both the person and a repair round can see the actual problem.
    const position = Number(/position (\d+)/.exec(error instanceof Error ? error.message : "")?.[1]);
    const near = Number.isFinite(position) ? `，第 ${position} 个字符附近：${source.slice(Math.max(0, position - 40), position + 40)}` : "";
    throw new Error(`模型输出不是完整 JSON${near}；请重试此阶段`);
  }
}
