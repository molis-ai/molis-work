export type DeviceFetch = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface DeviceCodeStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  interval: number;
}

export interface DeviceCodePollResult {
  status: "pending" | "slow_down" | "authorized" | "expired" | "denied" | "error";
  accessToken?: string;
  message?: string;
}

/**
 * GitHub's notifications endpoint requires the classic `notifications` or
 * `repo` OAuth scope and does not accept fine-grained PATs or GitHub App
 * tokens. Molis Work requests the narrower notifications scope and only calls
 * GET endpoints even though GitHub's scope also grants notification writes.
 */
export const GITHUB_DEVICE_DEFAULT_SCOPE = "notifications read:user";

export interface GithubDeviceFlowPorts {
  clientId(): string | null;
  storeClientId(value: string): void;
  bindToken(value: string): void;
}
/** Provider protocol; the host supplies the authorized credential boundary. */
export function createGithubDeviceFlow(ports: GithubDeviceFlowPorts) {
  function resolveClientId(override?: string): string | null {
    if (override?.trim()) return override.trim();
    return ports.clientId();
  }

  function storeGithubClientId(clientId: string): void {
    ports.storeClientId(clientId.trim());
  }

  async function startGithubDeviceFlow(opts?: {
    clientId?: string;
    scope?: string;
    fetchImpl?: DeviceFetch;
  }): Promise<DeviceCodeStart> {
    const clientId = resolveClientId(opts?.clientId);
    if (!clientId) {
      throw new Error(
        "MOLIS_WORK_GITHUB_CLIENT_ID required for device flow (or bind client id first)",
      );
    }
    if (opts?.clientId?.trim()) {
      storeGithubClientId(opts.clientId.trim());
    }
    const fetchImpl = opts?.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) throw new Error("fetch unavailable");

    const body = new URLSearchParams({
      client_id: clientId,
      scope: opts?.scope || GITHUB_DEVICE_DEFAULT_SCOPE,
    });
    const res = await fetchImpl("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "molis-work-feed-connector",
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`GitHub device/code HTTP ${res.status}: ${t.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      expires_in: number;
      interval: number;
    };
    return {
      deviceCode: json.device_code,
      userCode: json.user_code,
      verificationUri: json.verification_uri,
      expiresIn: json.expires_in,
      interval: json.interval || 5,
    };
  }

  async function pollGithubDeviceFlow(opts: {
    deviceCode: string;
    clientId?: string;
    fetchImpl?: DeviceFetch;
  }): Promise<DeviceCodePollResult> {
    const clientId = resolveClientId(opts.clientId);
    if (!clientId) {
      return { status: "error", message: "Missing GitHub client id" };
    }
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) {
      return { status: "error", message: "fetch unavailable" };
    }
    const body = new URLSearchParams({
      client_id: clientId,
      device_code: opts.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    const res = await fetchImpl("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "molis-work-feed-connector",
      },
      body: body.toString(),
    });
    const json = (await res.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (json.access_token) {
      ports.bindToken(json.access_token);
      return { status: "authorized", accessToken: json.access_token };
    }
    switch (json.error) {
      case "authorization_pending":
        return { status: "pending", message: json.error_description };
      case "slow_down":
        return { status: "slow_down", message: json.error_description };
      case "expired_token":
        return { status: "expired", message: json.error_description };
      case "access_denied":
        return { status: "denied", message: json.error_description };
      default:
        return {
          status: "error",
          message: json.error_description || json.error || `HTTP ${res.status}`,
        };
    }
  }

  return { storeGithubClientId, startGithubDeviceFlow, pollGithubDeviceFlow };
}
