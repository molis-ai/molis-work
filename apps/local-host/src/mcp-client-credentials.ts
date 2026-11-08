import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { atomicWriteFileSync, resolveHomeDirectory } from "@molis-ai/molis-work-storage";
import { actionGatewayHomeId } from "./action-gateway-identity.js";

export const MCP_CLIENT_CREDENTIAL_DIRECTORY = "config/mcp-client-credentials";
const CREDENTIAL_VERSION = /* @version format.mcp.client.credential */ 1;
const PROOF_TTL_MS = 60_000;
interface ClientCredential { schema_version: number; home_id: string; client_id: string; key_id: string; secret: string }
interface ClientProof { client_id: string; key_id: string; home_id: string; instance_id: string | null; expires_at: number }
const refused = () => new ActionError("actions.forbidden", "客户端连接凭据无效或已撤销，请重新接入 Runtime");

function validClient(clientId: string): boolean {
  return typeof clientId === "string" && clientId.length > 0 && clientId.length <= 200 && clientId === clientId.trim()
    && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(clientId) && !clientId.startsWith("agent:");
}

export function mcpClientCredentialPath(home: string, clientId: string): string {
  if (!validClient(clientId)) throw refused();
  return path.join(resolveHomeDirectory(home), MCP_CLIENT_CREDENTIAL_DIRECTORY, `${encodeURIComponent(clientId).replaceAll(".", "%2E")}.json`);
}

/** Parent links inside a Home are refused, including during explicit registration and rollback. */
function directory(home: string, create: boolean): boolean {
  const root = resolveHomeDirectory(home);
  if (create) fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  let current = root;
  for (const part of ["config", "mcp-client-credentials"]) {
    current = path.join(current, part);
    let state = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!state && create) { fs.mkdirSync(current, { mode: 0o700 }); state = fs.lstatSync(current); }
    if (!state) return false;
    if (!state.isDirectory() || state.isSymbolicLink()) throw refused();
  }
  return true;
}

function readCredential(home: string, clientId: string): ClientCredential | null {
  const file = mcpClientCredentialPath(home, clientId);
  if (!directory(home, false)) return null;
  const state = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!state) return null;
  if (!state.isFile() || state.isSymbolicLink() || state.nlink !== 1 || (state.mode & 0o077) !== 0 || state.size > 4096) throw refused();
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const opened = fs.fstatSync(descriptor), bytes = Buffer.alloc(4097), length = fs.readSync(descriptor, bytes, 0, bytes.length, 0);
    const current = fs.lstatSync(file, { throwIfNoEntry: false });
    if (opened.ino !== state.ino || opened.dev !== state.dev || (opened.mode & 0o077) !== 0 || !current || current.ino !== opened.ino || current.dev !== opened.dev || length > 4096) throw refused();
    let value: ClientCredential;
    try { value = JSON.parse(bytes.subarray(0, length).toString("utf8")) as ClientCredential; } catch { throw refused(); }
    if (!value || value.schema_version !== CREDENTIAL_VERSION || value.home_id !== actionGatewayHomeId(home) || value.client_id !== clientId
      || typeof value.key_id !== "string" || !/^[a-f0-9]{32}$/.test(value.key_id) || typeof value.secret !== "string" || !/^[a-f0-9]{64}$/.test(value.secret)
      || Object.keys(value).some(key => !["schema_version", "home_id", "client_id", "key_id", "secret"].includes(key))) throw refused();
    return value;
  } finally { fs.closeSync(descriptor); }
}

export const hasMcpClientCredential = (home: string, clientId: string): boolean => readCredential(home, clientId) !== null;

/** Trusted local registration only: no gateway request or MCP action can call this to claim an identity. */
export function changeMcpClientCredential(home: string, clientId: string, action: "connect" | "remove", assertCurrent: () => void = () => {}) {
  assertCurrent();
  const file = mcpClientCredentialPath(home, clientId), before = readCredential(home, clientId);
  if (action === "connect" && before || action === "remove" && !before) return { changed: false, rollback: () => true };
  const after: ClientCredential | null = action === "connect" ? { schema_version: CREDENTIAL_VERSION, home_id: actionGatewayHomeId(home), client_id: clientId,
    key_id: randomBytes(16).toString("hex"), secret: randomBytes(32).toString("hex") } : null;
  assertCurrent(); directory(home, true); assertCurrent();
  if (after) atomicWriteFileSync(file, `${JSON.stringify(after)}\n`, { mode: 0o600, durable: true });
  else fs.unlinkSync(file);
  return { changed: true, rollback(): boolean {
    try {
      const current = readCredential(home, clientId);
      if ((current?.key_id ?? null) !== (after?.key_id ?? null) || (current?.secret ?? null) !== (after?.secret ?? null)) return false;
      if (before) atomicWriteFileSync(file, `${JSON.stringify(before)}\n`, { mode: 0o600, durable: true });
      else if (current) fs.unlinkSync(file);
      return true;
    } catch { return false; }
  } };
}

/** A short-lived transport proof. Its key stays in the registration file, never in a Runtime's config or HTTP body. */
export function createMcpClientProof(credentialHome: string, clientId: string, targetHome: string, instanceId: string | null): string {
  const credential = readCredential(credentialHome, clientId);
  if (!credential) throw new ActionError("actions.connection_required", "此 Runtime 缺少独立连接凭据，请在设置中重新接入");
  const claims: ClientProof = { client_id: clientId, key_id: credential.key_id, home_id: actionGatewayHomeId(targetHome), instance_id: instanceId, expires_at: Date.now() + PROOF_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `mcp1.${encoded}.${createHmac("sha256", Buffer.from(credential.secret, "hex")).update(encoded).digest("hex")}`;
}

/** Returns only the registered identity. Caller-controlled body fields do not participate. */
export function authenticateMcpClientProof(credentialHome: string, targetHome: string, instanceId: string, proof: unknown, invoking: boolean) {
  if (typeof proof !== "string" || proof.length > 2048) throw refused();
  const match = /^mcp1\.([A-Za-z0-9_-]+)\.([a-f0-9]{64})$/.exec(proof);
  if (!match) throw refused();
  let claims: ClientProof;
  try { claims = JSON.parse(Buffer.from(match[1]!, "base64url").toString("utf8")) as ClientProof; } catch { throw refused(); }
  if (!claims || !validClient(claims.client_id) || typeof claims.key_id !== "string" || claims.home_id !== actionGatewayHomeId(targetHome)
    || !(claims.instance_id === null || typeof claims.instance_id === "string") || !Number.isSafeInteger(claims.expires_at)
    || claims.expires_at <= Date.now() || claims.expires_at > Date.now() + PROOF_TTL_MS + 1000
    || Object.keys(claims).some(key => !["client_id", "key_id", "home_id", "instance_id", "expires_at"].includes(key))) throw refused();
  const credential = readCredential(credentialHome, claims.client_id);
  if (!credential || credential.key_id !== claims.key_id) throw refused();
  const expected = createHmac("sha256", Buffer.from(credential.secret, "hex")).update(match[1]!).digest();
  if (!timingSafeEqual(expected, Buffer.from(match[2]!, "hex"))) throw refused();
  if (invoking && claims.instance_id !== instanceId || claims.instance_id !== null && claims.instance_id !== instanceId)
    throw new ActionError("actions.host_replaced", "系统服务已重启，请重新发现能力");
  return { clientId: credential.client_id, assertCurrent() {
    const current = readCredential(credentialHome, credential.client_id);
    if (!current || current.key_id !== credential.key_id || current.secret !== credential.secret) throw refused();
  } };
}
