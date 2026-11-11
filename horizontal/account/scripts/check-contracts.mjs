import fs from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";

const directory = new URL("../src/upstream/", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("provenance.json", directory), "utf8"));
for (const [name, expected] of Object.entries(manifest.sha256)) {
  assert.equal(createHash("sha256").update(fs.readFileSync(new URL(name, directory))).digest("hex"), expected, name);
}
const schemas = JSON.parse(fs.readFileSync(new URL("schemas.json", directory), "utf8")).$defs;
const needed = new Set(["ClientEnvironmentConfig", "AccountView", "Scope", "MeView", "SessionView", "UserView", "LoginMethodsView", "ProfileUpdateRequest", "ProductReauthenticationRequest", "ProductTransactionRequest", "TenantView", "PlatformTenantView", "Membership", "Invitation", "OwnershipTransfer", "Subscription", "PlanVersion", "SeatPool", "Assignment", "AuditEvent", "Feature", "EntitlementCheckResult", "TenantCreationPolicyView"]);
const typeOf = schema => {
  if (schema.$ref) { const name = schema.$ref.split("/").at(-1); needed.add(name); return name; }
  if ("const" in schema) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map(value => JSON.stringify(value)).join(" | ");
  if (schema.oneOf || (schema.anyOf && !schema.type)) return (schema.oneOf ?? schema.anyOf).map(value => `(${typeOf(value)})`).join(" | ");
  if (schema.type === "object") return "{ " + Object.entries(schema.properties ?? {}).map(([key, value]) =>
    `readonly ${key}${(schema.required ?? []).includes(key) ? "" : "?"}: ${typeOf(value)}`).join("; ") + " }";
  if (schema.type === "array") return `ReadonlyArray<${typeOf(schema.items)}>`;
  const primitive = { string: "string", integer: "number", number: "number", boolean: "boolean", null: "null" }[schema.type];
  assert.ok(primitive, "Unsupported public account schema type");
  return primitive;
};
const output = new Map();
for (const name of needed) output.set(name, typeOf(schemas[name]));
const text = `// Generated from Auth unified-account ${manifest.version} schemas.json; do not hand-edit business enums.\n`
  + `// Source digest: ${manifest.sha256["schemas.json"]}\n`
  + [...output].sort(([a], [b]) => a.localeCompare(b, "en")).map(([name, type]) => `export type ${name} = ${type};`).join("\n") + "\n";
const target = new URL("../../../packages/contracts/src/services/account-dto.ts", import.meta.url);
if (process.argv.includes("--write")) fs.writeFileSync(target, text);
else assert.equal(fs.readFileSync(target, "utf8"), text, "Account public DTOs must match the pinned Auth schema");
