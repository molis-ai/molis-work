import type { PlanVersion, Subscription } from "@molis-ai/molis-work-contracts/services/account";
import type { TenantPanel } from "./account-tenant-panel.js";
export const subscriptionLabels = { ACTIVE: '生效中', SCHEDULED: '尚未生效', EXPIRED: '已到期', DISABLED: '已停用' };
export const assignmentLabels = { RELEASED: '席位已回收', REASSIGNED: '已换绑', MEMBER_LEFT: '成员退出', MEMBER_REMOVED: '成员移除' };
export const subscriptionPath = (id: string) => '/platform/subscriptions/' + encodeURIComponent(id);
export const planName = (s: Subscription, plans: readonly PlanVersion[]) => plans.find(p => p.planId === s.planId && p.planVersion === s.planVersion)?.name ?? s.planId;
export const seatName = (id: string, type: string, subscriptions: readonly Subscription[], plans: readonly PlanVersion[]) => { const s = subscriptions.find(s => s.subscriptionId === id), p = plans.find(p => p.planId === s?.planId && p.planVersion === s?.planVersion); return (p?.name ?? id) + ' · ' + (p?.seatTypes.find(t => t.seatTypeId === type)?.name ?? type); };
export const canAssign = (id: string, subscriptions: readonly Subscription[]) => subscriptions.some(s => s.subscriptionId === id && s.status === 'ACTIVE' && Date.parse(s.startsAt) <= Date.now() && Date.now() < Date.parse(s.endsAt));
export function dateField(panel: TenantPanel, label: string, name: string, value: string) { const input = panel.ui.field(label, name, 'datetime-local', 'off'), date = new Date(value); input.value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16); const initial = input.value; return { input, iso: () => input.value === initial ? value : new Date(input.value).toISOString() }; }
export function reasonField(panel: TenantPanel) { const field = panel.ui.field('操作原因', 'reason', 'text', 'off'); field.maxLength = 500; return field; }

export function subscriptionRow(panel: TenantPanel, s: Subscription, plans: readonly PlanVersion[]) { const {node,L}=panel.ui,row=node('div','','account-method');row.append(node('strong',planName(s,plans)),node('p',L(subscriptionLabels[s.status])),node('p',new Date(s.startsAt).toLocaleString()+' — '+new Date(s.endsAt).toLocaleString()));return row; }
export function unavailable(panel: TenantPanel, reload: () => Promise<void>) { panel.begin('订阅状态暂不可确认');panel.ui.button('重试',()=>panel.ui.perform(reload));panel.ui.button('返回空间选择',()=>panel.ui.perform(panel.load)); }
