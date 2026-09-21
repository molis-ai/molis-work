import type { IncomingMessage, ServerResponse } from "node:http";
import type { ArtifactsQueryApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ContextLedgerApi } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import {
  ArtifactBrowserError, exportArtifactVersion, matchArtifactBrowserRoute, readArtifactBrowser, readGoalArtifactEmbeds,
} from "@molis-ai/molis-work-plugin-artifacts";
import { artifactWorkbench, renderArtifactWorkbenchPage } from "@molis-ai/molis-work-app-workbench";
import { codingReportPreview } from "@molis-ai/molis-work-plugin-coding";
import { renderFeedRichText } from "@molis-ai/molis-work-plugin-feed";
import { dateTimeLocale, htmlLang, L } from "./web-locale.js";
import { requestHeader } from "./web-http.js";

export interface ArtifactHttpContext {
  readonly boardId: string;
  readonly routePrefix: string;
  readonly projectTitle: string;
  readonly query: ArtifactsQueryApi;
  readonly desktopShell: boolean;
  readonly pageCsp: string;
}

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const primitives = { escape, text: (value: string) => escape(L(value)), formatDate: (value: string) => new Date(value).toLocaleString(dateTimeLocale()) };

export function renderGoalArtifactContext(input: {
  boardId: string; goalId: string; ledger: ContextLedgerApi["query"]; artifacts: ArtifactsQueryApi;
}): string {
  // The containing Goal fragment applies its Project prefix once to every local link.
  return artifactWorkbench.goalContext(readGoalArtifactEmbeds(input), { routePrefix: "", primitives });
}

/** HTTP composition only: Artifact application owns routing and exact-version reads. */
export function createLocalArtifactHttp(ports: { nativeDesktopBootstrapScript: string }) {
  return function handleArtifactNativePluginHttp(
    request: IncomingMessage, response: ServerResponse, pathname: string, context: ArtifactHttpContext,
  ): boolean {
    if (request.method !== "GET") return false;
    try {
      const route = matchArtifactBrowserRoute(pathname);
      if (!route) return false;
      if (route.kind === "export") {
        const content = exportArtifactVersion(context.query, context.boardId, route.reference);
        response.writeHead(200, {
          "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "content-disposition": `attachment; filename="artifact-v${route.reference.version}.json"`,
        });
        response.end(content);
        return true;
      }
      const view = readArtifactBrowser(context.query, context.boardId, route.reference);
      const report = codingReportPreview(view.selected);
      const presentation = report ? { body_html: renderFeedRichText(report.body_markdown),
        source_href: `${context.routePrefix}/?openPlugin=coding&openItem=${encodeURIComponent(report.reference.artifact_id)}&openTitle=${encodeURIComponent(report.title)}`,
        source_label: "在 Coding 打开原报告与会话", plugin_id: "coding", item_id: report.reference.artifact_id } : undefined;
      const fragment = requestHeader(request, "x-molis-work-fragment");
      if (fragment === "artifact-workbench" || fragment === "frame-block") {
        const compact = fragment === "frame-block";
        response.writeHead(view.requested && !view.selected ? 404 : 200, {
          "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "vary": "x-molis-work-fragment",
        });
        response.end(artifactWorkbench.fragments({ view, routePrefix: context.routePrefix, primitives, presentation }, compact ? "frame-block" : "detail"));
        return true;
      }
      const html = renderArtifactWorkbenchPage({
        view, routePrefix: context.routePrefix, projectTitle: context.projectTitle,
        lang: htmlLang(), desktopShell: context.desktopShell,
        nativeDesktopBootstrapScript: ports.nativeDesktopBootstrapScript,
        primitives, presentation,
      });
      response.writeHead(view.requested && !view.selected ? 404 : 200, {
        "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
        "content-security-policy": context.pageCsp,
      });
      response.end(html);
      return true;
    } catch (error) {
      if (!(error instanceof ArtifactBrowserError)) throw error;
      response.writeHead(error.status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify({ error: L(error.message) }));
      return true;
    }
  };
}
