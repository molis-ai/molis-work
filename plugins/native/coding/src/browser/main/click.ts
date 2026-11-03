import { errorMessage } from "../dom.js";
import { GOAL_CLICKS } from "./click-goals.js";
import { NAVIGATION_CLICKS } from "./click-navigation.js";
import { RECOVERY_CLICKS } from "./click-recovery.js";
import { REPORT_CLICKS } from "./click-report.js";
import { ROUND_CLICKS } from "./click-round.js";
import { pressNextStep } from "./click-steps.js";
import type { ClickRule } from "./click-types.js";
import { controls } from "./controls.js";
import type { Page } from "./page.js";
import { status } from "./request.js";

/** Every control the page's markup marks by an attribute; one control matches at most one rule. */
const RULES: readonly ClickRule[] = [...REPORT_CLICKS, ...GOAL_CLICKS, ...RECOVERY_CLICKS, ...ROUND_CLICKS, ...NAVIGATION_CLICKS];

/** One click anywhere on the page: a next step presses the control it names, otherwise the control's rule runs. */
export async function onClick(page: Page, event: MouseEvent) {
  const target = (event.target as Element | null)?.closest<HTMLButtonElement>("button,a");
  if (!target) return;
  try {
    if (target.dataset.ixStepId) {
      pressNextStep(page, target.dataset.ixStepId);
      return;
    }
    const rule = RULES.find(([selector]) => target.matches(selector));
    if (rule) await rule[1](page, target, event);
  } catch (error) {
    status(page, errorMessage(error), true);
    controls(page);
  }
}
