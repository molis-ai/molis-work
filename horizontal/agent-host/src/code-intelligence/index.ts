/**
 * Code intelligence on the Host side: the executor behind the SDK's official coding pack.
 *
 * The pack declares `coding.find-symbol` and leaves `coding.symbol-index` to the App; this is that App side. It answers a
 * symbol's definition and references by asking a language server the person configured, starting it on demand per file
 * type and closing it when the round ends. Downloads are off by default; with the person's `downloads: "allow"` and an
 * explicit registry, a missing server is fetched into the isolated tools root (Q5). Without either, the file type is refused
 * and the tool reports itself unavailable.
 */

import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ToolRunner } from "@prologue/sdk";
import { fileUri, startLanguageServer, type LanguageServerSpec, type LspClient } from "./lsp-client.js";
import { ensureTool, type ToolInstallSpec } from "./tool-fetcher.js";
import { checkProposedWrite, type ServerCapabilities } from "./write-check.js";
import { codeIntelligenceReadiness, localCommand } from "./readiness.js";

export type { LanguageServerSpec } from "./lsp-client.js";
export { ensureTool } from "./tool-fetcher.js";
export type { ToolInstallSpec } from "./tool-fetcher.js";
export { unconfiguredSymbolIndex } from "./coding-tools.js";

export interface CodeIntelligence {
  /** The `coding.symbol-index` executor; the official coding pack's `coding.find-symbol` calls it. */
  readonly symbolIndex: ToolRunner;
  /** Format and check a proposed write before it is reviewed (A4-2); `path` is inside this round's directory, the file may be new. */
  checkWrite(input: { readonly path: string; readonly before: string | undefined; readonly after: string }): ReturnType<typeof checkProposedWrite>;
  /** Which languages the round's directory uses and whether each one's program is here (A4); starts and downloads nothing. */
  readiness(): ReturnType<typeof codeIntelligenceReadiness>;
  close(): Promise<void>;
}

/**
 * The servers every round knows without configuration (A4: TypeScript/JavaScript, Python, Rust, Go), after the person's own entries,
 * which win for an extension they name. They are used only from this machine (an absolute path or a name on PATH) and never
 * downloaded; one that is not there makes its file type "not checked", with that reason.
 */
const TS = ["typescript-language-server", "--stdio"] as const;
export const BUILTIN_LANGUAGE_SERVERS: readonly LanguageServerSpec[] = [
  { command: TS[0], args: [TS[1]], extensions: [".ts", ".mts", ".cts"], languageId: "typescript" },
  { command: TS[0], args: [TS[1]], extensions: [".tsx"], languageId: "typescriptreact" },
  { command: TS[0], args: [TS[1]], extensions: [".js", ".mjs", ".cjs"], languageId: "javascript" },
  { command: TS[0], args: [TS[1]], extensions: [".jsx"], languageId: "javascriptreact" },
  { command: "pyright-langserver", args: ["--stdio"], extensions: [".py", ".pyi"], languageId: "python" },
  { command: "rust-analyzer", extensions: [".rs"], languageId: "rust" },
  { command: "gopls", extensions: [".go"], languageId: "go" },
];

const MAX_EXTENSIONS = 16;
const MAX_TEXT_CHARS = 2_000_000;
const MAX_SYMBOL_CHARS = 200;
const MAX_RESULTS = 50;

/**
 * Validate what a configuration file says about language servers. **Wrong entries are refused, not skipped**: a typo in a
 * command should not silently leave a file type without intelligence.
 */
export interface LanguageServerSettings {
  /** Whether the person lets the Host download a tool that is not installed (Q5). Default: off. */
  readonly downloads: boolean;
  /** The registry a download comes from; the platform does not pick one silently per package. */
  readonly registry?: string;
  readonly servers: readonly LanguageServerSpec[];
}

