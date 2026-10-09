import type { IncomingMessage, ServerResponse } from "node:http";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  FILE_ENTRIES_PAGE_LIMIT, SUBJECT_CONTEXT_TYPE, SUBJECT_REFERENCE_TYPE, isFileContentSource, isFileEntriesSource,
  type ActionSubjectContext, type ActionView, type FileContent, type FileEntriesPage,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { writeNativePluginJsonResponse } from "./native-plugin-http.js";
import { localWebActionContext } from "./local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { BUILTIN_PLUGIN_CATALOG, artifactTypeDeclarations } from "@molis-ai/molis-work-app-workbench";
import { ARTIFACT_SUBJECT_KIND, parseArtifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";

/**
 * The side panel's file tab (specs/archive/side-panel P3): the file sources plugins declare in this project, their entries,
 * and one file's preview — all read through the shared action directory as the local person, so a source the person
 * cannot read, or a plugin turned off here, is simply not there. Nothing is copied or cached on the Host.
 */
export interface SideFilesPorts {
  readonly localHost: MolisWorkLocalHost;
  readonly reference: LocalHostProjectReference;
  /** The built-in plugins this project shows (project ids): a hidden one's files are not listed, like its page. */
  readonly shownPlugins?: () => Promise<ReadonlySet<string>>;
}

const referenceOf = (view: ActionView) => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id });
const sourceId = (view: ActionView) => `${view.provider.provider_id}|${view.capability_id}|${view.version}`;
const isReader = (view: ActionView) => view.action.input_type === SUBJECT_REFERENCE_TYPE && view.action.output_type === SUBJECT_CONTEXT_TYPE;
const RAW_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"]);
const textual = (mediaType: string) => /^text\/|\/(json|xml|yaml|javascript|typescript|x-sh)$|\+(json|xml)$/u.test(mediaType);

/** The owner's preview of one 成果 version, or null to fall back to the 成果库's own reading of it. */
async function ownerPreview(subjectId: string, views: readonly ActionView[], invoke: (view: ActionView, input: unknown) => Promise<unknown>, ports: SideFilesPorts): Promise<FileContent | null> {
  const reference = parseArtifactSubjectId(subjectId);
  if (!reference) return null;
  const artifact = await ports.localHost.withProject(ports.reference, runtime => runtime.coordinator.artifacts.query.getArtifactVersion(runtime.board_id, reference));
  const declaration = artifact ? artifactTypeDeclarations().get(artifact.artifact_type_id) : undefined;
  // Only the declared owner previews its type, and only versions it produced.
  if (!artifact || artifact.availability !== "available" || !declaration?.preview || artifact.producer_plugin_id !== declaration.plugin_id) return null;
  const view = views.find(item => item.capability_id === declaration.preview!.capability_id && item.version === declaration.preview!.version && item.availability.available);
  if (!view) return null;
  try { return await invoke(view, { artifact }) as FileContent; } catch { return null; }
}

export async function handleSideFilesHttp(request: IncomingMessage, response: ServerResponse, url: URL, ports: SideFilesPorts): Promise<boolean> {
  const route = /^\/api\/side\/files\/(sources|entries|content|raw)$/u.exec(url.pathname)?.[1];
  if (!route) return false;
  const json = (status: number, body: unknown) => writeNativePluginJsonResponse(response, { status, body });
  if (request.method !== "GET") { json(405, { error: "不支持这个请求" }); return true; }
  try {
    const caller = await localWebActionContext(ports.localHost, ports.reference, LOCAL_OWNER_PERMISSIONS);
    const client = ports.localHost.actionClient(ports.reference);
    const views = await client.discover(caller);
    const shown = await ports.shownPlugins?.();
    // A built-in plugin the project does not show lists nothing here; a plugin installed from outside the catalog follows its own state.
    const hiddenHere = (view: ActionView) => {
      const builtin = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === (view.provider.plugin_id ?? view.provider.provider_id));
      return !!shown && !!builtin && !shown.has(builtin.project_plugin_id);
    };
    const sources = views.filter(view => isFileEntriesSource(view.action) && view.action.file_source?.kinds.length && view.availability.available && !hiddenHere(view));
    if (route === "sources") {
      json(200, { sources: sources.map(view => ({
        id: sourceId(view), plugin_id: view.provider.plugin_id ?? view.provider.provider_id, title: view.action.title,
        kinds: view.action.file_source!.kinds,
      })) });
      return true;
    }
    const source = sources.find(view => sourceId(view) === url.searchParams.get("source"));
    if (!source) { json(404, { error: "这个文件来源已经不在了（插件可能已停用）" }); return true; }
    if (route === "entries") {
      const cursor = url.searchParams.get("cursor");
      const page = await client.invoke(caller, referenceOf(source), { cursor: cursor || null, limit: FILE_ENTRIES_PAGE_LIMIT }) as FileEntriesPage;
      json(200, { page });
      return true;
    }
    const kind = url.searchParams.get("kind") ?? "", id = url.searchParams.get("id") ?? "";
    if (!kind || !id || !source.action.file_source!.kinds.some(entry => entry.kind === kind)) { json(400, { error: "没有说明要预览哪个文件" }); return true; }
    const provider = source.provider.provider_id;
    // A 成果 version previews through its type's owner (artifact-positioning A4b), the same as in the 成果库.
    const owned = kind === ARTIFACT_SUBJECT_KIND && route === "content" ? await ownerPreview(id, views, (view, input) => client.invoke(caller, referenceOf(view), input), ports) : null;
    if (owned) { json(200, { content: owned, via: "owner" }); return true; }
    const content = views.find(view => isFileContentSource(view.action) && view.availability.available && view.provider.provider_id === provider
      && view.action.file_source?.kinds.some(entry => entry.kind === kind));
    if (content) {
      const file = await client.invoke(caller, referenceOf(content), { subject: { kind, id } }) as FileContent;
      if (route === "raw") {
        // Only kinds the panel shows in a frame or an image, never a document that could run in this origin.
        if (file.encoding !== "base64" || !RAW_TYPES.has(file.media_type)) { json(415, { error: "这种文件不能直接显示" }); return true; }
        // nosniff pins the declared type, so the bytes are only ever shown as an image or by the PDF viewer (a sandboxed
        // frame would stop the viewer from rendering at all).
        response.writeHead(200, { "content-type": file.media_type, "content-disposition": "inline", "cache-control": "no-store", "x-content-type-options": "nosniff" });
        response.end(Buffer.from(file.data, "base64"));
        return true;
      }
      json(200, { content: file, via: "content" });
      return true;
    }
    if (route === "raw") { json(404, { error: "这个文件没有可直接显示的内容" }); return true; }
    // No preview action: the plugin's own subject reader gives the text the Assistant and search read too.
    const reader = views.find(view => isReader(view) && view.availability.available && view.provider.provider_id === provider && view.action.subject_kinds.includes(kind));
    if (!reader) { json(200, { content: null, via: "none" }); return true; }
    const context = await client.invoke(caller, referenceOf(reader), { subject_id: id }) as ActionSubjectContext;
    const mediaType = url.searchParams.get("media_type") ?? "";
    const file: FileContent = { subject: context.subject, revision: context.revision, title: context.title,
      media_type: textual(mediaType) ? mediaType : "text/plain", encoding: "utf8", data: context.content, truncated: !!context.truncated };
    json(200, { content: file, via: "reader" });
    return true;
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    json(/not_found$/u.test(code) ? 404 : 409, { error: error instanceof Error ? error.message : String(error), code });
    return true;
  }
}
