import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Subscription, PlanVersion, SeatPool, Assignment, Membership, TenantView } from "@molis-ai/molis-work-contracts/services/account";
import type { TenantPanel } from "./account-tenant-panel.js";
import { tenantPath } from "./account-tenant-panel.js";
import { subscriptionRow, unavailable, seatName, canAssign, assignmentLabels } from "./account-billing-fields.js";
import { renderEntitlements } from "./account-entitlements.js";
import { seatOperation } from "./account-seats.js";
export async function renderSubscriptions(panel: TenantPanel, tenant?: TenantView, history = false) {
  const { ui, list, begin, load } = panel, { form, node, button, perform, request } = ui;
  const current = begin('订阅与席位'), reload = () => renderSubscriptions(panel, tenant, history);
  button('返回空间选择', () => perform(load));
  try {
    const view = tenant ? await request<TenantView>(tenantPath(tenant.tenantId)) : undefined, path = view ? tenantPath(view.tenantId) : '';
    const manager = view && view.myRole !== 'MEMBER';
    const [plans, personal, subscriptions, pools, assignments, members] = await Promise.all([
      list<PlanVersion>('/catalog/plans'), list<Subscription>('/subscriptions'), view ? list<Subscription>(path + '/subscriptions') : [],
      manager ? list<SeatPool>(path + '/seat-pools') : [], view ? list<Assignment>(path + '/seat-assignments?state=' + (history ? 'history' : 'current')) : [], manager ? list<Membership>(path + '/members') : [],
    ]);
    if (!current()) return;
    form.append(node('p', view?.name ?? uiText.text("workbench.account-subscriptions.personal-space")));button('刷新订阅与席位', () => perform(reload)); button('查看当前权益', () => perform(() => renderEntitlements(panel, view, reload)));
    for (const [label, items] of [['个人订阅', personal], ['租户订阅', subscriptions]] as const) { if (label === '租户订阅' && !view) continue;
      form.append(node('h4', uiText.text(label))); if (!items.length) form.append(node('p', uiText.text("workbench.account-subscriptions.no-subscriptions")));
      for (const s of items) { const row = subscriptionRow(panel, s, plans); form.append(row); }
    }
    if (!view) return;
    form.append(node('h4', uiText.text(manager ? "workbench.account-subscriptions.seat-management" : "workbench.account-subscriptions.my-tenant-seats")), node('p', uiText.text("workbench.account-subscriptions.expired-disabled-assignments-kept-no-entitlements")));
    if (manager) { for (const pool of pools) { const row = node('div', '', 'account-method'); row.append(node('strong', seatName(pool.subscriptionId, pool.seatTypeId, subscriptions, plans)), node('p', uiText.text("workbench.account-subscriptions.total") + ' ' + pool.quantity + ' · ' + uiText.text("workbench.account-subscriptions.assigned") + ' ' + pool.assignedCount + ' · ' + uiText.text("workbench.account-subscriptions.available") + ' ' + pool.availableCount));form.append(row); }
      if (!pools.length) form.append(node('p', uiText.text("workbench.account-subscriptions.no-seat-pools")));
      button('分配席位', () => perform(() => seatOperation(panel, view, pools, members, subscriptions, plans, undefined, reload)));
    }
    button(history ? '查看当前分配' : '查看分配历史', () => perform(() => renderSubscriptions(panel, view, !history)));
    if (!assignments.length) form.append(node('p', uiText.text(history ? "workbench.account-subscriptions.no-assignment-history" : "workbench.account-subscriptions.no-current-assignments")));
    for (const a of assignments) { const row = node('div', '', 'account-method'); row.append(node('strong', seatName(a.subscriptionId, a.seatTypeId, subscriptions, plans)), node('p', a.userId), node('p', uiText.text(a.status === 'ENDED' ? assignmentLabels[a.endReason] : "workbench.account-subscriptions.retained-assignment") + ' · ' + new Date(a.endedAt ?? a.assignedAt).toLocaleString()));
      if (manager && a.status === 'ASSIGNED') { button('回收席位', () => { if (window.confirm(uiText.text("workbench.account-subscriptions.release-seat-end-its-entitlements"))) return perform(() => panel.change(path + '/seat-assignments/' + encodeURIComponent(a.assignmentId) + '/release', { expectedVersion: a.version }, '席位已更新。', false, reload)); }, row);
        if (canAssign(a.subscriptionId, subscriptions)) button('换绑席位', () => perform(() => seatOperation(panel, view, pools, members, subscriptions, plans, a, reload)), row); } form.append(row);
    }
  } catch (error) { if (current()) unavailable(panel, reload); throw error; }
}
