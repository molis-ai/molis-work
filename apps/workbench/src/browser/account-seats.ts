import type { Subscription, PlanVersion, SeatPool, Assignment, Membership, TenantView } from "@molis-ai/molis-work-contracts/services/account";
import { tenantPath, type TenantPanel } from "./account-tenant-panel.js";
import { canAssign, seatName } from "./account-billing-fields.js";
export async function seatOperation(panel: TenantPanel, tenant: TenantView, pools: SeatPool[], members: Membership[], subscriptions: Subscription[], plans: PlanVersion[], assignment: Assignment | undefined, reload: () => Promise<void>) {
  const { ui, begin, select, submit, change } = panel, { form, button, L, node, perform } = ui;
  const current = begin(assignment ? '换绑席位' : '分配席位');button('取消', () => perform(reload));
  const assigned = await panel.list<Assignment>(tenantPath(tenant.tenantId) + '/seat-assignments');if (!current()) return;
  const poolSelect = assignment ? undefined : select('席位类型', 'seatPool', [['', L('选择可用席位')], ...pools.flatMap((p,i) => p.availableCount > 0 && canAssign(p.subscriptionId, subscriptions) ? [[String(i), seatName(p.subscriptionId, p.seatTypeId, subscriptions, plans)] as [string,string]] : [])]);
  const target = select('分配给', 'seatMember', [['', L('选择有效成员')]]);
  const populate = () => { const pool = pools[Number(poolSelect?.value)], sub = assignment?.subscriptionId ?? pool?.subscriptionId, type = assignment?.seatTypeId ?? pool?.seatTypeId;
    target.replaceChildren();for (const [value, text] of [['', L('选择有效成员')], ...members.filter(m => m.status === 'ACTIVE' && !assigned.some(a => a.membershipId === m.membershipId && a.subscriptionId === sub && a.seatTypeId === type)).map(m => [m.membershipId, m.userId])]) { const option = node('option', text); option.value = value!;target.append(option); } };
  if (poolSelect) poolSelect.onchange = populate;populate();
  if (assignment) form.append(node('p', seatName(assignment.subscriptionId, assignment.seatTypeId, subscriptions, plans)));
  submit('确认席位操作', async () => {
    if (!window.confirm(L(assignment ? '确认换绑？原分配结束，席位转给所选成员。' : '确认将席位分配给所选成员？'))) return;
    const pool = pools[Number(poolSelect?.value)];
    await change(tenantPath(tenant.tenantId) + '/seat-assignments' + (assignment ? '/' + encodeURIComponent(assignment.assignmentId) + '/reassign' : ''), assignment ? { targetMembershipId: target.value, expectedVersion: assignment.version } : { subscriptionId: pool!.subscriptionId, seatTypeId: pool!.seatTypeId, membershipId: target.value, expectedVersion: pool!.version }, '席位已更新。', false, reload);
  });
}
