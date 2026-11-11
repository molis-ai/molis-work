import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AccountOperationInput } from "@molis-ai/molis-work-contracts/services/account";
import { accountOperation } from "./operations.js";
import { accountErrors } from "./errors.js";
import openapi from "./upstream/openapi.json" with { type: "json" };
import schemas from "./upstream/schemas.json" with { type: "json" };

/** Each management operation has one action and one frozen product route. No credential operations. */
const declarations = [
  ["getTenantCreationPolicy", "account.tenant-creation-policy.read", /* @version action.account.tenant-creation-policy.read */ 1, "读取租户创建策略"],
  ["createMyTenant", "account.tenant.create", /* @version action.account.tenant.create */ 1, "创建租户"],
  ["listFeatures", "account.features.list", /* @version action.account.features.list */ 1, "读取功能目录"],
  ["checkEntitlements", "account.entitlements.check", /* @version action.account.entitlements.check */ 1, "查询当前权益"],
  ["listMyTenants", "account.tenants.list", /* @version action.account.tenants.list */ 1, "读取所属租户"],
  ["getTenant", "account.tenant.read", /* @version action.account.tenant.read */ 1, "读取租户资料"],
  ["updateTenant", "account.tenant.update", /* @version action.account.tenant.update */ 1, "修改租户资料"],
  ["listMembers", "account.members.list", /* @version action.account.members.list */ 1, "读取租户成员"],
  ["updateMemberRole", "account.member.role", /* @version action.account.member.role */ 1, "修改成员角色"],
  ["removeMember", "account.member.remove", /* @version action.account.member.remove */ 1, "移除租户成员"],
  ["leaveTenant", "account.tenant.leave", /* @version action.account.tenant.leave */ 1, "退出租户"],
  ["createInvitation", "account.invitation.create", /* @version action.account.invitation.create */ 1, "邀请租户成员"],
  ["listTenantInvitations", "account.tenant-invitations.list", /* @version action.account.tenant-invitations.list */ 1, "读取租户邀请"],
  ["revokeInvitation", "account.invitation.revoke", /* @version action.account.invitation.revoke */ 1, "撤销租户邀请"],
  ["listMyInvitations", "account.invitations.list", /* @version action.account.invitations.list */ 1, "读取收到的邀请"],
  ["acceptInvitation", "account.invitation.accept", /* @version action.account.invitation.accept */ 1, "接受租户邀请"],
  ["declineInvitation", "account.invitation.decline", /* @version action.account.invitation.decline */ 1, "拒绝租户邀请"],
  ["createOwnershipTransfer", "account.ownership.create", /* @version action.account.ownership.create */ 1, "发起所有权交接"],
  ["listOwnershipTransfers", "account.ownership.list", /* @version action.account.ownership.list */ 1, "读取所有权交接"],
  ["acceptOwnershipTransfer", "account.ownership.accept", /* @version action.account.ownership.accept */ 1, "接受所有权交接"],
  ["cancelOwnershipTransfer", "account.ownership.cancel", /* @version action.account.ownership.cancel */ 1, "取消所有权交接"],
  ["createTenant", "account.platform-tenant.create", /* @version action.account.platform-tenant.create */ 1, "平台创建租户"],
  ["listPlatformTenants", "account.platform-tenants.list", /* @version action.account.platform-tenants.list */ 1, "平台读取租户列表"],
  ["getPlatformTenant", "account.platform-tenant.read", /* @version action.account.platform-tenant.read */ 1, "平台读取租户资料"],
  ["disableTenant", "account.platform-tenant.disable", /* @version action.account.platform-tenant.disable */ 1, "平台停用租户"],
  ["enableTenant", "account.platform-tenant.enable", /* @version action.account.platform-tenant.enable */ 1, "平台恢复租户"],
  ["listPlans", "account.plans.list", /* @version action.account.plans.list */ 1, "读取套餐目录"],
  ["listPersonalSubscriptions", "account.subscriptions.list", /* @version action.account.subscriptions.list */ 1, "读取个人订阅"],
  ["listTenantSubscriptions", "account.tenant-subscriptions.list", /* @version action.account.tenant-subscriptions.list */ 1, "读取租户订阅"],
  ["listSeatPools", "account.seat-pools.list", /* @version action.account.seat-pools.list */ 1, "读取租户席位库存"],
  ["listSeatAssignments", "account.seat-assignments.list", /* @version action.account.seat-assignments.list */ 1, "读取席位分配"],
  ["assignSeat", "account.seat.assign", /* @version action.account.seat.assign */ 1, "分配席位"],
  ["releaseSeat", "account.seat.release", /* @version action.account.seat.release */ 1, "回收席位"],
  ["reassignSeat", "account.seat.reassign", /* @version action.account.seat.reassign */ 1, "换绑席位"],
  ["createSubscription", "account.platform-subscription.create", /* @version action.account.platform-subscription.create */ 1, "平台开通订阅"],
  ["listPlatformSubscriptions", "account.platform-subscriptions.list", /* @version action.account.platform-subscriptions.list */ 1, "平台读取订阅列表"],
  ["getPlatformSubscription", "account.platform-subscription.read", /* @version action.account.platform-subscription.read */ 1, "平台读取订阅资料"],
  ["listPlatformSeatPools", "account.platform-seat-pools.list", /* @version action.account.platform-seat-pools.list */ 1, "平台读取订阅席位库存"],
  ["updateSubscription", "account.platform-subscription.update", /* @version action.account.platform-subscription.update */ 1, "平台变更订阅"],
  ["renewSubscription", "account.platform-subscription.renew", /* @version action.account.platform-subscription.renew */ 1, "平台续期订阅"],
  ["listPlatformAudit", "account.platform-audit.list", /* @version action.account.platform-audit.list */ 1, "平台读取商业审计"],
] as const;

