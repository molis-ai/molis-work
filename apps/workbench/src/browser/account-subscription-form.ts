import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Subscription, PlanVersion, SeatPool } from "@molis-ai/molis-work-contracts/services/account";
import type { TenantPanel } from "./account-tenant-panel.js";
import { dateField, reasonField, subscriptionPath } from "./account-billing-fields.js";
export type SubscriptionMode = 'create' | 'change' | 'period' | 'renew' | 'status';
export const subscriptionModeLabels = { create: '开通订阅', change: '变更套餐与数量', period: '调整有效期', renew: '续期订阅', status: '变更订阅状态' };
export async function subscriptionForm(panel: TenantPanel, mode: SubscriptionMode, plans: PlanVersion[], original: Subscription | undefined, reload: () => Promise<void>) {
  const { ui, begin, select, submit, change } = panel, { node, form, field, button, request, perform } = ui;
  const current = begin(subscriptionModeLabels[mode]);button('取消', () => perform(reload));
  const s = original ? await request<Subscription>(subscriptionPath(original.subscriptionId)) : undefined;
  const pools = s?.owner.kind === 'TENANT' && mode === 'change' ? await panel.list<SeatPool>(subscriptionPath(s.subscriptionId) + '/seat-pools') : [];
  if (!current()) return;
  if (s) form.append(node('p', uiText.text(s.owner.kind === 'USER' ? "workbench.account-subscription-form.personal-subscriptions" : "workbench.account-subscription-form.tenant-subscriptions") + ' · ' + s.owner.id));
  const scope = mode === 'create' ? select('开通对象', 'subscriptionKind', [['USER', uiText.text("workbench.account-subscription-form.personal")], ['TENANT', uiText.text("workbench.account-subscription-form.tenant")]]) : undefined;
  const target = mode === 'create' ? field('账号或租户 ID', 'subscriptionOwner', 'text', 'off') : undefined;if (target) target.maxLength = 128;
  const plan = mode === 'create' || mode === 'change' ? select('套餐版本', 'subscriptionPlan', [['', uiText.text("workbench.account-subscription-form.select-published-plan")], ...plans.map((p,i) => [String(i), p.name + ' · ' + p.planId + ' v' + p.planVersion] as [string,string])]) : undefined;
  if (plan && s) plan.value = String(plans.findIndex(p => p.planId === s.planId && p.planVersion === s.planVersion));
  const quantities = node('div'), inputs = new Map<string, HTMLInputElement>();
  if (plan) { form.append(quantities);const renderQuantities = () => { quantities.replaceChildren();inputs.clear();const p = plans[Number(plan.value)];
    if ((scope?.value ?? s?.owner.kind) !== 'TENANT' || plan.value === '' || !p) return;
    quantities.append(node('p', uiText.text("workbench.account-subscription-form.tenant-managers-must-release-seats-before-capacity-type")));
    for (const type of p.seatTypes) { const input = field(type.name + ' · ' + type.seatTypeId, 'quantity:' + type.seatTypeId, 'number', 'off');input.min = '0';input.max = '1000000';input.step = '1';input.value = String(pools.find(p => p.seatTypeId === type.seatTypeId)?.quantity ?? 0);quantities.append(input.parentElement!);inputs.set(type.seatTypeId,input); }
    for (const pool of pools) quantities.append(node('p', pool.seatTypeId + ' · ' + uiText.text("workbench.account-subscription-form.current-capacity") + ' ' + pool.quantity + ' · ' + uiText.text("workbench.account-subscription-form.assigned") + ' ' + pool.assignedCount));
  };plan.onchange = renderQuantities;if (scope) scope.onchange = renderQuantities;renderQuantities(); }
  const starts = mode === 'create' || mode === 'period' ? dateField(panel, '开始时间', 'subscriptionStart', s?.startsAt ?? new Date().toISOString()) : undefined;
  const ends = ['create','period','renew'].includes(mode) ? dateField(panel, '到期时间', 'subscriptionEnd', s?.endsAt ?? new Date(Date.now()+30*86400000).toISOString()) : undefined;
  if (mode === 'renew') form.append(node('p', uiText.text("workbench.account-subscription-form.extends-expiry-keeps-disabled-status-assignments")));
  if (mode === 'status') form.append(node('p', uiText.text(s!.enabled ? "workbench.account-subscription-form.disabling-keeps-assignments-expiry-but-removes-entitlements" : "workbench.account-subscription-form.enabling-keeps-original-term-without-renewal")));
  const reason = reasonField(panel);
  submit('确认订阅操作', async () => {
    const chosen = plan && plans[Number(plan.value)], seatQuantities = Object.fromEntries([...inputs].map(([id,input]) => [id, Number(input.value)]));
    if (ends && ((starts && Date.parse(ends.iso()) <= Date.parse(starts.iso())) || (mode === 'renew' && Date.parse(ends.iso()) <= Date.parse(s!.endsAt)))) { ui.message.textContent = uiText.text("workbench.account-subscription-form.expiry-must-follow-start-renewal-must-extend-expiry");return; }
    const body = mode === 'create' ? { owner: {kind:scope!.value,id:target!.value.trim()}, planId:chosen!.planId,planVersion:chosen!.planVersion,startsAt:starts!.iso(),endsAt:ends!.iso(),reason:reason.value.trim(),...(scope!.value === 'TENANT' ? {seatQuantities} : {}) } : {
      expectedVersion:s!.version,reason:reason.value.trim(),...(mode === 'change' ? {plan:{planId:chosen!.planId,planVersion:chosen!.planVersion},...(s!.owner.kind === 'TENANT' ? {seatQuantities}: {})} : mode === 'period' ? {startsAt:starts!.iso(),endsAt:ends!.iso()} : mode === 'renew' ? {endsAt:ends!.iso()} : {enabled:!s!.enabled}),
    };
    if (!window.confirm(uiText.text("workbench.account-subscription-form.apply-these-changes-no-payment-involved"))) return;
    await change(s ? subscriptionPath(s.subscriptionId) + (mode === 'renew' ? '/renew' : '') : '/platform/subscriptions', body, '订阅已更新。', Boolean(s && mode !== 'renew'), reload);
  });
}
