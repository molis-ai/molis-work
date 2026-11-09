import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PlatformTenantView } from "@molis-ai/molis-work-contracts/services/account";
import type { TenantPanel } from "./account-tenant-panel.js";
export async function renderPlatformTenants(panel: TenantPanel, capabilities: readonly string[]) {
  const { ui, begin, list, submit, change, load } = panel, { form, node, field, button, perform } = ui;
  const current = begin('平台租户管理'), reload = () => renderPlatformTenants(panel, capabilities);
  button('返回空间选择', () => perform(load));
  const tenants = capabilities.includes('TENANT_READ') ? await list<PlatformTenantView>('/platform/tenants') : [];
  if (!current()) return;
  if (capabilities.includes('TENANT_CREATE')) button('创建并分配租户', () => {
    begin('创建并分配租户'); const name = field('租户名称', 'tenantName', 'text', 'organization'), owner = field('所有者账号 ID', 'ownerUserId', 'text', 'off'), reason = field('操作原因', 'reason', 'text', 'off'); name.maxLength = 80; owner.maxLength = 128; reason.maxLength = 500;
    submit('确认创建', () => change('/platform/tenants', { name: name.value.trim(), ownerUserId: owner.value.trim(), reason: reason.value.trim() }, '租户已创建并分配给所有者。', false, reload)); button('取消', () => perform(reload));
  });
  if (capabilities.includes('TENANT_READ') && !tenants.length) form.append(node('p', uiText.text("workbench.account-tenant-platform.no-tenants-yet")));
  for (const tenant of tenants) { const row = node('div', '', 'account-method'); row.append(node('strong', tenant.name), node('p', uiText.text(tenant.status === 'ACTIVE' ? "workbench.account-tenant-platform.active" : "workbench.account-tenant-platform.switched-off")), node('p', uiText.text("workbench.account-tenant-platform.owner") + ' · ' + tenant.ownerUserId));
    if (capabilities.includes('TENANT_STATUS')) button(tenant.status === 'ACTIVE' ? '停用租户' : '恢复租户', () => {
      begin(tenant.status === 'ACTIVE' ? '停用租户' : '恢复租户'); form.append(node('p', tenant.name));
      if (tenant.status === 'ACTIVE') form.append(node('p', uiText.text("workbench.account-tenant-platform.disabling-blocks-member-access-keeps-records-does-not")));
      const reason = field('操作原因', 'reason', 'text', 'off'); reason.maxLength = 500;
      submit('确认操作', () => change('/platform/tenants/' + encodeURIComponent(tenant.tenantId) + (tenant.status === 'ACTIVE' ? '/disable' : '/enable'), { expectedVersion: tenant.version, reason: reason.value.trim() }, '租户状态已更新。', false, reload)); button('取消', () => perform(reload));
    }, row); form.append(row);
  }
}
