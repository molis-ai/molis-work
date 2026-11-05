import type { ActionDefinition, ActionProviderRegistration, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AccountSessionManager } from "./session-types.js";
import schemas from "./upstream/schemas.json" with { type: "json" };
import type { AccountOperationInput } from "@molis-ai/molis-work-contracts/services/account";
import { accountManagementActions } from "./management-actions.js";
export const ACCOUNT_PROVIDER_ID = "system.account";
export const ACCOUNT_PERMISSIONS = ["account:read", "account:write"] as const;
function expand(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(expand);
  if (!value || typeof value !== "object") return value;
  const entry = value as Record<string, unknown>;
  // Auth custom URL format is represented with standard action-schema keywords; the client also validates the exact frozen Auth schema.
  if (entry.format === "http-url") return { ...entry, format: "uri", pattern: "^https?://" };
  if (typeof entry.$ref === "string") return expand((schemas.$defs as Record<string, unknown>)[entry.$ref.split('/').at(-1)!]);
  return Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, expand(child)]));
}
const schema = (name: keyof typeof schemas.$defs) => expand(schemas.$defs[name]) as Record<string, unknown>;
const profileSchema = schema("ProfileUpdateRequest");
const profileInput = { ...profileSchema, properties: { ...profileSchema.properties as Record<string, unknown>, idempotencyKey: { type: "string", minLength: 16, maxLength: 128, pattern: "^[ -~]+$" } }, required: [...profileSchema.required as string[], "idempotencyKey"] };
const metadata = { scope: "home", audiences: ["user"], subject_kinds: [], scheduling: "concurrent" } as const;
export const accountActions = {
  methods: { capability_id: "account.login-methods.read", version: 1, operation: "query", action: { ...metadata,
    title: "读取登录方式", description: "读取当前 Molis 账号的登录方式及验证状态，只返回脱敏标签，不包含密码或验证凭据。", kind: "query", effect: "read", permissions: [ACCOUNT_PERMISSIONS[0]], input_schema: schema("Empty"), output_schema: schema("LoginMethodsView") } },
  profile: { capability_id: "account.profile.update", version: 1, operation: "command", action: { ...metadata,
    title: "修改个人资料", description: "按读取到的版本更新当前 Molis 账号的昵称或头像，同时影响两个产品显示的统一资料。", kind: "operation", effect: "write", permissions: [ACCOUNT_PERMISSIONS[1]], input_schema: profileInput, output_schema: schema("UserView") } },
} as const satisfies Record<string, ActionDefinition>;
export function accountActionProvider(session: () => AccountSessionManager): ActionProviderRegistration {
  return { provider: { provider_id: ACCOUNT_PROVIDER_ID, kind: "system", title: "Molis 账号" }, definitions: [...Object.values(accountActions), ...accountManagementActions.map(item => item.definition)],
    handlers: [...Object.entries(accountActions).map(([name, definition]) => ({ capability_id: definition.capability_id, version: definition.version,
      handle: async (caller: ActionExecutionContext, input: unknown) => {
        const { idempotencyKey, ...body } = input as Record<string, unknown>;
        return (await session().invoke(name === "profile" ? "updateProfile" : "listLoginMethods", name === "profile" ? { body, idempotencyKey: String(idempotencyKey) } : {}, {
        signal: caller.signal, assertCurrent: () => { caller.signal?.throwIfAborted(); caller.assert_authority_current?.(); }, beforeEffect: caller.beforeEffect,
      })).data; },
    })), ...accountManagementActions.map(({ operation, definition }) => ({ capability_id: definition.capability_id, version: definition.version,
      handle: async (caller: ActionExecutionContext, input: unknown) => (await session().invoke(operation, input as AccountOperationInput, {
        signal: caller.signal, assertCurrent: () => { caller.signal?.throwIfAborted(); caller.assert_authority_current?.(); }, beforeEffect: caller.beforeEffect,
      })).data,
    }))],
  };
}
