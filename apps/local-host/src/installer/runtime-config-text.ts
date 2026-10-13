import { createHash } from "node:crypto";
import { RuntimeIntegrationError } from "./runtime-integration-contract.js";

function invalidToml(): never {
  throw new RuntimeIntegrationError("installer.config_invalid", "TOML 配置包含无效或有歧义的 Molis Work 表，原文件未修改");
}

/** TOML keys are semantic segments: quoted dots are part of a key, whitespace around actual dots is not. */
function tomlKeyPath(source: string): string[] {
  const key = /[A-Za-z0-9_-]+|"(?:[^"\\\x00-\x08\x0a-\x1f\x7f]|\\(?:["\\btnfr]|u[\da-fA-F]{4}|U[\da-fA-F]{8}))*"|'[^'\x00-\x08\x0a-\x1f\x7f]*'/y;
  const parts: string[] = [];
  let at = 0;
  for (;;) {
    while (/[ \t]/.test(source[at] ?? "")) at++;
    key.lastIndex = at;
    const token = key.exec(source)?.[0];
    if (token === undefined) invalidToml();
    if (token[0] === '"') {
      const decoded = token.replace(/\\(u[\da-fA-F]{4}|U[\da-fA-F]{8}|.)/g, (escape: string, value: string) => {
        if (!/^[uU]/.test(value)) return escape;
        const point = parseInt(value.slice(1), 16);
        if (point > 0x10ffff || point >= 0xd800 && point <= 0xdfff) invalidToml();
        return JSON.stringify(String.fromCodePoint(point)).slice(1, -1);
      });
      parts.push(JSON.parse(decoded.replace(/\t/g, "\\t")) as string);
    } else parts.push(token[0] === "'" ? token.slice(1, -1) : token);
    at += token.length;
    while (/[ \t]/.test(source[at] ?? "")) at++;
    if (at === source.length) return parts;
    if (source[at++] !== ".") invalidToml();
  }
}

function keyBoundary(line: string, wanted: string, from = 0): number {
  let quote = "";
  for (let at = from; at < line.length; at++) {
    const char = line[at]!;
    if (quote) { if (quote === '"' && char === "\\") at++; else if (char === quote) quote = ""; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === wanted) return at;
    else if (char === "#") break;
  }
  return -1;
}

