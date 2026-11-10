import type { PlatformTenantView } from "@molis-ai/molis-work-contracts/services/account";
import type { TenantPanel } from "./account-tenant-panel.js";

const uiText = globalThis.t;
export async function renderPlatformTenants(panel: TenantPanel, capabilities: readonly string[]) {
  const { ui, begin, list, submit, change, load } = panel, { form, node, field, button, perform } = ui;
  const current = begin('workbench.account.platform-tenants'), reload = () => renderPlatformTenants(panel, capabilities);
  button('workbench.account.back-spaces', () => perform(load));
  const tenants = capabilities.includes('TENANT_READ') ? await list<PlatformTenantView>('/platform/tenants') : [];
  if (!current()) return;
  if (capabilities.includes('TENANT_CREATE')) button('workbench.account.create-tenant', () => {
    begin('workbench.account.create-tenant'); const name = field('workbench.account.tenant-name', 'tenantName', 'text', 'organization'), owner = field('workbench.account.owner-account-id', 'ownerUserId', 'text', 'off'), reason = field('workbench.account.operation-reason', 'reason', 'text', 'off'); name.maxLength = 80; owner.maxLength = 128; reason.maxLength = 500;
    submit('workbench.account.confirm-create', () => change('/platform/tenants', { name: name.value.trim(), ownerUserId: owner.value.trim(), reason: reason.value.trim() }, 'workbench.account.tenant-created', false, reload)); button('common.control.cancel', () => perform(reload));
  });
  if (capabilities.includes('TENANT_READ') && !tenants.length) form.append(node('p', uiText.text("workbench.account-tenant-platform.no-tenants-yet")));
  for (const tenant of tenants) { const row = node('div', '', 'account-method'); row.append(node('strong', tenant.name), node('p', uiText.text(tenant.status === 'ACTIVE' ? "workbench.account-tenant-platform.active" : "workbench.account-tenant-platform.switched-off")), node('p', uiText.text("workbench.account-tenant-platform.owner") + ' · ' + tenant.ownerUserId));
    if (capabilities.includes('TENANT_STATUS')) button(tenant.status === 'ACTIVE' ? 'workbench.account.disable-tenant' : 'workbench.account.restore-tenant', () => {
      begin(tenant.status === 'ACTIVE' ? 'workbench.account.disable-tenant' : 'workbench.account.restore-tenant'); form.append(node('p', tenant.name));
      if (tenant.status === 'ACTIVE') form.append(node('p', uiText.text("workbench.account-tenant-platform.disabling-blocks-member-access-keeps-records-does-not")));
      const reason = field('workbench.account.operation-reason', 'reason', 'text', 'off'); reason.maxLength = 500;
      submit('workbench.account.confirm-operation', () => change('/platform/tenants/' + encodeURIComponent(tenant.tenantId) + (tenant.status === 'ACTIVE' ? '/disable' : '/enable'), { expectedVersion: tenant.version, reason: reason.value.trim() }, 'workbench.account.tenant-updated', false, reload)); button('common.control.cancel', () => perform(reload));
    }, row); form.append(row);
  }
}
