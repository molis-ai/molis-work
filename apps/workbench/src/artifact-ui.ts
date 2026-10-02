import type { UiHostApi, UiSlotDescriptor, WorkbenchDocumentRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { ARTIFACT_BROWSER_UI_CONTRIBUTION_ID, ARTIFACT_IMPORT_CLIENT_SCRIPT, ARTIFACT_IMPORT_STYLES, renderArtifactImportSurface, type ArtifactBrowserUiModel, type ArtifactImportUiModel, type GoalArtifactEmbed } from "@molis-ai/molis-work-plugin-artifacts";

export const ARTIFACT_EMBED_STYLES = `
  .artifact-embed { padding:24px 0; overflow-wrap:anywhere; }
  .artifact-embed + .artifact-embed { border-top:1px solid var(--line); }
  .artifact-embed header { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 16px; }
  .artifact-embed h3 { margin:0; font-size:15px; line-height:1.4; }
  .artifact-embed header > span, .artifact-embed dt, .artifact-embed .artifact-notice { color:var(--muted); }
  .artifact-embed a { color:var(--blue-dark); text-underline-offset:3px; }
  .artifact-embed a:focus-visible { outline: var(--focus-stroke); outline-offset: 2px; }
  .artifact-embed p { margin:12px 0; }
  .artifact-embed .artifact-facts { display:grid; gap:8px; margin:16px 0; }
  .artifact-embed .artifact-facts div { display:grid; grid-template-columns:84px minmax(0,1fr); gap:12px; }
  .artifact-embed dd { margin:0; }
  @media(max-width:760px) { .artifact-embed > a { display:inline-flex; align-items:center; min-height:44px; } }
`;

export interface ArtifactImportWorkbenchRequest extends ArtifactImportUiModel {
  readonly lang: string;
  readonly desktopShell: boolean;
  readonly headHtml: string;
  readonly iconSpriteHtml: string;
}

export const ARTIFACT_WORKBENCH_STYLES = `
  .artifact-version-list { display:flex; flex-direction:column; gap:4px; }
  .artifact-import-entry { text-decoration:none; }
  .artifact-version-list .mw-dir-row,
  .artifact-version-list .feed-stage-entry { width:100%; }
  .artifact-detail, .artifact-empty { max-width:72ch; overflow-wrap:anywhere; }
  .artifact-detail header:not(.plugin-stage-detail-bar) { display:flex; gap:16px; align-items:baseline; margin:24px 0; }
  .artifact-detail h1 { font-size:24px; margin:0; line-height:1.25; }
  .artifact-detail h2 { font-size:15px; margin:24px 0 8px; }
  .artifact-document-preview { margin:24px 0 32px; min-width:0; }
  .artifact-document-preview h2 { font-size:15px; margin:24px 0 12px; }
  .artifact-document-body { white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; line-height:1.75; }
  .artifact-document-source a { color:var(--blue-dark); text-underline-offset:3px; }
  .artifact-document-warnings { padding:12px 16px; border:1px solid var(--line); border-radius:7px; color:var(--muted); }
  .artifact-document-warnings h2 { margin:0 0 8px; }
  .artifact-document-warnings ul { margin:0; padding-left:24px; }
  .artifact-notice { color:var(--muted); margin:0 0 24px; }
  .artifact-facts { display:grid; gap:12px; margin:24px 0; }
  .artifact-facts div { display:grid; grid-template-columns:100px minmax(0,1fr); gap:12px; }
  .artifact-facts dt { color:var(--muted); }
  .artifact-facts dd { margin:0; }
  .artifact-actions { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin:32px 0; }
  .artifact-actions span { color:var(--muted); }
  .artifact-export { padding:12px 16px; border-radius:8px; background:var(--blue-soft); text-decoration:none; }
  .artifact-reference-label { display:grid; gap:8px; }
  .artifact-business-preview { max-width:80ch; min-width:0; overflow-wrap:anywhere; }
  .artifact-business-preview pre { overflow:auto; max-width:100%; }
  .artifact-business-preview table { display:block; overflow:auto; max-width:100%; }
  .artifact-raw { margin-top:24px; }
  .artifact-raw summary { cursor:pointer; padding:8px 0; }
  .artifact-raw pre { max-height:min(45dvh,400px); overflow:auto; overscroll-behavior:contain; padding:16px; background:var(--rail); border-radius:8px; white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; }
  @media(max-width:760px) {
    .artifact-detail-content > p > .mw-btn { min-height:44px; }
    .artifact-export { min-height:44px; box-sizing:border-box; }
    .artifact-facts div { grid-template-columns:84px minmax(0,1fr); }
  }
`;

export function createArtifactWorkbenchRenderer(
  host: UiHostApi,
  slots: { readonly directory: UiSlotDescriptor; readonly main: UiSlotDescriptor },
  document: (request: WorkbenchDocumentRenderRequest) => string,
) {
  const mount = (surface: "directory" | "detail" | "embed" | "frame-block", model: ArtifactBrowserUiModel) => host.mount({
    slot: surface === "directory" ? slots.directory : slots.main,
    contribution: { contribution_id: ARTIFACT_BROWSER_UI_CONTRIBUTION_ID, surface, model },
  }).html;
  return {
    fragments: (model: ArtifactBrowserUiModel, surface: "detail" | "frame-block" = "detail"): string =>
      `<div data-artifact-directory>${mount("directory", model)}</div><div data-artifact-detail>${surface === "frame-block" ? mount("frame-block", model) : mount("detail", model)}</div>`,
    embed: (model: ArtifactBrowserUiModel): string => mount("embed", model),
    goalContext: (items: readonly GoalArtifactEmbed[], model: Omit<ArtifactBrowserUiModel, "view" | "relationship">): string =>
      items.map((item) => mount("embed", { ...model, view: item.view, relationship: item.relationship })).join(""),
    importPage: (request: ArtifactImportWorkbenchRequest): string => document({
      lang: request.lang,
      title: `${request.primitives.text("导入文档")} · ${request.projectTitle} · Molis Work`,
      head_html: `${request.headHtml}<meta name="molis-work-control-token" content="${request.primitives.escape(request.controlToken)}"><style>${ARTIFACT_IMPORT_STYLES}</style>`,
      body_attributes: { class: "artifact-import-page", "data-native-desktop": request.desktopShell },
      body_html: `${request.iconSpriteHtml}${renderArtifactImportSurface(request)}<script>${ARTIFACT_IMPORT_CLIENT_SCRIPT}</script>`,
    }),
  };
}
