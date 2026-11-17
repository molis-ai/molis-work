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
import type { AgentWriteChecks, AgentWriteCheckError } from "@molis-ai/molis-work-contracts/services/agent-host";
import { fileUri, type LspClient } from "./lsp-client.js";

/** What the round's code intelligence lends the check. */
export interface WriteCheckDeps {
  /** The server for a path, started on demand, and what it said it can do at its handshake. */
  clientFor(file: string): Promise<{ readonly client: LspClient; readonly languageId: string; readonly name: string; readonly capabilities: ServerCapabilities }>;
  /** Forget what the round's open documents hold for this path, so the next read sends the disk text again. */
  forget(file: string): void;
}

export interface ServerCapabilities {
  readonly documentFormattingProvider?: unknown;
  readonly documentRangeFormattingProvider?: unknown;
  readonly diagnosticProvider?: unknown;
}

interface TextEditLike { readonly range: { readonly start: Position; readonly end: Position }; readonly newText: string }
interface Position { readonly line: number; readonly character: number }
interface DiagnosticLike { readonly range?: { readonly start?: Position }; readonly severity?: number; readonly code?: string | number; readonly message?: string }

const MAX_ERRORS = 20;
const SETTLE_MS = 400;
const WAIT_MS = 4_000;
/** gofmt and rustfmt are the language's own form, so the whole file is theirs; elsewhere only what the change touched is formatted. */
const WHOLE_FILE = new Set(["go", "rust"]);

/** The proposed text, formatted when the server can, with the facts for the review card. */
export async function checkProposedWrite(deps: WriteCheckDeps, input: { readonly absolute: string; readonly before: string | undefined; readonly after: string }): Promise<{ readonly text: string; readonly checks: AgentWriteChecks }> {
  const extension = path.extname(input.absolute) || path.basename(input.absolute);
  let server: Awaited<ReturnType<WriteCheckDeps["clientFor"]>>;
  try { server = await deps.clientFor(input.absolute); } catch (error) {
    const reason = reasonOf(error, `no language server answers for ${extension}`);
    return { text: input.after, checks: { diagnostics: { state: "unchecked", reason }, formatting: { state: "unavailable", reason } } };
  }
  const { client, languageId, name, capabilities } = server;
  const uri = fileUri(input.absolute);
  let version = 1;
  const show = (text: string) => {
    if (version === 1) client.openDocument({ path: input.absolute, text, languageId }); else client.changeDocument({ path: input.absolute, text, version });
    version += 1;
  };
  try {
    // What the server already finds wrong in the file as it is, so only what the change brings is reported.
    show(input.before ?? "");
    const baseline = input.before === undefined ? [] : await errorsFor(client, uri, capabilities).catch(() => undefined);
    show(input.after);
    const formatted = await format(client, uri, languageId, input, capabilities, name);
    if (formatted.text !== input.after) show(formatted.text);
    // A server silent about the file as it is cannot say what the change brings: no second wait for an answer that cannot count.
    const after = baseline === undefined ? "the language server gave no diagnostics for the file as it is"
      : await errorsFor(client, uri, capabilities).catch((error: unknown) => reasonOf(error, "the language server gave no diagnostics in time"));
    const diagnostics: AgentWriteChecks["diagnostics"] = typeof after === "string" ? { state: "unchecked", reason: after } : newErrors(baseline!, after, name);
    return { text: formatted.text, checks: { diagnostics, formatting: formatted.fact } };
  } finally {
    try { client.closeDocument({ path: input.absolute }); } catch { /* the server is gone */ }
    deps.forget(input.absolute);
  }
}

async function format(client: LspClient, uri: string, languageId: string, input: { readonly before: string | undefined; readonly after: string }, capabilities: ServerCapabilities, name: string): Promise<{ readonly text: string; readonly fact: AgentWriteChecks["formatting"] }> {
  const options = indentation(input.after);
  const whole = WHOLE_FILE.has(languageId) || input.before === undefined;
  const range = whole ? undefined : changedLines(input.before!, input.after);
  if (range === null) return { text: input.after, fact: { state: "unchanged", source: name } };
  const can = whole ? capabilities.documentFormattingProvider : capabilities.documentRangeFormattingProvider;
  if (!can) return { text: input.after, fact: { state: "unavailable", reason: `${name} does not format ${languageId}` } };
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

/** The server's errors for the document as it stands: pulled when it can be asked, else the next publication it pushes. */
async function errorsFor(client: LspClient, uri: string, capabilities: ServerCapabilities): Promise<readonly DiagnosticLike[]> {
  if (capabilities.diagnosticProvider) {
    const report = await client.request<{ readonly items?: readonly DiagnosticLike[] } | null>("textDocument/diagnostic", { textDocument: { uri } }, WAIT_MS);
    return (report?.items ?? []).filter(isError);
  }
  return new Promise((resolve, reject) => {
    let latest: readonly DiagnosticLike[] | undefined, settle: NodeJS.Timeout | undefined;
    const done = (fn: () => void) => { stop(); clearTimeout(settle); clearTimeout(limit); fn(); };
    // Servers publish more than once while they work: the last word within a short quiet spell is the answer.
    const stop = client.onNotification((method, params) => {
      const published = params as { readonly uri?: string; readonly diagnostics?: readonly DiagnosticLike[] };
      if (method !== "textDocument/publishDiagnostics" || published.uri !== uri) return;
      latest = (published.diagnostics ?? []).filter(isError);
      clearTimeout(settle); settle = setTimeout(() => done(() => resolve(latest!)), SETTLE_MS);
    });
    const limit = setTimeout(() => done(() => latest ? resolve(latest) : reject(new Error("the language server gave no diagnostics in time"))), WAIT_MS);
  });
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

const reasonOf = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message.slice(0, 300) : fallback;
