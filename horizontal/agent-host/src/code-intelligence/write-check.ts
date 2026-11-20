/**
 * The check of a write before the person sees it (Coding A4-2, docs/design/coding-daily-basics scheme A): the proposed text is
 * formatted by the language server for its file type, then the server's errors for it are compared with its errors for the text
 * on disk now, and only errors the change brings are reported. The review card shows the formatted version, so what the person
 * approves is what is written (F-1: a `tool-before` rewrite becomes the reviewed proposal).
 *
 * Nothing here writes a file or runs anything but the language server the round already uses. When no server answers for the
 * file type, or it fails or is too slow, the facts say "not checked" with the reason — never "no errors".
 */

import path from "node:path";
import type { AgentWriteCheckCause, AgentWriteChecks, AgentWriteCheckError } from "@molis-ai/molis-work-contracts/services/agent-host";
import { fileUri, type LspClient } from "./lsp-client.js";

/** What the round's code intelligence lends the check. */
export interface WriteCheckDeps {
  /** The server for a path, started on demand, and what it said it can do at its handshake. */
  clientFor(file: string): Promise<{ readonly client: LspClient; readonly languageId: string; readonly name: string; readonly capabilities: ServerCapabilities }>;
  /** Close any document the symbol tool previously opened. Its next read takes text from disk again. */
  closeDocument(file: string): void;
}

export interface ServerCapabilities {
  readonly documentFormattingProvider?: unknown;
  readonly documentRangeFormattingProvider?: unknown;
  readonly diagnosticProvider?: unknown;
  readonly executeCommandProvider?: { readonly commands?: readonly string[] };
}

interface TextEditLike { readonly range: { readonly start: Position; readonly end: Position }; readonly newText: string }
interface Position { readonly line: number; readonly character: number }
interface DiagnosticLike { readonly range?: { readonly start?: Position }; readonly severity?: number; readonly code?: string | number; readonly message?: string }

const MAX_ERRORS = 20;
const SETTLE_MS = 400;
const WAIT_MS = 4_000;
const TS_REQUEST = "typescript.tsserverRequest";
/** gofmt and rustfmt are the language's own form, so the whole file is theirs; elsewhere only what the change touched is formatted. */
const WHOLE_FILE = new Set(["go", "rust"]);