/** The whole file: the person's download switch, the registry, and each server. */
export function languageServerSettings(value: unknown): LanguageServerSettings {
  const input = value as { readonly servers?: unknown; readonly downloads?: unknown; readonly registry?: unknown };
  const servers = languageServersFrom(value);
  const downloads = input.downloads === undefined ? false : input.downloads === "allow" ? true : input.downloads === "deny" ? false : (() => { throw new Error('language-servers.json downloads must be "allow" or "deny"'); })();
  if (input.registry !== undefined && (typeof input.registry !== "string" || !/^https:\/\/[^\s]+$/u.test(input.registry))) {
    throw new Error("language-servers.json registry must be an https URL");
  }
  // A person who allows downloads must also say where they come from: no silent default registry in production config.
  if (downloads && input.registry === undefined) throw new Error('language-servers.json needs an explicit registry (an https URL) when downloads is "allow"');
  return { downloads, servers, ...(input.registry === undefined ? {} : { registry: input.registry }) };
}

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
    const install = (server as { readonly install?: unknown }).install;
    if (install !== undefined) {
      const one = install as Partial<ToolInstallSpec>;
      if (typeof one.package !== "string" || !/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/iu.test(one.package)) throw new Error(`${where}.install.package must be a package name`);
      if (typeof one.version !== "string" || !/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(one.version)) throw new Error(`${where}.install.version must be an exact version`);
      if (typeof one.bin !== "string" || one.bin.length === 0) throw new Error(`${where}.install.bin must name the executable the package ships`);
    }
    return {
      command: server.command,
      extensions: extensions.map((one) => one.toLowerCase()),
      ...(server.args === undefined ? {} : { args: [...server.args] }),
      ...(server.languageId === undefined ? {} : { languageId: server.languageId }),
      ...(server.initializationOptions === undefined ? {} : { initializationOptions: server.initializationOptions }),
      ...(install === undefined ? {} : { install: install as ToolInstallSpec }),
    };
  });
}

/** The server for a path, by extension. */
function serverFor(servers: readonly LanguageServerSpec[], file: string): { readonly spec: LanguageServerSpec; readonly languageId: string } | undefined {
  const extension = path.extname(file).toLowerCase();
  const spec = servers.find((one) => one.extensions.includes(extension));
  return spec === undefined ? undefined : { spec, languageId: spec.languageId ?? extension.slice(1) };
}

/**
 * A path inside the round's root, or a refusal — the executor never reads outside the directory it was given.
 *
 * **Both sides are resolved through symlinks** before comparing: a link inside the root that points outside it would
 * otherwise pass a plain string-prefix check and read a file the round was never granted.
 */
async function insideRoot(rootPath: string, requested: string): Promise<string> {
  const refused = () => new Error(`coding.find-symbol only reads inside this round's directory; "${requested}" is outside it`);
  const root = await realpath(path.resolve(rootPath));
  const real = await realpath(path.resolve(rootPath, requested)).catch(() => {
    throw new Error(`coding.find-symbol cannot read "${requested}": no such file in this round's directory`);
  });
  const relative = path.relative(root, real);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) throw refused();
  return real;
}

/** Like `insideRoot`, for a file that may not exist yet: its directory must, inside the root. */
async function insideRootForWrite(rootPath: string, requested: string): Promise<string> {
  const root = await realpath(path.resolve(rootPath));
  const parent = await realpath(path.dirname(path.resolve(rootPath, requested))).catch(() => { throw new Error(`"${requested}" is in no directory of this round`); });
  const absolute = path.join(parent, path.basename(requested)), relative = path.relative(root, absolute);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`"${requested}" is outside this round's directory`);
  return absolute;
}

/** Q5: an applicable local command is used first; only when it is not there is the tool fetched into the isolated root. */
async function resolveSpec(
  spec: LanguageServerSpec,
  tools: { readonly root: string; readonly allow: () => boolean | Promise<boolean>; readonly registry?: string } | undefined,
): Promise<LanguageServerSpec> {
  const local = localCommand(spec.command);
  if (local !== undefined) return { ...spec, command: local };
  if (spec.install === undefined) throw new Error(`${spec.command} is not on this machine`);
  if (tools === undefined) throw new Error(`no ${spec.install.package} is installed and this Host has no tools directory to fetch it into`);
  const tool = await ensureTool(spec.install, {
    toolsRoot: tools.root,
    allow: tools.allow,
    ...(tools.registry === undefined ? {} : { registry: tools.registry }),
  });
  return { ...spec, command: tool.command };
}

/** Negotiate the server features used by the symbol and write checks. */
async function initializeServer(client: LspClient, rootPath: string, initializationOptions: unknown): Promise<ServerCapabilities> {
  const started = await client.request<{ readonly capabilities?: ServerCapabilities }>("initialize", {
    processId: process.pid,
    rootUri: fileUri(rootPath),
    capabilities: {
      textDocument: {
        definition: { linkSupport: false },
        references: {},
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        formatting: {}, rangeFormatting: {}, publishDiagnostics: { versionSupport: true }, diagnostic: {},
      },
    },
    workspaceFolders: [{ uri: fileUri(rootPath), name: path.basename(rootPath) || "work" }],
    ...(initializationOptions === undefined ? {} : { initializationOptions: initializationOptions }),
  });
  return started?.capabilities ?? {};
}

