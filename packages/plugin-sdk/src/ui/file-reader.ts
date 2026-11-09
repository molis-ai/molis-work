import { UI_FILE_LIMITS, type UiFileProblem, type UiFileResult } from "@molis-ai/molis-work-contracts/platform/ui";
import { isRecord } from "../json-value.js";

// Reading a file of ours (specs/font-and-skin-system/a-section-contract.md §3.1). Not published. The scan comes before `JSON.parse`, which would let the
// last of two equal names silently win, and it is a full grammar so that a problem has the same line and column in every runtime.

const DANGEROUS_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const PLAIN_NAME = /^[A-Za-z_][\w-]*$/u;
const FIX_SYNTAX = "按 JSON 语法改：属性名和字符串用双引号，结尾不留逗号，不写注释";

export const childPath = (path: string, name: string): string => (PLAIN_NAME.test(name) ? `${path}.${name}` : `${path}[${JSON.stringify(name)}]`);

interface ScanProblem { readonly path: string; readonly code: string; readonly reason: string; readonly fix: string; readonly offset: number }

interface JsonScan { readonly problems: readonly ScanProblem[]; readonly positions: ReadonlyMap<string, number> }

function scanJson(source: string, maxDepth: number): JsonScan {
  const problems: ScanProblem[] = [];
  const positions = new Map<string, number>([["$", 0]]);
  let at = 0;
  const skipSpace = () => {
    while (source[at] === " " || source[at] === "\n" || source[at] === "\r" || source[at] === "\t") at += 1;
  };
  const syntax = (path: string): false => {
    problems.push({ path, code: "ui.json_syntax", reason: at >= source.length ? "文件在这里提前结束了" : `这里不该出现 ${JSON.stringify(source.slice(at, at + 8))}`, fix: FIX_SYNTAX, offset: at });
    return false;
  };
  /** Moves past one string and gives its token, or null when it is malformed. */
  const stringToken = (): string | null => {
    const start = at;
    at += 1;
    while (at < source.length && source[at] !== '"') {
      const code = source.charCodeAt(at);
      if (code < 0x20) return null;
      if (source[at] !== "\\") {
        at += 1;
      } else if (source[at + 1] === "u") {
        if (!/^[0-9a-fA-F]{4}$/u.test(source.slice(at + 2, at + 6))) return null;
        at += 6;
      } else {
        if (!'"\\/bfnrt'.includes(source[at + 1] ?? " ")) return null;
        at += 2;
      }
    }
    if (source[at] !== '"') return null;
    at += 1;
    return source.slice(start, at);
  };
  const objectBody = (path: string, depth: number): boolean => {
    at += 1;
    skipSpace();
    if (source[at] === "}") {
      at += 1;
      return true;
    }
    const seen = new Set<string>();
    for (;;) {
      skipSpace();
      const start = at;
      const token = source[at] === '"' ? stringToken() : null;
      if (token === null) return syntax(path);
      // Decoded, so `"__proto__"` is the name it means.
      const name = JSON.parse(token) as string;
      const child = childPath(path, name);
      if (DANGEROUS_NAMES.has(name)) problems.push({ path: child, code: "ui.json_dangerous_name", reason: `属性名 ${name} 不允许出现`, fix: "删掉这个属性", offset: start });
      else if (seen.has(name)) problems.push({ path: child, code: "ui.json_repeated_name", reason: `属性名 ${name} 重复：普通解析器会让后一个悄悄盖掉前一个`, fix: "只留一个，删掉其余的", offset: start });
      seen.add(name);
      positions.set(child, start);
      skipSpace();
      if (source[at] !== ":") return syntax(child);
      at += 1;
      if (!value(child, depth)) return false;
      skipSpace();
      if (source[at] === "}") {
        at += 1;
        return true;
      }
      if (source[at] !== ",") return syntax(path);
      at += 1;
    }
  };
  const arrayBody = (path: string, depth: number): boolean => {
    at += 1;
    skipSpace();
    if (source[at] === "]") {
      at += 1;
      return true;
    }
    for (let index = 0; ; index += 1) {
      const child = `${path}[${index}]`;
      skipSpace();
      positions.set(child, at);
      if (!value(child, depth)) return false;
      skipSpace();
      if (source[at] === "]") {
        at += 1;
        return true;
      }
      if (source[at] !== ",") return syntax(path);
      at += 1;
    }
  };
  const value = (path: string, depth: number): boolean => {
    skipSpace();
    const first = source[at];
    if (first === "{" || first === "[") {
      if (depth >= maxDepth) {
        problems.push({ path, code: "ui.json_too_deep", reason: `嵌套超过 ${maxDepth} 层`, fix: "减少嵌套，这些文件用不到这么深", offset: at });
        return false;
      }
      return first === "{" ? objectBody(path, depth + 1) : arrayBody(path, depth + 1);
    }
    if (first === '"') return stringToken() === null ? syntax(path) : true;
    const literal = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/uy;
    literal.lastIndex = at;
    if (!literal.test(source)) return syntax(path);
    at = literal.lastIndex;
    return true;
  };
  if (value("$", 0)) {
    skipSpace();
    if (at < source.length) syntax("$");
  }
  return { problems, positions };
}