/** The proposed text, formatted when the server can, with the facts for the review card. */
export async function checkProposedWrite(deps: WriteCheckDeps, input: { readonly absolute: string; readonly before: string | undefined; readonly after: string }): Promise<{ readonly text: string; readonly checks: AgentWriteChecks }> {
  const extension = path.extname(input.absolute) || path.basename(input.absolute);
  let server: Awaited<ReturnType<WriteCheckDeps["clientFor"]>>;
  try { server = await deps.clientFor(input.absolute); } catch (error) {
    const reason = reasonOf(error, `no language server answers for ${extension}`), cause = causeOf(reason);
    return { text: input.after, checks: { diagnostics: { state: "unchecked", cause, reason }, formatting: { state: "unavailable", cause, reason } } };
  }
  const { client, languageId, name, capabilities } = server;
  const uri = fileUri(input.absolute);
  let revision = 0;
  let newest: { errors: readonly DiagnosticLike[]; at: number } | undefined;
  let updated: (() => void) | undefined;
  const stop = client.onNotification((method, params) => {
    const report = params as { uri?: string; version?: number; diagnostics?: readonly DiagnosticLike[] } | null;
    if (method !== "textDocument/publishDiagnostics" || report?.uri !== uri || report.version !== revision || !Array.isArray(report.diagnostics)) return;
    newest = { errors: report.diagnostics.filter(isError), at: performance.now() };
    updated?.();
  });
  const show = (text: string) => {
    newest = undefined;
    revision = revision ? client.changeDocument({ path: input.absolute, text }) : client.openDocument({ path: input.absolute, text, languageId });
  };
  const errorsFor = async (): Promise<readonly DiagnosticLike[]> => {
    if (!client.alive) throw new Error("the language server stopped");
    if (capabilities.diagnosticProvider) {
      const report = await client.request<{ kind?: string; items?: readonly DiagnosticLike[] } | null>("textDocument/diagnostic", { textDocument: { uri } }, WAIT_MS);
      if (report?.kind !== "full" || !Array.isArray(report.items)) throw new Error("the language server gave no diagnostics for this version");
      return report.items.filter(isError);
    }
    if (/^(typescript|javascript)(react)?$/u.test(languageId) && capabilities.executeCommandProvider?.commands?.includes(TS_REQUEST)) {
      return pullTypeScriptErrors(client, uri);
    }
    return new Promise((resolve, reject) => {
      let settle: NodeJS.Timeout | undefined;
      const finish = () => {
        updated = undefined;
        clearTimeout(settle);
        clearTimeout(limit);
        if (!client.alive) reject(new Error("the language server stopped"));
        else if (newest) resolve(newest.errors);
        else reject(new Error("the language server gave no diagnostics for this version"));
      };
      updated = () => {
        if (!newest) return;
        clearTimeout(settle);
        settle = setTimeout(finish, Math.max(0, SETTLE_MS - (performance.now() - newest.at)));
      };
      const limit = setTimeout(finish, WAIT_MS);
      updated();
    });
  };
  try {
    deps.closeDocument(input.absolute);
    // What the server already finds wrong in the file as it is, so only what the change brings is reported.
    let baseline: readonly DiagnosticLike[] | string = [];
    if (input.before !== undefined) {
      show(input.before);
      baseline = await errorsFor().catch((error: unknown) => reasonOf(error, "the language server gave no diagnostics for the file as it is"));
    }
    show(input.after);
    const formatted = await format(client, uri, languageId, input, capabilities, name);
    if (formatted.text !== input.after) show(formatted.text);
    // A server silent about the file as it is cannot say what the change brings: no second wait for an answer that cannot count.
    const after = typeof baseline === "string" ? baseline
      : await errorsFor().catch((error: unknown) => reasonOf(error, "the language server gave no diagnostics in time"));
    const diagnostics: AgentWriteChecks["diagnostics"] = typeof after === "string" ? { state: "unchecked", cause: causeOf(after), reason: after } : newErrors(baseline as readonly DiagnosticLike[], after, name);
    return { text: formatted.text, checks: { diagnostics, formatting: formatted.fact } };
  } catch (error) {
    const reason = reasonOf(error, "the language server stopped");
    return { text: input.after, checks: { diagnostics: { state: "unchecked", cause: causeOf(reason), reason }, formatting: { state: "failed", source: name, reason } } };
  } finally {
    stop();
    if (revision) try { client.closeDocument({ path: input.absolute }); } catch { /* the server is gone */ }
  }
}

/** TypeScript Language Server offers a synchronous pull through its advertised tsserver request. Its push has no version. */
async function pullTypeScriptErrors(client: LspClient, uri: string): Promise<readonly DiagnosticLike[]> {
  interface TypeScriptDiagnostic { readonly category: string; readonly code: number; readonly message: string; readonly startLocation?: { readonly line: number } }
  const reports = await Promise.all(["syntacticDiagnosticsSync", "semanticDiagnosticsSync"].map(command =>
    client.request<{ success?: boolean; body?: readonly TypeScriptDiagnostic[] }>("workspace/executeCommand", {
      command: TS_REQUEST, arguments: [command, { file: uri, includeLinePosition: true }],
    }, WAIT_MS)));
  return reports.flatMap(report => {
    if (report?.success !== true || !Array.isArray(report.body)) throw new Error("the language server gave no diagnostics for this version");
    const diagnostics: readonly TypeScriptDiagnostic[] = report.body;
    return diagnostics.filter(item => item.category === "error").map(item => ({
      code: item.code, message: item.message, range: { start: { line: (item.startLocation?.line ?? 1) - 1, character: 0 } },
    }));
  });
}

