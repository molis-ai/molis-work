import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceGroup, SurfaceItem } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { escapeHtml as e, icon, renderButton, renderMenu, renderMenuItem, say, type PresentationFormValues } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { SurfaceDisplayCorrection, SurfaceHomeDisplay } from "../surface-home-display.js";

type Control = NonNullable<PresentationFormValues["actions"]>[number];
export type CorrectionControls = Map<string, SurfaceDisplayCorrection>;
export type CorrectionRender = { controls: CorrectionControls; recovery?: ActionSubject; defaults?: boolean; headerOnly?: boolean };
export const restoreObject = "surface-correction:restore";
export const restorePosition = "surface-correction:restore-position";
export const correctionText = (key: string) => say.text({ owner: "workbench", key: "workbench.surfaces.correct." + key });

export function correctionMenu(items: readonly Control[], className = "") {
  if (!items.length) return "";
  const more = say.text({ owner: "workbench", key: "common.presentation.more" });
  return '<details class="mw-presentation__more ' + className + '"><summary aria-haspopup="menu" aria-label="' + e(more)
    + '" class="mw-btn mw-btn--ghost mw-btn--icon mw-btn--icon-only">' + icon("more") + "</summary>"
    + renderMenu({ items: items.map(({ key, label }) => renderMenuItem({ label, attrs: { "data-presentation-action": key } })).join("") }) + "</details>";
}

export function objectCorrections(data: SurfaceHomeDisplay, group: SurfaceGroup, item: SurfaceItem, controls?: CorrectionControls): Control[] {
  const position = data.position;
  if (!controls || !position?.forms.length || item.state !== "ok") return [];
  const choices: Control[] = [], subject = item.subject, expected_revision = data.corrections_revision;
  const add = (correction: SurfaceDisplayCorrection, label: string) => {
    const key = JSON.stringify(["surface-correction", item.owner_plugin_id, subject, correction.correction, correction.form]);
    controls.set(key, correction); choices.push({ key, label: correctionText(label) });
  };
  for (const form of position.forms) if (form !== item.form && position.forms.length > 1)
    add({ correction: "form", form, subject, expected_revision }, "form." + form);
  if (position.pin && group.kind !== "attention") add({ correction: "pin", subject, expected_revision }, "pin");
  add({ correction: "remove", subject, expected_revision }, "remove");
  if (expected_revision !== "0") add({ correction: "reset", subject, expected_revision }, "restore");
  return choices;
}

export function correctionHeader(data: SurfaceHomeDisplay, index: number, options: CorrectionRender | undefined) {
  const position = data.position;
  if (!options || !position?.forms.length) return "";
  const { controls, recovery, defaults = true, headerOnly } = options, expected_revision = data.corrections_revision;
  const group = data.groups[index];
  const hasRows = !!group?.items.length;
  const settings = defaults && (hasRows || expected_revision !== "0" || position.kind === "home");
  if (!settings && !hasRows && !recovery) return "";
  if (settings) controls.set(restorePosition, { correction: "reset", expected_revision });
  if (recovery) controls.set(restoreObject, { correction: "reset", subject: recovery, expected_revision });
  if (headerOnly) return settings ? correctionMenu([{ key: restorePosition, label: correctionText("restore-position") }], "surface-correction-default") : "";
  const reason = position.reasons?.[index] ?? data.reason;
  return '<div class="surface-correction-reason" data-surface-correction-reason><div>'
    + (reason ? '<p>' + say(reason) + '</p>' : "")
    + '<small>' + e(correctionText("scope." + position.kind)) + '</small></div>'
    + (settings ? correctionMenu([{ key: restorePosition, label: correctionText("restore-position") }], "surface-correction-default") : "")
    + (recovery ? '<div class="surface-correction-recovery" role="status">' + e(correctionText("removed")) + renderButton({
      label: correctionText("restore"), variant: "ghost", attrs: { "data-presentation-action": restoreObject },
    }) + '</div>' : "") + '</div>';
}