/** Scan table boundaries only, preserving value bytes. A header printed inside a string or array is not a table. */
function tomlHeaders(contents: string, family: readonly string[]) {
  const headers: Array<{ start: number; path: string[]; array: boolean }> = [];
  const belongs = (keys: readonly string[]) => family.every((part, at) => keys[at] === part);
  let quote = "", depth = 0, offset = 0, table: string[] = [];
  for (const line of contents.split(/(?<=\n)/)) {
    if (!quote && !depth && /^[ \t]*\[/.test(line)) {
      const opening = line.indexOf("["), array = line[opening + 1] === "[", from = opening + (array ? 2 : 1);
      const end = keyBoundary(line, "]", from), after = end + (array ? 2 : 1);
      if (end < 0 || array && line[end + 1] !== "]" || !/^[ \t]*(?:#.*)?\r?\n?$/.test(line.slice(after))) invalidToml();
      table = tomlKeyPath(line.slice(from, end));
      headers.push({ start: offset, path: table, array });
      offset += line.length; continue;
    }
    if (!quote && !depth) {
      const end = keyBoundary(line, "=");
      const keys = end < 0 ? [] : [...table, ...tomlKeyPath(line.slice(0, end))];
      if (end >= 0 && (belongs(keys) || keys.every((part, at) => family[at] === part)) && !belongs(table)) {
        // An inline/dotted definition cannot safely be rewritten as our separate table family.
        throw new RuntimeIntegrationError("installer.config_invalid", "Molis Work MCP 已以点分或内联键定义，本次不追加重复表；原文件未修改");
      }
    }
    for (let at = 0; at < line.length; at++) {
      const char = line[at]!;
      if (quote) {
        if (quote[0] === '"' && char === "\\") { at++; continue; }
        if (line.startsWith(quote, at)) {
          if (quote.length === 3) while (line[at + quote.length] === char) at++;
          at += quote.length - 1; quote = "";
        }
      } else if (char === "#") break;
      else if (char === '"' || char === "'") { quote = line.startsWith(char.repeat(3), at) ? char.repeat(3) : char; at += quote.length - 1; }
      else if (char === "[" || char === "{") depth++;
      else if (char === "]" || char === "}") { if (--depth < 0) invalidToml(); }
    }
    if (quote.length === 1) invalidToml();
    offset += line.length;
  }
  if (quote || depth) invalidToml();
  return headers;
}

export function extractTomlFamily(contents: string, familyName: string): { text: string; ranges: Array<[number, number]> } | null {
  const family = tomlKeyPath(familyName), matches = tomlHeaders(contents, family);
  const ranges: Array<[number, number]> = [];
  const seen = new Set<string>();
  for (let index = 0; index < matches.length; index += 1) {
    const entry = matches[index]!;
    if (!family.every((part, at) => entry.path[at] === part)) continue;
    const name = JSON.stringify(entry.path);
    if (entry.array || seen.has(name)) invalidToml();
    seen.add(name);
    ranges.push([entry.start, matches[index + 1]?.start ?? contents.length]);
  }
  if (ranges.length === 0) return null;
  return { text: ranges.map(([start, end]) => contents.slice(start, end)).join("\n"), ranges };
}

export function replaceTomlFamily(contents: string, familyName: string, replacement: string | null): string {
  const family = extractTomlFamily(contents, familyName);
  let next = contents;
  let insertionIndex = contents.length;
  if (family) {
    insertionIndex = family.ranges[0][0];
    for (const [start, end] of [...family.ranges].reverse()) next = next.slice(0, start) + next.slice(end);
  }
  if (replacement == null) return next;
  const before = next.slice(0, insertionIndex), after = next.slice(insertionIndex);
  return `${before}${before && !before.endsWith("\n") ? "\n" : ""}${replacement.trim()}\n${after}`;
}

export function replaceTopLevelJsonProperty(
  original: string | null,
  root: Record<string, unknown>,
  key: string,
  value: unknown,
): string {
  if (original == null) return `${JSON.stringify({ ...root, [key]: value }, null, 2)}\n`;
  const span = findTopLevelJsonValueSpan(original, key);
  if (span) return original.slice(0, span[0]) + JSON.stringify(value) + original.slice(span[1]);
  return `${JSON.stringify({ ...root, [key]: value }, null, detectJsonIndent(original))}${original.endsWith("\n") ? "\n" : ""}`;
}

export function findTopLevelJsonValueSpan(contents: string, requestedKey: string): [number, number] | null {
  let index = skipWhitespace(contents, 0);
  if (contents[index] !== "{") return null;
  index += 1;
  while (index < contents.length) {
    index = skipWhitespace(contents, index);
    if (contents[index] === "}") return null;
    if (contents[index] !== '"') return null;
    const keyEnd = scanJsonString(contents, index);
    const key = JSON.parse(contents.slice(index, keyEnd)) as string;
    index = skipWhitespace(contents, keyEnd);
    if (contents[index] !== ":") return null;
    const valueStart = skipWhitespace(contents, index + 1);
    const valueEnd = scanJsonValue(contents, valueStart);
    if (key === requestedKey) return [valueStart, valueEnd];
    index = skipWhitespace(contents, valueEnd);
    if (contents[index] === ",") {
      index += 1;
      continue;
    }
    if (contents[index] === "}") return null;
    return null;
  }
  return null;
}

export function scanJsonString(contents: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < contents.length; index += 1) {
    const character = contents[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') return index + 1;
  }
  throw new RuntimeIntegrationError("installer.config_invalid", "JSON 字符串没有结束");
}

export function scanJsonValue(contents: string, start: number): number {
  const first = contents[start];
  if (first === '"') return scanJsonString(contents, start);
  if (first === "{" || first === "[") {
    const stack = [first];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < contents.length; index += 1) {
      const character = contents[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{" || character === "[") stack.push(character);
      else if (character === "}" || character === "]") {
        stack.pop();
        if (stack.length === 0) return index + 1;
      }
    }
    throw new RuntimeIntegrationError("installer.config_invalid", "JSON 值没有结束");
  }
  let index = start;
  while (index < contents.length && !/[\s,}]/.test(contents[index])) index += 1;
  return index;
}

export function parseJsonObject(contents: string, label: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(contents) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed as Record<string, unknown>;
  } catch {
    throw new RuntimeIntegrationError("installer.config_invalid", `${label}不是有效 JSON，不会修改`);
  }
}

export function parseJsoncObject(contents: string, label: string): Record<string, unknown> {
  try {
    return parseJsonObject(contents, label);
  } catch (error) {
    if (!(error instanceof RuntimeIntegrationError)) throw error;
    return parseJsonObject(stripJsonc(contents), label);
  }
}

export function stripJsonc(contents: string): string {
  let result = "";
  let index = 0;
  let inString = false;
  let escaped = false;
  while (index < contents.length) {
    const character = contents[index];
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      index += 1;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      index += 1;
      continue;
    }
    if (character === "/" && contents[index + 1] === "/") {
      index += 2;
      while (index < contents.length && contents[index] !== "\n") index += 1;
      continue;
    }
    if (character === "/" && contents[index + 1] === "*") {
      index += 2;
      while (index < contents.length && !(contents[index] === "*" && contents[index + 1] === "/")) index += 1;
      index = Math.min(index + 2, contents.length);
      continue;
    }
    result += character;
    index += 1;
  }
  return result;
}

export function objectOrEmpty(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function detectJsonIndent(contents: string): number {
  const match = contents.match(/\n( +)"/);
  return match ? Math.min(match[1].length, 8) : 2;
}

export function skipWhitespace(contents: string, start: number): number {
  let index = start;
  while (index < contents.length && /\s/.test(contents[index])) index += 1;
  return index;
}

export function tomlString(value: string): string {
  return JSON.stringify(value);
}

export function normalizeBlock(value: string): string {
  return value.trim().replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

export function normalizeTrailingNewline(value: string): string {
  const trimmed = value.replace(/[ \t]+$/gm, "").replace(/\s+$/, "");
  return trimmed ? `${trimmed}\n` : "";
}

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

