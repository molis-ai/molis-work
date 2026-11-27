import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorFromResponse, actionErrorResponse } from "@molis-ai/molis-work-plugin-sdk";
import { actionGatewayHomeId } from "./action-gateway.js";
import { createHomeSnapshot, createOnlineHomeSnapshot } from "./home-snapshot.js";
import type { HomeSnapshotResult } from "./home-snapshot-contract.js";
import { readHostEndpoint } from "./host-endpoint.js";
import { probeMcpResident, probeMcpResidentReport } from "./mcp-resident-health.js";
import { resolveConfiguredHome } from "./product-home.js";
import type { MolisWorkLocalHost } from "./project-host.js";
import { RESIDENT_HOST_URL_ENV, postToResidentHost, residentHostOrigin } from "./resident-host-request.js";
import { readLocalWebBody, requestAbortSignal, sendLocalGatewayJson as sendJson } from "./web-http.js";

/** S-07 control gateway for online Home maintenance (online SQLite backup while resident Host holds `storage-owner`). */
export const HOME_MAINTENANCE_PATH = "/api/internal/home-maintenance";

const ALLOWED_FIELDS = ["action", "home_id", "destination"];

/** Mounted only after the resident service's loopback/Origin/control-token/idempotency gate (S-02, S-03, S-21). */
export async function handleHomeMaintenanceHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  home: string,
  host: MolisWorkLocalHost | null,
): Promise<boolean> {
  if (url.pathname !== HOME_MAINTENANCE_PATH) return false;
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "只支持本机 POST 调用" });
    return true;
  }
  // S-07 defense-in-depth: maintenance gateway accepts only local CLI/Host control-token callers, never browser page sessions.
  if (
    request.headers["x-molis-work-page-session"] !== undefined
    || request.headers["sec-fetch-site"] !== undefined
    || typeof request.headers["x-molis-work-control-token"] !== "string"
    || !request.headers["x-molis-work-control-token"]
  ) {
    sendJson(response, 403, { error: "维护接口仅接受本机控制凭据调用" });
    return true;
  }
  const disconnected = requestAbortSignal(request, response, new ActionError("actions.cancelled", "维护调用连接已断开"));
  try {
    const body = await readLocalWebBody(request, 64 * 1024);
    if (
      !body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).some(key => !ALLOWED_FIELDS.includes(key))
      || body.action !== "snapshot"
      || typeof body.home_id !== "string"
      || typeof body.destination !== "string"
      || !body.destination.trim()
      || !path.isAbsolute(body.destination)
    ) {
      throw new ActionError("actions.input_invalid", "Home 维护请求参数无效");
    }
    if (body.home_id !== actionGatewayHomeId(home)) {
      throw new ActionError("actions.home_mismatch", "Home 维护调用属于另一个 Home");
    }
    const result = host
      ? await createOnlineHomeSnapshot(host, {
        homeDirectory: home,
        destination: body.destination,
        signal: disconnected.signal,
      })
      : await createHomeSnapshot({
        homeDirectory: home,
        destination: body.destination,
        signal: disconnected.signal,
      });
    if (!response.destroyed) sendJson(response, 200, { result });
    else if (!response.writableEnded) {
      response.statusCode = 200;
      response.end();
    }
  } catch (error) {
    const refused = actionErrorResponse(error);
    if (!response.destroyed) sendJson(response, refused.status, refused.body);
  } finally {
    disconnected.dispose();
  }
  return true;
}

/**
 * Forwards `molis-work home snapshot` to the verified resident Host when this Home has an active HTTP listener.
 * Returns `null` ONLY when no resident HTTP listener answers for this Home (caller then runs offline under `storage-owner`).
 * Never falls back to direct offline disk access after a resident Host refuses or disconnects (`S-07`).
 */
export async function requestResidentHomeSnapshot(options: {
  readonly homeDirectory?: string;
  readonly destination: string;
  readonly signal?: AbortSignal;
}): Promise<HomeSnapshotResult | null> {
  const home = resolveConfiguredHome(options.homeDirectory);
  const explicitUrl = process.env[RESIDENT_HOST_URL_ENV]?.trim();
  const ownEndpoint = explicitUrl ? null : readHostEndpoint(home);
  const installationRoot = !explicitUrl && !ownEndpoint && path.basename(path.dirname(home)) === "spaces"
    ? path.dirname(path.dirname(home))
    : null;
  const endpoint = ownEndpoint ?? (installationRoot ? readHostEndpoint(installationRoot) : null);
  const address = explicitUrl || (endpoint ? `http://127.0.0.1:${endpoint.port}` : null);
  if (!address) return null;
  const origin = residentHostOrigin(address);
  const probeSignal = options.signal ?? new AbortController().signal;
  let health: Awaited<ReturnType<typeof probeMcpResident>>;
  try {
    health = await probeMcpResident(home, origin, probeSignal);
  } catch (error) {
    // A personal space under `<root>/spaces/<spaceId>` may be logged out / inactive while the genuine
    // installation Host answers on `<root>/run/endpoint.json` using `<root>`'s token. Only if `<root>`
    // itself passes HMAC verification as steady `ready` (no space transition/retirement in flight) may
    // we treat this space as unmounted and proceed offline under `storage-owner`.
    if (installationRoot && error instanceof ActionError && error.code === "actions.transport_invalid") {
      const rootHealth = await probeMcpResidentReport(installationRoot, origin, probeSignal).catch(() => null);
      if (rootHealth?.status === "ready") {
        if (rootHealth.spaceTransitioning) {
          throw new ActionError("actions.service_unavailable", "账号空间正在切换或尚未就绪，请稍后再试");
        }
        return null;
      }
      if (rootHealth?.status === "upgrading") {
        throw new ActionError("actions.service_unavailable", "Molis Work 正在升级这个 Home 的数据，请等待升级完成后再做快照");
      }
      if (rootHealth?.status === "starting" || rootHealth?.status === "pending") {
        throw new ActionError("actions.service_unavailable", "当前 Home 的常驻服务正在启动或暂未就绪，请稍后再试");
      }
    }
    throw error;
  }
  if (health === "absent") return null;
  if (health === "upgrading") {
    throw new ActionError("actions.service_unavailable", "Molis Work 正在升级这个 Home 的数据，请等待升级完成后再做快照");
  }
  if (health !== "ready") {
    throw new ActionError("actions.service_unavailable", "当前 Home 的常驻服务正在启动或暂未就绪，请稍后再试");
  }
  const homeId = actionGatewayHomeId(home);
  const answer = await postToResidentHost({
    origin,
    homeDirectory: home,
    homeId,
    path: HOME_MAINTENANCE_PATH,
    body: { action: "snapshot", home_id: homeId, destination: path.resolve(options.destination) },
    retryHint: "请先确认目标快照目录是否已经生成，再决定是否换新目录重试",
    signal: options.signal,
  });
  if (!answer) {
    throw new ActionError("actions.service_unavailable", "常驻服务在快照请求发送前已不可达，未回退离线直开库，请稍后重试");
  }
  if (!answer.ok) throw actionErrorFromResponse(answer.status, answer.body);
  const result = answer.body.result as Partial<HomeSnapshotResult> | undefined;
  if (
    !result || result.status !== "created"
    || typeof result.home_directory !== "string"
    || typeof result.snapshot_directory !== "string"
    || typeof result.stores !== "number"
    || typeof result.databases !== "number"
  ) {
    throw new ActionError("actions.delivery_unknown", "未收到完整的在线快照回执，请先检查目标目录再决定是否重试");
  }
  return result as HomeSnapshotResult;
}
