import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Subscription, PlanVersion, SeatPool, Assignment, Membership, TenantView } from "@molis-ai/molis-work-contracts/services/account";
import { tenantPath, type TenantPanel } from "./account-tenant-panel.js";
import { canAssign, seatName } from "./account-billing-fields.js";
export async function seatOperation(panel: TenantPanel, tenant: TenantView, pools: SeatPool[], members: Membership[], subscriptions: Subscription[], plans: PlanVersion[], assignment: Assignment | undefined, reload: () => Promise<void>) {
  const { ui, begin, select, submit, change } = panel, { form, button, node, perform } = ui;
  const current = begin(assignment ? 'workbench.account.reassign-seat' : 'workbench.account.assign-seat');button('common.control.cancel', () => perform(reload));
  const assigned = await panel.list<Assignment>(tenantPath(tenant.tenantId) + '/seat-assignments');if (!current()) return;
  const poolSelect = assignment ? undefined : select('workbench.account.seat-type', 'seatPool', [['', uiText.text("workbench.account-seats.select-available-seat")], ...pools.flatMap((p,i) => p.availableCount > 0 && canAssign(p.subscriptionId, subscriptions) ? [[String(i), seatName(p.subscriptionId, p.seatTypeId, subscriptions, plans)] as [string,string]] : [])]);
  const target = select('workbench.account.assign-to', 'seatMember', [['', uiText.text("workbench.account-seats.select-active-member")]]);
  const populate = () => { const pool = pools[Number(poolSelect?.value)], sub = assignment?.subscriptionId ?? pool?.subscriptionId, type = assignment?.seatTypeId ?? pool?.seatTypeId;
    target.replaceChildren();for (const [value, text] of [['', uiText.text("workbench.account-seats.select-active-member")], ...members.filter(m => m.status === 'ACTIVE' && !assigned.some(a => a.membershipId === m.membershipId && a.subscriptionId === sub && a.seatTypeId === type)).map(m => [m.membershipId, m.userId])]) { const option = node('option', text); option.value = value!;target.append(option); } };
  if (poolSelect) poolSelect.onchange = populate;populate();
  if (assignment) form.append(node('p', seatName(assignment.subscriptionId, assignment.seatTypeId, subscriptions, plans)));
  submit('workbench.account.confirm-seat-change', async () => {
    if (!window.confirm(uiText.text(assignment ? "workbench.account-seats.end-assignment-reassign-selected-member" : "workbench.account-seats.assign-seat-selected-member"))) return;
    const pool = pools[Number(poolSelect?.value)];
    await change(tenantPath(tenant.tenantId) + '/seat-assignments' + (assignment ? '/' + encodeURIComponent(assignment.assignmentId) + '/reassign' : ''), assignment ? { targetMembershipId: target.value, expectedVersion: assignment.version } : { subscriptionId: pool!.subscriptionId, seatTypeId: pool!.seatTypeId, membershipId: target.value, expectedVersion: pool!.version }, 'workbench.account.seat-updated', false, reload);
  });
}
