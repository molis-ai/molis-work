import type { UiHostApi, UiSlotDescriptor, WorkbenchDocumentRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { ARTIFACT_BROWSER_UI_CONTRIBUTION_ID, artifactDisplayTitle, type ArtifactBrowserUiModel, type GoalArtifactEmbed } from "@molis-ai/molis-work-plugin-artifacts";

export const ARTIFACT_EMBED_STYLES = `
  .artifact-embed { padding:20px 0; overflow-wrap:anywhere; }
  .artifact-embed + .artifact-embed { border-top:1px solid var(--line); }
  .artifact-embed header { display:flex; flex-wrap:wrap; align-items:baseline; gap:8px 16px; }
  .artifact-embed h3 { margin:0; font-size:16px; line-height:1.4; }
  .artifact-embed header > span, .artifact-embed dt, .artifact-embed .artifact-notice { color:var(--muted); }
  .artifact-embed a { color:var(--blue-dark); text-underline-offset:3px; }
  .artifact-embed a:focus-visible { outline:2px solid var(--focus); outline-offset:2px; }
  .artifact-embed p { margin:12px 0; }
  .artifact-embed .artifact-facts { display:grid; gap:8px; margin:16px 0; }
  .artifact-embed .artifact-facts div { display:grid; grid-template-columns:84px minmax(0,1fr); gap:12px; }
  .artifact-embed dd { margin:0; }
  @media(max-width:760px) { .artifact-embed > a { display:inline-flex; align-items:center; min-height:44px; } }
`;

export interface ArtifactWorkbenchRequest extends ArtifactBrowserUiModel {
  readonly projectTitle: string;
  readonly lang: string;
  readonly desktopShell: boolean;
  readonly headHtml: string;
  readonly backIconHtml: string;
  readonly iconSpriteHtml: string;
}

export const ARTIFACT_WORKBENCH_STYLES = `
  html:has(> body.artifact-page) { height:100dvh; overflow:hidden; }
  .artifact-page { height:100dvh; overflow:hidden; margin:0; background:var(--page); color:var(--ink); font:13px/1.52 var(--font); }
  .artifact-shell { display:grid; grid-template-columns:minmax(230px,286px) minmax(0,1fr); height:100dvh; min-height:0; overflow:hidden; }
  .artifact-directory { background:var(--rail); padding:24px 16px; min-width:0; }
  .artifact-directory header { margin-bottom:24px; }
  .artifact-directory h1 { font-size:17px; margin:16px 0 4px; }
  .artifact-directory header p { color:var(--muted); margin:0; overflow-wrap:anywhere; }
  .artifact-page a { color:var(--blue-dark); text-underline-offset:3px; }
  .artifact-back { display:inline-flex; align-items:center; gap:8px; min-height:38px; text-decoration:none; }
  .artifact-back svg { width:16px; height:16px; transform:rotate(180deg); }
  .artifact-version-list { display:flex; flex-direction:column; gap:2px; }
  .artifact-version-list .mw-dir-row,
  .artifact-version-list .feed-stage-entry { width:100%; }
  .artifact-stage { min-width:0; padding:24px clamp(20px,4vw,56px); background:var(--paper); }
  .artifact-detail, .artifact-empty { max-width:72ch; overflow-wrap:anywhere; }
  .artifact-detail header:not(.plugin-stage-detail-bar) { display:flex; gap:16px; align-items:baseline; margin:20px 0; }
  .artifact-detail h1 { font-size:clamp(22px,2.25vw,28px); margin:0; line-height:1.25; }
  .artifact-detail h2 { font-size:15px; margin:24px 0 8px; }
  .artifact-notice { color:var(--muted); margin:0 0 24px; }
  .artifact-facts { display:grid; gap:12px; margin:24px 0; }
  .artifact-facts div { display:grid; grid-template-columns:100px minmax(0,1fr); gap:12px; }
  .artifact-facts dt { color:var(--muted); }
  .artifact-facts dd { margin:0; }
  .artifact-actions { display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin:28px 0; }
  .artifact-actions span { color:var(--muted); }
  .artifact-export { padding:10px 14px; border-radius:8px; background:var(--blue-soft); text-decoration:none; }
  .artifact-reference-label { display:grid; gap:8px; }
  .artifact-page input { box-sizing:border-box; width:100%; padding:10px; font:inherit; color:var(--ink); background:var(--paper); border:1px solid var(--line); border-radius:8px; }
  .artifact-raw { margin-top:24px; }
  .artifact-raw summary { cursor:pointer; padding:8px 0; }
  .artifact-raw pre { max-height:min(45dvh,400px); overflow:auto; overscroll-behavior:contain; padding:16px; background:var(--rail); border-radius:8px; white-space:pre-wrap; overflow-wrap:anywhere; font-size:12px; }
  .artifact-page .artifact-directory { display:flex; flex-direction:column; height:100%; min-height:0; overflow:hidden; box-sizing:border-box; }
  .artifact-page .artifact-directory > header { flex:none; margin-bottom:16px; }
  .artifact-page .artifact-version-list { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; align-content:start; }
  .artifact-page .artifact-stage { display:flex; flex-direction:column; height:100%; min-height:0; overflow:hidden; box-sizing:border-box; }
  .artifact-page .artifact-stage > .artifact-back { flex:none; }
  .artifact-page .artifact-detail { display:flex; flex-direction:column; flex:1; min-height:0; }
  .artifact-page .artifact-detail > header { flex:none; max-height:30%; overflow:auto; margin:12px 0; }
  .artifact-page .artifact-detail-content { flex:1; min-height:0; overflow:auto; overscroll-behavior:contain; }
  .artifact-page .artifact-actions { flex:none; margin:0; padding:12px 0; border-top:1px solid var(--line); }
  .artifact-page :focus-visible { outline:2px solid var(--focus); outline-offset:-2px; }
  .artifact-page a:focus-visible { outline-offset:2px; }
  .artifact-page ::selection { background:var(--blue-soft); color:var(--ink); }
  .artifact-page[data-native-desktop] .artifact-directory, .artifact-page[data-native-desktop] .artifact-stage { padding-top:48px; }
  @media(max-width:760px) {
    .artifact-shell { display:block; }
    .artifact-page[data-artifact-selected] .artifact-directory { display:none; }
    .artifact-page:not([data-artifact-selected]) .artifact-stage { display:none; }
    .artifact-directory, .artifact-stage { min-height:100dvh; box-sizing:border-box; padding:16px; }
    .artifact-back, .artifact-export { min-height:44px; box-sizing:border-box; }
    .artifact-page input { font-size:16px; }
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
    page: (request: ArtifactWorkbenchRequest): string => {
      const p = request.primitives;
      return document({
        lang: request.lang, title: `${request.view.selected ? artifactDisplayTitle(request.view.selected) : "Artifacts"} · ${request.projectTitle} · Molis Work`,
        head_html: `${request.headHtml}<style>${ARTIFACT_WORKBENCH_STYLES}</style>`,
        body_attributes: { class: "artifact-page", "data-artifact-selected": Boolean(request.view.requested), "data-native-desktop": request.desktopShell },
        body_html: `${request.iconSpriteHtml}<!-- AR3: existing Calm Desktop directory/detail; exact-version results only; read-only browsing, no implicit publishing. -->
          <div class="artifact-shell"><aside class="artifact-directory"><header>
            <a class="artifact-back" href="${p.escape(request.routePrefix + "/")}">${request.backIconHtml}${p.text("返回项目目录")}</a>
            <h1>Artifacts</h1><p>${p.escape(request.projectTitle)}</p></header>${mount("directory", request)}</aside>
            <main class="artifact-stage"><a class="artifact-back" href="${p.escape(request.routePrefix + "/artifacts")}">${request.backIconHtml}${p.text("返回 Artifact 列表")}</a>${mount("detail", request)}</main></div>`,
      });
    },
  };
}