function expand(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(expand);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (typeof record.$ref === "string") return expand((schemas.$defs as Record<string, unknown>)[record.$ref.split('/').at(-1)!]);
  return Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, expand(entry)]));
}
const object = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });
export const accountManagementActions = declarations.map(([operation, capability_id, version, title]) => {
  const central = accountOperation(operation), declaration = central.declaration, properties: Record<string, unknown> = {}, required: string[] = [];
  for (const [location, key] of [["path", "params"], ["query", "query"]] as const) {
    const parameters = declaration.parameters.filter(p => p.in === location);
    if (parameters.length) {
      properties[key] = object(Object.fromEntries(parameters.map(p => [p.name, expand(p.schema)])), parameters.filter(p => p.required).map(p => p.name));
      if (parameters.some(p => p.required)) required.push(key);
    }
  }
  if (declaration.requestBody) { properties.body = expand(declaration.requestBody.content["application/json"].schema); required.push("body"); }
  const idempotency = declaration.parameters.find(p => p.name === "Idempotency-Key");
  if (idempotency) { properties.idempotencyKey = expand(idempotency.schema); required.push("idempotencyKey"); }
  const response = expand(declaration.responses["200"]!.content["application/json"].schema) as { properties: { data: Record<string, unknown> } };
  const read = central.method === "GET" || operation === "checkEntitlements";
  const definition: ActionDefinition = { capability_id, version, operation: read ? "query" : "command", action: {
    scope: "home", audiences: ["user"], subject_kinds: [], scheduling: "concurrent", title,
    description: title + "；以中央账号、当前租户权限和版本为准，不改变本地 Home。",
    kind: read ? "query" : "operation", effect: read ? "read" : "write", permissions: [read ? "account:read" : "account:write"],
    input_schema: object(properties, required), output_schema: response.properties.data,
  } };
  const product = Object.entries(openapi.paths).find(([path, methods]) => path.startsWith('/api/account/') && Object.values(methods).some(d => d.operationId === 'product_' + operation));
  if (!product) throw accountErrors.invalid_configuration("Missing product management route");
  return { operation, definition, path: product[0], method: central.method };
});

/** Route selection cannot change the upstream operation, method, origin or caller identity. */
export function matchAccountManagementRoute(method: string, url: URL): { action: ActionDefinition; input: AccountOperationInput; write: boolean; idempotency: boolean } | null {
  for (const route of accountManagementActions) {
    if (route.method !== method) continue;
    const names: string[] = [];
    const pattern = route.path.replace(/\{([^}]+)\}/gu, (_part, name: string) => { names.push(name); return "([^/]+)"; });
    const matched = new RegExp('^' + pattern + '$').exec(url.pathname);
    if (!matched) continue;
    const params: Record<string, string> = {}, query: Record<string, string | number> = {};
    try { names.forEach((name, i) => { params[name] = decodeURIComponent(matched[i + 1]!); }); }
    catch { throw accountErrors.invalid_request("Invalid account route encoding"); }
    const parameters = accountOperation(route.operation).declaration.parameters;
    for (const [key, value] of url.searchParams) {
      const p = parameters.find(p => p.in === "query" && p.name === key);
      if (!p || Object.hasOwn(query, key) || (p.schema.type === "integer" && !/^[1-9][0-9]*$/u.test(value))) throw accountErrors.invalid_request("Invalid account query");
      query[key] = p.schema.type === "integer" ? Number(value) : value;
    }
    return { action: route.definition, input: { ...(names.length ? { params } : {}), ...(Object.keys(query).length ? { query } : {}) }, write: method !== "GET", idempotency: parameters.some(p => p.name === "Idempotency-Key") };
  }
  return null;
}
