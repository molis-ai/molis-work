/**
 * Code intelligence on the Host side: the executor behind the SDK's official coding pack.
 *
 * The pack declares `coding.find-symbol` and leaves `coding.symbol-index` to the App; this is that App side. It answers a
 * symbol's definition and references by asking a language server the person configured, starting it on demand per file
 * type and closing it when the round ends. Nothing is downloaded: a file type with no configured server is refused, and
 * the tool reports itself unavailable.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ToolRunner } from "@prologue/sdk";
import { fileUri, startLanguageServer, type LanguageServerSpec, type LspClient } from "./lsp-client.js";

export type { LanguageServerSpec } from "./lsp-client.js";

export interface CodeIntelligence {
  /** The `coding.symbol-index` executor; the official coding pack's `coding.find-symbol` calls it. */
  readonly symbolIndex: ToolRunner;
  close(): Promise<void>;
}

const MAX_EXTENSIONS = 16;
const MAX_TEXT_CHARS = 2_000_000;
const MAX_SYMBOL_CHARS = 200;
const MAX_RESULTS = 50;

/**
 * Validate what a configuration file says about language servers. **Wrong entries are refused, not skipped**: a typo in a
 * command should not silently leave a file type without intelligence.
 */
export function languageServersFrom(value: unknown): readonly LanguageServerSpec[] {
  const input = value as { readonly servers?: unknown };
  if (input === null || typeof input !== "object" || !Array.isArray(input.servers)) throw new Error("language-servers.json must be an object with a servers list");
  if (input.servers.length > 32) throw new Error("language-servers.json lists more than 32 servers");
  return input.servers.map((entry, index) => {
    const server = entry as Partial<LanguageServerSpec>;
    const where = `language-servers.json servers[${index}]`;
    if (typeof server.command !== "string" || server.command.length === 0 || server.command.includes("\u0000")) throw new Error(`${where}.command must be a non-empty program`);
    const extensions = server.extensions;
    if (!Array.isArray(extensions) || extensions.length === 0 || extensions.length > MAX_EXTENSIONS ||
      extensions.some((one) => typeof one !== "string" || !/^\.[A-Za-z0-9]+$/.test(one))) {
      throw new Error(`${where}.extensions must list at least one extension such as ".ts"`);
    }
    if (server.args !== undefined && (!Array.isArray(server.args) || server.args.some((one) => typeof one !== "string"))) throw new Error(`${where}.args must be strings`);
    if (server.languageId !== undefined && (typeof server.languageId !== "string" || server.languageId.length === 0)) throw new Error(`${where}.languageId must be a non-empty string`);
    return {
      command: server.command,
      extensions: extensions.map((one) => one.toLowerCase()),
      ...(server.args === undefined ? {} : { args: [...server.args] }),
      ...(server.languageId === undefined ? {} : { languageId: server.languageId }),
      ...(server.initializationOptions === undefined ? {} : { initializationOptions: server.initializationOptions }),
    };
  });
}

/** The server for a path, by extension. */
function serverFor(servers: readonly LanguageServerSpec[], file: string): { readonly spec: LanguageServerSpec; readonly languageId: string } | undefined {
  const extension = path.extname(file).toLowerCase();
  const spec = servers.find((one) => one.extensions.includes(extension));
  return spec === undefined ? undefined : { spec, languageId: spec.languageId ?? extension.slice(1) };
}

/** A path inside the round's root, or a refusal — the executor never reads outside the directory it was given. */
function insideRoot(rootPath: string, requested: string): string {
  const resolved = path.resolve(rootPath, requested);
  const relative = path.relative(path.resolve(rootPath), resolved);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`coding.find-symbol only reads inside this round's directory; "${requested}" is outside it`);
  return resolved;
}

/**
 * One round's code intelligence: servers start on first use and are closed together. `servers` is what the person's
 * configuration lists; `rootPath` is this round's directory.
 */
