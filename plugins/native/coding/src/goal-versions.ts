import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
/**
 * The Goal's working agreement version; the Goal's own description has no separate version. Injected into the browser
 * with `toString()`; `readText` is the page's translator, or `codingText` where the words stay Chinese data.
 */
export function codingGoalVersionLabel(value: { agreement_version: number }, readText: (text: string, values?: Record<string, string | number>) => string = uiText.text): string {
  return value.agreement_version === 0 ? readText("coding.goal-version.none") : readText("coding.goal-version.label", { version: value.agreement_version });
}
