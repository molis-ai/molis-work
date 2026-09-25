import type { IncomingMessage } from "node:http";
import { documentTitle, htmlToMarkdown } from "@molis-ai/molis-work-module-shelf";
import { ExternalDocumentImportError, readExternalDocument } from "@molis-ai/molis-work-integration-catalog";
import {
  ArtifactImportError, DOCUMENT_IMPORT_MAX_BYTES, importArtifactDocument,
  type ArtifactDocumentImportPorts, type ExternalDocumentSource,
} from "@molis-ai/molis-work-plugin-artifacts";
import { connectorCredentialStatus, resolveConnectorToken } from "./connector-credentials.js";
import { feishuCliFetch, feishuCliMarker } from "./feishu-cli.js";
import { resolveUsableNotionToken } from "./notion-oauth.js";

const CONNECTOR_IDS: Record<ExternalDocumentSource, string> = {
  notion: "notion", feishu: "feishu", lark: "lark", "google-docs": "google-drive",
};

export function documentImportConnectionStatus(): Record<string, boolean> {
  return Object.fromEntries(Object.entries(CONNECTOR_IDS).map(([source, connector]) => [source, connectorCredentialStatus(connector).bound]));
}

export function importLocalArtifactDocument(input: Record<string, unknown>, ports: Omit<ArtifactDocumentImportPorts, "readExternal" | "readHtml">) {
  return importArtifactDocument(input, {
    ...ports,
    readHtml(html) {
      try { return { title: documentTitle(html), content: htmlToMarkdown(html) }; }
      catch { throw new ArtifactImportError(422, "document.html_invalid", "无法读取这个 HTML 文件，请改用 Markdown 或 TXT 导出"); }
    },
    async readExternal(document) {
      let token: string | null;
      try { token = document.source === "notion" ? await resolveUsableNotionToken() : resolveConnectorToken(CONNECTOR_IDS[document.source]); }
      catch { throw new ArtifactImportError(422, "document.credentials_unavailable", "无法读取连接器凭据，请在连接器设置中重新连接"); }
      if (!token) throw new ArtifactImportError(422, "document.connection_required", "请先在连接器设置中连接所选文档工具，并授予文档读取权限");
      const fetch = document.source === "feishu" && token === feishuCliMarker() ? feishuCliFetch : undefined;
      try { return await readExternalDocument(document, { token, fetch }); }
      catch (error) {
        if (document.source !== "notion" || !(error instanceof ExternalDocumentImportError) || error.code !== "needs_auth") throw error;
        const renewed = await resolveUsableNotionToken(true);
        if (!renewed) throw error;
        return readExternalDocument(document, { token: renewed });
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
