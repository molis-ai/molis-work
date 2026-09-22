/** Agreement changes and legacy contract revisions have independent counters. */
export function codingGoalVersionLabel(value: { contract_revision: number; agreement_version?: number }): string {
  const agreement = value.agreement_version === undefined ? "工作约定版本未记录"
    : value.agreement_version === 0 ? "尚未建立工作约定" : `工作约定 v${value.agreement_version}`;
  return `${agreement} · 目标合同修订 r${value.contract_revision}`;
}
