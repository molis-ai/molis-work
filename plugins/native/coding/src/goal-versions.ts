/** The Goal's working agreement version; the Goal's own description has no separate version. */
export function codingGoalVersionLabel(value: { agreement_version: number }): string {
  return value.agreement_version === 0 ? "尚未建立工作约定" : `工作约定 v${value.agreement_version}`;
}
