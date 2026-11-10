import { dateArg } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Invitation, Membership, TenantView } from "@molis-ai/molis-work-contracts/services/account";
import { tenantPath, tenantRoleLabels, type TenantPanel } from "./account-tenant-panel.js";

import { renderSubscriptions } from "./account-subscriptions.js";

const uiText = globalThis.t;
export async function renderTenantMembers(panel: TenantPanel, tenant: TenantView, userId: string) {
  const { ui, begin, list, select, submit, change, load } = panel, { form, node, field, button, request, perform } = ui;
  const current = begin('workbench.account.loading-members'), path = tenantPath(tenant.tenantId);
  button('workbench.account.back-spaces', () => perform(load));
  if (tenant.status === 'DISABLED') { form.replaceChildren(node('p', uiText.text("workbench.account-tenant-members.tenant-disabled-contact-platform-administrator"))); button('workbench.account.back-spaces', () => perform(load)); return; }
  let view: TenantView;
  try { view = await request<TenantView>(path); } catch (error) { if (current()) { begin('workbench.account.tenant-status-unknown'); button('common.control.retry', () => perform(() => renderTenantMembers(panel, tenant, userId))); button('workbench.account.back-spaces', () => perform(load)); } throw error; }
  if (!current()) return;
  const [members, invitations] = await Promise.all([list<Membership>(path + '/members'), view.myRole === 'MEMBER' ? [] : list<Invitation>(path + '/invitations')]);
  if (!current()) return;
  form.replaceChildren(node('h3', view.name), node('p', uiText.text(tenantRoleLabels[view.myRole])));
  button('workbench.account.back-spaces', () => perform(load));
  button('workbench.account.subscriptions-seats', () => perform(() => renderSubscriptions(panel, view)));
  const manager = view.myRole !== 'MEMBER', owner = view.myRole === 'OWNER', active = members.filter(m => m.status === 'ACTIVE');
  const cancel = () => button('common.control.cancel', () => perform(() => renderTenantMembers(panel, view, userId)));
  if (manager) button('workbench.account.edit-tenant', () => { begin('workbench.account.edit-tenant'); const name = field('workbench.account.tenant-name', 'tenantName', 'text', 'organization'); name.value = view.name; name.maxLength = 80;
    submit('workbench.account.save-tenant', () => change(path, { name: name.value.trim(), expectedVersion: view.version }, 'workbench.account.tenant-saved', true)); cancel(); });
  form.append(node('h4', uiText.text("workbench.account-tenant-members.member")));
  for (const member of active) {
    const row = node('div', '', 'account-method'); row.append(node('strong', member.userId === userId ? uiText.text("workbench.account-tenant-members.me") : member.userId), node('p', uiText.text(tenantRoleLabels[member.role])));
    if (owner && member.role !== 'OWNER') button(member.role === 'ADMIN' ? 'workbench.account.make-member' : 'workbench.account.make-admin', () => perform(() => change(path + '/members/' + encodeURIComponent(member.membershipId) + '/role', { role: member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN', expectedVersion: member.version }, 'workbench.account.member-role-updated', true)), row);
    if (manager && member.userId !== userId && member.role !== 'OWNER' && (owner || member.role === 'MEMBER')) button('workbench.account.remove-member', () => {
      if (window.confirm(uiText.text("workbench.account-tenant-members.remove-member-release-their-seats-tenant"))) return perform(() => change(path + '/members/' + encodeURIComponent(member.membershipId) + '/remove', { expectedVersion: member.version }, 'workbench.account.member-removed-seats-released'));
    }, row);
    form.append(row);
  }
  if (manager) {
    button('workbench.account.invite-member', () => { begin('workbench.account.invite-member'); const kind = select('workbench.account.invite-by', 'inviteKind', [['EMAIL', uiText.text("workbench.account-tenant-members.email")], ['PHONE', uiText.text("workbench.account-tenant-members.phone")], ['USER', uiText.text("workbench.account-tenant-members.molis-account-id")]]);
      const target = field('workbench.account.invite-target', 'inviteTarget', 'email', 'off'); target.maxLength = 254;
      kind.onchange = () => { target.value = ''; target.type = kind.value === 'EMAIL' ? 'email' : 'text'; if (kind.value === 'PHONE') target.pattern = '\\+861[3-9][0-9]{9}'; else target.removeAttribute('pattern'); };
      submit('workbench.account.send-invitation', () => change(path + '/invitations', { target: { kind: kind.value, value: target.value.trim() } }, 'workbench.account.invitation-sent')); cancel(); });
    for (const invitation of invitations.filter(i => i.status === 'PENDING')) { const row = node('div', '', 'account-method'); row.append(node('p', invitation.targetSummary), node('p', uiText.text("workbench.account.invite-pending-expiry", { end: dateArg(invitation.expiresAt, "datetime-with-seconds") })));
      button('workbench.account.revoke-invitation', () => perform(() => change(path + '/invitations/' + encodeURIComponent(invitation.invitationId) + '/revoke', { expectedVersion: invitation.version }, 'workbench.account.invitation-revoked')), row); form.append(row); }
  }
  if (owner) button('workbench.account.transfer-ownership', () => { begin('workbench.account.transfer-ownership'); const target = select('workbench.account.new-owner', 'nextOwner', [['', uiText.text("workbench.account-tenant-members.select-existing-member")], ...active.filter(m => m.role !== 'OWNER').map(m => [m.membershipId, m.userId] as [string, string])]);
    form.append(node('p', uiText.text("workbench.account-tenant-members.after-acceptance-become-member-retain-assigned-seats")));
    submit('workbench.account.start-transfer', async () => { if (window.confirm(uiText.text("workbench.account-tenant-members.start-ownership-transfer"))) await change(path + '/ownership-transfers', { targetMembershipId: target.value, expectedVersion: view.version }, 'workbench.account.transfer-started'); }); cancel();
  });
  else { const me = active.find(m => m.userId === userId); if (me) button('workbench.account.leave-tenant', () => { if (window.confirm(uiText.text("workbench.account-tenant-members.leave-tenant-release-seats-here"))) return perform(() => change(path + '/leave', { expectedVersion: me.version }, 'workbench.account.left-tenant')); }); }
}