export function createCodeIntelligence(input: {
  readonly servers: readonly LanguageServerSpec[];
  readonly rootPath: string;
  readonly timeoutMs?: number;
}): CodeIntelligence {
  const clients = new Map<string, LspClient>();
  const texts = new Map<string, string>();
  let closed = false;

  const clientFor = async (file: string): Promise<{ readonly client: LspClient; readonly languageId: string }> => {
    if (closed) throw new Error("this round has ended; code intelligence is closed");
    const found = serverFor(input.servers, file);
    if (found === undefined) {
      throw new Error(`no language server is configured for ${path.extname(file) || "this file"}; coding.find-symbol reports itself unavailable`);
    }
    const key = `${found.spec.command}\u0000${(found.spec.args ?? []).join("\u0000")}`;
    let client = clients.get(key);
    if (client === undefined || !client.alive) {
      client = startLanguageServer(found.spec, { cwd: input.rootPath, ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }) });
      clients.set(key, client);
      await client.request("initialize", {
        processId: process.pid,
        rootUri: fileUri(input.rootPath),
        capabilities: {
          textDocument: {
            definition: { linkSupport: false },
            references: {},
            documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          },
        },
        workspaceFolders: [{ uri: fileUri(input.rootPath), name: path.basename(input.rootPath) || "work" }],
        ...(found.spec.initializationOptions === undefined ? {} : { initializationOptions: found.spec.initializationOptions }),
      });
      client.notify("initialized", {});
    }
    return { client, languageId: found.languageId };
  };

  const open = async (absolute: string): Promise<{ readonly client: LspClient; readonly text: string }> => {
    // The server (or its absence) is decided first: a file type nobody configured gets the honest message, not a broken call.
    const { client, languageId } = await clientFor(absolute);
    const text = await readFile(absolute, "utf8");
    if (text.length > MAX_TEXT_CHARS) throw new Error("coding.find-symbol does not read files above 2,000,000 characters");
    const previous = texts.get(absolute);
    if (previous !== text) {
      client.openDocument({ path: absolute, text, languageId });
      texts.set(absolute, text);
    }
    return { client, text };
  };

  const symbolIndex: ToolRunner = async (call) => {
    const args = (call.args ?? {}) as { readonly symbol?: unknown; readonly path?: unknown };
    const requested = typeof args.path === "string" && args.path.length > 0 ? args.path : undefined;
    if (requested === undefined) throw new Error("coding.find-symbol needs a path inside this round's directory");
    const symbol = typeof args.symbol === "string" && args.symbol.trim().length > 0 ? args.symbol.trim() : undefined;
    if (symbol !== undefined && symbol.length > MAX_SYMBOL_CHARS) throw new Error("coding.find-symbol takes a symbol name of at most 200 characters");
    const absolute = insideRoot(input.rootPath, requested);
    const { client, text } = await open(absolute);
    const position = symbol === undefined ? { line: 0, character: 0 } : findSymbolPosition(text, symbol);
    if (position === undefined) return `no definition of "${symbol}" was found in ${requested}`;
    if (symbol === undefined) {
      const symbols = await client.request<readonly unknown[]>("textDocument/documentSymbol", { textDocument: { uri: fileUri(absolute) } });
      return describeSymbols(symbols, requested);
    }
    const definitions = await client.request<readonly LocationLike[] | LocationLike | null>("textDocument/definition", {
      textDocument: { uri: fileUri(absolute) }, position,
    });
    const references = await client.request<readonly LocationLike[] | null>("textDocument/references", {
      textDocument: { uri: fileUri(absolute) }, position, context: { includeDeclaration: false },
    });
    return [
      `symbol ${symbol} in ${requested}`,
      describe("definition", definitions, input.rootPath),
      describe("references", references, input.rootPath),
    ].join("\n");
  };

  return {
    symbolIndex,
    async close() {
      closed = true;
      await Promise.all([...clients.values()].map((client) => client.close().catch(() => undefined)));
      clients.clear();
      texts.clear();
    },
  };
}

interface LocationLike {
  readonly uri?: unknown;
  readonly targetUri?: unknown;
  readonly range?: { readonly start?: { readonly line?: unknown; readonly character?: unknown } };
  readonly targetRange?: { readonly start?: { readonly line?: unknown; readonly character?: unknown } };
  readonly targetSelectionRange?: { readonly start?: { readonly line?: unknown; readonly character?: unknown } };
}

function findSymbolPosition(text: string, symbol: string): { readonly line: number; readonly character: number } | undefined {
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const column = lines[index]!.search(new RegExp(`(^|[^\\w$])${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w$]|$)`));
    if (column >= 0) {
      const match = new RegExp(`(^|[^\\w$])(?:${symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`).exec(lines[index]!);
      return { line: index, character: column + (match?.[1] ? 1 : 0) };
    }
  }
  return undefined;
}

function describe(label: string, found: readonly LocationLike[] | LocationLike | null | undefined, rootPath: string): string {
  const list = found === null || found === undefined ? [] : Array.isArray(found) ? found : [found];
  if (list.length === 0) return `  ${label}: none`;
  return [`  ${label}:`, ...list.slice(0, MAX_RESULTS).map((one) => `    ${describeLocation(one, rootPath)}`)].join("\n");
}

function describeLocation(one: LocationLike, rootPath: string): string {
  const uri = typeof one.uri === "string" ? one.uri : typeof one.targetUri === "string" ? one.targetUri : "";
  const range = one.range ?? one.targetSelectionRange ?? one.targetRange;
  const line = typeof range?.start?.line === "number" ? range.start.line + 1 : undefined;
  const character = typeof range?.start?.character === "number" ? range.start.character + 1 : undefined;
  return `${uri.replace("file://", "") || "(nowhere)"}${line === undefined ? "" : `:${line}${character === undefined ? "" : `:${character}`}`}`
    + (uri.startsWith("file://") && !uri.replace("file://", "").startsWith(path.resolve(rootPath)) ? " (outside this round's directory)" : "");
}

function describeSymbols(symbols: readonly unknown[], requested: string): string {
  const lines: string[] = [`top-level symbols in ${requested}`];
  for (const symbol of symbols.slice(0, MAX_RESULTS)) {
    const one = symbol as { readonly name?: unknown; readonly range?: LocationLike["range"]; readonly kind?: unknown };
    const line = typeof one.range?.start?.line === "number" ? one.range.start.line + 1 : undefined;
    if (typeof one.name !== "string") continue;
    lines.push(`  ${one.name}${line === undefined ? "" : `:${line}`}`);
  }
  return lines.length === 1 ? `${lines[0]}: none` : lines.join("\n");
}
