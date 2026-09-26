import type { IncomingMessage } from "node:http";
import { documentTitle, htmlToMarkdown } from "@molis-ai/molis-work-module-shelf";
import { ExternalDocumentImportError, readExternalDocument } from "@molis-ai/molis-work-integration-catalog";
import {
  ArtifactImportError, DOCUMENT_IMPORT_MAX_BYTES, importArtifactDocument,
  type ArtifactDocumentImportPorts, type ExternalDocumentSource,
} from "@molis-ai/molis-work-plugin-artifacts";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { listConnectorConnectionViews } from "./web-connector-connections.js";
import { resolveApiConnection } from "./connector-access.js";
import { withConnectorConnections } from "./connector-connection-store.js";

const CONNECTOR_IDS: Record<ExternalDocumentSource, string> = {
  notion: "notion", feishu: "feishu", lark: "lark", "google-docs": "google-drive",
};

export function documentImportConnections(home = resolveMolisWorkHome()) {
  return listConnectorConnectionViews(home).filter(row => Object.values(CONNECTOR_IDS).includes(row.service_id)
    && !["mcp", "none"].includes(row.auth_method) && (row.auth_method !== "cli" || row.service_id === "feishu"));
}
export function documentImportConnectionStatus(): Record<string, boolean> {
  const connections = documentImportConnections();
  return Object.fromEntries(Object.entries(CONNECTOR_IDS).map(([source, connector]) => [source, connections.some(row => row.service_id === connector && row.state === "connected")]));
}

export function importLocalArtifactDocument(input: Record<string, unknown>, ports: Omit<ArtifactDocumentImportPorts, "readExternal" | "readHtml">) {
  const home = resolveMolisWorkHome();
  let usedConnection: string | undefined;
  let usedRevision: string | undefined;
  return importArtifactDocument(input, {
    ...ports,
    async beforeSave() {
      if (usedConnection) {
        const active = withConnectorConnections(home, store => { const row = store.require(usedConnection!); return store.state(row) === "connected" && row.updated_at === usedRevision; });
        if (!active) throw new ArtifactImportError(422, "document.connection_revoked", "读取期间连接已断开，请重新授权后导入");
      }
      await ports.beforeSave?.();
    },
    readHtml(html) {
      try { return { title: documentTitle(html), content: htmlToMarkdown(html) }; }
      catch { throw new ArtifactImportError(422, "document.html_invalid", "无法读取这个 HTML 文件，请改用 Markdown 或 TXT 导出"); }
    },
    async readExternal(document) {
      const service = CONNECTOR_IDS[document.source];
      const candidates = documentImportConnections(home).filter(row => row.service_id === service && row.state === "connected");
      const id = document.connection_id || (candidates.length === 1 ? candidates[0]!.connection_id : undefined);
      if (!id) throw new ArtifactImportError(422, "document.connection_required", candidates.length ? "该来源有多个账号，请选择要使用的连接" : "请先在连接器设置中连接所选文档工具，并授予文档读取权限");
      let access: Awaited<ReturnType<typeof resolveApiConnection>>;
      try { access = await resolveApiConnection(home, id, service); }
      catch { throw new ArtifactImportError(422, "document.credentials_unavailable", "所选连接不可用，请在连接器设置中重新授权"); }
      usedConnection = id;
      usedRevision = access.connection.updated_at;
      const read = () => readExternalDocument(document, { token: access.token, fetch: access.fetchImpl,
        ...(access.connection.auth_method === "oauth" ? { tokenKind: "access_token" as const } : {}) });
      try { return { ...await read(), connection_id: id }; }
      catch (error) {
        if (access.connection.auth_method !== "oauth" || !(error instanceof ExternalDocumentImportError) || error.code !== "needs_auth") throw error;
        access = await resolveApiConnection(home, id, service, true);
        return { ...await read(), connection_id: id };
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
        reject(new ArtifactImportError(413, "document.too_large", "导入请求过大，文件不能超过 2 MB"));
      } else chunks.push(chunk);
    });
    request.on("end", () => {
      if (rejected) return;
      try {
        const raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
        const body: unknown = JSON.parse(raw);
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("object required");
        resolve(body as Record<string, unknown>);
      } catch { reject(new ArtifactImportError(400, "document.request_invalid", "导入请求必须是有效的 UTF-8 JSON 对象")); }
    });
    request.on("error", reject);
    request.on("aborted", () => reject(new ArtifactImportError(400, "document.request_aborted", "导入请求已中断，请重新尝试")));
  });
}