async function format(client: LspClient, uri: string, languageId: string, input: { readonly before: string | undefined; readonly after: string }, capabilities: ServerCapabilities, name: string): Promise<{ readonly text: string; readonly fact: AgentWriteChecks["formatting"] }> {
  const options = indentation(input.after);
  const whole = WHOLE_FILE.has(languageId) || input.before === undefined;
  const range = whole ? undefined : changedLines(input.before!, input.after);
  if (range === null) return { text: input.after, fact: { state: "unchanged", source: name } };
  const can = whole ? capabilities.documentFormattingProvider : capabilities.documentRangeFormattingProvider;
  if (!can) return { text: input.after, fact: { state: "unavailable", cause: "unsupported", reason: `${name} does not format ${languageId}` } };
  try {
    const edits = whole
      ? await client.request<readonly TextEditLike[] | null>("textDocument/formatting", { textDocument: { uri }, options }, 8_000)
      : await client.request<readonly TextEditLike[] | null>("textDocument/rangeFormatting", { textDocument: { uri }, range, options }, 8_000);
    const text = applyEdits(input.after, edits ?? []);
    if (text === input.after) return { text, fact: { state: "unchanged", source: name } };
    return { text, fact: { state: "formatted", source: name, lines: changedLineCount(input.after, text), as_written: input.after } };
  } catch (error) {
    return { text: input.after, fact: { state: "failed", source: name, reason: reasonOf(error, "the formatter failed") } };
  }
}

const isError = (one: DiagnosticLike) => one.severity === undefined || one.severity === 1;
const keyOf = (one: DiagnosticLike) => `${one.code ?? ""}\u0000${one.message ?? ""}`;

/** Errors in the new text that the old one did not have, counted per kind so a moved error is not a new one. */
function newErrors(before: readonly DiagnosticLike[], after: readonly DiagnosticLike[], source: string): AgentWriteChecks["diagnostics"] {
  const held = new Map<string, number>();
  for (const one of before) held.set(keyOf(one), (held.get(keyOf(one)) ?? 0) + 1);
  const added = after.filter(one => { const left = held.get(keyOf(one)) ?? 0; if (left > 0) { held.set(keyOf(one), left - 1); return false; } return true; });
  if (!added.length) return { state: "clean", source };
  const errors: AgentWriteCheckError[] = added.slice(0, MAX_ERRORS).map(one => ({ code: String(one.code ?? ""), line: (one.range?.start?.line ?? 0) + 1, text: String(one.message ?? "").split("\n")[0]!.slice(0, 300) }));
  return { state: "errors", source, errors, more: added.length - errors.length };
}

/** Lines the change touched, as an LSP range on the new text; null when nothing changed. */
function changedLines(before: string, after: string): { readonly start: Position; readonly end: Position } | null {
  if (before === after) return null;
  const a = before.split("\n"), b = after.split("\n");
  let top = 0; while (top < a.length && top < b.length && a[top] === b[top]) top += 1;
  let tail = 0; while (tail < a.length - top && tail < b.length - top && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
  const last = Math.max(top, b.length - 1 - tail);
  return { start: { line: top, character: 0 }, end: { line: last, character: b[last]?.length ?? 0 } };
}

function changedLineCount(before: string, after: string): number {
  const a = before.split("\n"), b = after.split("\n");
  let count = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) count += 1;
  return count;
}

/** The file's own indentation, so a server formats in its style: tabs when lines begin with one, else the smallest space step. */
function indentation(text: string): { readonly tabSize: number; readonly insertSpaces: boolean } {
  const lines = text.split("\n").filter(line => /^\s+\S/u.test(line));
  if (lines.filter(line => line.startsWith("\t")).length > lines.length / 2) return { tabSize: 4, insertSpaces: false };
  const steps = lines.map(line => /^ */u.exec(line)![0].length).filter(width => width > 0);
  return { tabSize: steps.length ? Math.min(8, Math.max(2, Math.min(...steps))) : 2, insertSpaces: true };
}

/** Apply LSP text edits (non-overlapping, positions in the original text) from the end backwards. */
export function applyEdits(text: string, edits: readonly TextEditLike[]): string {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === "\n") starts.push(i + 1);
  const offset = (at: Position) => Math.min(text.length, (starts[at.line] ?? text.length) + at.character);
  const sorted = [...edits].sort((x, y) => offset(y.range.start) - offset(x.range.start));
  let result = text;
  for (const edit of sorted) result = result.slice(0, offset(edit.range.start)) + edit.newText + result.slice(offset(edit.range.end));
  return result;
}

/** The cause a reason names, by the words this module and the code intelligence it uses write. */
const causeOf = (reason: string): AgentWriteCheckCause => /no language server is configured|no language server answers/u.test(reason) ? "no-server"
  : /not on this machine|no .* is installed/u.test(reason) ? "missing" : /no diagnostics/u.test(reason) ? "silent" : "failed";
const reasonOf = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message.slice(0, 300) : fallback;
