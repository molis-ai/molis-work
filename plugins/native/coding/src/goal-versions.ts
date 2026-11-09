import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * The Goal's working agreement version; the Goal's own description has no separate version. Injected into the browser
 * with `toString()`; `L` is the page's translator, or `codingZh` where the words stay Chinese data.
 */
export function codingGoalVersionLabel(value: { agreement_version: number }, _L: (text: string, values?: Record<string, string | number>) => string): string {
  return value.agreement_version === 0 ? uiText.text("coding.goal-version.none") : uiText.text("coding.goal-version.label", { version: value.agreement_version });
}
