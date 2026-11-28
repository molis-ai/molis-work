import { disclosureHeight } from "@molis-ai/molis-work-plugin-sdk/ui";

/** The other folds with the shared chevron hold several children, so the one-row grid does not fit them. Where the engine
 * can animate to `auto` (`interpolate-size`), their content opens to its natural height on the same clock as the chevron
 * instead of snapping open under a turning chevron; elsewhere it opens at once, as before. */
const CHEVRON_FOLDS = ":is(.mw-disclosure,.form-disclosure:not(.mw-collapsible),.mw-object-row__fold)";
/** Native details keep their content box during exit. A region uses a one-row grid as its instant
 * fallback, stays visible through the fade, and excludes its controls from focus as soon as it closes.
 * An empty status line stays in the accessibility tree so it can announce the result when filled. */
export function naturalFold(fold: string, closed: string, kind: "details" | "region" | "status" = "region"): string {
  const clock = "var(--dur-move) var(--ease-quint)";
  const motion = `block-size ${clock}`;
  const native = kind === "details";
  const box = native ? `${fold}::details-content` : fold;
  const shut = native ? `${closed}::details-content` : closed;
  let fallback = "";
  let openStyle = `overflow:clip;transition:${motion},content-visibility var(--dur-move) allow-discrete`;
  let closedStyle = "";
  if (!native) {
    const fade = `${motion},opacity ${clock}`;
    const show = kind === "region" ? ",visibility 0s" : "";
    const hide = kind === "region" ? `;visibility:hidden;interactivity:inert;transition:${fade},visibility 0s var(--dur-move)` : "";
    fallback = `${fold}{display:grid;grid-template-rows:1fr;transition:${fade}${show}}${closed}{grid-template-rows:0fr;opacity:0${hide}}`;
    openStyle = "";
    closedStyle = ";grid-template-rows:1fr";
  }
  return fallback
    + `@supports (interpolate-size:allow-keywords){${fold}{interpolate-size:allow-keywords}${box}{block-size:auto;${openStyle}}${shut}{block-size:0${closedStyle}}}`
    + `@media (prefers-reduced-motion:reduce){${box},${shut}{transition:none}}`;
}

export const DISCLOSURE_STYLES = `${disclosureHeight(".mw-collapsible", ".mw-collapsible>.mw-collapsible__body")}.mw-collapsible>.mw-collapsible__body{padding:0 0 12px}${naturalFold(CHEVRON_FOLDS, `${CHEVRON_FOLDS}:not([open])`, "details")}`;
