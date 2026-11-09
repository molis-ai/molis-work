import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AccountView, Invitation, OwnershipTransfer, TenantView } from "@molis-ai/molis-work-contracts/services/account";
import type { AccountUi } from "./account-management.js";
import { createTenantPanel, tenantRoleLabels } from "./account-tenant-panel.js";
import { renderTenantMembers } from "./account-tenant-members.js";
import { renderPlatformTenants } from "./account-tenant-platform.js";
import { renderSubscriptions } from "./account-subscriptions.js";
import { renderPlatformSubscriptions } from "./account-platform-subscriptions.js";
export function openAccountTenants(ui: AccountUi, account: Extract<AccountView, { state: "AUTHENTICATED" }>, back: () => Promise<void>) {
  const { form, dialog, node, button, perform } = ui;
  const { panel, dispose } = createTenantPanel(ui, load);
  const finish = async () => { dispose(); dialog.removeEventListener('close', dispose); await back(); };
  dialog.addEventListener('close', dispose);
  async function load() {
    const current = panel.begin('个人与租户'); form.append(node('p', uiText.text("workbench.account-tenants.loading-tenant-status")));
    try {
      const [tenants, invitations, transfers] = await Promise.all([panel.list<TenantView>('/tenants'), panel.list<Invitation>('/invitations'), panel.list<OwnershipTransfer>('/ownership-transfers')]);
      if (!current()) return;
      form.replaceChildren(node('h3', uiText.text("workbench.account-tenants.personal-tenant-spaces")));
      const select = panel.select('当前空间', 'accountScope', [['', uiText.text("workbench.account-tenants.personal-space")], ...tenants.map(t => [t.tenantId, t.name + ' · ' + uiText.text(t.status === 'DISABLED' ? "workbench.account-tenants.switched-off" : tenantRoleLabels[t.myRole])] as [string, string])]); select.required = false;
      select.onchange = () => { const tenant = tenants.find(t => t.tenantId === select.value); if (tenant) void perform(() => renderTenantMembers(panel, tenant, account.user.userId)); };
      button('个人订阅', () => perform(() => renderSubscriptions(panel)));
      if (account.capabilities.some(c => c.startsWith('SUBSCRIPTION_') || c === 'AUDIT_READ')) button('平台订阅管理', () => perform(() => renderPlatformSubscriptions(panel, account.capabilities)));
      button('刷新租户状态', () => perform(load)); button('返回账号', finish);
      if (account.capabilities.some(c => c.startsWith('TENANT_'))) button('平台租户管理', () => perform(() => renderPlatformTenants(panel, account.capabilities)));
      const pending = invitations.filter(i => i.status === 'PENDING'), handoffs = transfers.filter(t => t.status === 'PENDING');
      if (pending.length || handoffs.length) form.append(node('h4', uiText.text("workbench.account-tenants.invitations-ownership-transfers")));
      for (const invitation of pending) { const row = node('div', '', 'account-method'); row.append(node('strong', uiText.text("workbench.account-tenants.join-tenant")), node('p', tenants.find(t => t.tenantId === invitation.tenantId)?.name ?? invitation.tenantId), node('p', invitation.targetSummary + ' · ' + new Date(invitation.expiresAt).toLocaleString()));
        button('确认加入', () => perform(() => panel.change('/invitations/' + encodeURIComponent(invitation.invitationId) + '/accept', { expectedVersion: invitation.version }, '已加入租户。')), row);
        button('拒绝', () => perform(() => panel.change('/invitations/' + encodeURIComponent(invitation.invitationId) + '/decline', { expectedVersion: invitation.version }, '已拒绝邀请。')), row); form.append(row); }
      for (const transfer of handoffs) { const tenant = tenants.find(t => t.tenantId === transfer.tenantId), receive = tenant?.membershipId === transfer.toMembershipId, row = node('div', '', 'account-method');
        row.append(node('strong', uiText.text("workbench.account-tenants.ownership-transfer")), node('p', tenant?.name ?? transfer.tenantId), node('p', new Date(transfer.expiresAt).toLocaleString()));
        if (tenant?.status === 'ACTIVE') button(receive ? '确认接收所有权' : '取消交接', () => {
          if (!receive || window.confirm(uiText.text("workbench.account-tenants.will-become-owner-previous-owner-will-become-member"))) return perform(() => panel.change('/ownership-transfers/' + encodeURIComponent(transfer.transferId) + (receive ? '/accept' : '/cancel'), { expectedVersion: transfer.version }, receive ? '已完成所有权交接。' : '已取消交接。'));
        }, row); form.append(row);
      }
    } catch (error) { if (current()) { panel.begin('租户状态暂不可确认'); button('重试', () => perform(load)); button('返回账号', finish); } throw error; }
  }
  void perform(load);
  return () => { dispose(); dialog.removeEventListener('close', dispose); };
}
