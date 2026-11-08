import openapi from "./upstream/openapi.json" with { type: "json" };
import schemas from "./upstream/schemas.json" with { type: "json" };
import { validateNamed, validateWithDocument, type Schema } from "./upstream/validate.js";
import { accountErrors } from "./errors.js";
import type { AccountEnvironmentConfig, AccountOperationInput } from "@molis-ai/molis-work-contracts/services/account";

interface Parameter { readonly name: string; readonly in: string; readonly required?: boolean; readonly schema: Schema }
interface Media { readonly content: { readonly "application/json": { readonly schema: { readonly $ref: string } } } }
interface Declaration {
  readonly operationId: string;
  readonly parameters: readonly Parameter[];
  readonly security: readonly Record<string, unknown>[];
  readonly requestBody?: Media;
  readonly responses: Readonly<Record<string, Media>>;
  readonly "x-session-required-purposes"?: readonly string[];
}
export interface AccountOperation {
  readonly id: string;
  readonly method: string;
  readonly path: string;
  readonly declaration: Declaration;
}
const paths: Readonly<Record<string, Readonly<Record<string, Declaration>>>> = openapi.paths;
const operations: readonly AccountOperation[] = Object.entries(paths)
  .filter(([path]) => path.startsWith("/api/v2/"))
  .flatMap(([path, methods]) => Object.entries(methods).map(([method, declaration]) => ({ id: declaration.operationId, method: method.toUpperCase(), path, declaration })));

export function accountOperation(id: string): AccountOperation {
  const operation = operations.find(value => value.id === id);
  if (!operation) throw accountErrors.invalid_request("Unknown account operation");
  return operation;
}

function schemaName(media: Media): string { return media.content["application/json"].schema.$ref.split("/").at(-1)!; }
function validParameter(schema: Schema, value: unknown): boolean {
  if (typeof schema.$ref === "string") return validateNamed(schema.$ref.split("/").at(-1)!, value);
  return validateWithDocument({ ...schemas, $defs: { ...schemas.$defs, ParameterInput: schema } }, "ParameterInput", value);
}
export function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** Every URL segment/query/header comes from a fixed contract declaration. */
export function prepareOperation(config: AccountEnvironmentConfig, operation: AccountOperation, input: AccountOperationInput) {
  if (!isRecord(input) || Object.keys(input).some(key => !["params", "query", "body", "idempotencyKey"].includes(key))) throw accountErrors.invalid_request("Unexpected account operation input");
  const { declaration } = operation, params = input.params ?? {}, query = input.query ?? {};
  if (!isRecord(params) || !isRecord(query)) throw accountErrors.invalid_request("Invalid account operation parameters");
  for (const [values, location] of [[params, "path"], [query, "query"]] as const) {
    const declared = declaration.parameters.filter(parameter => parameter.in === location);
    if (Object.keys(values).some(key => !declared.some(parameter => parameter.name === key))) throw accountErrors.invalid_request("Unknown account operation parameter");
    for (const parameter of declared) {
      const value = values[parameter.name];
      if ((value === undefined && parameter.required) || (value !== undefined && !validParameter(parameter.schema, value))) throw accountErrors.invalid_request("Invalid account operation parameter");
    }
  }
  const key = declaration.parameters.find(parameter => parameter.name === "Idempotency-Key");
  if (key ? !validParameter(key.schema, input.idempotencyKey) : input.idempotencyKey !== undefined) throw accountErrors.invalid_request("Invalid account idempotency key");
  if (declaration.requestBody ? !validateNamed(schemaName(declaration.requestBody), input.body) : input.body !== undefined) throw accountErrors.invalid_request("Invalid account operation body");
  if (isRecord(input.body)) {
    if ("clientId" in input.body && input.body.clientId !== config.clientId) throw accountErrors.forbidden("Account client does not match this Host");
    if ("redirectUri" in input.body && !config.redirectAllowlist.includes(String(input.body.redirectUri))) throw accountErrors.forbidden("Account callback is not registered");
  }
  const path = operation.path.replace(/\{([^}]+)\}/gu, (_, key: string) => encodeURIComponent(String(params[key])));
  const url = new URL(path, config.authOrigin);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value));
  const requiresSession = declaration.security.length > 0 && !declaration.security.some(item => Object.keys(item).length === 0)
    || (isRecord(input.body) && declaration["x-session-required-purposes"]?.includes(String(input.body.purpose))) === true;
  return { url, requiresSession, requiresInitiator: declaration.parameters.some(parameter => parameter.name === "X-Auth-Initiator-Proof") };
}

export function validateOperationResponse(operation: AccountOperation, status: number, body: unknown): boolean {
  const media = operation.declaration.responses[String(status)];
  return media !== undefined && validateNamed(schemaName(media), body);
}

/** Noncredential product mappings are derived from the same frozen operation directory. */
export function centralAccountOperationForProduct(productOperationId: string): string {
  const direct: Readonly<Record<string, string>> = { productUpdateProfile: "updateProfile", productListLoginMethods: "listLoginMethods", productActivity: "recordActivity" };
  const id = productOperationId.startsWith("product_") ? productOperationId.slice("product_".length) : direct[productOperationId];
  if (!id) throw accountErrors.invalid_request("This product operation requires private authentication orchestration");
  accountOperation(id);
  if (!Object.values(paths).some(methods => Object.values(methods).some(operation => operation.operationId === productOperationId))) throw accountErrors.invalid_request("Unknown product account operation");
  return id;
}