export interface ProblemSink {
  readonly problems: UiFileProblem[];
  add(path: string, code: string, reason: string, fix: string): void;
}

function createSink(file: string, source: string, positions: ReadonlyMap<string, number>): ProblemSink & { addAt(path: string, code: string, reason: string, fix: string, offset: number): void } {
  const problems: UiFileProblem[] = [];
  let lineStarts: number[] | null = null;
  const place = (offset: number): { line: number; column: number } => {
    if (lineStarts === null) {
      lineStarts = [0];
      for (let index = source.indexOf("\n"); index !== -1; index = source.indexOf("\n", index + 1)) lineStarts.push(index + 1);
    }
    let [low, high] = [0, lineStarts.length - 1];
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (lineStarts[middle]! <= offset) low = middle;
      else high = middle - 1;
    }
    return { line: low + 1, column: offset - lineStarts[low]! + 1 };
  };
  const addAt = (path: string, code: string, reason: string, fix: string, offset: number | undefined) => {
    problems.push({ file, path, code, reason, fix, ...(offset === undefined ? {} : place(offset)) });
  };
  return { problems, addAt, add: (path, code, reason, fix) => addAt(path, code, reason, fix, positions.get(path)) };
}

export type StrictRead = { readonly ok: false; readonly problems: readonly UiFileProblem[] } | { readonly ok: true; readonly value: unknown; readonly sink: ProblemSink };

/** The bytes first, then the scan, then `JSON.parse`. */
export function readStrictJson(source: string, file: string, maxBytes: number | undefined, maxDepth: number = UI_FILE_LIMITS.depth): StrictRead {
  const bytes = maxBytes === undefined ? 0 : new TextEncoder().encode(source).length;
  if (maxBytes !== undefined && bytes > maxBytes) {
    return { ok: false, problems: [{ file, path: "$", code: "ui.file_too_large", reason: `文件有 ${bytes} 字节，上限是 ${maxBytes}`, fix: "减少内容后再试" }] };
  }
  const scan = scanJson(source, maxDepth);
  const sink = createSink(file, source, scan.positions);
  for (const problem of scan.problems) sink.addAt(problem.path, problem.code, problem.reason, problem.fix, problem.offset);
  return sink.problems.length > 0 ? { ok: false, problems: sink.problems } : { ok: true, value: JSON.parse(source), sink };
}

/** The fields a file's object may have: an unknown one is refused, never ignored. Gives the object when it is one. */
export function readObject(sink: ProblemSink, value: unknown, path: string, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> | null {
  if (!isRecord(value)) {
    sink.add(path, "ui.file_wrong_type", "这里必须是对象", `写成 { ${required.join(", ")} }`);
    return null;
  }
  const known = new Set([...required, ...optional]);
  for (const name of Object.keys(value)) {
    if (!known.has(name)) sink.add(childPath(path, name), "ui.file_unknown_field", `不认识 ${name.slice(0, 60)}`, `这里只能写 ${[...known].join("、") || "空对象"}，删掉它`);
  }
  for (const name of required) {
    if (value[name] === undefined) sink.add(path, "ui.file_missing_field", `缺少 ${name}`, `加上 ${name}`);
  }
  return value;
}

export function checkFormatVersion(sink: ProblemSink, value: Record<string, unknown>, current: number): void {
  if (value.format_version !== undefined && value.format_version !== current) {
    sink.add("$.format_version", "ui.file_format_version", `format_version 是 ${JSON.stringify(value.format_version)}，这个版本的程序只读 ${current}`, `按第 ${current} 版的格式改，再写 "format_version": ${current}`);
  }
}

export function finishFile<T>(sink: ProblemSink, value: unknown): UiFileResult<T> {
  return sink.problems.length > 0 ? { ok: false, problems: sink.problems } : { ok: true, value: value as T };
}
