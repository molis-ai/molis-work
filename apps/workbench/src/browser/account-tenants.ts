import type { AccountView, Invitation, OwnershipTransfer, TenantView, TenantCreationPolicyView } from "@molis-ai/molis-work-contracts/services/account";
import type { AccountUi } from "./account-management.js";
import { createTenantPanel, tenantRoleLabels } from "./account-tenant-panel.js";
import { renderTenantMembers } from "./account-tenant-members.js";
import { renderPlatformTenants } from "./account-tenant-platform.js";
import { renderSubscriptions } from "./account-subscriptions.js";
import { renderPlatformSubscriptions } from "./account-platform-subscriptions.js";
export function openAccountTenants(ui: AccountUi, account: Extract<AccountView, { state: "AUTHENTICATED" }>, back: () => Promise<void>) {
  const { form, dialog, L, node, button, perform } = ui;
  const { panel, dispose } = createTenantPanel(ui, load);
  const finish = async () => { dispose(); dialog.removeEventListener('close', dispose); await back(); };
  dialog.addEventListener('close', dispose);
  async function load() {
    const current = panel.begin('个人与租户'); form.append(node('p', L('正在读取租户状态…')));
    try {
      const [tenants, invitations, transfers, policy] = await Promise.all([panel.list<TenantView>('/tenants'), panel.list<Invitation>('/invitations'), panel.list<OwnershipTransfer>('/ownership-transfers'), ui.request<TenantCreationPolicyView>('/tenant-creation-policy')]);
      if (!current()) return;
      form.replaceChildren(node('h3', L('个人与租户')));
      const select = panel.select('当前空间', 'accountScope', [['', L('个人空间')], ...tenants.map(t => [t.tenantId, t.name + ' · ' + L(t.status === 'DISABLED' ? '已停用' : tenantRoleLabels[t.myRole])] as [string, string])]); select.required = false;
      select.onchange = () => { const tenant = tenants.find(t => t.tenantId === select.value); if (tenant) void perform(() => renderTenantMembers(panel, tenant, account.user.userId)); };
      if(policy.mode==='SELF_SERVICE')button('创建租户',()=>{
        panel.begin('创建租户');const name=ui.field('租户名称','name','text','organization');name.maxLength=120;
        panel.submit('创建租户',()=>panel.change('/tenants',{name:name.value.trim()},'租户已创建。'));button('返回',()=>perform(load));
      });
      button('个人订阅', () => perform(() => renderSubscriptions(panel)));
      if (account.capabilities.some(c => c.startsWith('SUBSCRIPTION_') || c === 'AUDIT_READ')) button('平台订阅管理', () => perform(() => renderPlatformSubscriptions(panel, account.capabilities)));
      button('刷新租户状态', () => perform(load)); button('返回账号', finish);
      if (account.capabilities.some(c => c.startsWith('TENANT_'))) button('平台租户管理', () => perform(() => renderPlatformTenants(panel, account.capabilities)));
      const pending = invitations.filter(i => i.status === 'PENDING'), handoffs = transfers.filter(t => t.status === 'PENDING');
      if (pending.length || handoffs.length) form.append(node('h4', L('邀请与交接')));
      for (const invitation of pending) { const row = node('div', '', 'account-method'); row.append(node('strong', L('加入租户')), node('p', tenants.find(t => t.tenantId === invitation.tenantId)?.name ?? invitation.tenantId), node('p', invitation.targetSummary + ' · ' + new Date(invitation.expiresAt).toLocaleString()));
        button('确认加入', () => perform(() => panel.change('/invitations/' + encodeURIComponent(invitation.invitationId) + '/accept', { expectedVersion: invitation.version }, '已加入租户。')), row);
        button('拒绝', () => perform(() => panel.change('/invitations/' + encodeURIComponent(invitation.invitationId) + '/decline', { expectedVersion: invitation.version }, '已拒绝邀请。')), row); form.append(row); }
      for (const transfer of handoffs) { const tenant = tenants.find(t => t.tenantId === transfer.tenantId), receive = tenant?.membershipId === transfer.toMembershipId, row = node('div', '', 'account-method');
        row.append(node('strong', L('所有权交接')), node('p', tenant?.name ?? transfer.tenantId), node('p', new Date(transfer.expiresAt).toLocaleString()));
        if (tenant?.status === 'ACTIVE') button(receive ? '确认接收所有权' : '取消交接', () => {
          if (!receive || window.confirm(L('接收后你将成为所有者，原所有者变为普通成员。确认接收？'))) return perform(() => panel.change('/ownership-transfers/' + encodeURIComponent(transfer.transferId) + (receive ? '/accept' : '/cancel'), { expectedVersion: transfer.version }, receive ? '已完成所有权交接。' : '已取消交接。'));
        }, row); form.append(row);
      }
    } catch (error) { if (current()) { panel.begin('租户状态暂不可确认'); button('重试', () => perform(load)); button('返回账号', finish); } throw error; }
  }
  void perform(load);
  return () => { dispose(); dialog.removeEventListener('close', dispose); };
}
