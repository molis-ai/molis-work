import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Invitation, Membership, TenantView } from "@molis-ai/molis-work-contracts/services/account";
import { tenantPath, tenantRoleLabels, type TenantPanel } from "./account-tenant-panel.js";

import { renderSubscriptions } from "./account-subscriptions.js";
export async function renderTenantMembers(panel: TenantPanel, tenant: TenantView, userId: string) {
  const { ui, begin, list, select, submit, change, load } = panel, { form, L, node, field, button, request, perform } = ui;
  const current = begin('正在读取成员…'), path = tenantPath(tenant.tenantId);
  button('返回空间选择', () => perform(load));
  if (tenant.status === 'DISABLED') { form.replaceChildren(node('p', uiText.text("workbench.account-tenant-members.tenant-disabled-contact-platform-administrator"))); button('返回空间选择', () => perform(load)); return; }
  let view: TenantView;
  try { view = await request<TenantView>(path); } catch (error) { if (current()) { begin('租户状态暂不可确认'); button('重试', () => perform(() => renderTenantMembers(panel, tenant, userId))); button('返回空间选择', () => perform(load)); } throw error; }
  if (!current()) return;
  const [members, invitations] = await Promise.all([list<Membership>(path + '/members'), view.myRole === 'MEMBER' ? [] : list<Invitation>(path + '/invitations')]);
  if (!current()) return;
  form.replaceChildren(node('h3', view.name), node('p', L(tenantRoleLabels[view.myRole])));
  button('返回空间选择', () => perform(load));
  button('订阅与席位', () => perform(() => renderSubscriptions(panel, view)));
  const manager = view.myRole !== 'MEMBER', owner = view.myRole === 'OWNER', active = members.filter(m => m.status === 'ACTIVE');
  const cancel = () => button('取消', () => perform(() => renderTenantMembers(panel, view, userId)));
  if (manager) button('修改租户资料', () => { begin('修改租户资料'); const name = field('租户名称', 'tenantName', 'text', 'organization'); name.value = view.name; name.maxLength = 80;
    submit('保存租户资料', () => change(path, { name: name.value.trim(), expectedVersion: view.version }, '租户资料已保存。', true)); cancel(); });
  form.append(node('h4', uiText.text("workbench.account-tenant-members.member")));
  for (const member of active) {
    const row = node('div', '', 'account-method'); row.append(node('strong', member.userId === userId ? uiText.text("workbench.account-tenant-members.me") : member.userId), node('p', L(tenantRoleLabels[member.role])));
    if (owner && member.role !== 'OWNER') button(member.role === 'ADMIN' ? '设为成员' : '设为管理员', () => perform(() => change(path + '/members/' + encodeURIComponent(member.membershipId) + '/role', { role: member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN', expectedVersion: member.version }, '成员角色已更新。', true)), row);
    if (manager && member.userId !== userId && member.role !== 'OWNER' && (owner || member.role === 'MEMBER')) button('移除成员', () => {
      if (window.confirm(uiText.text("workbench.account-tenant-members.remove-member-release-their-seats-tenant"))) return perform(() => change(path + '/members/' + encodeURIComponent(member.membershipId) + '/remove', { expectedVersion: member.version }, '已移除成员并释放其租户席位。'));
    }, row);
    form.append(row);
  }
  if (manager) {
    button('邀请成员', () => { begin('邀请成员'); const kind = select('邀请方式', 'inviteKind', [['EMAIL', uiText.text("workbench.account-tenant-members.email")], ['PHONE', uiText.text("workbench.account-tenant-members.phone")], ['USER', uiText.text("workbench.account-tenant-members.molis-account-id")]]);
      const target = field('受邀邮箱、+86 手机号或账号 ID', 'inviteTarget', 'email', 'off'); target.maxLength = 254;
      kind.onchange = () => { target.value = ''; target.type = kind.value === 'EMAIL' ? 'email' : 'text'; if (kind.value === 'PHONE') target.pattern = '\\+861[3-9][0-9]{9}'; else target.removeAttribute('pattern'); };
      submit('发送邀请', () => change(path + '/invitations', { target: { kind: kind.value, value: target.value.trim() } }, '邀请已创建，受邀者登录后可确认加入。')); cancel(); });
    for (const invitation of invitations.filter(i => i.status === 'PENDING')) { const row = node('div', '', 'account-method'); row.append(node('p', invitation.targetSummary), node('p', uiText.text("workbench.account-tenant-members.awaiting-confirmation") + ' · ' + new Date(invitation.expiresAt).toLocaleString()));
      button('撤销邀请', () => perform(() => change(path + '/invitations/' + encodeURIComponent(invitation.invitationId) + '/revoke', { expectedVersion: invitation.version }, '邀请已撤销。')), row); form.append(row); }
  }
  if (owner) button('所有权交接', () => { begin('所有权交接'); const target = select('新所有者', 'nextOwner', [['', uiText.text("workbench.account-tenant-members.select-existing-member")], ...active.filter(m => m.role !== 'OWNER').map(m => [m.membershipId, m.userId] as [string, string])]);
    form.append(node('p', uiText.text("workbench.account-tenant-members.after-acceptance-become-member-retain-assigned-seats")));
    submit('发起交接', async () => { if (window.confirm(uiText.text("workbench.account-tenant-members.start-ownership-transfer"))) await change(path + '/ownership-transfers', { targetMembershipId: target.value, expectedVersion: view.version }, '交接已发起，等待对方确认。'); }); cancel();
  });
  else { const me = active.find(m => m.userId === userId); if (me) button('退出租户', () => { if (window.confirm(uiText.text("workbench.account-tenant-members.leave-tenant-release-seats-here"))) return perform(() => change(path + '/leave', { expectedVersion: me.version }, '已退出租户并释放租户席位。')); }); }
}
