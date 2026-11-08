import type { Subscription, PlanVersion, AuditEvent } from "@molis-ai/molis-work-contracts/services/account";
import type { TenantPanel } from "./account-tenant-panel.js";
import { subscriptionRow, unavailable } from "./account-billing-fields.js";
import { subscriptionForm, subscriptionModeLabels, type SubscriptionMode } from "./account-subscription-form.js";
export async function renderPlatformSubscriptions(panel: TenantPanel, capabilities: readonly string[]) {
  const { ui, begin, list, load } = panel, { form, node, L, button, perform } = ui;
  const current = begin('平台订阅管理'), reload = () => renderPlatformSubscriptions(panel, capabilities);
  button('返回空间选择', () => perform(load));
  try {
    const plans = await list<PlanVersion>('/catalog/plans');if (!current()) return;
    if (capabilities.includes('SUBSCRIPTION_WRITE')) button('开通订阅', () => perform(() => subscriptionForm(panel, 'create', plans, undefined, reload)));
    if (!plans.length) form.append(node('p', L('暂无已发布套餐，请先在平台配置套餐目录。')));
    if (capabilities.includes('AUDIT_READ')) button('订阅与席位操作记录', () => perform(() => audit(panel, reload)));
    if (!capabilities.includes('SUBSCRIPTION_READ')) return;
    const subscriptions = await list<Subscription>('/platform/subscriptions');if (!current()) return;
    if (!subscriptions.length) form.append(node('p', L('暂无订阅。')));
    for (const s of subscriptions) { const row = subscriptionRow(panel,s,plans);row.dataset.subscription=s.subscriptionId;row.append(node('p', L(s.owner.kind === 'USER' ? '个人' : '租户') + ' · ' + s.owner.id),node('small',s.subscriptionId));
      if (capabilities.includes('SUBSCRIPTION_WRITE')) for (const mode of ['change','period','renew','status'] as const) button(mode === 'status' ? s.enabled ? '停用订阅' : '恢复订阅' : subscriptionModeLabels[mode], () => perform(() => subscriptionForm(panel, mode as SubscriptionMode, plans, s, reload)), row);
      form.append(row);
    }
  } catch (error) { if (current()) unavailable(panel, reload); throw error; }
}
async function audit(panel: TenantPanel, back: () => Promise<void>) {
  const { ui, begin } = panel, { form, node, L, button, request, perform } = ui;
  const current = begin('订阅与席位操作记录');button('返回订阅管理', () => perform(back));
  async function next(cursor?: string) { const page = await request<{items:AuditEvent[];nextCursor:string|null}>('/platform/audit-events?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));if (!current()) return;
    for (const event of page.items) { const row = node('div', '', 'account-method');row.append(node('strong', event.operation), node('p', event.target.id),node('p', event.actorUserId + ' · ' + new Date(event.occurredAt).toLocaleString() + ' · ' + L(event.result === 'SUCCEEDED' ? '成功' : '已拒绝')));
      for (const c of event.changes) row.append(node('p', c.field + ': ' + (c.before ?? '—') + ' → ' + (c.after ?? '—')));form.append(row); }
    if (!cursor && !page.items.length) form.append(node('p', L('暂无操作记录。')));
    if (page.nextCursor) { const more = button('加载更多', () => perform(async () => { await next(page.nextCursor!);more.remove(); })); }
  }
  await next();
}
