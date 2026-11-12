import { dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { AccountView, Invitation, OwnershipTransfer, TenantView, TenantCreationPolicyView } from "@molis-ai/molis-work-contracts/services/account";
import type { AccountUi } from "./account-management.js";
import { createTenantPanel, tenantRoleLabels } from "./account-tenant-panel.js";
import { renderTenantMembers } from "./account-tenant-members.js";
import { renderPlatformTenants } from "./account-tenant-platform.js";
import { renderSubscriptions } from "./account-subscriptions.js";
import { renderPlatformSubscriptions } from "./account-platform-subscriptions.js";

const uiText = globalThis.t;
export function openAccountTenants(ui: AccountUi, account: Extract<AccountView, { state: "AUTHENTICATED" }>, back: () => Promise<void>) {
  const { form, dialog, node, button, perform } = ui;
  const { panel, dispose } = createTenantPanel(ui, load);
  const finish = async () => { dispose(); dialog.removeEventListener('close', dispose); await back(); };
  dialog.addEventListener('close', dispose);
  async function load() {
    const current = panel.begin('workbench.account.personal-and-tenants'); form.append(node('p', uiText.text("workbench.account-tenants.loading-tenant-status")));
    try {
      const [tenants, invitations, transfers, policy] = await Promise.all([panel.list<TenantView>('/tenants'), panel.list<Invitation>('/invitations'), panel.list<OwnershipTransfer>('/ownership-transfers'), ui.request<TenantCreationPolicyView>('/tenant-creation-policy')]);
      if (!current()) return;
      form.replaceChildren(node('h3', uiText.text("workbench.account-tenants.personal-tenant-spaces")));
      const select = panel.select('workbench.account.current-space', 'accountScope', [['', uiText.text("workbench.account-tenants.personal-space")], ...tenants.map(t => [t.tenantId, t.name + ' · ' + uiText.text(t.status === 'DISABLED' ? "workbench.account-tenants.switched-off" : tenantRoleLabels[t.myRole])] as [string, string])]); select.required = false;
      select.onchange = () => { const tenant = tenants.find(t => t.tenantId === select.value); if (tenant) void perform(() => renderTenantMembers(panel, tenant, account.user.userId)); };
      if(policy.mode==='SELF_SERVICE')button('workbench.account-tenants.create',()=>{
        panel.begin('workbench.account-tenants.create');const name=ui.field('workbench.account.tenant-name','name','text','organization');name.maxLength=120;
        panel.submit('workbench.account-tenants.create',()=>panel.change('/tenants',{name:name.value.trim()},'workbench.account-tenants.created'));button('common.control.back',()=>perform(load));
      });
      button('workbench.account.personal-subscriptions', () => perform(() => renderSubscriptions(panel)));
      if (account.capabilities.some(c => c.startsWith('SUBSCRIPTION_') || c === 'AUDIT_READ')) button('workbench.account.platform-subscriptions', () => perform(() => renderPlatformSubscriptions(panel, account.capabilities)));
      button('workbench.account.refresh-tenants', () => perform(load)); button('workbench.account.back-account', finish);
      if (account.capabilities.some(c => c.startsWith('TENANT_'))) button('workbench.account.platform-tenants', () => perform(() => renderPlatformTenants(panel, account.capabilities)));
      const pending = invitations.filter(i => i.status === 'PENDING'), handoffs = transfers.filter(t => t.status === 'PENDING');
      if (pending.length || handoffs.length) form.append(node('h4', uiText.text("workbench.account-tenants.invitations-ownership-transfers")));
      for (const invitation of pending) { const row = node('div', '', 'account-method'); row.append(node('strong', uiText.text("workbench.account-tenants.join-tenant")), node('p', tenants.find(t => t.tenantId === invitation.tenantId)?.name ?? invitation.tenantId), node('p', uiText.text("workbench.account.invite-target-expiry", { target: invitation.targetSummary, end: dateArg(invitation.expiresAt, "datetime-with-seconds") })));
        button('workbench.account.join-tenant', () => perform(() => panel.change('/invitations/' + encodeURIComponent(invitation.invitationId) + '/accept', { expectedVersion: invitation.version }, 'workbench.account.joined-tenant')), row);
        button('workbench.account.decline', () => perform(() => panel.change('/invitations/' + encodeURIComponent(invitation.invitationId) + '/decline', { expectedVersion: invitation.version }, 'workbench.account.invitation-declined')), row); form.append(row); }
      for (const transfer of handoffs) { const tenant = tenants.find(t => t.tenantId === transfer.tenantId), receive = tenant?.membershipId === transfer.toMembershipId, row = node('div', '', 'account-method');
        row.append(node('strong', uiText.text("workbench.account-tenants.ownership-transfer")), node('p', tenant?.name ?? transfer.tenantId), node('p', uiText.text("workbench.account.expiry", { end: dateArg(transfer.expiresAt, "datetime-with-seconds") })));
        if (tenant?.status === 'ACTIVE') button(receive ? 'workbench.account.accept-ownership' : 'workbench.account.cancel-transfer', () => {
          if (!receive || window.confirm(uiText.text("workbench.account-tenants.will-become-owner-previous-owner-will-become-member"))) return perform(() => panel.change('/ownership-transfers/' + encodeURIComponent(transfer.transferId) + (receive ? '/accept' : '/cancel'), { expectedVersion: transfer.version }, receive ? 'workbench.account.ownership-transferred' : 'workbench.account.transfer-cancelled'));
        }, row); form.append(row);
      }
    } catch (error) { if (current()) { panel.begin('workbench.account.tenant-status-unknown'); button('common.control.retry', () => perform(load)); button('workbench.account.back-account', finish); } throw error; }
  }
  void perform(load);
  return () => { dispose(); dialog.removeEventListener('close', dispose); };
}
