import { format, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { logPreviewFailure } from "./host-log.js";
import { objectLinkAt, type BoundActionClient, type HostOfferedOriginalFile } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import {
  ARTIFACTS_PLUGIN_ID, artifactsErrors, documentErrors, matchArtifactBrowserRoute, artifactsActions, artifactVersionPath, importedFileOf, openArtifactOriginal,
  EXTERNAL_DOCUMENT_SOURCES, type ArtifactFileImport, type ArtifactImportResult, type ArtifactExternalImport, type GoalArtifactEmbed,
} from "@molis-ai/molis-work-module-artifacts";
import { artifactWorkbench } from "@molis-ai/molis-work-app-workbench";
import { artifactTypeDeclarations, artifactContinuers, artifactReferrerActions, continuerReadsFile, type ArtifactTypeDeclaration } from "./artifact-type-registry.js";
import { renderFilePreviewHtml } from "@molis-ai/molis-work-design-system";
import { IMPORTED_DOCUMENT_READ_TYPES, IMPORTED_DOCUMENT_TYPE, importedDocumentFile, isImportedDocumentVersion, type ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ActionProgressEvent, ArtifactCompareResult, ArtifactContinueResult, ArtifactReferrersResult, FileContent } from "@molis-ai/molis-work-contracts/platform/actions";
import { currentLocale, inLanguagePreview } from "./web-locale.js";
import { importedDocumentWarnings, type ReadArtifactDisplay } from "./artifact-display-words.js";
import { requestHeader, sendLocalWebJson } from "./web-http.js";
import { readArtifactImportBody } from "./artifact-document-import.js";
import { responseAbortSignal } from "./web-entry-actions.js";
import { answerPluginRouteStream } from "./plugin-route-stream.js";
import { executorProviders, unavailableReason } from "./assistant/assistant-executor.js";
import { builtinPluginByManifestId } from "./plugin-registry.js";

export interface ArtifactHttpContext {
  readonly projectId: string;
  readonly routePrefix: string;
  readonly projectTitle: string;
  readonly actions: BoundActionClient;
  readonly homeDirectory: string;
  /** The person's 成果库 actions for one import that comes with a file the Host received (`ActionCallContext.original_file`). */
  readonly offeredActions: (file: HostOfferedOriginalFile) => BoundActionClient;
  /** A type owner's actions, bound with the permissions its preview declares (A4). */
  readonly ownerActions?: (permissions: readonly string[]) => BoundActionClient;
  /** Optional override for whether an input-target plugin is available; when omitted, discovered from active `placement_relation` actions. */
  readonly inputTargetAvailable?: () => Promise<boolean>;
  readonly readArtifactDisplay: ReadArtifactDisplay;
  readonly controlToken: string;
  readonly desktopShell: boolean;
  readonly pageCsp: string;
}

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

/** The platform's own pages and answers use the Workbench's current dictionary. */
const primitives = { escape, text: (value: string) => escape(uiText.text(value)), formatDate: (value: string) => format.date(value, "datetime-with-seconds") };

function continuersFor(version: ArtifactVersionRecord | null) {
  if (!version || version.availability !== "available" || version.lifecycle_state === "archived") return [];
  if (version.artifact_type_id !== IMPORTED_DOCUMENT_TYPE) return artifactContinuers(version);
  const file = importedDocumentFile(version);
  return file ? artifactContinuers(version).filter(item => continuerReadsFile(item, file)) : [];
}

function assertSupportedImportVersion(version: ArtifactVersionRecord | null): void {
  if (version?.artifact_type_id === IMPORTED_DOCUMENT_TYPE && !isImportedDocumentVersion(version)) {
    throw documentErrors.unsupported_version(uiText.text("workbench.browser-ui.import-version-unsupported"));
  }
}

/**
 * The owner's preview of a 成果 version (specs/artifact-positioning A4): the type's declared preview action turns the
 * version into a file, rendered read-only, with a way back to the pinned work object in its owner.
 */
async function ownerPreview(artifact: ArtifactVersionRecord | null, declarations: ReadonlyMap<string, ArtifactTypeDeclaration>,
  pluginTitle: string | undefined, context: ArtifactHttpContext, languagePreview: boolean) {
  const declaration = artifact ? declarations.get(artifact.artifact_type_id) : undefined;
  // Only the type's declared owner previews it, and only versions that owner produced.
  if (!artifact || artifact.availability !== "available" || !declaration?.preview || !context.ownerActions
    || artifact.producer_plugin_id !== declaration.plugin_id) return undefined;
  let content: FileContent;
  try { content = await context.ownerActions(declaration.preview.action.permissions).invoke(declaration.preview, { artifact }) as FileContent; }
  catch (error) { logPreviewFailure(error, artifact.artifact_type_id); return undefined; }
  const pinned = artifact.origin.kind === "pinned" ? artifact.origin.subject : null;
  // 「原文已改」 (A4b): the owner compares the version with its work object as it is now.
  let compared: ArtifactCompareResult["state"] | null = null;
  if (pinned && declaration.compare) {
    try { compared = (await context.ownerActions(declaration.compare.action.permissions).invoke(declaration.compare, { artifact }) as ArtifactCompareResult).state; }
    catch { compared = null; }
  }
  const version = { version: artifact.version };
  const notice = artifact.origin.kind === "imported" ? uiText.text("workbench.browser-ui.imported-version-notice")
    : compared === "changed" ? uiText.text("workbench.browser-ui.original-changed-notice", version)
      : compared === "moved" ? uiText.text("workbench.browser-ui.original-moved-notice", version)
        : compared === "missing" ? uiText.text("workbench.browser-ui.original-deleted-notice", version) : undefined;
  // A moved object is not in this project to open; only an object that is here gets the way back.
  return { body_html: languagePreview ? "" : renderFilePreviewHtml(content, primitives), ...(notice ? { notice } : {}),
    source_href: pinned && compared !== "missing" && compared !== "moved" ? objectLinkAt(context.routePrefix, { surface: declaration.surface, id: pinned.id, title: artifact.title }) : "",
    source_label: pinned ? uiText.text("workbench.browser-ui.open-original-in-plugin", { plugin: pluginTitle ?? artifact.producer_plugin_id }) : "",
    plugin_id: declaration.surface, item_id: pinned?.id ?? "" };
}

export async function renderProjectArtifactContext(embeds: GoalArtifactEmbed[], readArtifactDisplay: ReadArtifactDisplay): Promise<string> {
  // The containing Goal fragment applies its Project prefix once to every local link; types are named as their owners declare.
  const words = await readArtifactDisplay(embeds.flatMap(({ view }) => view.selected ? [view.selected] : []));
  return artifactWorkbench.goalContext(embeds, { routePrefix: "", primitives, importedDocumentWarnings, typeTitle: version => words(version)?.title });
}

/** The name the page sends with a raw original (percent-encoded UTF-8): one file name, no path. */
function offeredFilename(raw: string | undefined): string {
  let name = "";
  try { name = decodeURIComponent(raw ?? "").trim(); } catch { name = ""; }
  if (!name || name.length > 255 || /[\\/\u0000-\u001f]/u.test(name)) throw documentErrors.filename_invalid("文件名无效");
  return name;
}

/**
 * A file of any size, sent as the raw body (the person chose it in the page): the Host keeps it in its own temporary file and offers
 * that one to the 成果库's import, which keeps it inline up to 6 MB and in its store above (onboarding limits, 2026-10-22).
 */
async function importRawOriginal(request: IncomingMessage, response: ServerResponse, context: ArtifactHttpContext): Promise<void> {
  const stop = new AbortController();
  const signal = AbortSignal.any([responseAbortSignal(response), stop.signal]);
  const control = { signal, beforeEffect: async () => signal.throwIfAborted() };
  const filename = offeredFilename(requestHeader(request, "x-molis-work-filename"));
  const mime = (requestHeader(request, "content-type") ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase() || "application/octet-stream";
  const directory = await mkdtemp(join(tmpdir(), "molis-artifact-original-"));
  try {
    const path = join(directory, "original");
    await pipeline(request, createWriteStream(path, { flags: "wx" }));
    const input: ArtifactFileImport = { source: "file", filename, original_file: { filename, mime },
      ...new URL(request.url ?? "/", "http://host").searchParams.get("allow_model_download") === "true" ? { allow_model_download: true } : {} };
    const answer = async (on_progress?: (event: ActionProgressEvent) => void) => {
      const saved = await context.offeredActions({ path, install_id: ARTIFACTS_PLUGIN_ID }).invoke(artifactsActions.importFile, input, control, on_progress ? { on_progress } : undefined);
      return { status: saved.reused ? 200 : 201, body: { ...saved, url: context.routePrefix + artifactVersionPath(saved) } };
    };
    if (requestHeader(request, "accept")?.includes("application/x-ndjson")) await answerPluginRouteStream(response, emit => answer(emit), () => stop.abort());
    else { const result = await answer(); sendLocalWebJson(response, result.status, result.body); }
  } finally { await rm(directory, { recursive: true, force: true }); }
}

async function importArtifactJson(request: IncomingMessage, response: ServerResponse, context: ArtifactHttpContext): Promise<boolean> {
  const stop = new AbortController();
  const signal = AbortSignal.any([responseAbortSignal(response), stop.signal]);
  const control = { signal, beforeEffect: async () => signal.throwIfAborted() };
  const input = await readArtifactImportBody(request);
  // Preserve the established HTTP wire errors; the shared action contract
  // still validates the complete input before any business operation.
  if (input.source !== "file" && !EXTERNAL_DOCUMENT_SOURCES.includes(input.source as ArtifactExternalImport["source"])) {
    throw documentErrors.source_invalid("请选择支持的文档来源");
  }
  if (input.source === "file" && typeof input.content !== "string" && input.original_file === undefined) {
    throw documentErrors.content_invalid("请选择要导入的文件");
  }
  const answer = async (on_progress?: (event: ActionProgressEvent) => void) => {
    const transport = on_progress ? { on_progress } : undefined;
    const saved = input.source === "file"
      ? await context.actions.invoke<unknown, ArtifactImportResult>(artifactsActions.importFile, input, control, transport)
      : await context.actions.invoke<unknown, ArtifactImportResult>(artifactsActions.importExternal, input, control, transport);
    const result = { ...saved, url: context.routePrefix + artifactVersionPath(saved) };
    return { status: result.reused ? 200 : 201, body: result };
  };
  // A page that waits on a slow reading (the speech model's download, a transcription) asks for its progress as NDJSON (PMAT-48).
  if (requestHeader(request, "accept")?.includes("application/x-ndjson")) return answerPluginRouteStream(response, emit => answer(emit), () => stop.abort());
  const result = await answer();
  sendLocalWebJson(response, result.status, result.body);
  return true;
}

/** HTTP composition only: Artifact application owns routing and exact-version reads. */
export function createLocalArtifactHttp() {
  return async function handleArtifactNativePluginHttp(
    request: IncomingMessage, response: ServerResponse, pathname: string, context: ArtifactHttpContext,
  ): Promise<boolean> {
    try {
      if (pathname === "/api/artifacts/import" && request.method === "POST") return importArtifactJson(request, response, context);
      if (pathname === "/api/artifacts/import/original" && request.method === "POST") { await importRawOriginal(request, response, context); return true; }
      // Which document services are connected, for an import dialog outside the 成果库 (the side panel's 资料, specs/project-knowledge §8.1).
      if (pathname === "/api/artifacts/import/sources" && request.method === "GET") {
        sendLocalWebJson(response, 200, await context.actions.invoke(artifactsActions.importSources, {}));
        return true;
      }
      if (pathname === "/api/artifacts/continue" && request.method === "POST") {
        // 「从这一版继续」 (A4b): the chosen plugin starts a new object from this version, with its own permissions.
        const body = await readArtifactImportBody(request) as { reference?: { artifact_id?: unknown; version?: unknown }; plugin_id?: unknown };
        const reference = { artifact_id: String(body.reference?.artifact_id ?? ""), version: Number(body.reference?.version) };
        const view = await context.actions.invoke(artifactsActions.read, { reference });
        assertSupportedImportVersion(view.selected);
        const continuer = continuersFor(view.selected).find(item => item.plugin_id === body.plugin_id);
        if (!view.selected || !continuer || !context.ownerActions) throw artifactsErrors.continue_unavailable("这一版不能在这个插件里继续");
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
        const latest = new Map<string, ArtifactVersionRecord>();
        for (const version of view.versions) {
          if (version.lifecycle_state !== "active" || version.availability !== "available") continue;
          const current = latest.get(version.artifact_id);
          if (!current || version.version > current.version) latest.set(version.artifact_id, version);
        }
        const versions = [...latest.values()], words = await context.readArtifactDisplay(versions);
        sendLocalWebJson(response, 200, { versions: versions.map(version => ({ reference: { artifact_id: version.artifact_id, version: version.version },
          title: version.title, type_title: words(version)?.title ?? version.artifact_type_id, created_at: version.created_at })) });
        return true;
      }
      const route = matchArtifactBrowserRoute(pathname);
      if (!route) return false;
      if (route.kind === "file") {
        // A download (S7 exception list): an imported version's original file, or the text it was read into (A3).
        const view = await context.actions.invoke(artifactsActions.browser, { reference: route.reference,
          supported_types: IMPORTED_DOCUMENT_READ_TYPES });
        assertSupportedImportVersion(view.selected);
        const file = importedFileOf(view.selected);
        const stream = file?.stored ? await openArtifactOriginal(context.homeDirectory, context.projectId, file.stored) : null;
        if (!file || (file.stored && !stream)) throw artifactsErrors.file_missing(uiText.text("workbench.artifact-library-http.no-file"));
        response.writeHead(200, { "content-type": file.mime, "cache-control": "no-store", "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'none'; sandbox",
          "content-disposition": `${file.inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.filename)}` });
        if (file.stored) await pipeline(stream!, response); else response.end(file.bytes);
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
        supported_types: IMPORTED_DOCUMENT_READ_TYPES });
      assertSupportedImportVersion(view.selected);
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
      const selected = view.selected;
      const words = await context.readArtifactDisplay(selected ? [...view.versions, selected] : view.versions);
      const fragment = requestHeader(request, "x-molis-work-fragment"), compact = fragment === "frame-block";
      const languagePreview = fragment === "artifact-workbench" && inLanguagePreview();
      const presentation = await ownerPreview(selected, artifactTypeDeclarations(), selected ? words(selected)?.pluginTitle : undefined, context, languagePreview);
      // 「从这一版继续」 (A4b): who declares it for this type; for an imported file, those whose `file` declaration reads it.
      const continuers = continuersFor(selected).map(item => ({ plugin_id: item.plugin_id, plugin_title: item.plugin_title }));
      const reference = view.selected ? { artifact_id: view.selected.artifact_id, version: view.selected.version } : null;
      const linked = reference && route.kind === "detail" ? await context.actions.invoke(artifactsActions.links, { reference }) : undefined;
      // Documents and other objects that link to this version (五.1), each answered by its own plugin; one that cannot answer is left out.
      const referrers = linked && reference && context.ownerActions ? (await Promise.all(artifactReferrerActions().map(item => context.ownerActions!(item.action.action.permissions)
        .invoke(item.action, { reference }).then(result => (result as ArtifactReferrersResult).referrers.map(row => ({ ...row, plugin_title: item.plugin_title }))).catch(() => [])))).flat() : [];
      const links = linked ? { ...linked, referrers } : undefined;
      const goalInput = !links
        ? true
        : context.inputTargetAvailable
          ? await context.inputTargetAvailable()
          : (await context.actions.discover().catch(() => [])).some(view => view.availability.available && view.action.placement_relation?.role === "bind");
      // 「交给插件作为输入」 (2026-10-04): the input ports of running plugins that take a usable version's type.
      const pluginInputs = reference && route.kind === "detail" && selected?.availability === "available" && selected.lifecycle_state !== "archived"
        ? (await context.actions.invoke(artifactsActions.pluginInputs, { reference }).catch(() => ({ inputs: [] }))).inputs : [];
      const handoffExecutors = route.kind === "detail" && selected?.availability === "available" && selected.lifecycle_state !== "archived"
        ? executorProviders(await context.actions.discover().catch(() => []))
          .filter(provider => unavailableReason(provider) === null)
          .map(provider => ({ id: builtinPluginByManifestId(provider.plugin_id)?.project_plugin_id ?? provider.plugin_id, plugin_id: provider.plugin_id, title: provider.title }))
        : [];
      response.writeHead(view.requested && !view.selected ? 404 : 200, {
        "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "vary": "x-molis-work-fragment",
      });
      response.end(artifactWorkbench.fragments({ view, routePrefix: context.routePrefix, primitives, presentation, importedDocumentWarnings, ...(links ? { links } : {}), ...(goalInput ? {} : { goalInput }), continuers, handoffExecutors, pluginInputs,
        languagePreview, typeTitle: version => words(version)?.title }, compact ? "frame-block" : "detail", currentLocale()));
      return true;
    } catch (error) {
      const failure = actionErrorResponse(error);
      if (!response.destroyed) sendLocalWebJson(response, failure.status, failure.body);
      return true;
    }
  };
}
