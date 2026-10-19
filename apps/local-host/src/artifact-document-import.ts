import type { IncomingMessage } from "node:http";
import { extractMaterial, readMaterialHtml } from "./material-extraction.js";
import { readMaterialDocuments } from "./material-documents.js";
import { ActionError, defineErrorCodes, type ActionCallContext, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { readExternalDocument } from "@molis-ai/molis-work-integration-catalog";
import {
  ARTIFACTS_PLUGIN_ID, DOCUMENT_IMPORT_MAX_BYTES, artifactsActions, documentErrors, importArtifactDocument,
  type ArtifactDocumentImportPorts, type ArtifactFileImport, type ArtifactImportResult, type ExternalDocumentSource,
} from "@molis-ai/molis-work-plugin-artifacts";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { listConnectorConnectionViews } from "./connector-connection-views.js";
import { resolveApiConnection } from "./connector-access.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { withConnectorRequest } from "./connector-lifecycle.js";

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

const CONNECTOR_IDS: Record<ExternalDocumentSource, string> = {
  notion: "notion", feishu: "feishu", lark: "lark", "google-docs": "google-drive",
};

/** A file saved into the project's 成果库 through its own import action, as `caller`; refused where the 成果库 is off. */
export async function importThroughArtifacts(client: ActionClient, caller: ActionCallContext, input: ArtifactFileImport): Promise<ArtifactImportResult> {
  return await client.invoke(caller, { ...artifactsActions.importFile, provider_id: ARTIFACTS_PLUGIN_ID }, input) as ArtifactImportResult;
}

export function documentImportConnections(home = resolveMolisWorkHome()) {
  return listConnectorConnectionViews(home).filter(row => Object.values(CONNECTOR_IDS).includes(row.service_id)
    && !["mcp", "none"].includes(row.auth_method) && (row.auth_method !== "cli" || row.service_id === "feishu"));
}
export function documentImportConnectionStatus(): Record<string, boolean> {
  const connections = documentImportConnections();
  return Object.fromEntries(Object.entries(CONNECTOR_IDS).map(([source, connector]) => [source, connections.some(row => row.service_id === connector && row.state === "connected")]));
}

export function importLocalArtifactDocument(input: Record<string, unknown>, ports: Omit<ArtifactDocumentImportPorts, "readExternal" | "readHtml"> & {
  beforeDispatch?(): void | Promise<void>;
}) {
  const home = resolveMolisWorkHome();
  let usedConnection: string | undefined;
  let usedRevision: string | undefined;
  const assertConnection = () => {
    if (!usedConnection) return;
    const active = withConnectorConnections(home, store => { const row = store.require(usedConnection!); return store.state(row) === "connected" && row.updated_at === usedRevision; });
    if (!active) throw artifactImportErrors.connection_revoked("读取期间连接已断开或改变，请重新授权后导入");
  };
  return importArtifactDocument(input, {
    ...ports,
    async beforeSave() {
      await ports.beforeSave?.();
      ports.signal?.throwIfAborted();
      assertConnection();
    },
    async readHtml(html) {
      try { const parsed = await readMaterialHtml(html, { signal: ports.signal, timeoutMs: 12_000 }); return { title: parsed.title ?? "", content: parsed.text }; }
      catch { ports.signal?.throwIfAborted(); throw artifactImportErrors.html_invalid("无法读取这个 HTML 文件，请改用 Markdown 或 TXT 导出"); }
    },
    readFileText: file => readOriginalText(file, ports.signal),
    async readExternal(document) {
      const service = CONNECTOR_IDS[document.source];
      const candidates = documentImportConnections(home).filter(row => row.service_id === service && row.state === "connected");
      const id = document.connection_id || (candidates.length === 1 ? candidates[0]!.connection_id : undefined);
      if (!id) throw artifactImportErrors.connection_required(candidates.length ? "该来源有多个账号，请选择要使用的连接" : "请先在连接器设置中连接所选文档工具，并授予文档读取权限");
      try { return await withConnectorRequest(home, id, ports.signal, async signal => {
        const beforeDispatch = async () => { await ports.beforeDispatch?.(); signal.throwIfAborted(); assertConnection(); };
        await beforeDispatch();
        let access: Awaited<ReturnType<typeof resolveApiConnection>>;
        try { access = await resolveApiConnection(home, id, service); }
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
          access = await resolveApiConnection(home, id, service, true);
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

/**
 * The text of an original the import keeps as it is (specs/project-knowledge PMAT-14): a PDF's text layer (no recognition) and a
 * Word document's content, by the Host's extraction. A file it cannot read is still imported, with a note and no text.
 */
async function readOriginalText(file: { filename: string; data_base64: string }, signal?: AbortSignal): Promise<{ text: string; warnings: string[] } | null> {
  const extension = file.filename.toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1];
  if (extension !== "pdf" && extension !== "docx") return null;
  const source = { file_name: file.filename, bytes: Buffer.from(file.data_base64, "base64") };
  try {
    if (extension === "pdf") {
      const read = await extractMaterial(source, { ...(signal ? { signal } : {}), timeoutMs: 60_000, pdfMode: "text", textFormat: "markdown" });
      const thin = read.coverage.status !== "sufficient" ? ["PDF 里只读出了部分文字（扫描页没有文字层）；原件完整保存。"] : [];
      return { text: read.text, warnings: read.text.trim() ? thin : ["这份 PDF 没有可读的文字层，只保存了原件。"] };
    }
    const batch = await readMaterialDocuments([source], { ...(signal ? { signal } : {}), timeoutMs: 60_000 });
    return { text: batch.documents.map(document => document.content).join("\n\n"), warnings: batch.warnings };
  } catch {
    signal?.throwIfAborted();
    return { text: "", warnings: ["没能读出这个文件的正文，只保存了原件。"] };
  }
}
