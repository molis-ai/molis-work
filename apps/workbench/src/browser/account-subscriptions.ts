import { dateArg, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Subscription, PlanVersion, SeatPool, Assignment, Membership, TenantView } from "@molis-ai/molis-work-contracts/services/account";
import type { TenantPanel } from "./account-tenant-panel.js";
import { tenantPath } from "./account-tenant-panel.js";
import { subscriptionRow, unavailable, seatName, canAssign, assignmentLabels } from "./account-billing-fields.js";
import { renderEntitlements } from "./account-entitlements.js";
import { seatOperation } from "./account-seats.js";
export async function renderSubscriptions(panel: TenantPanel, tenant?: TenantView, history = false) {
  const { ui, list, begin, load } = panel, { form, node, button, perform, request } = ui;
  const current = begin('workbench.account.subscriptions-seats'), reload = () => renderSubscriptions(panel, tenant, history);
  button('workbench.account.back-spaces', () => perform(load));
  try {
    const view = tenant ? await request<TenantView>(tenantPath(tenant.tenantId)) : undefined, path = view ? tenantPath(view.tenantId) : '';
    const manager = view && view.myRole !== 'MEMBER';
    const [plans, personal, subscriptions, pools, assignments, members] = await Promise.all([
      list<PlanVersion>('/catalog/plans'), list<Subscription>('/subscriptions'), view ? list<Subscription>(path + '/subscriptions') : [],
      manager ? list<SeatPool>(path + '/seat-pools') : [], view ? list<Assignment>(path + '/seat-assignments?state=' + (history ? 'history' : 'current')) : [], manager ? list<Membership>(path + '/members') : [],
    ]);
    if (!current()) return;
    form.append(node('p', view?.name ?? uiText.text("workbench.account-subscriptions.personal-space")));button('workbench.account.refresh-subscriptions-seats', () => perform(reload)); button('workbench.account.show-entitlements', () => perform(() => renderEntitlements(panel, view, reload)));
    for (const [label, items] of [['workbench.account.personal-subscriptions', personal], ...(view ? [['workbench.account.tenant-subscriptions', subscriptions] as const] : [])] as const) {
      form.append(node('h4', uiText.text(label))); if (!items.length) form.append(node('p', uiText.text("workbench.account-subscriptions.no-subscriptions")));
      for (const s of items) { const row = subscriptionRow(panel, s, plans); form.append(row); }
    }
    if (!view) return;
    form.append(node('h4', uiText.text(manager ? "workbench.account-subscriptions.seat-management" : "workbench.account-subscriptions.my-tenant-seats")), node('p', uiText.text("workbench.account-subscriptions.expired-disabled-assignments-kept-no-entitlements")));
    if (manager) { for (const pool of pools) { const row = node('div', '', 'account-method'); row.append(node('strong', seatName(pool.subscriptionId, pool.seatTypeId, subscriptions, plans)), node('p', uiText.text("workbench.account-subscriptions.total") + ' ' + pool.quantity + ' · ' + uiText.text("workbench.account-subscriptions.assigned") + ' ' + pool.assignedCount + ' · ' + uiText.text("workbench.account-subscriptions.available") + ' ' + pool.availableCount));form.append(row); }
      if (!pools.length) form.append(node('p', uiText.text("workbench.account-subscriptions.no-seat-pools")));
      button('workbench.account.assign-seat', () => perform(() => seatOperation(panel, view, pools, members, subscriptions, plans, undefined, reload)));
    }
    button(history ? 'workbench.account.current-assignments' : 'workbench.account.assignment-history', () => perform(() => renderSubscriptions(panel, view, !history)));
    if (!assignments.length) form.append(node('p', uiText.text(history ? "workbench.account-subscriptions.no-assignment-history" : "workbench.account-subscriptions.no-current-assignments")));
    for (const a of assignments) { const row = node('div', '', 'account-method'); row.append(node('strong', seatName(a.subscriptionId, a.seatTypeId, subscriptions, plans)), node('p', a.userId), node('p', uiText.text(a.status === "ENDED" ? assignmentLabels[a.endReason] : "workbench.account.assignment-retained", { at: dateArg(a.endedAt ?? a.assignedAt, "datetime") })));
      if (manager && a.status === 'ASSIGNED') { button('workbench.account.release-seat', () => { if (window.confirm(uiText.text("workbench.account-subscriptions.release-seat-end-its-entitlements"))) return perform(() => panel.change(path + '/seat-assignments/' + encodeURIComponent(a.assignmentId) + '/release', { expectedVersion: a.version }, 'workbench.account.seat-updated', false, reload)); }, row);
        if (canAssign(a.subscriptionId, subscriptions)) button('workbench.account.reassign-seat', () => perform(() => seatOperation(panel, view, pools, members, subscriptions, plans, a, reload)), row); } form.append(row);
    }
  } catch (error) { if (current()) unavailable(panel, reload); throw error; }
}
