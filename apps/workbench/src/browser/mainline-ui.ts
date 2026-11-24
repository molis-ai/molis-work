import type * as sdk from "@molis-ai/molis-work-plugin-sdk/ui";
import type * as adoption from "@molis-ai/molis-work-design-system/home-page-adoption";

type Renderers = Pick<typeof sdk, "escapeHtml" | "icon" | "renderAlert" | "renderBadge" | "renderButton" | "renderPopover" | "renderStatusMark" | "t">
  & Pick<typeof adoption, "renderCheckSummary" | "renderCompareAdoptBar" | "renderEditConflict">;

// The former split bundles each included their own SDK, text and state-ring runtime.
// The shell supplies its existing renderer before initializing either workbench surface.
export let escapeHtml: Renderers["escapeHtml"];
export let icon: Renderers["icon"];
export let renderAlert: Renderers["renderAlert"];
export let renderBadge: Renderers["renderBadge"];
export let renderButton: Renderers["renderButton"];
export let renderPopover: Renderers["renderPopover"];
export let renderStatusMark: Renderers["renderStatusMark"];
export let t: Renderers["t"];
export let renderCheckSummary: Renderers["renderCheckSummary"];
export let renderCompareAdoptBar: Renderers["renderCompareAdoptBar"];
export let renderEditConflict: Renderers["renderEditConflict"];
export function installRenderers(renderers: Renderers) {
  ({ escapeHtml, icon, renderAlert, renderBadge, renderButton, renderPopover, renderStatusMark, t, renderCheckSummary, renderCompareAdoptBar, renderEditConflict } = renderers);
}
