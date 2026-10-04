import type { IncomingMessage, ServerResponse } from "node:http";
import { PAGES_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/pages";
import { PAGES_READABLE_FILE } from "@molis-ai/molis-work-plugin-pages";
import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  ArtifactBrowserError, ArtifactImportError, DOCUMENT_ARTIFACT_TYPE, matchArtifactBrowserRoute, artifactsActions, artifactVersionPath, importedFileOf,
  EXTERNAL_DOCUMENT_SOURCES, type ArtifactFileImport, type ArtifactExternalImport, type GoalArtifactEmbed,
} from "@molis-ai/molis-work-plugin-artifacts";
import { ExternalDocumentImportError } from "@molis-ai/molis-work-integration-catalog";
import { artifactWorkbench, artifactTypeDeclarations, artifactContinuers, artifactReferrerActions, BUILTIN_PLUGIN_CATALOG, type ArtifactTypeDeclaration } from "@molis-ai/molis-work-app-workbench";
import { renderFilePreviewHtml } from "@molis-ai/molis-work-design-system";
import { importedDocumentFile, type ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ArtifactCompareResult, ArtifactContinueResult, ArtifactReferrersResult, FileContent } from "@molis-ai/molis-work-contracts/platform/actions";
import { dateTimeLocale, L } from "./web-locale.js";
import { requestHeader, sendLocalWebJson } from "./web-http.js";
import { readArtifactImportBody } from "./artifact-document-import.js";

export interface ArtifactHttpContext {
  readonly boardId: string;
  readonly routePrefix: string;
  readonly projectTitle: string;
  readonly actions: BoundActionClient;
  /** A type owner's actions, bound with the permissions its preview declares (A4). */
  readonly ownerActions?: (permissions: readonly string[]) => BoundActionClient;
  readonly controlToken: string;
  readonly desktopShell: boolean;
  readonly pageCsp: string;
}

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

const primitives = { escape, text: (value: string) => escape(L(value)), formatDate: (value: string) => new Date(value).toLocaleString(dateTimeLocale()) };

/**
 * The owner's preview of a 成果 version (specs/artifact-positioning A4): the type's declared preview action turns the
 * version into a file, rendered read-only, with a way back to the pinned work object in its owner.
 */
async function ownerPreview(artifact: ArtifactVersionRecord | null, declarations: ReadonlyMap<string, ArtifactTypeDeclaration>, context: ArtifactHttpContext) {
  const declaration = artifact ? declarations.get(artifact.artifact_type_id) : undefined;
  // Only the type's declared owner previews it, and only versions that owner produced.
  if (!artifact || artifact.availability !== "available" || !declaration?.preview || !context.ownerActions
    || artifact.producer_plugin_id !== declaration.plugin_id) return undefined;
  let content: FileContent;
  try { content = await context.ownerActions(declaration.preview.action.permissions).invoke(declaration.preview, { artifact }) as FileContent; }
  catch { return undefined; }
  const pinned = artifact.origin.kind === "pinned" ? artifact.origin.subject : null;
  // 「原文已改」 (A4b): the owner compares the version with its work object as it is now.
  let compared: ArtifactCompareResult["state"] | null = null;
  if (pinned && declaration.compare) {
    try { compared = (await context.ownerActions(declaration.compare.action.permissions).invoke(declaration.compare, { artifact }) as ArtifactCompareResult).state; }
    catch { compared = null; }
  }
  const notice = artifact.origin.kind === "imported" ? "这是导入时保存的版本；原文后续修改不会自动同步。"
    : compared === "changed" ? "原文已改，这里仍是第 {version} 版。" : compared === "missing" ? "原对象已经删除，这里仍保留第 {version} 版。" : undefined;
  return { body_html: renderFilePreviewHtml(content, primitives), ...(notice ? { notice } : {}),
    source_href: pinned && compared !== "missing" ? `${context.routePrefix}/?openPlugin=${encodeURIComponent(declaration.surface)}&openItem=${encodeURIComponent(pinned.id)}&openTitle=${encodeURIComponent(artifact.title)}` : "",
    source_label: pinned ? `在${/^[\x20-\x7e]+$/u.test(declaration.plugin_title) ? ` ${declaration.plugin_title} ` : declaration.plugin_title}打开原对象` : "",
    plugin_id: declaration.surface, item_id: pinned?.id ?? "" };
}

