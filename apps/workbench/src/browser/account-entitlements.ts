import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Feature, EntitlementCheckResult, EntitlementDecision, Subscription, PlanVersion, TenantView } from "@molis-ai/molis-work-contracts/services/account";
import type { TenantPanel } from "./account-tenant-panel.js";
import { tenantPath } from "./account-tenant-panel.js";
import { planName, seatName } from "./account-billing-fields.js";

/** Display-only snapshot. Every action queries Auth again; this view never grants a local permission. */
export async function renderEntitlements(panel: TenantPanel, tenant: TenantView | undefined, back: () => Promise<void>) {
  const { ui, list } = panel, { form, node, button, perform, request } = ui;
  const current = panel.begin('当前权益'), reload = () => renderEntitlements(panel, tenant, back);
  button('返回订阅与席位', () => perform(back)); button('刷新权益', () => perform(reload));
  form.append(node('p', tenant?.name ?? uiText.text("workbench.account-entitlements.personal-space")));
  const content = node('div'); content.setAttribute('aria-live', 'polite'); form.append(content);
  const unknown = () => { if (current()) content.replaceChildren(node('p', uiText.text("workbench.account-entitlements.entitlements-cannot-be-confirmed-reconnect-refresh"))); };
  let timer: ReturnType<typeof setTimeout> | undefined, deadline = 0;
  const expire = () => { if (current()) { unknown(); void perform(reload); } };
  const focus = () => { if (deadline && Date.now() >= deadline) expire(); };
  window.addEventListener('offline', unknown); window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
  panel.cleanup(() => { clearTimeout(timer); window.removeEventListener('offline', unknown); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); });
  unknown();
  try {
    const scope = tenant ? { kind: 'TENANT', tenantId: tenant.tenantId } : { kind: 'PERSONAL' };
    const [catalog, plans, personal, shared] = await Promise.all([list<Feature>('/catalog/features'), list<PlanVersion>('/catalog/plans'), list<Subscription>('/subscriptions'), tenant ? list<Subscription>(tenantPath(tenant.tenantId) + '/subscriptions') : []]);
    const features = catalog.filter(f => f.product === 'WORK' || f.product === 'SHARED'), decisions: EntitlementDecision[] = [];
    // Revisions include the requested feature IDs; separate batches are independent snapshots.
    for (let i = 0; i < features.length; i += 100) {
      const ids = features.slice(i, i + 100).map(f => f.featureId);
      const result = await request<EntitlementCheckResult>('/entitlements/check', { scope, featureIds: ids });
      if ((result.scope.kind !== scope.kind || (result.scope.kind === 'TENANT' && result.scope.tenantId !== scope.tenantId)) || result.decisions.length !== ids.length || new Set(result.decisions.map(d => d.featureId)).size !== ids.length || result.decisions.some(d => !ids.includes(d.featureId))) throw Error('Entitlement snapshot changed');
      decisions.push(...result.decisions);
    }
    if (!current()) return;
    deadline = Math.min(...decisions.map(d => Date.parse(d.validUntil)));
    if (!navigator.onLine || (decisions.length && deadline <= Date.now())) { unknown(); return; }
    content.replaceChildren();
    if (!features.length) { content.append(node('p', uiText.text("workbench.account-entitlements.no-features-available"))); return; }
    const subscriptions = [...personal, ...shared];
    for (const d of decisions) {
      const row = node('div', '', 'account-method'); row.dataset.entitlement = d.featureId;
      row.append(node('strong', features.find(f => f.featureId === d.featureId)!.name), node('p', uiText.text(d.allowed ? "workbench.account-entitlements.granted" : "workbench.account-entitlements.not-granted")));
      for (const s of d.sources) { const sub = subscriptions.find(v => v.subscriptionId === s.subscriptionId);
        row.append(node('p', s.kind === 'PERSONAL_SUBSCRIPTION' ? uiText.text("workbench.account-entitlements.personal-subscriptions") + ' · ' + (sub ? planName(sub, plans) : s.subscriptionId) : uiText.text("workbench.account-entitlements.current-tenant-seat") + ' · ' + seatName(s.subscriptionId, s.seatTypeId, subscriptions, plans)));
      }
      content.append(row);
    }
    content.append(node('p', uiText.text("workbench.account-entitlements.valid-until") + ' ' + new Date(deadline).toLocaleString()));
    timer = setTimeout(expire, Math.max(1, deadline - Date.now()));
  } catch { unknown(); }
}
