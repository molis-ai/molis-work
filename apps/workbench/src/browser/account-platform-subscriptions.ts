import { dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Subscription, PlanVersion, AuditEvent } from "@molis-ai/molis-work-contracts/services/account";
import type { TenantPanel } from "./account-tenant-panel.js";
import { subscriptionRow, unavailable } from "./account-billing-fields.js";
import { subscriptionForm, subscriptionModeLabels, type SubscriptionMode } from "./account-subscription-form.js";

const uiText = globalThis.t;
export async function renderPlatformSubscriptions(panel: TenantPanel, capabilities: readonly string[]) {
  const { ui, begin, list, load } = panel, { form, node, button, perform } = ui;
  const current = begin('workbench.account.platform-subscriptions'), reload = () => renderPlatformSubscriptions(panel, capabilities);
  button('workbench.account.back-spaces', () => perform(load));
  try {
    const plans = await list<PlanVersion>('/catalog/plans');if (!current()) return;
    if (capabilities.includes('SUBSCRIPTION_WRITE')) button('workbench.account.create-subscription', () => perform(() => subscriptionForm(panel, 'create', plans, undefined, reload)));
    if (!plans.length) form.append(node('p', uiText.text("workbench.account-platform-subscriptions.publish-plans-platform-catalog-first")));
    if (capabilities.includes('AUDIT_READ')) button('workbench.account.billing-audit', () => perform(() => audit(panel, reload)));
    if (!capabilities.includes('SUBSCRIPTION_READ')) return;
    const subscriptions = await list<Subscription>('/platform/subscriptions');if (!current()) return;
    if (!subscriptions.length) form.append(node('p', uiText.text("workbench.account-platform-subscriptions.no-subscriptions")));
    for (const s of subscriptions) { const row = subscriptionRow(panel,s,plans);row.dataset.subscription=s.subscriptionId;row.append(node('p', uiText.text(s.owner.kind === 'USER' ? "workbench.account-platform-subscriptions.personal" : "workbench.account-platform-subscriptions.tenant") + ' · ' + s.owner.id),node('small',s.subscriptionId));
      if (capabilities.includes('SUBSCRIPTION_WRITE')) for (const mode of ['change','period','renew','status'] as const) button(mode === 'status' ? s.enabled ? 'workbench.account.disable-subscription' : 'workbench.account.enable-subscription' : subscriptionModeLabels[mode], () => perform(() => subscriptionForm(panel, mode as SubscriptionMode, plans, s, reload)), row);
      form.append(row);
    }
  } catch (error) { if (current()) unavailable(panel, reload); throw error; }
}
async function audit(panel: TenantPanel, back: () => Promise<void>) {
  const { ui, begin } = panel, { form, node, button, request, perform } = ui;
  const current = begin('workbench.account.billing-audit');button('workbench.account.back-platform-subscriptions', () => perform(back));
  async function next(cursor?: string) { const page = await request<{items:AuditEvent[];nextCursor:string|null}>('/platform/audit-events?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''));if (!current()) return;
    for (const event of page.items) { const row = node('div', '', 'account-method');row.append(node('strong', event.operation), node('p', event.target.id),node('p', uiText.text(event.result === "SUCCEEDED" ? "workbench.account.audit-succeeded" : "workbench.account.audit-rejected", { actor: event.actorUserId, at: dateArg(event.occurredAt, "datetime-with-seconds") })));
      for (const c of event.changes) row.append(node('p', c.field + ': ' + (c.before ?? '—') + ' → ' + (c.after ?? '—')));form.append(row); }
    if (!cursor && !page.items.length) form.append(node('p', uiText.text("workbench.account-platform-subscriptions.no-operations-recorded")));
    if (page.nextCursor) { const more = button('workbench.account.load-more', () => perform(async () => { await next(page.nextCursor!);more.remove(); })); }
  }
  await next();
}