/** Every 成果 type a built-in plugin declares, as consumers name types (id and schema version). */
export function declaredArtifactTypes(): Array<{ artifact_type_id: string; schema_version: number }> {
  return BUILTIN_PLUGIN_CATALOG.flatMap(entry => entry.manifest.artifacts.produces.map(type => ({ artifact_type_id: type.artifact_type_id, schema_version: type.schema_version })));
}

export function renderGoalArtifactContext(embeds: GoalArtifactEmbed[]): string {
  // The containing Goal fragment applies its Project prefix once to every local link; types are named as their owners declare.
  return artifactWorkbench.goalContext(embeds, { routePrefix: "", primitives,
    typeTitles: Object.fromEntries([...artifactTypeDeclarations()].map(([type, declaration]) => [type, declaration.title])) });
}

/** HTTP composition only: Artifact application owns routing and exact-version reads. */
export function createLocalArtifactHttp() {
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
        if (input.source === "file" && typeof input.content !== "string" && input.original_file === undefined) {
          throw new ArtifactImportError(400, "document.content_invalid", "请选择要导入的文件");
        }
        const saved = input.source === "file"
          ? await context.actions.invoke(artifactsActions.importFile, input as unknown as ArtifactFileImport)
          : await context.actions.invoke(artifactsActions.importExternal, input as unknown as ArtifactExternalImport);
        const result = { ...saved, url: context.routePrefix + artifactVersionPath(saved) };
        sendLocalWebJson(response, result.reused ? 200 : 201, { ...result, warnings: result.warnings.map(warning => L(warning)) });
        return true;
      }
      if (pathname === "/api/artifacts/continue" && request.method === "POST") {
        // 「从这一版继续」 (A4b): the chosen plugin starts a new object from this version, with its own permissions.
        const body = await readArtifactImportBody(request) as { reference?: { artifact_id?: unknown; version?: unknown }; plugin_id?: unknown };
        const reference = { artifact_id: String(body.reference?.artifact_id ?? ""), version: Number(body.reference?.version) };
        const view = await context.actions.invoke(artifactsActions.read, { reference });
        const continuer = view.selected ? artifactContinuers().get(view.selected.artifact_type_id)?.find(item => item.plugin_id === body.plugin_id) : undefined;
        if (!view.selected || !continuer || !context.ownerActions) { sendLocalWebJson(response, 400, { error: L("这一版不能在这个插件里继续") }); return true; }
        const result = await context.ownerActions(continuer.action.action.permissions).invoke(continuer.action, { artifact: view.selected }) as ArtifactContinueResult;
        sendLocalWebJson(response, 201, result);
        return true;
      }
      if (pathname === "/api/artifacts/plugin-inputs" && request.method === "POST") {
        // 「交给插件作为输入」 (artifact-positioning, 2026-10-04): the person gives a plugin input port this version, or puts back its source.
        const body = await readArtifactImportBody(request) as { reference?: { artifact_id?: unknown; version?: unknown }; plugin_id?: unknown; port?: unknown; restore?: unknown };
        const result = await context.actions.invoke(artifactsActions.bindPluginInput, { reference: { artifact_id: String(body.reference?.artifact_id ?? ""), version: Number(body.reference?.version) },
          plugin_id: String(body.plugin_id ?? ""), port: String(body.port ?? ""), restore: body.restore === true });
        sendLocalWebJson(response, 200, result);
        return true;
      }
      if (request.method !== "GET") return false;
      if (pathname === "/api/artifacts/versions") {
        // What a Goal can hand in (A5): the latest available version of each 成果, named as its owner declares the type.
        const view = await context.actions.invoke(artifactsActions.browser, { reference: null });
        const declarations = artifactTypeDeclarations(), latest = new Map<string, ArtifactVersionRecord>();
        for (const version of view.versions) {
          if (version.lifecycle_state !== "active" || version.availability !== "available") continue;
          const current = latest.get(version.artifact_id);
          if (!current || version.version > current.version) latest.set(version.artifact_id, version);
        }
        sendLocalWebJson(response, 200, { versions: [...latest.values()].map(version => ({ reference: { artifact_id: version.artifact_id, version: version.version },
          title: version.title, type_title: declarations.get(version.artifact_type_id)?.title ?? version.artifact_type_id, created_at: version.created_at })) });
        return true;
      }
      const route = matchArtifactBrowserRoute(pathname);
      if (!route) return false;
      if (route.kind === "file") {
        // A download (S7 exception list): an imported version's original file, or the text it was read into (A3).
        const view = await context.actions.invoke(artifactsActions.browser, { reference: route.reference,
          supported_types: [{ artifact_type_id: DOCUMENT_ARTIFACT_TYPE, schema_version: 1 }] });
        const file = importedFileOf(view.selected);
        if (!file) { sendLocalWebJson(response, 404, { error: L("这个版本没有可取回的文件") }); return true; }
        response.writeHead(200, { "content-type": file.mime, "cache-control": "no-store", "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; sandbox",
          "content-disposition": `${file.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}` });
        response.end(file.bytes);
        return true;
      }
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
        if (route.kind === "detail") { target.set("openItem", context.routePrefix + pathname); if (view.selected) target.set("openTitle", view.selected.title); }
        response.writeHead(302, { location: `${context.routePrefix}/?${target}`, "cache-control": "no-store" });
        response.end();
        return true;
      }
      const declarations = artifactTypeDeclarations();
      const presentation = await ownerPreview(view.selected, declarations, context);
      // 「从这一版继续」 (A4b): who declares it for this type; Pages only for an imported file it can read.
      const selected = view.selected, file = importedDocumentFile(selected);
      const continuers = selected && selected.availability === "available" && selected.lifecycle_state !== "archived" ? (artifactContinuers().get(selected.artifact_type_id) ?? [])
        .filter(item => !file || item.plugin_id !== PAGES_PLUGIN_ID || PAGES_READABLE_FILE.test(file.filename)).map(item => ({ plugin_id: item.plugin_id, plugin_title: item.plugin_title })) : [];
      const reference = view.selected ? { artifact_id: view.selected.artifact_id, version: view.selected.version } : null;
      const goals = reference && route.kind === "detail" ? await context.actions.invoke(artifactsActions.links, { reference }) : undefined;
      // Documents and other objects that link to this version (五.1), each answered by its own plugin; one that cannot answer is left out.
      const referrers = goals && reference && context.ownerActions ? (await Promise.all(artifactReferrerActions().map(item => context.ownerActions!(item.action.action.permissions)
        .invoke(item.action, { reference }).then(result => (result as ArtifactReferrersResult).referrers.map(row => ({ ...row, plugin_title: item.plugin_title }))).catch(() => [])))).flat() : [];
      const links = goals ? { ...goals, referrers } : undefined;
      // 「交给插件作为输入」 (2026-10-04): the input ports of running plugins that take a usable version's type.
      const pluginInputs = reference && route.kind === "detail" && selected?.availability === "available" && selected.lifecycle_state !== "archived"
        ? (await context.actions.invoke(artifactsActions.pluginInputs, { reference }).catch(() => ({ inputs: [] }))).inputs : [];
      const compact = requestHeader(request, "x-molis-work-fragment") === "frame-block";
      response.writeHead(view.requested && !view.selected ? 404 : 200, {
        "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "vary": "x-molis-work-fragment",
      });
      // The directory carries the 成果库's one import entry (A3); its dialog needs the connected document services.
      const available = compact ? null : await context.actions.invoke(artifactsActions.importSources, {});
      response.end(artifactWorkbench.fragments({ view, routePrefix: context.routePrefix, primitives, presentation, ...(links ? { links } : {}), continuers, pluginInputs,
        typeTitles: Object.fromEntries([...declarations].map(([type, declaration]) => [type, declaration.title])),
        ...(available ? { importForm: { connectionStatus: available.sources, connections: available.connections } } : {}) }, compact ? "frame-block" : "detail"));
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
