import { AGENT_PROMPT_MAX_CHARS } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import { agentDefinitionsErrors } from "./agent-definitions.js";

/**
 * Splits a prompt between user-editable guidance ("做事方法与内容偏好") and the system-owned
 * structured output/format contract (PF-A14). Editing in simplified mode always preserves the
 * program-owned output contract verbatim; advanced full-text edits are validated against required
 * output keys with targeted error feedback instead of silently breaking structured parsers.
 */
export interface PromptEditorSections {
  readonly editable: string;
  readonly locked_format: string | null;
  readonly required_keys: readonly string[];
  readonly format_intact: boolean;
}

const FORMAT_HEADING = /^#{2,3}\s*(?:输出格式|输出要求|返回格式|格式要求|Output\s+format|Response\s+format|JSON\s*格式|Format)\b/iu;
const FORMAT_LINE = /(?:只输出|仅输出|严格输出|输出一个|返回(?:一个|合法的?)?|Return\s+(?:only\s+)?(?:one\s+|a\s+)?|Output\s+(?:only\s+)?(?:one\s+|a\s+)?|Respond\s+(?:only\s+)?with\s+)[^\n]{0,60}JSON|JSON\s*(?:对象|数组|Schema|格式|object|array)|```json\b/iu;
const JSON_SCHEMA_KEY = /"([a-zA-Z_][a-zA-Z0-9_]{0,63})"\s*:/gu;

function findLockedFormatStart(defaultBody: string): number {
  const normalized = defaultBody.replace(/\r\n/gu, "\n");
  const lines = normalized.split("\n");
  let offset = 0;
  let headingStart = -1;
  for (const line of lines) {
    if (FORMAT_HEADING.test(line.trim())) headingStart = offset;
    offset += line.length + 1;
  }
  if (headingStart > 0) {
    const tail = normalized.slice(headingStart);
    if (/json|schema|字段|field|```/iu.test(tail)) return headingStart;
  }
  // Otherwise inspect trailing paragraph(s) separated by blank lines.
  const paragraphs: Array<{ start: number; text: string }> = [];
  const pattern = /[^\n][\s\S]*?(?=\n{2,}|$)/gu;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(normalized)) !== null) {
    paragraphs.push({ start: match.index, text: match[0] });
  }
  if (paragraphs.length < 2) return -1;
  let splitAt = -1;
  for (let i = paragraphs.length - 1; i >= 1; i--) {
    const para = paragraphs[i]!;
    if (FORMAT_LINE.test(para.text) || (splitAt !== -1 && /```json|^\s*\{[\s\S]*\}\s*$/u.test(para.text))) {
      splitAt = para.start;
    } else if (splitAt !== -1) {
      break;
    } else if (i < paragraphs.length - 2) {
      break;
    }
  }
  return splitAt;
}

function extractRequiredKeys(formatBlock: string): string[] {
  const keys = new Set<string>();
  for (const match of formatBlock.matchAll(JSON_SCHEMA_KEY)) {
    const key = match[1]!;
    if (key) keys.add(key);
    if (keys.size >= 24) break;
  }
  return [...keys];
}

export function splitPromptContract(defaultBody: string, currentBody: string): PromptEditorSections {
  const normDefault = defaultBody.replace(/\r\n/gu, "\n");
  const normCurrent = currentBody.replace(/\r\n/gu, "\n");
  const start = findLockedFormatStart(normDefault);
  if (start < 0) {
    return { editable: normCurrent, locked_format: null, required_keys: [], format_intact: true };
  }
  const locked = normDefault.slice(start).trim();
  const requiredKeys = extractRequiredKeys(locked);
  const trimmedCurrent = normCurrent.trimEnd();
  if (trimmedCurrent.endsWith(locked)) {
    const editable = trimmedCurrent.slice(0, trimmedCurrent.length - locked.length).trimEnd();
    return { editable, locked_format: locked, required_keys: requiredKeys, format_intact: true };
  }
  const currentStart = findLockedFormatStart(normCurrent);
  const editable = currentStart > 0 ? normCurrent.slice(0, currentStart).trimEnd() : normCurrent;
  const formatIntact = hasValidFormat(normCurrent, requiredKeys);
  return { editable, locked_format: locked, required_keys: requiredKeys, format_intact: formatIntact };
}

function hasValidFormat(body: string, requiredKeys: readonly string[]): boolean {
  if (!/json/iu.test(body)) return false;
  return requiredKeys.every(key => body.includes(`"${key}"`));
}

/** Rebuilds the full prompt from simplified user guidance while locking the system output contract. */
export function composeSimplifiedPrompt(defaultBody: string, guidance: string): string {
  const clean = guidance.replace(/\r\n/gu, "\n").trim();
  if (!clean) {
    throw agentDefinitionsErrors.invalid("做事方法与内容偏好不能为空；要回到原版请点「恢复默认」");
  }
  const { locked_format } = splitPromptContract(defaultBody, defaultBody);
  const combined = locked_format ? `${clean}\n\n${locked_format}` : clean;
  if (combined.length > AGENT_PROMPT_MAX_CHARS) {
    throw agentDefinitionsErrors.invalid(`内容偏好加上系统格式约束超过了 ${AGENT_PROMPT_MAX_CHARS} 字，请精简后再保存`);
  }
  return combined;
}

/** Validates an advanced full-text edit against the prompt's system-owned output format keys. */
export function validateFullPromptBody(defaultBody: string, nextBody: string): void {
  const { locked_format, required_keys } = splitPromptContract(defaultBody, defaultBody);
  if (!locked_format) return;
  if (!/json/iu.test(nextBody)) {
    throw agentDefinitionsErrors.invalid("高级原文缺少 JSON 输出格式要求，这会导致程序无法读取结果。请补回格式约束，或点「恢复默认」回到原版。");
  }
  const missing = required_keys.filter(key => !nextBody.includes(`"${key}"`));
  if (missing.length > 0) {
    throw agentDefinitionsErrors.invalid(`输出格式约束缺少程序需要的字段：${missing.slice(0, 6).join("、")}。请补回后再保存，或点「恢复默认」回到原版。`);
  }
}
