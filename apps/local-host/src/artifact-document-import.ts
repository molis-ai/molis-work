import type { IncomingMessage } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { readOriginalText } from "./artifact-original-text.js";
import { readMaterialHtml } from "./material-extraction.js";
import { ActionError, defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { readExternalDocument } from "@molis-ai/molis-work-integration-catalog";
import {
  DOCUMENT_IMPORT_MAX_BYTES, documentErrors, importArtifactDocument, storeArtifactOriginal,
  type ArtifactDocumentImportPorts, type OfferedOriginal,
} from "@molis-ai/molis-work-module-artifacts";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { resolveApiConnection } from "./connector-access.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorRequest } from "./connector-lifecycle.js";
import { builtinIntegrationDeclarations } from "./builtin-integrations.js";

/**
 * What the Host's side of the document import refuses: reading the request, the HTML file and the connected service. Every code is
 * `artifacts.document.<reason>`, the family the plugin declares the rest of (`documentErrors`, which the too-large request below also raises);
 * what is wrong with the request is `invalid`, as the 422s that stood for the connection were.
 */
const artifactImportErrors = defineErrorCodes("artifacts.document", {
  request_invalid: "invalid",
  request_aborted: "invalid",
  html_invalid: "invalid",
  connection_revoked: "invalid",
  connection_required: "invalid",
  credentials_unavailable: "invalid",
});

/**
 * Each document source's import, from the integrations of kind `document_import` the plugins declared: the service it reads with and
 * the ways of connecting its reading works with.
 */
function documentImports(): Record<string, { service: string; methods: readonly string[] }> {
  return Object.fromEntries(builtinIntegrationDeclarations().listIntegrations("document_import").map(entry => [entry.declaration.document_source!,
    { service: entry.declaration.service_id, methods: entry.declaration.connection_methods ?? [] }]));
}

type ConnectionView = ReturnType<typeof listConnectorConnectionViews>[number];
const readsWith = (row: ConnectionView, entry: { service: string; methods: readonly string[] }) =>
  row.service_id === entry.service && entry.methods.includes(row.auth_method);

export function documentImportConnections(home = resolveMolisWorkHome()) {
  const imports = Object.values(documentImports());
  return listConnectorConnectionViews(home).filter(row => imports.some(entry => readsWith(row, entry)));
}
export function documentImportConnectionStatus(): Record<string, boolean> {
  const connections = documentImportConnections();
  return Object.fromEntries(Object.entries(documentImports()).map(([source, entry]) => [source, connections.some(row => readsWith(row, entry) && row.state === "connected")]));
}

export async function importLocalArtifactDocument(input: Record<string, unknown>, ports: Omit<ArtifactDocumentImportPorts, "readExternal" | "readHtml" | "offered"> & {
  /**
   * The file the person gave the Host for this import (`ActionCallContext.original_file`, checked by the caller: the person's own call,
   * offered to the 成果库), read here and, over the inline size, kept in the 成果库's store. Never read from the input.
   */
  offeredPath?: string;
  beforeDispatch?(): void | Promise<void>;
  /** Decided by the Host from the caller (a person's explicit yes, S-39), never read from the input here (PMAT-48). */
  allowModelDownload?: boolean;
  onProgress?: (progress: { stage: string; progress: number }) => void;
}) {
  const home = resolveMolisWorkHome();
  let usedConnection: string | undefined;
  let usedRevision: string | undefined;
  const assertConnection = () => {
    if (!usedConnection) return;
    const active = withConnectorConnections(home, store => { const row = store.require(usedConnection!); return store.state(row) === "connected" && row.updated_at === usedRevision; });
    if (!active) throw artifactImportErrors.connection_revoked("读取期间连接已断开或改变，请重新授权后导入");
  };
  const offered = ports.offeredPath ? await offeredOriginal(home, ports.projectId, ports.offeredPath, ports.signal) : undefined;
  return importArtifactDocument(input, {
    ...ports,
    ...offered ? { offered } : {},
    async beforeSave() {
      await ports.beforeSave?.();
      ports.signal?.throwIfAborted();
      assertConnection();
    },
    async readHtml(html) {
      try { const parsed = await readMaterialHtml(html, { signal: ports.signal, timeoutMs: 12_000 }); return { title: parsed.title ?? "", content: parsed.text }; }
      catch { ports.signal?.throwIfAborted(); throw artifactImportErrors.html_invalid("无法读取这个 HTML 文件，请改用 Markdown 或 TXT 导出"); }
    },
    readFileText: file => readOriginalText(file, home, { ...ports.signal ? { signal: ports.signal } : {},
      ...ports.allowModelDownload ? { allowModelDownload: true } : {}, ...ports.onProgress ? { onProgress: ports.onProgress } : {} }),
    async readExternal(document) {
      const entry = documentImports()[document.source], service = entry?.service;
      const candidates = entry ? documentImportConnections(home).filter(row => readsWith(row, entry) && row.state === "connected") : [];
      const id = document.connection_id || (candidates.length === 1 ? candidates[0]!.connection_id : undefined);
      if (!id) throw artifactImportErrors.connection_required(candidates.length ? "该来源有多个账号，请选择要使用的连接" : "请先在连接器设置中连接所选文档工具，并授予文档读取权限");
      try { return await withConnectorRequest(home, id, ports.signal, async signal => {
        const beforeDispatch = async () => { await ports.beforeDispatch?.(); signal.throwIfAborted(); assertConnection(); };
        await beforeDispatch();
        const control = { signal, beforeEffect: beforeDispatch, current: () => { signal.throwIfAborted(); assertConnection(); } };
        let access: Awaited<ReturnType<typeof resolveApiConnection>>;
        try { access = await resolveApiConnection(home, id, control, service); }
        catch { signal.throwIfAborted(); throw artifactImportErrors.credentials_unavailable("所选连接不可用，请在连接器设置中重新授权"); }
        usedConnection = id;
        usedRevision = access.connection.updated_at;
        const read = () => readExternalDocument(document, { token: access.token, fetch: access.fetchImpl, signal, beforeDispatch,
          ...(access.connection.auth_method === "oauth" ? { tokenKind: "access_token" as const } : {}) });
        try { return { ...await read(), connection_id: id }; }
        catch (error) {
          signal.throwIfAborted();
          assertConnection();
          if (access.connection.auth_method !== "oauth" || !(error instanceof ActionError) || error.code !== "catalog_integration.needs_auth") throw error;
          await beforeDispatch();
          access = await resolveApiConnection(home, id, control, service, true);
          return { ...await read(), connection_id: id };
        }
      }); }
      catch (error) {
        ports.signal?.throwIfAborted();
        assertConnection();
        throw error;
      }
    },
  });
}

/** The offered file as the import reads it: its size now, its bytes or a copy in the 成果库's store when asked. */
async function offeredOriginal(home: string, projectId: string, path: string, signal?: AbortSignal): Promise<OfferedOriginal> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) throw documentErrors.original_not_offered("交给宿主的原文件已经不在了，请重新选择");
  return { size_bytes: info.size, read: () => readFile(path, signal ? { signal } : {}), store: () => storeArtifactOriginal(home, projectId, path, signal) };
}

/** JSON escaping can expand a 2 MB text file six-fold; the decoded file is separately bounded. */
export async function readArtifactImportBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const maxBytes = DOCUMENT_IMPORT_MAX_BYTES * 6 + 16_384;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    request.on("data", (chunk: Buffer) => {
      if (rejected) return;
      size += chunk.length;
      if (size > maxBytes) {
        rejected = true;
        chunks.length = 0;
        reject(documentErrors.too_large("导入请求过大，文件不能超过 2 MB"));
      } else chunks.push(chunk);
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
        const body: unknown = JSON.parse(raw);
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("object required");
        resolve(body as Record<string, unknown>);
      } catch { reject(artifactImportErrors.request_invalid("导入请求必须是有效的 UTF-8 JSON 对象")); }
    });
    request.on("error", reject);
    request.on("aborted", () => reject(artifactImportErrors.request_aborted("导入请求已中断，请重新尝试")));
  });
}
