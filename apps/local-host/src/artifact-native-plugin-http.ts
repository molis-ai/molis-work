import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  ArtifactBrowserError, ArtifactImportError, DOCUMENT_ARTIFACT_TYPE, matchArtifactBrowserRoute, artifactsActions, artifactVersionPath,
  EXTERNAL_DOCUMENT_SOURCES, type ArtifactFileImport, type ArtifactExternalImport, type GoalArtifactEmbed,
} from "@molis-ai/molis-work-plugin-artifacts";
import { ExternalDocumentImportError } from "@molis-ai/molis-work-integration-catalog";
import { artifactWorkbench, renderArtifactImportPage } from "@molis-ai/molis-work-app-workbench";
import { codingReportPreview } from "@molis-ai/molis-work-plugin-coding";
import { renderFeedRichText } from "@molis-ai/molis-work-plugin-feed";
import { dateTimeLocale, htmlLang, L } from "./web-locale.js";
import { requestHeader, sendLocalWebJson } from "./web-http.js";
import { readArtifactImportBody } from "./artifact-document-import.js";

export interface ArtifactHttpContext {
  readonly boardId: string;
  readonly routePrefix: string;
  readonly projectTitle: string;
  readonly actions: BoundActionClient;
  readonly controlToken: string;
  readonly desktopShell: boolean;
  readonly pageCsp: string;
}

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const primitives = { escape, text: (value: string) => escape(L(value)), formatDate: (value: string) => new Date(value).toLocaleString(dateTimeLocale()) };

export function renderGoalArtifactContext(embeds: GoalArtifactEmbed[]): string {
  // The containing Goal fragment applies its Project prefix once to every local link.
  return artifactWorkbench.goalContext(embeds, { routePrefix: "", primitives });
}

/** HTTP composition only: Artifact application owns routing and exact-version reads. */
export function createLocalArtifactHttp(ports: { nativeDesktopBootstrapScript: string }) {
  return async function handleArtifactNativePluginHttp(
    request: IncomingMessage, response: ServerResponse, pathname: string, context: ArtifactHttpContext,
  ): Promise<boolean> {
    try {
      if (pathname === "/api/artifacts/import" && request.method === "POST") {
        const input = await readArtifactImportBody(request);
        // Preserve the established HTTP wire errors; the shared action contract
        // still validates the complete input before any business operation.
        if (input.source !== "file" && !EXTERNAL_DOCUMENT_SOURCES.includes(input.source as ArtifactExternalImport["source"])) {
          throw new ArtifactImportError(400, "document.source_invalid", "请选择支持的文档来源");
        }
        if (input.source === "file" && typeof input.content !== "string") {
          throw new ArtifactImportError(400, "document.content_invalid", "文件必须是 UTF-8 文本");
        }
        const saved = input.source === "file"
          ? await context.actions.invoke(artifactsActions.importFile, input as unknown as ArtifactFileImport)
          : await context.actions.invoke(artifactsActions.importExternal, input as unknown as ArtifactExternalImport);
        const result = { ...saved, url: context.routePrefix + artifactVersionPath(saved) };
        sendLocalWebJson(response, result.reused ? 200 : 201, { ...result, warnings: result.warnings.map(warning => L(warning)) });
        return true;
      }
      if (request.method !== "GET") return false;
      if (pathname === "/artifacts/import") {
        const available = await context.actions.invoke(artifactsActions.importSources, {});
        const html = renderArtifactImportPage({
          ...context, connectionStatus: available.sources, connections: available.connections,
          lang: htmlLang(), nativeDesktopBootstrapScript: ports.nativeDesktopBootstrapScript, primitives,
        });
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": context.pageCsp });
        response.end(html);
        return true;
      }
      const route = matchArtifactBrowserRoute(pathname);
      if (!route) return false;
      if (route.kind === "export") {
        const exported = await context.actions.invoke(artifactsActions.export, { reference: route.reference });
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "content-disposition": `attachment; filename="artifact-v${route.reference.version}.json"`,
        });
        response.end(exported.content);
        return true;
      }
      const view = await context.actions.invoke(artifactsActions.browser, { reference: route.reference,
        supported_types: [{ artifact_type_id: DOCUMENT_ARTIFACT_TYPE, schema_version: 1 }] });
      // Read first, so a disabled or forbidden 成果 surface answers as before. A direct visit (address bar, refresh, a link
      // from elsewhere) then opens the workbench on the 成果 surface and, for a version, that version; only the workbench's
      // own fragment requests get the surface's HTML.
      if (!requestHeader(request, "x-molis-work-fragment")) {
        const target = new URLSearchParams({ openPlugin: "artifacts" });
        if (route.kind === "detail") target.set("openItem", context.routePrefix + pathname);
        response.writeHead(302, { location: `${context.routePrefix}/?${target}`, "cache-control": "no-store" });
        response.end();
        return true;
      }
      // Coding's change sets are process items now, never in the 成果库; only its run report shows here.
      const report = codingReportPreview(view.selected);
      const presentation = report ? { body_html: renderFeedRichText(report.body_markdown),
        source_href: `${context.routePrefix}/?openPlugin=coding&openItem=${encodeURIComponent(report.reference.artifact_id)}&openTitle=${encodeURIComponent(report.title)}`,
        source_label: "在 Coding 打开原报告与会话", plugin_id: "coding", item_id: report.reference.artifact_id } : undefined;
      const compact = requestHeader(request, "x-molis-work-fragment") === "frame-block";
      response.writeHead(view.requested && !view.selected ? 404 : 200, {
        "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "vary": "x-molis-work-fragment",
      });
      response.end(artifactWorkbench.fragments({ view, routePrefix: context.routePrefix, primitives, presentation }, compact ? "frame-block" : "detail"));
      return true;
    } catch (error) {
      if (error instanceof ActionError) {
        sendLocalWebJson(response, error.code === "actions.forbidden" ? 403 : ["actions.missing", "actions.plugin_disabled"].includes(error.code) ? 404 : 400, { error: L(error.message), code: error.code });
        return true;
      }
      if (error instanceof ArtifactImportError || error instanceof ExternalDocumentImportError) {
        sendLocalWebJson(response, error.status, { error: L(error.message), code: error.code });
        return true;
      }
      if (!(error instanceof ArtifactBrowserError)) throw error;
      response.writeHead(error.status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: L(error.message) }));
      return true;
    }
  };
}
