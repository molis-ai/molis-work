import type { IncomingMessage, ServerResponse } from "node:http";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { logPreviewFailure } from "./host-log.js";
import { PAGES_PLUGIN_ID, PAGES_READABLE_FILE } from "@molis-ai/molis-work-contracts/modules/pages";
import type { BoundActionClient, HostOfferedOriginalFile } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import {
  ARTIFACTS_PLUGIN_ID, artifactsErrors, documentErrors, DOCUMENT_ARTIFACT_TYPE, matchArtifactBrowserRoute, artifactsActions, artifactVersionPath, importedFileOf, openArtifactOriginal,
  EXTERNAL_DOCUMENT_SOURCES, type ArtifactFileImport, type ArtifactExternalImport, type GoalArtifactEmbed,
} from "@molis-ai/molis-work-module-artifacts";
import { artifactWorkbench, artifactTypeDeclarations, artifactContinuers, artifactReferrerActions, type ArtifactTypeDeclaration } from "@molis-ai/molis-work-app-workbench";
import { renderFilePreviewHtml } from "@molis-ai/molis-work-design-system";
import { importedDocumentFile, type ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { ActionProgressEvent, ArtifactCompareResult, ArtifactContinueResult, ArtifactReferrersResult, FileContent } from "@molis-ai/molis-work-contracts/platform/actions";
import { dateTimeLocale, L } from "./web-locale.js";
import { requestHeader, sendLocalWebJson } from "./web-http.js";
import { readArtifactImportBody } from "./artifact-document-import.js";
import { answerPluginRouteStream } from "./plugin-route-stream.js";

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
  catch (error) { logPreviewFailure(error, artifact.artifact_type_id); return undefined; }
  const pinned = artifact.origin.kind === "pinned" ? artifact.origin.subject : null;
  // 「原文已改」 (A4b): the owner compares the version with its work object as it is now.
  let compared: ArtifactCompareResult["state"] | null = null;
  if (pinned && declaration.compare) {
    try { compared = (await context.ownerActions(declaration.compare.action.permissions).invoke(declaration.compare, { artifact }) as ArtifactCompareResult).state; }
    catch { compared = null; }
  }
  const notice = artifact.origin.kind === "imported" ? "这是导入时保存的版本；原文后续修改不会自动同步。"
    : compared === "changed" ? "原文已改，这里仍是第 {version} 版。" : compared === "moved" ? "原对象已移到别处，这里仍保留第 {version} 版。"
      : compared === "missing" ? "原对象已经删除，这里仍保留第 {version} 版。" : undefined;
  // A moved object is not in this project to open; only an object that is here gets the way back.
  return { body_html: renderFilePreviewHtml(content, primitives), ...(notice ? { notice } : {}),
    source_href: pinned && compared !== "missing" && compared !== "moved" ? `${context.routePrefix}/?openPlugin=${encodeURIComponent(declaration.surface)}&openItem=${encodeURIComponent(pinned.id)}&openTitle=${encodeURIComponent(artifact.title)}` : "",
    source_label: pinned ? `在${/^[\x20-\x7e]+$/u.test(declaration.plugin_title) ? ` ${declaration.plugin_title} ` : declaration.plugin_title}打开原对象` : "",
    plugin_id: declaration.surface, item_id: pinned?.id ?? "" };
}

export function renderGoalArtifactContext(embeds: GoalArtifactEmbed[]): string {
  // The containing Goal fragment applies its Project prefix once to every local link; types are named as their owners declare.
  return artifactWorkbench.goalContext(embeds, { routePrefix: "", primitives,
    typeTitles: Object.fromEntries([...artifactTypeDeclarations()].map(([type, declaration]) => [type, declaration.title])) });
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
  const filename = offeredFilename(requestHeader(request, "x-molis-work-filename"));
  const mime = (requestHeader(request, "content-type") ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase() || "application/octet-stream";
  const directory = await mkdtemp(join(tmpdir(), "molis-artifact-original-"));
  try {
    const path = join(directory, "original");
    await pipeline(request, createWriteStream(path, { flags: "wx" }));
    const input: ArtifactFileImport = { source: "file", filename, original_file: { filename, mime },
      ...new URL(request.url ?? "/", "http://host").searchParams.get("allow_model_download") === "true" ? { allow_model_download: true } : {} };
    const answer = async (on_progress?: (event: ActionProgressEvent) => void) => {
      const saved = await context.offeredActions({ path, install_id: ARTIFACTS_PLUGIN_ID }).invoke(artifactsActions.importFile, input, undefined, on_progress ? { on_progress } : undefined);
      return { status: saved.reused ? 200 : 201, body: { ...saved, url: context.routePrefix + artifactVersionPath(saved), warnings: saved.warnings.map(warning => L(warning)) } };
    };
    if (requestHeader(request, "accept")?.includes("application/x-ndjson")) await answerPluginRouteStream(response, emit => answer(emit), () => undefined);
    else { const result = await answer(); sendLocalWebJson(response, result.status, result.body); }
  } finally { await rm(directory, { recursive: true, force: true }); }
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
          throw documentErrors.source_invalid("请选择支持的文档来源");
        }
        if (input.source === "file" && typeof input.content !== "string" && input.original_file === undefined) {
          throw documentErrors.content_invalid("请选择要导入的文件");
        }
        const answer = async (on_progress?: (event: ActionProgressEvent) => void) => {
          const transport = on_progress ? { on_progress } : undefined;
          const saved = input.source === "file"
            ? await context.actions.invoke(artifactsActions.importFile, input as unknown as ArtifactFileImport, undefined, transport)
            : await context.actions.invoke(artifactsActions.importExternal, input as unknown as ArtifactExternalImport, undefined, transport);
          const result = { ...saved, url: context.routePrefix + artifactVersionPath(saved) };
          return { status: result.reused ? 200 : 201, body: { ...result, warnings: result.warnings.map(warning => L(warning)) } };
        };
        // A page that waits on a slow reading (the speech model's download, a transcription) asks for its progress as NDJSON (PMAT-48).
        if (requestHeader(request, "accept")?.includes("application/x-ndjson")) return answerPluginRouteStream(response, emit => answer(emit), () => undefined);
        const result = await answer();
        sendLocalWebJson(response, result.status, result.body);
        return true;
      }
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
        const continuer = view.selected ? artifactContinuers().get(view.selected.artifact_type_id)?.find(item => item.plugin_id === body.plugin_id) : undefined;
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
        const stream = file?.stored ? await openArtifactOriginal(context.homeDirectory, context.projectId, file.stored) : null;
        if (!file || (file.stored && !stream)) throw artifactsErrors.file_missing("这个版本没有可取回的文件");
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
        .filter(item => !file || item.plugin_id !== PAGES_PLUGIN_ID || (file.stored ? Boolean(file.text?.trim()) : PAGES_READABLE_FILE.test(file.filename))).map(item => ({ plugin_id: item.plugin_id, plugin_title: item.plugin_title })) : [];
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
      response.end(artifactWorkbench.fragments({ view, routePrefix: context.routePrefix, primitives, presentation, ...(links ? { links } : {}), continuers, pluginInputs,
        typeTitles: Object.fromEntries([...declarations].map(([type, declaration]) => [type, declaration.title])) }, compact ? "frame-block" : "detail"));
      return true;
    } catch (error) {
      // The status is the one of the failure's kind. This is the one edge where the Host translates a failure's message itself.
      const failure = actionErrorResponse(error, { translate: L });
      sendLocalWebJson(response, failure.status, failure.body);
      return true;
    }
  };
}