/**
 * One round's code intelligence: servers start on first use and are closed together. `servers` is what the person's
 * configuration lists; `rootPath` is this round's directory.
 */
export function createCodeIntelligence(input: {
  readonly servers: readonly LanguageServerSpec[];
  readonly rootPath: string;
  readonly timeoutMs?: number;
  /** Q5: where a not-yet-installed server is fetched to, and whether the person allows it. */
  readonly tools?: { readonly root: string; readonly allow: () => boolean | Promise<boolean>; readonly registry?: string };
}): CodeIntelligence {
  const clients = new Map<string, LspClient>();
  const starting = new Map<string, Promise<LspClient>>();
  const spawning = new Set<LspClient>();
  const texts = new Map<string, string>();
  const openWith = new Map<string, LspClient>();
  const fileOperations = new Map<string, Promise<unknown>>();
  const abilities = new WeakMap<LspClient, ServerCapabilities>();
  // A round reads a bounded number of files: handing the model an unbounded cache would hold whole trees in memory.
  const MAX_OPEN_DOCUMENTS = 64;
  let closed = false;

  const ensureClient = (key: string, resolved: LanguageServerSpec, spec: LanguageServerSpec): Promise<LspClient> => {
    const existing = clients.get(key);
    if (existing !== undefined && existing.alive) return Promise.resolve(existing);
    const inFlight = starting.get(key);
    if (inFlight !== undefined) return inFlight;
    const launch = (async () => {
      if (closed) throw new Error("this round has ended; code intelligence is closed");
      const client = startLanguageServer(resolved, { cwd: input.rootPath, ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }) });
      spawning.add(client);
      try {
        const capabilities = await initializeServer(client, input.rootPath, spec.initializationOptions);
        if (closed) throw new Error("this round has ended; code intelligence is closed");
        abilities.set(client, capabilities);
        client.notify("initialized", {});
        clients.set(key, client);
        return client;
      } catch (error) {
        // A server that never finished its handshake (or raced with round close) is not reusable.
        if (clients.get(key) === client) clients.delete(key);
        await client.close().catch(() => undefined);
        if (closed) throw new Error("this round has ended; code intelligence is closed");
        throw new Error(`the language server failed to start: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        spawning.delete(client);
        starting.delete(key);
      }
    })();
    starting.set(key, launch);
    return launch;
  };

  const closeDocument = (file: string) => {
    openWith.get(file)?.closeDocument({ path: file });
    texts.delete(file);
    openWith.delete(file);
  };
  const withDocument = async <T>(file: string, operation: () => Promise<T>): Promise<T> => {
    const previous = fileOperations.get(file);
    const current = Promise.resolve(previous).catch(() => undefined).then(operation);
    fileOperations.set(file, current);
    try { return await current; }
    finally { if (fileOperations.get(file) === current) fileOperations.delete(file); }
  };

  const clientFor = async (file: string): Promise<{ readonly client: LspClient; readonly languageId: string; readonly name: string; readonly capabilities: ServerCapabilities }> => {
    if (closed) throw new Error("this round has ended; code intelligence is closed");
    const found = serverFor(input.servers, file);
    if (found === undefined) {
      throw new Error(`no language server is configured for ${path.extname(file) || "this file"}; coding.find-symbol reports itself unavailable`);
    }
    const resolved = await resolveSpec(found.spec, input.tools);
    if (closed) throw new Error("this round has ended; code intelligence is closed");
    const key = `${resolved.command}\u0000${(resolved.args ?? []).join("\u0000")}`;
    const client = await ensureClient(key, resolved, found.spec);
    return { client, languageId: found.languageId, name: path.basename(resolved.command), capabilities: abilities.get(client) ?? {} };
  };

  const open = async (absolute: string): Promise<{ readonly client: LspClient; readonly text: string }> => {
    // The server (or its absence) is decided first: a file type nobody configured gets the honest message, not a broken call.
    const { client, languageId } = await clientFor(absolute);
    const text = await readFile(absolute, "utf8");
    if (text.length > MAX_TEXT_CHARS) throw new Error("coding.find-symbol does not read files above 2,000,000 characters");
    const previous = texts.get(absolute);
    // A restarted server has never seen the document, even when its text did not change while it was down.
    if (previous === undefined || openWith.get(absolute) !== client) {
      client.openDocument({ path: absolute, text, languageId });
      openWith.set(absolute, client);
    } else if (previous !== text) {
      client.changeDocument({ path: absolute, text });
    }
    texts.delete(absolute); texts.set(absolute, text);
    for (const held of texts.keys()) {
      if (texts.size <= MAX_OPEN_DOCUMENTS) break;
      // The document may belong to another file type's server: close it on the client that opened it.
      closeDocument(held);
    }
    return { client, text };
  };

  const symbolIndex: ToolRunner = async (call) => {
    const args = (call.args ?? {}) as { readonly symbol?: unknown; readonly path?: unknown };
    const requested = typeof args.path === "string" && args.path.length > 0 ? args.path : undefined;
    if (requested === undefined) throw new Error("coding.find-symbol needs a path inside this round's directory");
    const symbol = typeof args.symbol === "string" && args.symbol.trim().length > 0 ? args.symbol.trim() : undefined;
    if (symbol !== undefined && symbol.length > MAX_SYMBOL_CHARS) throw new Error("coding.find-symbol takes a symbol name of at most 200 characters");
    const realRoot = await realpath(path.resolve(input.rootPath));
    const absolute = await insideRoot(input.rootPath, requested);
    return withDocument(absolute, () => symbolsFor(absolute, realRoot, requested, symbol));
  };

  const symbolsFor = async (absolute: string, realRoot: string, requested: string, symbol: string | undefined) => {
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
      await describe("definition", definitions, realRoot),
      await describe("references", references, realRoot),
    ].join("\n");
  };

  return {
    symbolIndex,
    readiness: () => codeIntelligenceReadiness({ servers: input.servers, rootPath: input.rootPath,
      ...(input.tools === undefined ? {} : { tools: { root: input.tools.root, ...(input.tools.registry === undefined ? {} : { registry: input.tools.registry }) } }) }),
    checkWrite: async ({ path: requested, before, after }) => {
      const absolute = await insideRootForWrite(input.rootPath, requested);
      return withDocument(absolute, () => checkProposedWrite({ clientFor, closeDocument }, { absolute, before, after }));
    },
    async close() {
      closed = true;
      await Promise.all([...clients.values(), ...spawning.values()].map((client) => client.close().catch(() => undefined)));
      await Promise.allSettled([...starting.values()]);
      await Promise.all([...clients.values(), ...spawning.values()].map((client) => client.close().catch(() => undefined)));
      clients.clear();
      spawning.clear();
      texts.clear();
      openWith.clear();
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

async function describe(label: string, found: readonly LocationLike[] | LocationLike | null | undefined, realRoot: string): Promise<string> {
  const list = found === null || found === undefined ? [] : Array.isArray(found) ? found : [found];
  if (list.length === 0) return `  ${label}: none`;
  const lines = await Promise.all(list.slice(0, MAX_RESULTS).map(async (one) => `    ${await describeLocation(one, realRoot)}`));
  return [`  ${label}:`, ...lines].join("\n");
}

async function describeLocation(one: LocationLike, realRoot: string): Promise<string> {
  const uri = typeof one.uri === "string" ? one.uri : typeof one.targetUri === "string" ? one.targetUri : "";
  const range = one.range ?? one.targetSelectionRange ?? one.targetRange;
  const line = typeof range?.start?.line === "number" ? range.start.line + 1 : undefined;
  const character = typeof range?.start?.character === "number" ? range.start.character + 1 : undefined;
  const suffix = line === undefined ? "" : `:${line}${character === undefined ? "" : `:${character}`}`;
  if (!uri.startsWith("file://")) return `${uri || "(nowhere)"}${suffix}`;
  let decoded: string;
  try { decoded = fileURLToPath(uri); } catch {
    try { decoded = decodeURIComponent(uri.slice("file://".length)); } catch { decoded = uri.slice("file://".length); }
  }
  if (!decoded || !path.isAbsolute(decoded)) return `${decoded || "(nowhere)"}${suffix}`;
  const resolved = await realpath(decoded).catch(() => path.resolve(decoded));
  const rel = path.relative(realRoot, resolved);
  if (rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    return `${rel.split(path.sep).join("/")}${suffix}`;
  }
  return `${path.basename(decoded) || "(outside)"}${suffix} (outside this round's directory)`;
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


/** The executor a round gets when the optional `language-servers.json` exists but could not be used: report it, per call. */
export function unavailableSymbolIndex(reason: string): ToolRunner {
  return async () => { throw new Error(reason); };
}
